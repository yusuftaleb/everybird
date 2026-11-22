// The Map and Tree views' share images, their pure parts: how the map is fitted, where its six top places go (two
// columns of three in every format), the totals the Totals row keeps, the tree's equal totals, and its Rectangular
// names (every tip named).
import { describe, expect, it } from 'vitest'
import { LIST, LIST_COLS, LIST_ROWS, MAP_TOTALS, ROW, listColumns, mapImageLayout, TOP_PLACES } from '@/lib/share/map-image'
import { printDesign } from '@/lib/share/print'
import { VIEW_TOTALS } from '@/components/share/dialog-options'
import { en } from '@/i18n/messages/en'
import { FOOTER_LINE, SMALL_INLINE, SMALL_ROW, cardLayout, prepareCard, type ShareImageOpts } from '@/lib/share/image'
import { IMAGE_SIZES, TOTALS, TOTALS_TYPE, rowsLabels, totalsPlace } from '@/lib/share/tree-image'
import { LABEL_GAP, fitRound } from '@/lib/tree/fan'
import { chosenTotals, fitBox, wrapParts } from '@/lib/share/view-image'
import { buildSpeciesIndex } from '@/lib/species/load'

describe('the map image', () => {
  it('fits the map whole in the area, centred on the side with room to spare', () => {
    // The world (2000 × 983) in a tall story area: as wide as the area, centred vertically.
    expect(fitBox(2000, 983, { x: 64, y: 300, w: 952, h: 1200 })).toEqual({ x: 64, y: 300 + (1200 - 983 * 0.476) / 2, s: 0.476 })
    // A tall province layer in a wide area: as tall as the area, centred across.
    const f = fitBox(100, 400, { x: 0, y: 0, w: 1000, h: 200 })
    expect(f).toEqual({ x: 475, y: 0, s: 0.5 })
  })

  it('six places: two columns of three under the map in every format, inside the frame, the rest the map\'s', () => {
    expect(TOP_PLACES).toBe(6)
    expect([LIST_COLS, LIST_ROWS]).toEqual([2, 3])
    for (const format of ['story', 'post', 'square', 'desktop', 'wide', 'print', 'printLandscape'] as const) {
      const c = cardLayout(format, { name: true, filter: true, latest: false, count: 318 }, format.startsWith('print') ? printDesign('A2', format === 'printLandscape') : undefined).collage
      // The totals take the top of the collage's area (view-image.ts).
      const area = { x: c.x, y: c.y + 70, w: c.w, h: c.h - 70 }
      const L = mapImageLayout(area, 12, true)
      expect(L, format).toMatchObject({ rows: 6, perCol: 3 })
      const list = L.list!
      // Three rows at their own pitch, no growing: the list's height is the same in every format.
      expect(list.h, format).toBe(2 * ROW.pitch + ROW.h)
      expect(list.y + list.h, format).toBeCloseTo(area.y + area.h, 9)
      // The map's box is the area's width and every unit of height the legend and the list leave.
      expect(L.map.w, format).toBe(area.w)
      expect(L.map.h + L.legendH + LIST.above + list.h, format).toBeCloseTo(area.h, 9)
    }
  })

  it("the list's columns are the map's width, or the content's when the map is narrower than two comfortable columns", () => {
    const area = { x: 214, y: 0, w: 1492, h: 600 }
    const wide = listColumns(area, 214 + 746, 1400)
    expect(wide).toHaveLength(2)
    expect(wide[0].x).toBeCloseTo(214 + 46)
    expect(wide[1].x + wide[1].w).toBeCloseTo(214 + 46 + 1400)
    expect(wide[1].x - (wide[0].x + wide[0].w)).toBe(LIST.gap)
    // A map the height keeps narrower than two columns of LIST.colMin: the content's width.
    const narrow = listColumns(area, 214 + 746, 600)
    expect(narrow[0].x).toBe(214)
    expect(narrow[1].x + narrow[1].w).toBeCloseTo(214 + 1492)
    // Never wider than the area, never past its edges.
    const square = listColumns({ x: 64, y: 0, w: 952, h: 600 }, 64 + 476, 990)
    expect(square[0].x).toBe(64)
    expect(square[1].x + square[1].w).toBeCloseTo(64 + 952)
  })

  it('fewer places than six fill the left column first; none, no list; a short area lists only the lines that fit', () => {
    const area = { x: 0, y: 0, w: 952, h: 1000 }
    expect(mapImageLayout(area, 1, true)).toMatchObject({ rows: 1, perCol: 1 })
    expect(mapImageLayout(area, 3, true)).toMatchObject({ rows: 3, perCol: 3 })
    expect(mapImageLayout(area, 4, true)).toMatchObject({ rows: 4, perCol: 3 })
    expect(mapImageLayout(area, 0, false).list).toBeNull()
    expect(mapImageLayout({ x: 0, y: 0, w: 952, h: 200 }, 9, true)).toMatchObject({ rows: 4, perCol: 2 })
  })
})

