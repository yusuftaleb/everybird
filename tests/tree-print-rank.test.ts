// Round 6, item 22 (the maintainer, 2026-11-21: Print's own "Down to" went), on synthetic data: a Tree share image and a
// Tree poster alike draw exactly the rank on screen, its Level (the Display panel's) included, at every poster size and
// in both orientations; nothing deeper is drawn or offered.
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import type { ListEntry } from '@/lib/list/model'
import { PRINT_SIZES, type PrintSize } from '@/lib/share/print'
import type { CardFormat, ShareImageOpts } from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { TipRank } from '@/lib/tree/levels'
import { parseNewick } from '@/lib/tree/tree'

const sp = (code: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: false, ar: 1, q: true })

// Small: O1 (F1: Aa, Ab), O2 (F2: Ba; F3: Ca, Cb), each genus two species.
const small = [
  sp('a1', 'Aa one', 'O1', 'F1', 1), sp('a2', 'Aa two', 'O1', 'F1', 2), sp('a3', 'Ab one', 'O1', 'F1', 3), sp('a4', 'Ab two', 'O1', 'F1', 4),
  sp('b1', 'Ba one', 'O2', 'F2', 5), sp('b2', 'Ba two', 'O2', 'F2', 6),
  sp('c1', 'Ca one', 'O2', 'F3', 7), sp('c2', 'Ca two', 'O2', 'F3', 8), sp('c3', 'Cb one', 'O2', 'F3', 9), sp('c4', 'Cb two', 'O2', 'F3', 10),
]
const smallTree = parseNewick('((((a1:1,a2:1):1,(a3:1,a4:1):1):4,((b1:1,b2:1):5,((c1:1,c2:1):1,(c3:1,c4:1):1):4):1):1);')
// Big: two orders of 60 one-species families each, so All birds draws 2 orders, and its families Level 120 families.
const big = Array.from({ length: 120 }, (_, i) => sp(`s${i}`, `G${i} s${i}`, i < 60 ? 'P1' : 'P2', `Fam${String(i).padStart(3, '0')}`, i + 1))
const half = (from: number) => big.slice(from, from + 60).map((r) => `${r.code}:1`).join(',')
const bigTree = parseNewick(`((${half(0)}):2,(${half(60)}):2);`)

const data = vi.hoisted(() => ({ tree: null as unknown, species: null as unknown }))
vi.mock('@/lib/tree/load', () => ({ loadTree: async () => ({ tree: data.tree }) }))
vi.mock('@/lib/species/load', async (orig) => ({ ...(await orig<typeof import('@/lib/species/load')>()), loadSpecies: async () => data.species }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), loadStickers: async () => new Map() }))
// The frame: the real card layout for the format (and the poster's size), and a canvas that records the text drawn.
const drawn: string[] = []
vi.mock('@/lib/share/view-image', async (orig) => {
  const real = await orig<typeof import('@/lib/share/view-image')>()
  const { cardLayout } = await import('@/lib/share/image')
  const print = await import('@/lib/share/print')
  return {
    ...real,
    renderViewImage: async (opts: ShareImageOpts, _footer: string, paint: (ctx: CanvasRenderingContext2D, card: unknown, area: unknown) => void) => {
      const landscape = opts.format === 'printLandscape'
      const L = cardLayout(opts.format, { name: false, filter: false, latest: false, count: 0, countSize: 'hide' }, opts.printSize && (opts.format === 'print' || landscape) ? print.printDesign(opts.printSize, landscape) : undefined)
      let px = 10
      const ctx = new Proxy({} as Record<string | symbol, unknown>, {
        get: (o, k) => (k === 'measureText' ? (s: string) => ({ width: s.length * 0.55 * px })
          : k === 'fillText' ? (s: string) => { drawn.push(s) }
            : k in o ? o[k] : () => {}),
        set: (o, k, v) => { if (k === 'font') px = parseFloat(v); o[k] = v; return true },
      })
      const card = { L, colors: { ink: '#000', line: '#999', muted: '#666', paper: '#fff', hairline: '#ddd' }, fonts: { count: (n: number) => `${n}px c`, footer: (n: number) => `${n}px f`, lifer: (n: number) => `${n}px l` }, transparent: false }
      paint(ctx as unknown as CanvasRenderingContext2D, card, { ...L.collage })
      return new Blob(['tree'])
    },
  }
})
const { renderTreeImage } = await import('@/lib/share/tree-image')

