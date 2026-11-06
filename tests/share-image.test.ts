import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAME_MAX } from '@/lib/share/link'
import { IMAGE_SIZE, NAME_MAX_LEN, SHARE_COLORS, cardLayout, filterLabel, maxTileSide, shareCardText } from '@/lib/share/image'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Trip } from '@/lib/list/trips'
import { orderLabel } from '@/lib/species/orders'

const row = (code: string, ord: string, fam: string, famCom: string) => ({ code, com: code, sci: code, ord, fam, famCom, to: 1 }) as never
const rows = [row('grbher3', 'Pelecaniformes', 'Ardeidae', 'Herons, Egrets, and Bitterns'), row('houspa', 'Passeriformes', 'Passeridae', 'Old World Sparrows')]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const trips: Trip[] = [{ id: 'EG-2026-09-01', country: 'EG', start: '2026-09-01', end: '2026-09-12', label: 'Egypt · Sep 2026', codes: ['grbher3'] }]
const countryName = (iso: string) => ({ EG: 'Egypt', CA: 'Canada' })[iso] ?? iso
const ctx = { species, trips, countryName }

describe('shareCardText', () => {
  it('gives the count and the latest lifer line', () => {
    expect(shareCardText(197, { com: 'Western Grebe', date: '2026-09-30' })).toEqual({
      count: '197 species',
      latest: 'Latest lifer: Western Grebe · Sep 2026',
    })
  })
  it('groups thousands, leaves out a missing latest lifer, and drops a missing date', () => {
    expect(shareCardText(1234)).toEqual({ count: '1,234 species' })
    expect(shareCardText(1, { com: 'Mallard' })).toEqual({ count: '1 species', latest: 'Latest lifer: Mallard' })
    expect(shareCardText(3, { com: 'Mallard', date: '2024' }).latest).toBe('Latest lifer: Mallard · 2024')
  })
})

describe('filterLabel', () => {
  it('is undefined with no filter', () => {
    expect(filterLabel({}, ctx)).toBeUndefined()
  })
  it('reads the filter in words: birds, then place, then time', () => {
    expect(filterLabel({ country: 'EG', year: '2026' }, ctx)).toBe('Egypt · 2026')
    expect(filterLabel({ order: 'Pelecaniformes', family: 'Ardeidae', country: 'EG' }, ctx)).toBe('Herons, Egrets, and Bitterns · Egypt')
    expect(filterLabel({ order: 'Passeriformes' }, ctx)).toBe('Perching birds')
    expect(filterLabel({ year: '2025' }, ctx)).toBe('2025')
  })
  it('a trip stands for its country and year', () => {
    expect(filterLabel({ year: '2026', trip: 'EG-2026-09-01' }, ctx)).toBe('Egypt · Sep 2026')
    expect(filterLabel({ country: 'EG', year: '2026', trip: 'EG-2026-09-01' }, ctx)).toBe('Egypt · Sep 2026')
    expect(filterLabel({ order: 'Pelecaniformes', year: '2026', trip: 'EG-2026-09-01' }, ctx)).toBe(`${orderLabel('Pelecaniformes')} · Egypt · Sep 2026`)
  })
})

describe('share image constants', () => {
  it('story is 1080×1920 and post is 1080×1350', () => {
    expect(IMAGE_SIZE.story).toEqual([1080, 1920])
    expect(IMAGE_SIZE.post).toEqual([1080, 1350])
  })
  it('the name field allows what a share link carries', () => {
    expect(NAME_MAX_LEN).toBe(NAME_MAX)
  })
  it('colours equal tokens.css (light and dark)', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles/tokens.css'), 'utf8')
    const block = (sel: string) => {
      const i = css.indexOf(sel)
      return css.slice(css.indexOf('{', i), css.indexOf('}', i))
    }
    const light = block(':root[data-theme=light]'), dark = block(':root[data-theme=dark]')
    for (const [theme, body] of [['light', light], ['dark', dark]] as const) {
      const map = SHARE_COLORS[theme] as Record<string, string>
      const names = ['ink', 'paper', 'accent', 'muted', 'line', 'hairline', 'surface']
      expect(Object.keys(map).sort()).toEqual([...names].sort())
      for (const n of names) expect(body).toMatch(new RegExp(`--${n}:\\s*${map[n]}\\s*;`, 'i'))
    }
  })
})

describe('cardLayout', () => {
  const SAFE = { story: { top: 250, bottom: 340 }, post: { top: 64, bottom: 64 } } as const
  for (const format of ['story', 'post'] as const) {
    it(`${format}: the birder's name and count lead, the collage, then the latest lifer and the footer, inside the safe zones`, () => {
      const [W, H] = IMAGE_SIZE[format]
      const { top, bottom } = SAFE[format]
      for (const hasName of [false, true]) for (const hasFilter of [false, true]) for (const hasLatest of [false, true]) {
        const L = cardLayout(format, hasName, hasFilter, hasLatest)
        expect([L.W, L.H]).toEqual([W, H])
        expect(L.collage.x).toBe(64)
        expect(L.collage.w).toBe(W - 128)
        // Top: the name (if any), then the count, then the filter in words.
        const first = hasName ? L.name! : L.count
        expect(first.y).toBe(top)
        if (hasName) expect(L.count.y).toBeGreaterThanOrEqual(L.name!.y + L.name!.size)
        expect(L.count.size).toBe(96)
        if (hasFilter) expect(L.filter!.y).toBeGreaterThanOrEqual(L.count.y + L.count.size)
        const headBottom = hasFilter ? L.filter!.y + L.filter!.size : L.count.y + L.count.size
        expect(L.collage.y).toBeGreaterThan(headBottom)
        // Bottom: a hairline, the latest lifer, the footer; nothing in the bottom safe zone.
        expect(L.rule.y).toBeGreaterThan(L.collage.y + L.collage.h)
        if (hasLatest) expect(L.latest!.y).toBeGreaterThan(L.rule.y)
        expect(L.footer.y).toBeGreaterThan(hasLatest ? L.latest!.y : L.rule.y)
        expect(L.footer.y + L.footer.size).toBeLessThanOrEqual(H - bottom)
        expect(L.collage.h).toBeGreaterThan(format === 'story' ? 800 : 700)
      }
      expect(cardLayout(format, true, true, true).collage.h).toBeLessThan(cardLayout(format, false, false, true).collage.h)
    })
  }
  it('no sticker is drawn wider than 22% of the collage, so a short list sits as a cluster', () => {
    expect(maxTileSide(952)).toBeCloseTo(952 * 0.22)
    expect(maxTileSide(4000)).toBe(440) // and never past the 384px files' sharp size
  })
})
