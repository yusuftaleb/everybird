import { EN_UI } from '@/i18n/messages/en-ui'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { HOWTO_DATA, makeHowtoData } from '../scripts/build-data/build-howto'
import { BIRDS, COLLAGE, FAMILIES, HERONS, SHARE, THREATENED, TOTAL } from '@/components/about/how-it-works-data'
import { ORDERS, TAXONOMY_ORDERS } from '@/components/about/HowItWorksScene'
import { collageHole, touchesHole, type Rect } from '@/lib/layout/count-box'
import { decodeMask, maskCell, type Mask } from '@/lib/layout/mask'
import { relSizes, type PackBird } from '@/lib/layout/pack'
import { EXP } from '@/lib/layout/constants'
import { orderLabel } from '@/lib/species/orders'
import { THREATENED as THREAT_CATS } from '@/lib/species/iucn'
import type { MaskTable } from '@/lib/layout/layout.worker'
import type { SpeciesFile } from '@/lib/species/types'

// The About demo's birds (src/components/about/how-it-works-data.ts) are the product's own packing of the demo's list.
const DATA = join(process.cwd(), 'public/data')
const species = (JSON.parse(readFileSync(join(DATA, 'species.v1.json'), 'utf8')) as SpeciesFile).species
const byCode = new Map(species.map((r) => [r.code, r]))
const masks = new Map<string, Mask>()
for (const code of BIRDS) {
  const row = byCode.get(code)!
  const table = JSON.parse(readFileSync(join(DATA, `masks/${row.ord}.v1.json`), 'utf8')) as MaskTable
  masks.set(code, decodeMask(table[code]))
}

/** A box's painted cells (its mask laid over the box), as rects in the box's coordinates. */
function painted(code: string, [x, y, w, h]: [number, number, number, number]): Rect[] {
  const m = masks.get(code)!
  const cw = w / m.w, ch = h / m.h
  const out: Rect[] = []
  for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) if (maskCell(m, i, j)) out.push([x + i * cw, y + j * ch, x + (i + 1) * cw, y + (j + 1) * ch])
  return out
}
const overlap = (a: Rect, b: Rect, tol: number) => a[0] < b[2] - tol && b[0] < a[2] - tol && a[1] < b[3] - tol && b[1] < a[3] - tol