beforeAll(() => { (globalThis as { Path2D?: unknown }).Path2D ??= class { constructor(public d?: string) {} } })
beforeEach(() => { drawn.length = 0 })
const use = (rows: SpeciesRow[], tree: unknown) => { data.species = buildSpeciesIndex(rows); data.tree = tree }
const entry = (code: string): ListEntry => ({ code, date: '2024-01', place: { country: 'CA' } } as ListEntry)

/** Renders the tree at All birds (or `tree`), at the screen's Level `rank` when given, and returns the text drawn. */
async function draw(format: CardFormat, o: { printSize?: PrintSize; rank?: TipRank; layout?: 'fan' | 'circle' | 'rows'; tree?: { ord?: string } } = {}) {
  const species = data.species as ReturnType<typeof buildSpeciesIndex>
  const opts = {
    format, ...(o.printSize ? { printSize: o.printSize } : {}), entries: [entry(species.rows[0].code)], species, theme: 'light', strings: en.ui, latest: false,
    at: { tree: o.tree ?? {}, layout: o.layout ?? 'rows', ...(o.rank ? { rank: o.rank } : {}) }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t: en.ui,
  } as Parameters<typeof renderTreeImage>[0]
  await renderTreeImage(opts)
  // Nothing about a deeper rank is offered to the poster any more.
  expect(opts).not.toHaveProperty('deeper')
  return new Set(drawn)
}

const orderNames = ['O1', 'O2']
const familyNames = ['F1 birds', 'F2 birds', 'F3 birds']

describe('a Tree share image draws exactly the rank on screen', () => {
  it('in every share format and layout', async () => {
    use(small, smallTree)
    for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
      for (const layout of ['rows', 'fan', 'circle'] as const) {
        drawn.length = 0
        const text = await draw(format, { layout })
        for (const n of orderNames) expect(text.has(n), `${format} ${layout} ${n}`).toBe(true)
        for (const n of familyNames) expect(text.has(n), `${format} ${layout} ${n}`).toBe(false)
      }
    }
  })
})

describe('a Tree poster draws the screen\'s rank, its Level, as the share image does', () => {
  it('at every poster size, portrait and landscape: the orders at All birds, never the families under them', async () => {
    use(small, smallTree)
    for (const format of ['print', 'printLandscape'] as const) {
      for (const printSize of PRINT_SIZES) {
        drawn.length = 0
        const text = await draw(format, { printSize, layout: format === 'printLandscape' ? 'fan' : 'rows' })
        for (const n of orderNames) expect(text.has(n), `${format} ${printSize} ${n}`).toBe(true)
        for (const n of familyNames) expect(text.has(n), `${format} ${printSize} ${n}`).toBe(false)
      }
    }
  })
  it('the screen\'s Level picks the rank: with Families on screen the poster draws every family, as the share image', async () => {
    use(big, bigTree)
    for (const [format, printSize] of [['print', 'A4'], ['print', 'A1'], ['post', undefined]] as const) {
      drawn.length = 0
      const text = await draw(format, { printSize, rank: 'families' })
      expect(text.has('Fam000 birds'), `${format} ${printSize}`).toBe(true)
      expect(text.has('Fam119 birds'), `${format} ${printSize}`).toBe(true)
      expect(text.has('P1'), `${format} ${printSize}`).toBe(false)
    }
  })
  it('a screen at the species draws the species', async () => {
    use(small, smallTree)
    const text = await draw('print', { printSize: 'A2', tree: { ord: 'O2' } })
    expect(text.has('B1')).toBe(true)
    expect(text.has('F2 birds')).toBe(false)
  })
})
