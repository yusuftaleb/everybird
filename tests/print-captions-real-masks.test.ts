import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createLayoutHandler, type MaskLoader } from '@/lib/layout/layout.worker'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { planCaptions } from '@/lib/share/captions'
import * as image from '@/lib/share/image'
import { printDesign, type PrintSize } from '@/lib/share/print'

// The real species file and masks (public data, no personal data): names and silhouettes as the poster gets them.
const data = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const rows = (data('species.v1.json') as { species: SpeciesRow[] }).species
const masks = data('masks.v2.json') as Record<string, Record<string, [number, number, string]>>
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

type Opts = { marked?: Set<string>; titled?: boolean; format?: 'print' | 'printLandscape' }

async function namesFit(entries: ListEntry[], size: PrintSize, { marked, titled = false, format = 'print' }: Opts = {}): Promise<boolean> {
  const content: image.CardContent = { name: titled, filter: titled, latest: true, count: entries.length }
  const L = image.cardLayout(format, content, printDesign(size, format === 'printLandscape'))
  const plan = planCaptions(entries, species, size, L.collage.w, undefined, undefined, marked)
  if (!plan.ok) return false
  const spec = image.imagePackSpec(format, content, size, plan)
  const load: MaskLoader = async (order) => masks[order] ?? {}
  const birds = entries.map((e) => ({ code: e.code, mass: species.byCode.get(e.code)!.g, ord: species.byCode.get(e.code)!.ord }))
  const reply = await createLayoutHandler(load)({
    type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile,
    captions: birds.map((b) => spec.captionBoxes![b.code]),
  })
  return image.fitCaptionPack(image.packFromReply(reply), entries, format, content, size, plan, marked).ok
}

describe('print captions on real masks', () => {
  it('40 species on A4 whose names fit turns the switch on', async () => {
    const ok: boolean[] = []
    for (let seed = 1; seed <= 4; seed++) ok.push(await namesFit(pick(40, seed), 'A4'))
    expect(ok).toEqual([true, true, true, true])
  }, 60_000)

  it('fits names with the lifer rings, a title and a filter line, upright and landscape', async () => {
    for (const [size, n] of [['A4', 40], ['A2', 160]] as const) {
      for (const format of ['print', 'printLandscape'] as const) {
        for (let seed = 1; seed <= 3; seed++) {
          const entries = pick(n, seed * 31 + n)
          const marked = new Set([entries[0].code, entries[n - 1].code])
          expect(await namesFit(entries, size, { marked, titled: true, format }), `${size} ${format} seed ${seed}`).toBe(true)
        }
      }
    }
  }, 120_000)

  it('fits names for 30 and 160 species on A2 and 320 on A1', async () => {
    expect(await namesFit(pick(30, 6), 'A2')).toBe(true)
    expect(await namesFit(pick(160, 7), 'A2')).toBe(true)
    expect(await namesFit(pick(320, 8), 'A1')).toBe(true)
  }, 120_000)
})
