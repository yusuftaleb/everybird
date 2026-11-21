// The Map and Tree views' share images, their pure parts: how the map is fitted, where its six top places go (a column
// in the Story and the portrait poster, else three columns by two rows), the totals the Totals row keeps, the tree's
// equal totals, and its Rectangular names (every tip named).
import { describe, expect, it } from 'vitest'
import { MAP_TOTALS, gridColumns, mapImageLayout, mapListsInColumn, TOP_PLACES } from '@/lib/share/map-image'
import { printDesign } from '@/lib/share/print'
import { VIEW_TOTALS } from '@/components/share/dialog-options'
import { en } from '@/i18n/messages/en'
import { FOOTER_LINE, SMALL_INLINE, SMALL_ROW, cardLayout, prepareCard, type ShareImageOpts } from '@/lib/share/image'
import { IMAGE_SIZES, TOTALS, rowsLabels, totalsSize } from '@/lib/share/tree-image'
import { LABEL_GAP, fitRound } from '@/lib/tree/fan'
import { MAP_FOOTER, TREE_FOOTER, chosenTotals, fitBox, wrapParts } from '@/lib/share/view-image'
import { buildSpeciesIndex } from '@/lib/species/load'

describe('the map image', () => {
  it('fits the map whole in the area, centred on the side with room to spare', () => {
    // The world (2000 × 983) in a tall story area: as wide as the area, centred vertically.
    expect(fitBox(2000, 983, { x: 64, y: 300, w: 952, h: 1200 })).toEqual({ x: 64, y: 300 + (1200 - 983 * 0.476) / 2, s: 0.476 })
    // A tall province layer in a wide area: as tall as the area, centred across.
    const f = fitBox(100, 400, { x: 0, y: 0, w: 1000, h: 200 })
    expect(f).toEqual({ x: 475, y: 0, s: 0.5 })
  })

  it('six places: in a column under the map in the Story and the portrait poster, in three columns by two rows in every other format, inside the frame', () => {
    expect(TOP_PLACES).toBe(6)
    for (const format of ['story', 'post', 'square', 'desktop', 'wide', 'print', 'printLandscape'] as const) {
      const c = cardLayout(format, { name: true, filter: true, latest: false, count: 318, viewFooter: true }, format.startsWith('print') ? printDesign('A2', format === 'printLandscape') : undefined).collage
      // The totals take the top of the collage's area (view-image.ts).
      const area = { x: c.x, y: c.y + 100, w: c.w, h: c.h - 100 }
      const grid = !mapListsInColumn(format)
      expect(grid, format).toBe(format !== 'story' && format !== 'print')
      // The world (2000 × 983) at the area's full width.
      const mapH = (983 * area.w) / 2000
      const L = mapImageLayout(area, 12, true, grid, mapH)
      expect(L.rows, format).toBe(6)
      expect(L.cols, format).toBe(grid ? 3 : 1)
      const list = L.list!
      expect(list.y + list.h, format).toBeLessThanOrEqual(area.y + area.h + 1e-6)
      // The map's box is the area's width, the rest of its height once the legend and the list are under it.
      expect(L.map.w, format).toBe(area.w)
      expect(L.map.y + L.map.h + L.legendH, format).toBeLessThan(list.y)
      if (grid) {
        expect(L, format).toMatchObject({ k: 1, pitch: 64 })
        expect(list.h, format).toBe(64 + 46)
      } else {
        // The column (round 6): the map at the full width, its box exactly the map's height, and the rows grown to fill
        // the rest down to the area's foot, nothing left over (no empty band under the six countries).
        expect(L.map.h, format).toBeCloseTo(mapH, 6)
        expect(list.y + list.h, format).toBeCloseTo(area.y + area.h, 6)
        expect(L.k, format).toBeGreaterThan(1.4)
        expect(L.k, format).toBeLessThanOrEqual(2)
        expect(L.pitch, format).toBeGreaterThanOrEqual(64 * L.k - 1e-6)
        expect(fitBox(2000, 983, L.map).s * 2000, format).toBeCloseTo(area.w, 6)
      }
      if (grid) {
        // The world (2000 × 983) takes the whole width where the height allows (Post), else as much as it allows: in
        // every format larger than with the places in a column.
        const s = fitBox(2000, 983, L.map).s
        expect(s, format).toBeGreaterThan(fitBox(2000, 983, mapImageLayout(area, 12, true, false).map).s)
        expect(2000 * s, format).toBeGreaterThan(area.w * (format === 'post' ? 0.99 : format === 'square' ? 0.85 : 0.55))
      }
    }
  })

  it("the grid's columns are the map's width, at least three 300-unit cells, centred on the map and inside the area", () => {
    const area = { x: 214, y: 0, w: 1492, h: 600 }
    const wide = gridColumns(area, 214 + 746, 1400)
    expect(wide[0].x).toBeCloseTo(214 + 46)
    expect(wide[2].x + wide[2].w).toBeCloseTo(214 + 46 + 1400)
    expect(wide[1].x - (wide[0].x + wide[0].w)).toBe(32)
    // A map the height keeps narrow (the desktop's): the grid is still three cells of 300.
    const narrow = gridColumns(area, 214 + 746, 600)
    expect(narrow[0].w).toBe(300)
    expect(narrow[2].x + narrow[2].w - narrow[0].x).toBe(964)
    // Never wider than the area, never past its edges.
    const square = gridColumns({ x: 64, y: 0, w: 952, h: 600 }, 64 + 476, 830)
    expect(square[0].x).toBe(64)
    expect(square[2].x + square[2].w).toBeCloseTo(64 + 952)
  })

  it('fewer places than six list them all; none, no list; a short area lists only what fits', () => {
    const area = { x: 0, y: 0, w: 952, h: 1000 }
    expect(mapImageLayout(area, 3, true, false).rows).toBe(3)
    expect(mapImageLayout(area, 4, true, true)).toMatchObject({ rows: 4, cols: 3 })
    expect(mapImageLayout(area, 0, false, true).list).toBeNull()
    const short = mapImageLayout({ x: 0, y: 0, w: 952, h: 300 }, 9, true, false)
    expect(short.rows).toBe(2)
    // No room under a full-width map: the rows keep their size and the map shrinks into what is left.
    expect(mapImageLayout({ x: 0, y: 0, w: 952, h: 600 }, 6, true, false, 468)).toMatchObject({ k: 1, pitch: 64 })
    // Two places in a tall column: grown to the cap, spread at most a quarter more, the rest left to the centring.
    const two = mapImageLayout({ x: 0, y: 0, w: 952, h: 1400 }, 2, true, false, 468)
    expect(two).toMatchObject({ k: 2, pitch: 2 * 64 * 1.25 })
    expect(two.map.h).toBeGreaterThan(468)
    expect(mapImageLayout({ x: 0, y: 0, w: 1800, h: 200 }, 9, true, true).rows).toBe(3)
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

describe('the tree image: four equal totals on top', () => {
  it('species, genera, families and orders, in that order, every number the same size, the largest that fits each', () => {
    expect(TOTALS).toEqual(['species', 'genera', 'families', 'orders'])
    const texts = ['202 / 11,201', '150 / 2,379', '60 / 251', '20 / 41']
    const w = (s: string) => s.length * 0.55
    const { num, label } = totalsSize(texts, 952, w)
    // One size for the four, set by the widest, each inside its quarter.
    expect(num).toBe(Math.floor((952 / 4 - 24) / w(texts[0])))
    for (const t of texts) expect(w(t) * num).toBeLessThanOrEqual(952 / 4)
    expect(label).toBeLessThan(num)
    // Never larger than the cap, however wide the image; one total (the Totals row's species alone) as large as that.
    expect(totalsSize(['1 / 2'], 1800, w).num).toBe(56)
  })
})

describe("the row: the tree's oldest lineage and the collage's latest lifer, one form (round 6, items 4 and 17)", () => {
  const content = { name: true, filter: true, latest: true, count: 200 }
  it('the Story stacks it (SMALL_ROW): the sticker and two lines, only the row gap from the drawing', () => {
    const L = cardLayout('story', content)
    expect(L.latest).toMatchObject({ icon: SMALL_ROW.icon, label: SMALL_ROW.label, name: SMALL_ROW.name })
    expect(L.latest!.inline).toBeUndefined()
    expect(L.latest!.y - (L.collage.y + L.collage.h)).toBe(24 + L.latest!.lift!)
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

describe('the credit on each image', () => {
  it('the map has the site alone; the tree adds AvesData, each credit in one form', () => {
    expect(FOOTER_LINE).toBe('everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(MAP_FOOTER).toBe('everybird.yusuftaleb.com')
    expect(TREE_FOOTER).toBe('everybird.yusuftaleb.com · Stickers: huashu-bird-sticker · Tree: AvesData · CC BY 4.0')
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
