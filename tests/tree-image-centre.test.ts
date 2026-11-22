// The Tree image's drawing (round 6, Yusuf: "too high and small" on the Story's Radial at the orders): in every format,
// poster and arrangement, at the shipped tree's levels, with the time scale and the totals on and off, the drawing is as
// large as fits between the totals and the row above the footer, and centred there on its real bounds (roundBounds:
// fitRound's up, down and reach, then the axis and the key): centred within 1 unit across and down, touching the room on
// one axis, and everything it draws inside those bounds.
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
import { yRange } from './fixtures/tree-image-harness'

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
const frame = vi.hoisted(() => ({ last: null as null | { rec: ReturnType<typeof import('./fixtures/tree-image-harness').recorder>; L: { W: number; H: number; collage: { x: number; y: number; w: number; h: number } }; latestAs: boolean; row: string } }))
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
type Box = { x: number; y: number; w: number; h: number }
const CARDS: Record<Layout, CardFormat[]> = { fan: ['desktop', 'wide', 'square'], circle: ['story', 'post', 'square'], rows: ['story', 'post', 'square'] }
const LEVELS: [string, TreeLevel][] = [['orders', {}], ['5 families', { ord: 'Galliformes' }], ['27 genera', { ord: 'Cuculiformes' }], ['93 genera', { ord: 'Passeriformes', fam: 'Thraupidae' }], ['141 families', { ord: 'Passeriformes' }]]

async function placed(layout: Layout, format: CardFormat, time: boolean, totals: boolean, level: TreeLevel, size?: PrintSize) {
  setNames(null)
  let got: { room: Box; drawing: Box } | undefined
  let drew = ''
  await renderTreeImage({
    format, entries, species, theme: 'light', strings: en.ui, latest: false, ...(size ? { printSize: size } : {}),
    at: { tree: level, layout, time }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t: en.ui,
    totals: totals ? undefined : [], oldest: true, onTreeText: (x: { layout: Layout }) => { drew = x.layout }, onTreeBounds: (b: { room: Box; drawing: Box }) => { got = b },
  } as unknown as Parameters<typeof renderTreeImage>[0])
  return { ...got!, drew, rec: frame.last!.rec, L: frame.last!.L }
}

const CASES = (Object.keys(CARDS) as Layout[]).flatMap((layout) => [
  ...CARDS[layout].map((format) => ({ layout, format, size: undefined as PrintSize | undefined })),
  ...(['A4', 'A2'] as PrintSize[]).map((size) => ({ layout, format: (layout === 'fan' ? 'printLandscape' : 'print') as CardFormat, size })),
])

describe('the Tree drawing fills the room under the totals and is centred on its real bounds', () => {
  for (const { layout, format, size } of CASES) {
    it(`${layout} on ${format}${size ? ` ${size}` : ''}`, async () => {
      for (const time of [true, false]) for (const totals of [true, false]) for (const [name, level] of LEVELS) {
        const at = `${name}, time ${time}, totals ${totals}`
        const { room, drawing: d, drew, rec, L } = await placed(layout, format, time, totals, level, size)
        expect(drew, at).toBe(layout)
        // Centred: the same room above as below, and either side.
        expect(Math.abs((d.y - room.y) - (room.y + room.h - d.y - d.h)), at).toBeLessThanOrEqual(1)
        expect(Math.abs((d.x - room.x) - (room.x + room.w - d.x - d.w)), at).toBeLessThanOrEqual(1)
        // As large as fits: touching the room across or down, and never past it.
        expect(d.w >= room.w - 1 || d.h >= room.h - 1, `${at}: ${Math.round(d.w)} of ${Math.round(room.w)} × ${Math.round(d.h)} of ${Math.round(room.h)}`).toBe(true)
        expect(d.w, at).toBeLessThanOrEqual(room.w + 1)
        expect(d.h, at).toBeLessThanOrEqual(room.h + 1)
        // Real: everything drawn under the totals (the frame's row aside) lies inside those bounds, top to bottom.
        const foot = L.collage.y + L.collage.h
        const ink = [...rec.texts.map((x) => yRange(x.box)), ...rec.images.map(yRange), ...rec.strokes.filter((s) => s.length).map((s) => yRange(s))]
          .filter(([a, b]) => a >= room.y - 0.5 && b <= foot + 0.5)
        expect(Math.min(...ink.map((x) => x[0])), at).toBeGreaterThanOrEqual(d.y - 1)
        expect(Math.max(...ink.map((x) => x[1])), at).toBeLessThanOrEqual(d.y + d.h + 1)
      }
    })
  }
})
