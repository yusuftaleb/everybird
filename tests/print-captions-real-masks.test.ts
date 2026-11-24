import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { readOrderMasks } from '../scripts/build-data/data-files'
import { createLayoutHandler, type MaskLoader } from '@/lib/layout/layout.worker'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { planCaptions, type TextMeasurer } from '@/lib/share/captions'
import * as image from '@/lib/share/image'
import { printDesign, type PrintSize } from '@/lib/share/print'
import { installStubs } from './fixtures/share-image-harness'

// The real species file and masks (public data, no personal data): names and silhouettes as the poster gets them.
const data = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const rows = (data('species.v1.json') as { species: SpeciesRow[] }).species
const masks = Object.fromEntries(readOrderMasks(join(__dirname, '..', 'public', 'data', 'masks')))
const species = buildSpeciesIndex(rows)
const drawn = rows.filter((r) => r.st && masks[r.ord]?.[r.code])

// A deterministic pick of `n` drawn species (an LCG over the drawn rows), as a list of lifers.
function pick(n: number, seed: number): ListEntry[] {
  let s = seed >>> 0
  const chosen = new Set<string>()
  while (chosen.size < n) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    chosen.add(drawn[s % drawn.length].code)
  }
  return [...chosen].map((code) => ({ code, date: '2024-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))
}

type Opts = { titled?: boolean; format?: 'print' | 'printLandscape'; countSize?: image.CountSize; measure?: TextMeasurer }

async function realPack(entries: ListEntry[], size: PrintSize, { titled = false, format = 'print', countSize, measure }: Opts = {}) {
  const content: image.CardContent = { name: titled, filter: titled, latest: true, count: entries.length, countSize }
  const L = image.cardLayout(format, content, printDesign(size, format === 'printLandscape'))
  const plan = planCaptions(entries, species, size, L.collage.w, undefined, measure)
  if (!plan.ok) return undefined
  const spec = image.imagePackSpec(format, content, size, plan)
  const load: MaskLoader = async (order) => masks[order] ?? {}
  const birds = entries.map((e) => ({ code: e.code, mass: species.byCode.get(e.code)!.g, ord: species.byCode.get(e.code)!.ord }))
  const reply = await createLayoutHandler(load)({
    type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile,
    captions: birds.map((b) => spec.captionBoxes![b.code]),
  })
  return { pack: image.packFromReply(reply), content, plan }
}

async function namesFit(entries: ListEntry[], size: PrintSize, o: Opts = {}): Promise<boolean> {
  const r = await realPack(entries, size, o)
  if (!r) return false
  return image.fitCaptionPack(r.pack, entries, o.format ?? 'print', r.content, size, r.plan).ok
}

const overlap = (p: { x: number; y: number; w: number; h: number }, q: { x: number; y: number; w: number; h: number }) =>
  p.x < q.x + q.w - 1e-6 && p.x + p.w > q.x + 1e-6 && p.y < q.y + q.h - 1e-6 && p.y + p.h > q.y + 1e-6

afterEach(() => vi.unstubAllGlobals())

describe('print captions on real masks', () => {
  it('a titled A4 at its cap with names keeps a long filter caption on one line, so the names stay where they fit', async () => {
    for (let seed = 1; seed <= 3; seed++) {
      const entries = pick(20, seed * 17)
      // The dialog's measurer on both sides, as the dialog plans and prepareCard re-plans.
      installStubs()
      const r = (await realPack(entries, 'A4', { titled: true, measure: image.captionMeasurer() }))!
      image.clearStickerCache()
      const card = await image.prepareCard({
        format: 'print', printSize: 'A4', showNames: true, entries, species, pack: r.pack, theme: 'light', strings: en.ui,
        name: 'A test list', filterLabel: 'Perching birds · Seen in Canada + Egypt + Kenya · Threatened · Mar 2020 to Jun 2021',
      })
      vi.unstubAllGlobals()
      expect(card.labelLines, `seed ${seed}`).toBeUndefined()
      const caps = card.captions!
      expect(caps, `seed ${seed}`).toHaveLength(20)
      const top = card.L.filter!.y + card.L.filter!.size
      for (const t of card.tiles) expect(t.y).toBeGreaterThanOrEqual(top)
      for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) expect(overlap(caps[i], caps[j]), `seed ${seed} ${i}/${j}`).toBe(false)
    }
  }, 60_000)

  it('20 species on A4 whose names fit turns the switch on', async () => {
    const ok: boolean[] = []
    for (let seed = 1; seed <= 4; seed++) ok.push(await namesFit(pick(20, seed), 'A4'))
    expect(ok).toEqual([true, true, true, true])
  }, 60_000)

  it('fits names with a title, upright and landscape, with the count in the middle or beside the title', async () => {
    for (const [size, n] of [['A4', 20], ['A2', 80]] as const) {
      for (const format of ['print', 'printLandscape'] as const) {
        for (let seed = 1; seed <= 3; seed++) {
          const entries = pick(n, seed * 31 + n)
          const countSize = seed === 3 ? 'title' : undefined
          expect(await namesFit(entries, size, { titled: true, format, countSize }), `${size} ${format} seed ${seed}`).toBe(true)
        }
      }
    }
  }, 120_000)

  it('fits names for 30 and 80 species on A2, 160 on A1 and 180 on 24 × 36 in', async () => {
    expect(await namesFit(pick(30, 6), 'A2')).toBe(true)
    expect(await namesFit(pick(80, 7), 'A2')).toBe(true)
    expect(await namesFit(pick(160, 8), 'A1')).toBe(true)
    expect(await namesFit(pick(180, 9), 'US24x36')).toBe(true)
  }, 120_000)
})
