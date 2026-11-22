// Round 6, item 10: the collage never meets the footer's hairline. On every collage card (every format and orientation,
// the poster too; with and without the latest lifer row; a loose and a dense pack; the wish list's card: a title, no
// count, no row), the lowest drawn sticker stays at least the card's own collage-to-hairline gap (GAPS.collage) above
// the hairline, or the row's gap (GAPS.latest) above the latest lifer's sticker. Read from drawShareImage's draw log.
// Before the fix, without the row, 1 px on the Story and the Post (the credit's own line lifts the hairline, and the frame
// kept no room for it), 9 on the Square, and 4 on the portrait poster with its latest lifer line in the foot.
// Real masks and masses from public/data (reference data, no personal list), sampled at a fixed stride.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { decodeMask, type Mask } from '@/lib/layout/mask'
import { packFrame } from '@/lib/layout/pack'
import type { Arrangement } from '@/lib/arrangement'
import { clearStickerCache, drawShareImage, GAPS, imagePackSpec, type CardFormat, type CountSize } from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { installStubs, NOW } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())
const DATA = resolve(__dirname, '../public/data')
let masks = new Map<string, Mask>()
let rows: SpeciesRow[] = []
beforeAll(() => {
  masks = new Map()
  for (const f of readdirSync(resolve(DATA, 'masks')).sort()) {
    const rec = JSON.parse(readFileSync(resolve(DATA, 'masks', f), 'utf8')) as Record<string, [number, number, string]>
    for (const [c, m] of Object.entries(rec)) masks.set(c, decodeMask(m))
  }
  rows = (JSON.parse(readFileSync(resolve(DATA, 'species.v1.json'), 'utf8')).species as SpeciesRow[])
    .filter((s) => s.st && masks.has(s.code))
    .sort((a, b) => (a.code < b.code ? -1 : 1))
})

/** The numbers of a logged call, "drawImage(img, 1, 2, 3, 4)" -> [1, 2, 3, 4]. */
const nums = (line: string) => line.slice(line.indexOf('(') + 1, -1).split(', ').map(Number).filter((n) => Number.isFinite(n))

async function gaps(format: CardFormat, n: number, latest: boolean, countSize: CountSize, arrangement: Arrangement) {
  const pick = Array.from({ length: n }, (_, i) => rows[Math.floor((i * rows.length) / n)])
  const entries = pick.map((r, i) => ({ code: r.code, date: `20${10 + (i % 15)}-0${(i % 9) + 1}`, heard: false, dead: false, media: false, sources: ['ebird'] }))
  const spec = imagePackSpec(format, { name: true, filter: false, latest, count: n, countSize }, undefined, undefined, arrangement)
  const r = packFrame(pick.map((s, i) => ({ id: i, mass: s.g, mask: masks.get(s.code)! })), spec.aspect, { hole: spec.hole, maxTile: spec.maxTile, oval: spec.oval, free: spec.free })
  const pack = { W: r.W, H: r.H, boxes: new Map([...r.boxes].map(([id, b]) => [pick[id].code, b])) }
  const logs = installStubs()
  clearStickerCache()
  const canvas = await drawShareImage({
    format, entries, species: buildSpeciesIndex(pick), pack, now: NOW, theme: 'light', strings: en.ui, name: 'Ada Lovelace’s birds', latest, countSize,
  } as never)
  const log = logs.get(canvas as unknown as object)!
  const draws = log.filter((l) => l.startsWith('drawImage(')).map(nums)
  // The collage's tiles are drawn first, one each (every bird here has a sticker); the latest lifer's sticker after them.
  const tiles = draws.slice(0, n)
  const low = Math.max(...tiles.map(([, y, , h]) => y + h))
  const hairline = nums(log.find((l) => l.startsWith('fillRect(') && nums(l)[3] === 2)!)[1]
  return { hairline: hairline - low, row: latest ? draws[n][1] - low : Infinity }
}

describe('the collage keeps its gap above the footer', () => {
  const FORMATS: CardFormat[] = ['story', 'post', 'square', 'desktop', 'wide', 'print', 'printLandscape']
  // Every arrangement (Fit, Oval, Free: the maintainer's second case was an Oval Story of 1,092 birds, the row off).
  for (const arrangement of ['packed', 'oval', 'free'] as const) {
    for (const format of FORMATS) {
      // A loose pack (under FRAME_DENSE_FROM) and a dense one; the Story also at 1,092 birds.
      for (const n of format === 'story' ? [200, 400, 1092] : [200, 400]) {
        it(`${arrangement}, ${format}, ${n} birds: with and without the latest lifer, and the wish list's card`, async () => {
          const G = GAPS[format]
          for (const latest of [true, false]) {
            const g = await gaps(format, n, latest, 'medium', arrangement)
            expect(g.hairline, `latest ${latest}`).toBeGreaterThanOrEqual(G.collage - 0.5)
            if (latest) expect(g.row).toBeGreaterThanOrEqual(G.latest - 0.5)
          }
          const wish = await gaps(format, n, false, 'hide', arrangement)
          expect(wish.hairline, 'wish list').toBeGreaterThanOrEqual(G.collage - 0.5)
        }, 180_000)
      }
    }
  }
})
