// The Map image drawn by its real painter on the Tree sweep's recording context (tests/fixtures/tree-image-harness.ts,
// the stored glyph advances), in the frame the real card lays out (cardLayout): the totals at the top right as the
// tree's (totalsPlace, TOTALS_TYPE), the top countries in two columns of three with no bars at the small row's size,
// nothing over anything, the map's box larger than before (r6). Synthetic lists only.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { SMALL_ROW, type CardFormat, type ShareImageOpts } from '@/lib/share/image'
import { TOTALS_TYPE, totalsPlace } from '@/lib/share/view-image'
import { printDesign, type PrintSize } from '@/lib/share/print'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { FONTS, quadsOverlap, shrink, textWidth, yRange, type Pt } from './fixtures/tree-image-harness'

const shipped = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const world = JSON.parse(readFileSync('public/data/map-countries.v1.json', 'utf8'))
const species = buildSpeciesIndex(shipped.species)

vi.mock('@/lib/map/shapes', async (orig) => ({ ...(await orig<typeof import('@/lib/map/shapes')>()), loadMapCountries: async () => (globalThis as { __world?: unknown }).__world }))
vi.mock('@/lib/flag', () => ({ flagSrc: (iso: string) => (iso ? `/flags/${iso}.svg` : null) }))
type Rec = ReturnType<typeof import('./fixtures/tree-image-harness').recorder>
const frame = vi.hoisted(() => ({ last: null as null | { rec: Rec; clips: Pt[][]; bars: number; L: { collage: { x: number; y: number; w: number; h: number }; name?: { y: number; size: number } } } }))
vi.mock('@/lib/share/view-image', async (orig) => {
  const real = await orig<typeof import('@/lib/share/view-image')>()
  const { cardLayout } = await import('@/lib/share/image')
  const h = await import('./fixtures/tree-image-harness')
  return {
    ...real,
    renderViewImage: async (opts: ShareImageOpts, paint: (ctx: CanvasRenderingContext2D, card: unknown, area: unknown) => void) => {
      const print = opts.format === 'print' || opts.format === 'printLandscape'
      const L = cardLayout(opts.format, { name: !!opts.name, filter: false, latest: false, count: 0, countSize: 'hide' }, print ? printDesign(opts.printSize ?? 'A2', opts.format === 'printLandscape') : undefined)
      const rec = h.recorder()
      const clips: Pt[][] = []
      let bars = 0
      const c = rec.ctx as unknown as Record<string, unknown>
      c.rect = (x: number, y: number, w: number, hh: number) => { clips.push([[x, y], [x + w, y], [x + w, y + hh], [x, y + hh]]) }
      c.roundRect = () => { bars++ }
      const card = { L, name: opts.name?.trim() || undefined, colors: { ink: '#000000', line: '#999999', muted: '#666666', paper: '#ffffff', hairline: '#dddddd', accent: '#cc0000', surface: '#eeeeee' }, fonts: h.FONTS, transparent: false }
      paint(rec.ctx, card, { ...L.collage })
      frame.last = { rec, clips, bars, L }
      return new Blob(['map'])
    },
  }
})
const { renderMapImage } = await import('@/lib/share/map-image')

beforeAll(() => {
  const g = globalThis as Record<string, unknown>
  g.__world = world
  // No path data: the recorder samples none (the map's shapes are checked by their clip box).
  g.Path2D = class {}
  // Flags "load" from a stub SVG.
  vi.stubGlobal('fetch', async () => ({ text: async () => '<svg viewBox="0 0 4 3"></svg>' }))
  vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }))
  vi.stubGlobal('Image', class { src = ''; decode() { return Promise.resolve() } })
})

/** A list with birds in the first `n` of these countries, more birds in the earlier ones. */
const COUNTRIES = ['BA', 'CD', 'US', 'DE', 'RU', 'CA', 'KE', 'GB']
const LONG: Record<string, string> = { BA: 'Bosnia and Herzegovina', CD: 'Democratic Republic of the Congo', US: 'Vereinigte Staaten von Amerika', DE: 'Deutschland', RU: 'Российская Федерация', CA: 'Canada', KE: 'Kenya', GB: 'United Kingdom' }
const listOf = (n: number) => {
  const pattern = Array.from({ length: n }, (_, j) => Array<number>(n - j).fill(j)).flat()
  return shipped.species.slice(0, 400).map((r, i) => ({ code: r.code, date: '2020-01', place: { country: COUNTRIES[pattern[i % pattern.length]] }, heard: false, dead: false, media: false, sources: ['ebird'] }))
}
const names = (k: string) => LONG[k.slice(2)] ?? k.slice(2)

