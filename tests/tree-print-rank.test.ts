// Round 6, "One step + size" (Yusuf, 2026-11-20), on synthetic data: a Tree share image always draws the rank on screen;
// only Print may draw one rank deeper ("Down to", levelView's 'deeper'), and only at a poster size where every name of
// that rank prints whole at TREE_NAME_MIN_PT or more on paper (namesFit, treeNameMinPx; renderTreeImage reports each
// size through onDeeper and draws the screen's rank where the deeper one does not fit).
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import type { ListEntry } from '@/lib/list/model'
import { CAPTION_MIN_PT, PRINT_SIZES, TREE_NAME_MIN_PT, printDesign, treeNameMinPx, type PrintSize } from '@/lib/share/print'
import type { CardFormat, ShareImageOpts } from '@/lib/share/image'
import type { DeeperFits } from '@/lib/share/view-image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { LabelSpan } from '@/lib/tree/fan'
import { levelView } from '@/lib/tree/levels'
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
// Big: two orders of 60 one-species families each, so All birds draws 2 orders and one rank deeper 120 families.
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
const { namesFit, renderTreeImage } = await import('@/lib/share/tree-image')

beforeAll(() => { (globalThis as { Path2D?: unknown }).Path2D ??= class { constructor(public d?: string) {} } })
beforeEach(() => { drawn.length = 0 })
const use = (rows: SpeciesRow[], tree: unknown) => { data.species = buildSpeciesIndex(rows); data.tree = tree }
const entry = (code: string): ListEntry => ({ code, date: '2024-01', place: { country: 'CA' } } as ListEntry)

/** Renders the tree at All birds (or `tree`) and returns the text drawn and what onDeeper reported. */
async function draw(format: CardFormat, o: { printSize?: PrintSize; deeper?: boolean; layout?: 'fan' | 'circle' | 'rows'; tree?: { ord?: string } } = {}) {
  const reports: (DeeperFits | null)[] = []
  const species = data.species as ReturnType<typeof buildSpeciesIndex>
  await renderTreeImage({
    format, ...(o.printSize ? { printSize: o.printSize } : {}), entries: [entry(species.rows[0].code)], species, theme: 'light', strings: en.ui, latest: false,
    at: { tree: o.tree ?? {}, layout: o.layout ?? 'rows' }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t: en.ui,
    deeper: o.deeper, onDeeper: (d) => reports.push(d),
  } as Parameters<typeof renderTreeImage>[0])
  return { text: new Set(drawn), reports }
}

describe("Print's Down to: the rank under the screen's (levelView 'deeper')", () => {
  const none = new Set<string>()
  it('is the next rank under the one drawn, past lone tips, and none under the species', () => {
    use(small, smallTree)
    const at = (l: { ord?: string; fam?: string; genus?: string }) => levelView(smallTree, data.species as never, l, none, false, 'deeper')?.tips
    expect(levelView(smallTree, data.species as never, {}, none)!.tips).toBe('orders')
    expect(at({})).toBe('families')
    // O2 has 6 species (SPECIES_AT or fewer), so the screen is already at its species: nothing deeper.
    expect(levelView(smallTree, data.species as never, { ord: 'O2' }, none)!.tips).toBe('species')
    expect(at({ ord: 'O2' })).toBeUndefined()
  })
  it('draws the same open branch one rank deeper: All birds at every family', () => {
    use(big, bigTree)
    const v = levelView(bigTree, data.species as never, {}, none, false, 'deeper')!
    expect(v.tips).toBe('families')
    expect(v.rows.filter((r) => r.kind === 'group')).toHaveLength(120)
    expect(v.level).toEqual(levelView(bigTree, data.species as never, {}, none)!.level)
  })
})

