// The Tree image's totals (round 6, Yusuf, as the promo's tree poster): one right-aligned group at the top right, each
// number over its rank, right-aligned; beside the card's title on its band (the title at the left) when both fit,
// else right-aligned under the title; without a title, still at the top right. Share images and posters alike.
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import type { CardFormat, ShareImageOpts } from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import { setNames } from '@/lib/species/names'
import type { SpeciesRow } from '@/lib/species/types'
import type { TreeLevel } from '@/lib/tree/levels'
import { parseNewick } from '@/lib/tree/tree'
import { printDesign, type PrintSize } from '@/lib/share/print'
import { TOTALS_TYPE } from '@/lib/share/tree-image'
import { FONTS, textWidth, yRange } from './fixtures/tree-image-harness'

const file = JSON.parse(readFileSync('public/data/tree.v1.json', 'utf8'))
const shipped = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const tree = parseNewick(file.newick, file.taxOnly)
const species = buildSpeciesIndex(shipped.species)
const deNames = JSON.parse(readFileSync('public/data/names.de.v1.json', 'utf8'))
// A list: every third species.
const codes = new Set(shipped.species.filter((_, i) => i % 3 === 0).map((r) => r.code))
const entries = [...codes].map((code) => ({ code, date: '2020-01', place: { country: 'CA' } }))

vi.mock('@/lib/tree/load', () => ({ loadTree: async () => ({ tree: (globalThis as { __tree?: unknown }).__tree }) }))
vi.mock('@/lib/species/load', async (orig) => ({ ...(await orig<typeof import('@/lib/species/load')>()), loadSpecies: async () => (globalThis as { __species?: unknown }).__species }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), loadStickers: async (urls: string[]) => new Map(urls.map((u) => [u, {}])) }))
const frame = vi.hoisted(() => ({ last: null as null | { rec: ReturnType<typeof import('./fixtures/tree-image-harness').recorder>; L: { W: number; H: number; collage: { x: number; y: number; w: number; h: number }; name?: { y: number; size: number } }; latestAs: boolean; row: string } }))
vi.mock('@/lib/share/view-image', async (orig) => {
  const real = await orig<typeof import('@/lib/share/view-image')>()
  const { cardLayout, paintRow } = await import('@/lib/share/image')
  const h = await import('./fixtures/tree-image-harness')
  return {
    ...real,
    renderViewImage: async (opts: ShareImageOpts & { latestAs?: { row: { com: string }; label: string; detail?: string } }, paint: (ctx: CanvasRenderingContext2D, card: unknown, area: unknown) => void) => {
      // The card as the real frame lays it out (prepareCard): the title, the view's footer, the Tree's tighter gaps, a poster's size.
      const print = opts.format === 'print' || opts.format === 'printLandscape'
      const L = cardLayout(opts.format, { name: !!opts.name, filter: false, latest: !!opts.latestAs, count: 0, countSize: 'hide', ...(opts.tight ? { tight: true } : {}) }, print ? printDesign(opts.printSize ?? 'A2', opts.format === 'printLandscape') : undefined)
      const rec = h.recorder()
      const card = { L, name: opts.name?.trim() || undefined, colors: { ink: '#000', line: '#999', muted: '#666', paper: '#fff', hairline: '#ddd', accent: '#c00', surface: '#eee' }, fonts: h.FONTS, transparent: false }
      paint(rec.ctx, card, { ...L.collage })
      // The frame's row, by the frame's own painter (image.ts paintRow), its sticker its square.
      let row = ''
      if (opts.latestAs && L.latest) {
        rec.ctx.drawImage({} as CanvasImageSource, L.latest.x, L.latest.y, L.latest.icon, L.latest.icon)
        row = paintRow(rec.ctx, h.FONTS, card.colors, L.latest, { label: opts.latestAs.label, name: opts.latestAs.row.com, ...(opts.latestAs.detail ? { detail: opts.latestAs.detail } : {}) })
      }
      frame.last = { rec, L, latestAs: !!opts.latestAs, row }
      return new Blob(['tree'])
    },
  }
})
const { renderTreeImage } = await import('@/lib/share/tree-image')

beforeAll(() => {
  (globalThis as { __tree?: unknown }).__tree = tree;
  (globalThis as { __species?: unknown }).__species = species;
  (globalThis as { Path2D?: unknown }).Path2D = class { constructor(public d?: string) {} }
})