type Case = { format: CardFormat; size?: PrintSize }
const FORMATS: Case[] = [
  { format: 'story' }, { format: 'post' }, { format: 'square' }, { format: 'desktop' }, { format: 'wide' },
  { format: 'print', size: 'A4' }, { format: 'print', size: 'A2' }, { format: 'printLandscape', size: 'A4' }, { format: 'printLandscape', size: 'A2' },
]
const label = ({ format, size }: Case) => `${format}${size ? ` ${size}` : ''}`

async function draw(c: Case, opts: { n: number; name?: string; totals?: readonly ('species' | 'countries')[]; theme?: 'light' | 'dark' }) {
  const list = listOf(opts.n)
  await renderMapImage({
    format: c.format, ...(c.size ? { printSize: c.size } : {}), entries: list, species, theme: opts.theme ?? 'light', strings: en.ui, latest: false,
    ...(opts.name ? { name: opts.name } : {}), at: { names }, state: { list, filter: {}, seen: undefined, sci: false }, t: en.ui,
    ...(opts.totals ? { totals: opts.totals } : {}),
  } as unknown as Parameters<typeof renderMapImage>[0])
  return frame.last!
}

const xs = (b: Pt[]) => b.map((p) => p[0])
const xRange = (b: Pt[]): [number, number] => [Math.min(...xs(b)), Math.max(...xs(b))]
/** A text's baseline (the recorder's em box: 0.75 of the size above it). */
const baseline = (d: { box: Pt[]; px: number }) => yRange(d.box)[0] + 0.75 * d.px

const TITLES = [undefined, 'Ada', 'Yusuf’s birds of the whole wide world']
const TOTALS: (readonly ('species' | 'countries')[] | undefined)[] = [undefined, ['countries'], []]

