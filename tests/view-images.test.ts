// The Map and Tree views' share images, their pure parts: how the map is fitted, where its top places go, which tree
// names are kept, and where the tree's fan goes.
import { describe, expect, it } from 'vitest'
import { mapImageLayout, TOP_PLACES } from '@/lib/share/map-image'
import { en } from '@/i18n/messages/en'
import { FOOTER_LINE, SITE_LABEL, cardLayout, prepareCard, type ShareImageOpts } from '@/lib/share/image'
import { fanFits, imageFanBox, keepNames } from '@/lib/share/tree-image'
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

describe('the tree image draws a fan in a wide or square area, rows in a tall one', () => {
  it('a square, post or horizontal area draws the fan; the story rows', () => {
    expect(fanFits({ w: 952, h: 700 })).toBe(true)
    expect(fanFits({ w: 952, h: 1000 })).toBe(true)
    expect(fanFits({ w: 952, h: 1300 })).toBe(false)
  })
  it('the fan and its names fit the area above the axis and key, centred', () => {
    for (const area of [{ x: 64, y: 300, w: 952, h: 640 }, { x: 64, y: 200, w: 1800, h: 600 }]) {
      const below = 84
      const box = imageFanBox(area, below)
      expect(box.cx).toBe(area.x + area.w / 2)
      const out = (box.cy - box.R) - area.y // the names' room over the arc's top
      expect(out).toBeGreaterThanOrEqual(240)
      expect(box.cx - box.R - 240).toBeGreaterThanOrEqual(area.x - 0.5)
      expect(box.cy + below).toBeLessThanOrEqual(area.y + area.h + 0.5)
    }
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