type Layout = 'fan' | 'circle' | 'rows'
const CASES: { layout: Layout; format: CardFormat; size?: PrintSize }[] = [
  { layout: 'circle', format: 'story' }, { layout: 'circle', format: 'post' }, { layout: 'rows', format: 'square' },
  { layout: 'fan', format: 'desktop' }, { layout: 'fan', format: 'wide' }, { layout: 'fan', format: 'square' },
  { layout: 'circle', format: 'print', size: 'A2' }, { layout: 'fan', format: 'printLandscape', size: 'A2' }, { layout: 'rows', format: 'print', size: 'A4' },
]
const TITLES = [undefined, 'Ada', 'Yusuf’s tree of the birds of the world']
const xs = (b: [number, number][]) => b.map((p) => p[0])

describe('the Tree totals sit at the top right, beside the title when both fit', () => {
  const seen = { band: 0, under: 0 }
  for (const { layout, format, size } of CASES) for (const name of TITLES) for (const totals of [undefined, ['species', 'families']]) {
    it(`${layout} on ${format}${size ? ` ${size}` : ''}, ${name ? `"${name}"` : 'no title'}, ${totals ? 'two totals' : 'all four'}`, async () => {
      setNames(null)
      await renderTreeImage({
        format, entries, species, theme: 'light', strings: en.ui, latest: false, ...(size ? { printSize: size } : {}), ...(name ? { name } : {}),
        at: { tree: {} as TreeLevel, layout, time: true }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t: en.ui,
        totals, oldest: true, onTreeText: () => {},
      } as unknown as Parameters<typeof renderTreeImage>[0])
      const { rec, L } = frame.last!
      const nums = rec.texts.filter((x) => x.font === FONTS.count(TOTALS_TYPE.num))
      const labels = rec.texts.filter((x) => x.font === FONTS.mono(TOTALS_TYPE.label))
      expect(nums.length).toBe(totals ? 2 : 4)
      expect(labels.length).toBe(nums.length)
      const right = L.collage.x + L.collage.w
      nums.forEach((n, i) => {
        const l = labels[i]
        // Number over its rank, both right-aligned on the block's right edge.
        expect(Math.max(...xs(l.box))).toBeCloseTo(Math.max(...xs(n.box)), 6)
        expect(yRange(l.box)[0]).toBeGreaterThan(yRange(n.box)[0])
      })
      // The group ends at the content's right edge, the blocks left to right in the Totals' order, 48 apart at least.
      const blocks = nums.map((n, i) => [Math.min(...xs(n.box), ...xs(labels[i].box)), Math.max(...xs(n.box)), labels[i].s] as const).sort((p, q) => p[0] - q[0])
      expect(blocks.map((x) => x[2])).toEqual(totals ? ['SPECIES', 'FAMILIES'] : ['SPECIES', 'GENERA', 'FAMILIES', 'ORDERS'])
      expect(blocks.at(-1)![1]).toBeCloseTo(right, 6)
      for (let i = 1; i < blocks.length; i++) expect(blocks[i][0] - blocks[i - 1][1]).toBeGreaterThanOrEqual(TOTALS_TYPE.between - 1e-6)
      const top = Math.min(...nums.map((n) => yRange(n.box)[0])), bottom = Math.max(...labels.map((l) => yRange(l.box)[1]))
      const left = blocks[0][0]
      if (!name) {
        // No title: at the top of the content, right-aligned.
        expect(L.name).toBeUndefined()
        // (The em box starts 0.03 em above the caps, which sit on the content's top.)
        expect(top).toBeGreaterThanOrEqual(L.collage.y - 2)
        expect(top).toBeLessThan(L.collage.y + 20)
        return
      }
      const T = L.name!
      const titleW = textWidth(name, FONTS.name(T.size))
      const band = titleW + TOTALS_TYPE.between + (right - left) <= L.collage.w + 1e-6
      if (band) {
        seen.band++
        // On the title's band: level with it, clear of it by the gap.
        expect(top).toBeLessThan(T.y + T.size)
        expect(bottom).toBeGreaterThan(T.y)
        expect(left - (L.collage.x + titleW)).toBeGreaterThanOrEqual(TOTALS_TYPE.between - 1e-6)
      } else {
        seen.under++
        // Under the title, right-aligned: the title's line first.
        expect(top).toBeGreaterThanOrEqual(T.y + T.size)
      }
      // Nothing else drawn reaches up into the totals (the drawing starts under them).
      const drawing = rec.texts.filter((x) => !nums.includes(x) && !labels.includes(x)).filter((x) => Math.min(...xs(x.box)) < right && Math.max(...xs(x.box)) > left)
      for (const x of drawing) if (yRange(x.box)[1] > top && yRange(x.box)[0] < L.collage.y + L.collage.h) expect(yRange(x.box)[0]).toBeGreaterThanOrEqual(bottom)
    })
  }
  it('both placements occur', () => {
    expect(seen.band).toBeGreaterThan(0)
    expect(seen.under).toBeGreaterThan(0)
  })
})
