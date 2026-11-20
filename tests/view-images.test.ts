// The Map and Tree views' share images, their pure parts: how the map is fitted, where its top places go, the tree's
// four equal totals, and its Rectangular names (every tip named).
import { describe, expect, it } from 'vitest'
import { mapImageLayout, TOP_PLACES } from '@/lib/share/map-image'
import { en } from '@/i18n/messages/en'
import { FOOTER_LINE, SITE_LABEL, cardLayout, prepareCard, type ShareImageOpts } from '@/lib/share/image'
import { IMAGE_SIZES, TOTALS, rowsLabels, totalsSize } from '@/lib/share/tree-image'
import { LABEL_GAP, fitRound } from '@/lib/tree/fan'
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

  it('the top places sit beside the map in a wide area, under it otherwise, every one inside the frame in every image shape', () => {
    for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
      const c = cardLayout(format, { name: true, filter: true, latest: false, count: 318 }).collage
      // The count's block takes the top of the collage's area (view-image.ts).
      const area = { x: c.x, y: c.y + 200, w: c.w, h: c.h - 200 }
      const L = mapImageLayout(area, 12, true)
      expect(L.rows, format).toBe(TOP_PLACES)
      const list = L.list!
      expect(list.x, format).toBeGreaterThanOrEqual(area.x)
      expect(list.x + list.w, format).toBeLessThanOrEqual(area.x + area.w + 1e-6)
      expect(list.y, format).toBeGreaterThanOrEqual(area.y - 1e-6)
      expect(list.y + list.h, format).toBeLessThanOrEqual(area.y + area.h + 1e-6)
      expect(L.map.w, format).toBeGreaterThan(area.w * 0.5)
      expect(L.map.h, format).toBeGreaterThan(area.h * 0.3)
      if (L.side) expect(L.map.x + L.map.w, format).toBeLessThan(list.x)
      else expect(L.map.y + L.map.h + L.legendH, format).toBeLessThanOrEqual(list.y + 1e-6)
      expect(L.side, format).toBe(area.w >= area.h * 1.2)
    }
  })

  it('fewer places than five list them all; none, no list; a short area lists only what fits', () => {
    const area = { x: 0, y: 0, w: 952, h: 1000 }
    expect(mapImageLayout(area, 3, true).rows).toBe(3)
    expect(mapImageLayout(area, 0, false).list).toBeNull()
    const short = mapImageLayout({ x: 0, y: 0, w: 1800, h: 200 }, 9, true)
    expect(short.side).toBe(true)
    expect(short.rows * 64).toBeLessThanOrEqual(200)
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
    // Never larger than the cap, however wide the image; one total ("Hide totals") as large as that.
    expect(totalsSize(['1 / 2'], 1800, w).num).toBe(56)
  })
})

describe('the tree image names every tip', () => {
  it('Rectangular: one size for every name, small enough for the longest; the counts only where they fit', () => {
    const spans = [{ name: 5, count: 3, on: true }, { name: 20, count: 3, on: false }, { name: 4, count: 0, on: false }]
    const { px, box, counts } = rowsLabels(spans, 40, 500)
    expect(px).toBeLessThanOrEqual(30)
    expect(box + px * (2 * LABEL_GAP + 20)).toBeLessThanOrEqual(500 + 1e-9) // the longest name fits whole
    expect(box).toBeLessThanOrEqual(40)
    expect(counts).toEqual([true, false, false])
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
  it('the map has the collage footer; the tree adds AvesData, each credit in one form', () => {
    expect(FOOTER_LINE).toBe('everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(MAP_FOOTER).toBe(FOOTER_LINE)
    expect(TREE_FOOTER).toBe('everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0 · Tree: AvesData, CC BY 4.0')
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
