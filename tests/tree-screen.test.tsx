// @vitest-environment jsdom
// Round 6, item 12: the screen offers what Share and Print offer. At 143 tips (an order of 143 families, as Perching
// birds' Level = Families), Fan, Radial and Rectangular are all offered and the one picked is drawn; under the 11px floor
// a Fan or Radial shrinks its names (fitScreen) and the note with its Rectangular button shows, exactly then; no two
// labels overlap (checked from the fit's geometry, here and on the shipped Perching birds' families).
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { LABEL_COUNT, LABEL_GAP, RADIAL_GAP, SCREEN_SIZES, dotK, fanAngle, fitRound, fitScreen, polar, type FanShape, type LabelSpan, type RoundFit } from '@/lib/tree/fan'
import { levelView } from '@/lib/tree/levels'
import { TIP_R, parseNewick, type TreeFile } from '@/lib/tree/tree'
import { TREE_LAYOUT_KEY } from '@/lib/tree-mine'

const N = 143
const { fetchData, rows } = vi.hoisted(() => {
  const n = 143
  // A balanced tree of 143 species, each its own family in one order.
  const build = (lo: number, hi: number, age: number): string => {
    if (lo === hi) return `s${lo}:${age}`
    const mid = (lo + hi) >> 1
    return `(${build(lo, mid, age / 2)},${build(mid + 1, hi, age / 2)}):${age / 2}`
  }
  const file = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: '2026', newick: `${build(0, n - 1, 40)};` }
  const rows: SpeciesRow[] = []
  const fetchData = vi.fn(async (name: string) => {
    if (name === 'tree.v1.json') return file
    if (name === 'species.v1.json') return { v: 1, ebirdTaxonomy: '2026', species: rows }
    throw new Error(`no ${name}`)
  })
  return { fetchData, rows }
})
vi.mock('@/lib/data-url', () => ({ fetchData, fetchAllMasks: vi.fn(() => new Promise(() => {})) }))
for (let i = 0; i < N; i++) {
  rows.push({ code: `s${i}`, com: `Bird ${i}`, sci: `G${i} x`, ord: 'Passeriformes', fam: `Fam${i}idae`, famCom: `Family number ${i}`, to: i, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true } as SpeciesRow)
}
const { default: TreeView } = await import('@/components/tree/TreeView')

let slot: HTMLDivElement
let restore: () => void = () => {}
const kept = new Map<string, string>()
beforeEach(() => {
  slot = document.body.appendChild(document.createElement('div'))
  kept.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
})
afterEach(() => { cleanup(); slot.remove(); restore(); vi.unstubAllGlobals() })
/** A measured width for the tree (jsdom lays nothing out). */
function widthOf(w: number) {
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) {} observe() { this.cb() } disconnect() {} })
  const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).classList.contains('eb-tree') ? w : 0 } })
  restore = () => { if (was) Object.defineProperty(HTMLElement.prototype, 'clientWidth', was) }
}
const entries = rows.filter((_, i) => i % 3 === 0).map((r) => ({ code: r.code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry))
const layoutBtn = (name: string) => within(within(slot).getByRole('group', { name: 'Layout' })).getByRole('button', { name })
const fanPx = (c: HTMLElement) => parseFloat((c.querySelector('.eb-tree-fan') as HTMLElement).style.getPropertyValue('--tree-px'))

describe('143 tips on screen: every layout offered, the one picked drawn, the note exactly under the floor', () => {
  for (const w of [1088, 360]) {
    it(`at ${w}px`, async () => {
      widthOf(w)
      const { container } = render(<TreeView layoutSlot={slot} entries={entries} sci={false} onPick={() => {}} branch={{ ord: 'Passeriformes' }} onOpen={() => {}} />)
      await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
      expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^143 families$/i)
      for (const [name, round, circle] of [['Fan', true, false], ['Radial', true, true], ['Rectangular', false, false]] as const) {
        fireEvent.click(layoutBtn(name))
        for (const n of ['Fan', 'Radial', 'Rectangular']) expect(layoutBtn(n)).not.toHaveAttribute('aria-disabled')
        expect(layoutBtn(name)).toHaveAttribute('aria-pressed', 'true')
        const tree = container.querySelector('.eb-tree')!
        expect(tree.hasAttribute('data-round')).toBe(round)
        if (!round) { expect(screen.queryByTestId('tree-small')).toBeNull(); continue }
        expect(!!container.querySelector('.eb-tree-fan[data-circle]')).toBe(circle)
        expect(container.querySelectorAll('.eb-tree-fan-label')).toHaveLength(N)
        // The note exactly when the names are under the floor, and its button switching to Rectangular.
        const small = fanPx(container) < SCREEN_SIZES.floor
        expect(!!screen.queryByTestId('tree-small')).toBe(small)
        if (small) expect(within(screen.getByTestId('tree-small')).getByRole('button', { name: 'Rectangular' })).toBeInTheDocument()
      }
      // The 1088px Fan of 143 tips is under the floor (the maintainer's case), the 360px one too.
      fireEvent.click(layoutBtn('Fan'))
      expect(fanPx(container)).toBeLessThan(SCREEN_SIZES.floor)
      fireEvent.click(within(screen.getByTestId('tree-small')).getByRole('button', { name: 'Rectangular' }))
      expect(kept.get(TREE_LAYOUT_KEY)).toBe('rows')
      expect(container.querySelector('.eb-tree')).not.toHaveAttribute('data-round')
    })
  }
})