describe('the Totals row: the totals each image draws', () => {
  it('keeps the chosen totals in the image\'s order, any combination, none included; unset, all of them', () => {
    expect(MAP_TOTALS).toEqual(['species', 'countries'])
    expect(chosenTotals(TOTALS, undefined)).toEqual([...TOTALS])
    expect(chosenTotals(TOTALS, ['orders', 'species'])).toEqual(['species', 'orders'])
    expect(chosenTotals(MAP_TOTALS, ['countries'])).toEqual(['countries'])
    expect(chosenTotals(MAP_TOTALS, [])).toEqual([])
    // The dialog's lists are the images' own.
    expect(VIEW_TOTALS.map).toEqual([...MAP_TOTALS])
    expect(VIEW_TOTALS.tree).toEqual([...TOTALS])
  })
})

describe('the tree image: the totals at the top right (round 6, as the promo)', () => {
  it('species, genera, families and orders, in that order; beside the title when both fit, else under it', () => {
    expect(TOTALS).toEqual(['species', 'genera', 'families', 'orders'])
    expect(TOTALS_TYPE).toMatchObject({ num: 44, label: 15, gap: 8, between: 48 })
    // Side by side with the title only when the two and the gap between them fit the width.
    expect(totalsPlace(500, 400, 952)).toEqual({ band: true, k: 1 })
    expect(totalsPlace(500, 405, 952)).toEqual({ band: false, k: 1 })
    // No title: never on a band, still at full size.
    expect(totalsPlace(500, undefined, 952)).toEqual({ band: false, k: 1 })
    // A group wider than the card on its own shrinks to fit it.
    expect(totalsPlace(1904, undefined, 952).k).toBeCloseTo(0.5, 9)
  })
})

describe("the row: the tree's oldest lineage and the collage's latest lifer, one form (round 6, items 4 and 17)", () => {
  const content = { name: true, filter: true, latest: true, count: 200 }
  it('the Story stacks it (SMALL_ROW): the sticker and two lines, only the row gap from the drawing', () => {
    const L = cardLayout('story', content)
    expect(L.latest).toMatchObject({ icon: SMALL_ROW.icon, label: SMALL_ROW.label, name: SMALL_ROW.name })
    expect(L.latest!.inline).toBeUndefined()
    expect(L.latest!.y - (L.collage.y + L.collage.h)).toBe(24)
  })
  it('Desktop, Post (and its 5:4) and Square: one line just above the hairline (SMALL_INLINE), name first', () => {
    for (const format of ['desktop', 'post', 'wide', 'square'] as const) {
      const L = cardLayout(format, content)
      expect(L.latest, format).toMatchObject({ icon: SMALL_INLINE.icon, label: SMALL_INLINE.label, name: SMALL_INLINE.name, inline: true })
      expect(L.latest!.y + L.latest!.icon).toBeLessThan(L.rule.y)
      expect(L.collage.y + L.collage.h).toBeLessThan(L.latest!.y)
    }
  })
})

describe('the round trees report how far they reach (round 6: the block is centred on what is drawn)', () => {
  it('a circle given a height reaches no further than half of it each way; a fan keeps its room under the centre', () => {
    const spans = Array.from({ length: 30 }, (_, i) => ({ name: 6, count: 2, on: i % 3 > 0 }))
    const c = fitRound(spans, 'circle', { w: 952, h: 1100 }, IMAGE_SIZES)!
    expect(c.up).toBeLessThanOrEqual(550)
    expect(c.down).toBeLessThanOrEqual(550)
    expect(c.up + c.down).toBeLessThan(1100)
    const f = fitRound(spans, 'fan', { w: 1492, h: 600 }, IMAGE_SIZES)!
    expect(f.down).toBe(IMAGE_SIZES.below)
    expect(f.up + f.down).toBeLessThanOrEqual(600)
  })
})

describe('the tree image names every tip', () => {
  it('Rectangular: one size for every name, small enough for the longest with its count; every count kept (round 6)', () => {
    const spans = [{ name: 5, count: 3, on: true }, { name: 20, count: 3, on: false }, { name: 4, count: 0, on: false }]
    const { px, box, counts, col } = rowsLabels(spans, 40, 1000)
    expect(px).toBeLessThanOrEqual(30)
    // The longest name and its count fit whole beside the drawing, which gave way first.
    expect(box + px * (3 * LABEL_GAP + 20 + 3)).toBeLessThanOrEqual(col + 1e-9)
    expect(box).toBeLessThanOrEqual(40)
    expect(counts).toEqual([true, true, false])
  })
  it('Fan and Radial: the image fits whatever the screen named, at its own scale', () => {
    // 45 tips the screen names at 900px wide fit the story's 952-unit area.
    const spans = Array.from({ length: 45 }, (_, i) => ({ name: 8, count: 3, on: i % 2 === 0 }))
    expect(fitRound(spans, 'fan', { w: 900 })).toBeDefined()
    const f = fitRound(spans, 'fan', { w: 952, h: 1100 }, IMAGE_SIZES)!
    expect(f).toBeDefined()
    expect(f.h).toBeLessThanOrEqual(1100)
  })
})

describe('the footer on each image', () => {
  it('every card, the Map\'s and the Tree\'s too, links to the credits and dates itself at the right', async () => {
    const species = buildSpeciesIndex([])
    const base: ShareImageOpts = { format: 'square', entries: [], species, theme: 'light', strings: en.ui, now: new Date(2026, 10, 19), pack: { W: 1, H: 1, boxes: new Map() } }
    const card = await prepareCard(base)
    expect([card.footerLine, card.stamp]).toEqual([FOOTER_LINE, '19 Nov 2026'])
    expect(FOOTER_LINE).toBe('everybird.yusuftaleb.com/credits')
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