describe('the About demo', () => {
  it('builds from prospective species and masks without changing committed inputs', () => {
    const committed = readFileSync(HOWTO_DATA, 'utf8')
    const baseline = makeHowtoData()
    const overlay = <T,>(file: string): T => {
      const data = JSON.parse(readFileSync(join(DATA, file), 'utf8'))
      if (file === 'species.v1.json') data.species = data.species.map((row: SpeciesFile['species'][number]) => row.code === 'amerob' ? { ...row, ar: 1, sv: 'next-preview' } : row)
      if (file === 'masks/Passeriformes.v1.json') data.amerob = [24, 24, Buffer.alloc(72, 255).toString('base64')]
      return data as T
    }
    const preview = makeHowtoData(overlay)
    expect(preview).toContain('"amerob":"next-preview"')
    const collageLine = (source: string) => source.split('\n').find((line) => line.startsWith('export const COLLAGE:'))
    expect(collageLine(preview)).not.toBe(collageLine(baseline))
    expect(readFileSync(HOWTO_DATA, 'utf8')).toBe(committed)
  })

  it('is what scripts/build-data/build-howto.ts packs today (rerun it after changing the packer, the masks or the demo)', () => {
    expect(readFileSync(HOWTO_DATA, 'utf8')).toBe(makeHowtoData())
  })

  it('draws every bird it counts: TOTAL stickers in each collage and share image, the families the stats line says', () => {
    expect(new Set(BIRDS).size).toBe(TOTAL)
    for (const layout of ['wide', 'compact'] as const) expect(Object.keys(COLLAGE[layout].all).sort()).toEqual([...BIRDS].sort())
    for (const f of ['story', 'post', 'square'] as const) expect(Object.keys(SHARE[f].tiles)).toHaveLength(TOTAL)
    expect(new Set(BIRDS.map((c) => byCode.get(c)!.fam)).size).toBe(FAMILIES)
    // Each chip's count is the birds of that order drawn
    for (const [label, k] of ORDERS) expect(BIRDS.filter((c) => orderLabel(byCode.get(c)!.ord, EN_UI) === label), label).toHaveLength(k)
  })

  it('counts the threatened birds (VU, EN, CR) the stats line shows from species.v1.json', () => {
    expect(THREATENED).toBe(BIRDS.filter((c) => { const iu = byCode.get(c)!.iu; return !!iu && THREAT_CATS.includes(iu) }).length)
    expect(THREATENED).toBe(1) // lesyel, VU
  })

  it("says the Taxa panel's head against the taxonomy's own order count (\"7 of 45 orders\")", () => {
    expect(TAXONOMY_ORDERS).toBe(new Set(species.map((r) => r.ord)).size)
  })

  it('has chips whose counts add up to its total, each order a real one with a bird in the demo, Herons six', () => {
    expect(ORDERS.reduce((a, [, k]) => a + k, 0)).toBe(TOTAL)
    const shown = new Set(BIRDS.map((c) => orderLabel(byCode.get(c)!.ord, EN_UI)))
    expect(new Set(ORDERS.map(([l]) => l))).toEqual(shown)
    expect(ORDERS.find(([l]) => l === 'Herons')![1]).toBe(HERONS.length)
    for (const c of HERONS) expect(byCode.get(c)!.famCom).toBe('Herons, Egrets, and Bitterns')
  })

  for (const layout of ['wide', 'compact'] as const) {
    for (const state of ['all', 'herons'] as const) {
      it(`${layout}, ${state === 'all' ? 'every bird' : 'Herons chosen'}: no sticker paints on the count or on another, all inside the box`, () => {
        const c = COLLAGE[layout]
        const boxes = c[state]
        // The drawn count's hole (packed at z x the box with this hole scaled up, drawn at 1/z)
        const hole = collageHole(state === 'all' ? TOTAL : HERONS.length, { W: c.W, F: c.F, minWidth: c.W, maxWidth: c.W })
        // The packer works on 2-unit cells (2 / z px drawn): allow a cell's rounding on the hole's padding.
        const inner = { ...hole, pad: Math.max(0, hole.pad - 2 / c.z) }
        const cells = Object.fromEntries(Object.entries(boxes).map(([code, b]) => [code, painted(code, b)]))
        for (const [code, b] of Object.entries(boxes)) {
          expect(b[0] >= 0 && b[1] >= 0 && b[0] + b[2] <= c.W + 0.1 && b[1] + b[3] <= c.H + 0.1, `${code} inside`).toBe(true)
          for (const r of cells[code]) {
            const about: Rect = [r[0] - c.W / 2, r[1] - c.H / 2, r[2] - c.W / 2, r[3] - c.H / 2]
            expect(touchesHole(about, inner), `${code} on the count`).toBe(false)
          }
        }
        const codes = Object.keys(boxes)
        for (let i = 0; i < codes.length; i++) for (let j = i + 1; j < codes.length; j++) {
          const hit = cells[codes[i]].some((a) => cells[codes[j]].some((b) => overlap(a, b, 1)))
          expect(hit, `${codes[i]} on ${codes[j]}`).toBe(false)
        }
      })
    }
  }

  it('sizes stickers by painted area (relSizes): a long-tailed bird gets a longer tile than a compact one of its mass', () => {
    const birds: PackBird[] = BIRDS.map((code, id) => ({ id, mass: byCode.get(code)!.g, mask: masks.get(code)! }))
    const rel = relSizes(birds, EXP)
    const long = (code: string) => Math.max(...COLLAGE.wide.all[code].slice(2))
    // The collage's tiles follow rel exactly (one base for every bird)
    const k = long(BIRDS[0]) / rel.get(0)!
    for (const [id, code] of BIRDS.entries()) expect(long(code) / rel.get(id)!).toBeCloseTo(k, 0)
  })

  it('packs every share image around its count', () => {
    for (const f of ['story', 'post', 'square'] as const) expect(Object.keys(SHARE[f].tiles).sort()).toEqual([...BIRDS].sort())
  })
})