describe('no two labels overlap, and every one is inside the width (the fit\'s geometry)', () => {
  /** Each label as an oriented box: along its radius from past the dot, the sticker's box thick. */
  const boxes = (f: RoundFit, spans: readonly LabelSpan[], shape: FanShape) => spans.map((sp, i) => {
    const a = fanAngle(i + 0.5, spans.length, shape, f.open), ux = Math.cos(a), uy = -Math.sin(a)
    const from = f.R + TIP_R * dotK(f.px) + f.px * LABEL_GAP
    const len = f.st + f.px * (LABEL_GAP + sp.name + (f.counts[i] && sp.count ? LABEL_GAP + sp.count : 0))
    const [sx, sy] = polar(f, from, a)
    return { cx: sx + (ux * len) / 2, cy: sy + (uy * len) / 2, ux, uy, hw: len / 2, hh: f.st / 2 }
  })
  type Box = ReturnType<typeof boxes>[number]
  const corners = (b: Box) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([p, q]) => [b.cx + p * b.hw * b.ux - q * b.hh * b.uy, b.cy + p * b.hw * b.uy + q * b.hh * b.ux])
  // Separating axes: two oriented boxes overlap unless one of their four axes separates them (a hair of tolerance).
  const overlap = (a: Box, b: Box) => [[a.ux, a.uy], [-a.uy, a.ux], [b.ux, b.uy], [-b.uy, b.ux]].every(([x, y]) => {
    const pa = corners(a).map(([px, py]) => px * x + py * y), pb = corners(b).map(([px, py]) => px * x + py * y)
    return Math.min(...pa) < Math.max(...pb) - 0.01 && Math.min(...pb) < Math.max(...pa) - 0.01
  })
  const check = (spans: LabelSpan[], w: number) => {
    for (const shape of ['fan', 'circle'] as const) {
      const f = fitScreen(spans, shape, w, shape === 'circle' ? { ...SCREEN_SIZES, gap: RADIAL_GAP } : SCREEN_SIZES)!
      expect(f, `${shape} at ${w}`).toBeDefined()
      // Under the floor exactly when the full-size fit fails.
      expect(f.px < SCREEN_SIZES.floor).toBe(!fitRound(spans, shape, { w }, shape === 'circle' ? { ...SCREEN_SIZES, gap: RADIAL_GAP } : SCREEN_SIZES))
      const bs = boxes(f, spans, shape)
      for (const b of bs) for (const [x] of corners(b)) { expect(x).toBeGreaterThanOrEqual(-0.5); expect(x).toBeLessThanOrEqual(w + 0.5) }
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) expect(overlap(bs[i], bs[j]), `${shape} ${w}px: labels ${i} and ${j}`).toBe(false)
    }
  }
  const spanOf = (name: string, count: string): LabelSpan => ({ name: name.length * 0.56, count: (count.length * 0.62 * LABEL_COUNT * 13) / 13, on: true })
  it('143 synthetic families at 1088, 768 and 360px', () => {
    const spans = rows.map((r) => spanOf(r.famCom, '12 of 40'))
    for (const w of [1088, 768, 360]) check(spans, w)
  })
  it("the shipped tree: Perching birds' families", () => {
    const file = JSON.parse(readFileSync(resolve(__dirname, '../public/data/tree.v1.json'), 'utf8')) as TreeFile
    const shipped = JSON.parse(readFileSync(resolve(__dirname, '../public/data/species.v1.json'), 'utf8')) as { species: SpeciesRow[] }
    const v = levelView(parseNewick(file.newick, file.taxOnly), buildSpeciesIndex(shipped.species), { ord: 'Passeriformes' }, new Set(), false)!
    expect(v.tips).toBe('families')
    const spans = v.rows.flatMap((r) => (r.kind === 'group' ? [spanOf(r.row.famCom ?? r.key, `${r.on} of ${r.total}`)] : []))
    for (const w of [1088, 360]) check(spans, w)
  })
})