describe('9 pt on paper (TREE_NAME_MIN_PT)', () => {
  it('is one constant beside the captions, in design units through each size\'s own scale', () => {
    expect(TREE_NAME_MIN_PT).toBe(9)
    expect(CAPTION_MIN_PT).toBe(18)
    // 9 pt = 18.75 px at 150 dpi; A4 draws 1.148 px per unit, A1 3.248.
    expect(treeNameMinPx('A4')).toBeCloseTo(18.75 / (1240 / 1080), 6)
    expect(treeNameMinPx('A1')).toBeCloseTo(18.75 / (3508 / 1080), 6)
    expect(treeNameMinPx('A4')).toBeGreaterThan(treeNameMinPx('A2'))
  })
  it('namesFit: Rectangular at the size its rows allow, a Fan or Radial only when fitRound names every tip at that floor', () => {
    const spans: LabelSpan[] = Array.from({ length: 100 }, () => ({ name: 4, count: 2, on: true }))
    // 100 rows of 44px in 1000 units: a 10-unit pitch, names at 7.5.
    const room = { w: 952, h: 1000 }
    expect(namesFit('rows', spans, 4400, room, 7.5)).toBe(true)
    expect(namesFit('rows', spans, 4400, room, 7.6)).toBe(false)
    expect(namesFit('rows', [], 0, room, 1)).toBe(false)
    // A floor the round layout can reach fits, a larger one does not.
    const few = spans.slice(0, 12)
    expect(namesFit('circle', few, 12 * 44, room, 9)).toBe(true)
    expect(namesFit('circle', spans, 4400, room, 20)).toBe(false)
  })
})

describe('a Tree share image draws exactly the rank on screen', () => {
  const orderNames = ['O1', 'O2']
  const familyNames = ['F1 birds', 'F2 birds', 'F3 birds']
  it('in every share format, even when a deeper rank is asked for, and never reports one', async () => {
    use(small, smallTree)
    for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
      for (const layout of ['rows', 'fan', 'circle'] as const) {
        const { text, reports } = await draw(format, { deeper: true, layout })
        for (const n of orderNames) expect(text.has(n), `${format} ${layout} ${n}`).toBe(true)
        for (const n of familyNames) expect(text.has(n), `${format} ${layout} ${n}`).toBe(false)
        expect(reports, format).toEqual([])
      }
    }
  })
})

describe('the Tree poster one rank deeper', () => {
  it('draws the deeper rank when asked and every name prints at 9 pt; reports every size', async () => {
    use(small, smallTree)
    const shown = await draw('print', { printSize: 'A2' })
    expect(shown.text.has('O1')).toBe(true)
    expect(shown.text.has('F1 birds')).toBe(false)
    expect(shown.reports).toEqual([{ rank: 'families', fits: Object.fromEntries(PRINT_SIZES.map((s) => [s, true])) }])
    drawn.length = 0
    const deep = await draw('print', { printSize: 'A2', deeper: true })
    for (const n of ['F1 birds', 'F2 birds', 'F3 birds']) expect(deep.text.has(n)).toBe(true)
    expect(deep.text.has('O1')).toBe(false)
  })
  it('only at the sizes where every name prints at 9 pt; elsewhere the screen\'s rank, even when asked', async () => {
    use(big, bigTree)
    // 120 rows in the poster's drawing: about a 9-unit pitch, names about 6.8 units, so 9 pt (5.77 units on A1) holds only on the largest sizes.
    const a4 = await draw('print', { printSize: 'A4', deeper: true })
    const fits = a4.reports[0]!.fits
    expect(a4.reports[0]!.rank).toBe('families')
    expect(fits).toMatchObject({ A4: false, A3: false, A2: false, A1: true, US24x36: true })
    expect(a4.text.has('P1')).toBe(true)
    expect(a4.text.has('Fam000 birds')).toBe(false)
    drawn.length = 0
    const a1 = await draw('print', { printSize: 'A1', deeper: true })
    expect(a1.text.has('Fam000 birds')).toBe(true)
    expect(a1.text.has('Fam119 birds')).toBe(true)
    expect(a1.text.has('P1')).toBe(false)
    // In landscape (a Fan prints horizontally), each size is checked on its own turned card.
    drawn.length = 0
    const fan = await draw('printLandscape', { printSize: 'A1', layout: 'fan' })
    expect(Object.keys(fan.reports[0]!.fits).sort()).toEqual([...PRINT_SIZES].sort())
    expect(printDesign('A1', true)[1]).toBe(1080)
  })
  it('reports nothing deeper when the screen shows the species', async () => {
    use(small, smallTree)
    const { reports } = await draw('print', { printSize: 'A2', tree: { ord: 'O2' } })
    expect(reports).toEqual([null])
  })
})