describe('the Map image: totals at the top right, the top countries in two columns of three', () => {
  const seen = { band: 0, under: 0, clipped: 0 }
  for (const c of FORMATS) for (const n of [1, 3, 6, 8]) for (const name of TITLES) for (const totals of TOTALS) {
    it(`${label(c)}, ${n} countries, ${name ? `"${name}"` : 'no title'}, ${totals ? `totals [${totals.join(', ')}]` : 'both totals'}`, async () => {
      const { rec, bars, clips, L } = await draw(c, { n, name, totals })
      const content = L.collage
      // The totals: as the tree's, one right-aligned group at the content's top right, placed by totalsPlace.
      const nums = rec.texts.filter((x) => x.font.startsWith('700') && x.font.endsWith('px count'))
      const labels = rec.texts.filter((x) => /^500 [\d.]+px mono$/.test(x.font) && x.px < SMALL_ROW.label)
      const want = totals ?? ['species', 'countries']
      expect(nums.length).toBe(want.length)
      // Drawn right to left; "COUNTRY" for one.
      expect(labels.map((x) => x.s.replace(/IES$|Y$/, ''))).toEqual([...want].reverse().map((k) => (k === 'species' ? 'SPEC' : 'COUNTR')))
      if (want.length) {
        const k = nums[0].px / TOTALS_TYPE.num
        const groupW = labels.reduce((sum, l, i) => sum + Math.max(textWidth(nums[i].s, FONTS.count(TOTALS_TYPE.num)), textWidth(l.s, FONTS.mono(TOTALS_TYPE.label), TOTALS_TYPE.track * TOTALS_TYPE.label)) + (i ? TOTALS_TYPE.between : 0), 0)
        const titleW = name && L.name ? textWidth(name, FONTS.name(L.name.size)) : undefined
        const place = totalsPlace(groupW, titleW, content.w)
        expect(k).toBeCloseTo(place.k, 9)
        expect(Math.max(...nums.map((x) => xRange(x.box)[1]))).toBeCloseTo(content.x + content.w, 6)
        const top = Math.min(...nums.map((x) => yRange(x.box)[0]))
        if (place.band) { seen.band++; expect(top).toBeLessThan(content.y) } else { seen.under++; expect(top).toBeGreaterThanOrEqual(content.y - 2) }
      }
      // The list: every country up to six, two columns of three, the left one first, at the small row's size, no bars.
      const names = rec.texts.filter((x) => x.font === FONTS.lifer(SMALL_ROW.name))
      const counts = rec.texts.filter((x) => x.font === FONTS.mono(SMALL_ROW.label))
      const shown = Math.min(n, 6)
      expect(names).toHaveLength(shown)
      expect(counts).toHaveLength(shown)
      expect(bars).toBeLessThanOrEqual(1) // the legend's ramp only
      expect(rec.rects).toHaveLength(0)
      const left = xRange(names[0].box)[0]
      names.forEach((x, i) => {
        if (i < 3) expect(xRange(x.box)[0]).toBeCloseTo(left, 6)
        else {
          expect(xRange(x.box)[0]).toBeGreaterThan(left + 300)
          expect(baseline(x)).toBeCloseTo(baseline(names[i - 3]), 6)
        }
        if (i % 3) expect(baseline(x)).toBeGreaterThan(baseline(names[i - 1]))
        // Name and count on one baseline; the name clipped clear of the count.
        expect(baseline(counts[i])).toBeCloseTo(baseline(x), 6)
        expect(xRange(counts[i].box)[0] - xRange(x.box)[1]).toBeGreaterThanOrEqual(15.9)
        if (x.s.endsWith('…')) seen.clipped++
      })
      // Nothing over anything: every text, flag and the map's box; all of it inside the card's content but the totals on the band.
      const map = clips[0]
      const things: Pt[][] = [...rec.texts.map((x) => shrink(x.box, 0.1)), ...rec.images, map]
      for (let i = 0; i < things.length; i++) for (let j = i + 1; j < things.length; j++) expect(quadsOverlap(things[i], things[j]), `${i} over ${j}`).toBe(false)
      for (const b of [...names.map((x) => x.box), ...counts.map((x) => x.box), map]) {
        expect(xRange(b)[0]).toBeGreaterThanOrEqual(content.x - 1e-6)
        expect(xRange(b)[1]).toBeLessThanOrEqual(content.x + content.w + 1e-6)
        expect(yRange(b)[1]).toBeLessThanOrEqual(content.y + content.h + 1e-6)
      }
    })
  }
  it('both placements occur, and long names clip', () => {
    expect(seen.band).toBeGreaterThan(0)
    expect(seen.under).toBeGreaterThan(0)
    expect(seen.clipped).toBeGreaterThan(0)
  })
})

describe("the map's box grew (r6: the smaller list and the moved totals give it their room)", () => {
  // Before (the totals centred over the map, the list in a column or a 3 × 2 grid with bars): the drawn map, six
  // countries, title "Ada", both totals. Story, Post and the portrait posters were already as wide as the content.
  const BEFORE: Record<string, [number, number]> = {
    story: [952.0, 467.9], post: [952.0, 467.9], square: [931.6, 457.8], desktop: [939.7, 461.8], wide: [964.2, 473.8],
    'print A4': [952.0, 467.9], 'print A2': [952.0, 467.9], 'printLandscape A4': [988.6, 485.8], 'printLandscape A2': [988.6, 485.8],
  }
  for (const c of FORMATS) {
    it(label(c), async () => {
      const { clips, L } = await draw(c, { n: 6, name: 'Ada' })
      const b = clips[0], w = b[1][0] - b[0][0], h = b[2][1] - b[0][1]
      const [w0, h0] = BEFORE[label(c)]
      // As wide as the content now, or larger than before.
      if (w < L.collage.w - 1e-6) expect(w * h).toBeGreaterThan(w0 * h0 * 1.05)
      else expect(w).toBeCloseTo(L.collage.w, 6)
      expect(w).toBeGreaterThanOrEqual(w0 - 0.05)
    })
  }
})
