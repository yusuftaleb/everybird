// The Map and Tree views' share images, their pure parts: how the map is fitted, the legend's ranges, which tree names are kept.
import { describe, expect, it } from 'vitest'
import { shadeRanges, shadeStep } from '@/lib/map/shapes'
import { en } from '@/i18n/messages/en'
import { FOOTER_LINE, SITE_LABEL, prepareCard, type ShareImageOpts } from '@/lib/share/image'
import { keepNames } from '@/lib/share/tree-image'
import { MAP_FOOTER, TREE_FOOTER, fitBox, wrapParts } from '@/lib/share/view-image'
import { buildSpeciesIndex } from '@/lib/species/load'

describe('the map image', () => {
  it('fits the map whole in the area, centred on the side with room to spare', () => {
    // The world (2000 × 983) in a tall story area: as wide as the area, centred vertically.
    expect(fitBox(2000, 983, { x: 64, y: 300, w: 952, h: 1200 })).toEqual({ x: 64, y: 300 + (1200 - 983 * 0.476) / 2, s: 0.476 })
    // A tall province layer in a wide area: as tall as the area, centred across.
    const f = fitBox(100, 400, { x: 0, y: 0, w: 1000, h: 200 })
    expect(f).toEqual({ x: 475, y: 0, s: 0.5 })
  })

  it("the legend's ranges are the shade steps' own, every count from 1 to the most in one", () => {
    const r = shadeRanges(100)
    expect(r[0][1]).toBe(1)
    expect(r[r.length - 1]).toEqual([5, expect.any(Number), 100])
    for (const [step, from, to] of r) for (const n of [from, to]) expect(shadeStep(n, 100)).toBe(step)
    for (let i = 1; i < r.length; i++) expect(r[i][1]).toBe(r[i - 1][2] + 1)
    expect(shadeRanges(0)).toEqual([])
    expect(shadeRanges(1)).toEqual([[5, 1, 1]])
  })
})

describe('the tree image keeps the names that fit', () => {
  it('every name when the rows are far enough apart, only rows with a bird on the list', () => {
    const rows = [{ y: 0, n: 2 }, { y: 30, n: 0 }, { y: 60, n: 1 }]
    expect([...keepNames(rows, 24)].sort()).toEqual([0, 2])
  })

  it('largest count first, skipping a name that would touch one already kept (the upper on a tie)', () => {
    const rows = [{ y: 0, n: 1 }, { y: 10, n: 5 }, { y: 20, n: 3 }, { y: 30, n: 3 }, { y: 50, n: 3 }]
    // 5 at 10 first; 3 at 20 touches it, 3 at 30 is kept (20 away), then 3 at 50 (20 from 30); 1 at 0 touches 10.
    expect([...keepNames(rows, 20)].sort()).toEqual([1, 3, 4])
  })
})

describe('the credit on each image', () => {
  it('the map credits the site alone, the tree the site and AvesData (CC BY 4.0); neither the stickers', () => {
    expect(MAP_FOOTER).toBe(SITE_LABEL)
    expect(TREE_FOOTER).toBe(`${SITE_LABEL} · tree: AvesData, McTavish et al., CC BY 4.0`)
    for (const f of [MAP_FOOTER, TREE_FOOTER]) expect(f).not.toMatch(/sticker|huashu/)
    expect(FOOTER_LINE).toBe(`${SITE_LABEL} · stickers by huashu`)
  })

  it('a card draws the footer it is given, the date stamp after it; without one, FOOTER_LINE', async () => {
    const species = buildSpeciesIndex([])
    const base: ShareImageOpts = { format: 'square', entries: [], species, theme: 'light', strings: en.ui, now: new Date(2026, 10, 19), pack: { W: 1, H: 1, boxes: new Map() } }
    expect((await prepareCard({ ...base, footer: TREE_FOOTER })).footerLine).toBe(`${TREE_FOOTER} · 19 Nov 2026`)
    expect((await prepareCard({ ...base, footer: MAP_FOOTER })).footerLine).toBe(`${MAP_FOOTER} · 19 Nov 2026`)
    expect((await prepareCard(base)).footerLine).toBe(`${FOOTER_LINE} · 19 Nov 2026`)
  })
})

describe("the tree image's line under the count", () => {
  const parts = ['24 of 41 orders', '92 of 251 families', '310 of 2,379 genera']
  const len = (s: string) => s.length
  it('one line when it fits, else broken between parts', () => {
    expect(wrapParts(parts, len, 100)).toEqual(['24 of 41 orders · 92 of 251 families · 310 of 2,379 genera'])
    expect(wrapParts(parts, len, 40)).toEqual(['24 of 41 orders · 92 of 251 families', '310 of 2,379 genera'])
    expect(wrapParts(parts, len, 10)).toEqual(parts)
  })
})
