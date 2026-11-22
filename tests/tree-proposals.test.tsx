// @vitest-environment jsdom
// Round 6, the Tree brief's item 13 (the approved design proposals): H4 (Try again after the load fails), O8 (one
// loading line), D9 (Show every group when Lifers only empties the view), D10 (a complete group's count in Ink 600), AU3
// (the rows one Tab stop, ↑ ↓ Home End), AD5 (unpicked, a touch screen opens on Rectangular), and P7, P10, AN11 in tree.css.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesRow } from '@/lib/species/types'
import type { OpenBranch } from '@/lib/tree/path'
import { TREE_LAYOUT_KEY, TREE_MINE_KEY } from '@/lib/tree-mine'

const { fetchData, rows, fail } = vi.hoisted(() => {
  const file = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: '2026', newick: '((a1:1,a2:1):2,(b1:2,b2:2):1);' }
  const rows: SpeciesRow[] = []
  const fail = { tree: 1 }
  const fetchData = vi.fn(async (name: string) => {
    if (name === 'tree.v1.json') { if (fail.tree > 0) { fail.tree--; throw new Error('offline') } return file }
    if (name === 'species.v1.json') return { v: 1, ebirdTaxonomy: '2026', species: rows }
    throw new Error(`no ${name}`)
  })
  return { fetchData, rows, fail }
})
vi.mock('@/lib/data-url', () => ({ fetchData, fetchAllMasks: vi.fn(() => new Promise(() => {})) }))
const sp = (code: string, sci: string, ord: string, fam: string, to: number) => ({ code, com: code.toUpperCase(), sci, ord, fam, famCom: `${fam} birds`, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
rows.push(sp('a1', 'Aa one', 'Oa', 'Fa', 1), sp('a2', 'Aa two', 'Oa', 'Fa', 2), sp('b1', 'Bb one', 'Ob', 'Fb', 3), sp('b2', 'Bb two', 'Ob', 'Fb', 4))
const { default: TreeView } = await import('@/components/tree/TreeView')

const entries = ['a1', 'a2'].map((code) => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry))
let slot: HTMLDivElement
const kept = new Map<string, string>()
let restore: () => void = () => {}
beforeEach(() => {
  slot = document.body.appendChild(document.createElement('div'))
  kept.clear()
  vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
  vi.stubGlobal('sessionStorage', globalThis.localStorage)
})
afterEach(() => { cleanup(); slot.remove(); restore(); restore = () => {}; vi.unstubAllGlobals() })
const Tree = ({ branch = {} }: { branch?: OpenBranch }) => <TreeView layoutSlot={slot} entries={entries} sci={false} onPick={() => {}} branch={branch} onOpen={() => {}} />
const tipsList = () => screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
function widthOf(w: number) {
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) {} observe() { this.cb() } disconnect() {} })
  const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).classList.contains('eb-tree') ? w : 0 } })
  restore = () => { if (was) Object.defineProperty(HTMLElement.prototype, 'clientWidth', was) }
}
const coarse = (on: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: on && q === '(pointer: coarse)', media: q, addEventListener() {}, removeEventListener() {} }))

describe('H4 and O8: the load', () => {
  // First in the file: the tree's first fetch fails (the loader caches only a success).
  it('a failure says so with "Try again", which loads again; loading is one mono line with role status', async () => {
    render(<Tree />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading the tree')
    expect(screen.getByRole('status').tagName).toBe('DIV')
    expect(screen.getByRole('status')).toHaveClass('eb-mono')
    const failed = await screen.findByTestId('tree-failed')
    expect(failed).toHaveTextContent("The tree didn't load. Try again")
    expect(failed).not.toHaveTextContent(/Open Tree again/)
    expect(failed).toHaveAttribute('role', 'status')
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }))
    expect(await tipsList()).toBeInTheDocument()
    expect(fail.tree).toBe(0)
  })
})

describe('the rows', () => {
  it('D10: a complete group\'s count is marked full; P7 and D10 in tree.css', async () => {
    render(<Tree />)
    const tips = await tipsList()
    const counts = [...tips.querySelectorAll('.eb-tree-count')]
    expect(counts.map((c) => [c.textContent, c.hasAttribute('data-full')])).toEqual([['2 / 2', true], ['0 / 2', false]])
  })
  it('AU3: one Tab stop; ↑ ↓ Home End move between the rows and carry it', async () => {
    render(<Tree />)
    const tips = await tipsList()
    const buttons = within(tips).getAllByRole('button')
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1])
    act(() => buttons[0].focus())
    fireEvent.keyDown(buttons[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map((b) => b.tabIndex)).toEqual([-1, 0])
    fireEvent.keyDown(buttons[1], { key: 'Home' })
    expect(document.activeElement).toBe(buttons[0])
    fireEvent.keyDown(buttons[0], { key: 'End' })
    expect(document.activeElement).toBe(buttons[1])
    fireEvent.keyDown(buttons[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(buttons[1])
  })
  it('D9: Lifers only emptying the view offers "Show every group", which turns it off', async () => {
    kept.set(TREE_MINE_KEY, '1')
    render(<Tree branch={{ ord: 'Ob' }} />)
    const button = await screen.findByTestId('tree-show-all')
    expect(button.closest('p')).toHaveTextContent('No bird on the list here. Show every group')
    fireEvent.click(button)
    expect(kept.has(TREE_MINE_KEY)).toBe(false)
    expect(await tipsList()).toBeInTheDocument()
  })
})

describe('AD5: on a touch screen, unpicked, Rectangular at any width', () => {
  it('a coarse pointer opens on Rectangular at 1,100px; a fine one on the Fan; a pick wins either way', async () => {
    widthOf(1100)
    coarse(true)
    const { container, unmount } = render(<Tree />)
    await tipsList()
    expect(container.querySelector('.eb-tree')).not.toHaveAttribute('data-round')
    expect(within(within(slot).getByRole('group', { name: 'Layout' })).getByRole('button', { name: 'Rectangular' })).toHaveAttribute('aria-pressed', 'true')
    unmount()
    kept.set(TREE_LAYOUT_KEY, 'fan')
    const picked = render(<Tree />)
    await tipsList()
    expect(picked.container.querySelector('.eb-tree')).toHaveAttribute('data-round')
    picked.unmount()
    kept.clear()
    coarse(false)
    const fine = render(<Tree />)
    await tipsList()
    expect(fine.container.querySelector('.eb-tree')).toHaveAttribute('data-round')
  })
})

describe('tree.css: P7, D10, P10, AN11', () => {
  const css = readFileSync(resolve(__dirname, '../src/components/tree/tree.css'), 'utf8')
  const rule = (sel: string) => css.match(new RegExp(`\\n${sel.replace(/[.[\]]/g, '\\$&')} \\{([^}]*)\\}`))?.[1] ?? ''
  it('the rows\' counts Muted, a complete one Ink 600; headings and the axis title at 12px, ticks 11px; the chart fades in, names ease, none under reduced motion', () => {
    expect(rule('.eb-tree-count')).toMatch(/color: var\(--muted\)/)
    expect(rule('.eb-tree-count[data-full]')).toMatch(/color: var\(--ink\); font-weight: 600/)
    expect(rule('.eb-tree-heading')).toMatch(/font-size: 12px/)
    expect(rule('.eb-tree-axis-title')).toMatch(/font-size: 12px/)
    expect(rule('.eb-tree-tick')).toMatch(/font-size: 11px/)
    expect(rule('.eb-tree-chart')).toMatch(/animation: eb-card-in \.24s/)
    expect(css).toMatch(/\.eb-tree-nm, \.eb-tree-fan-text \{ transition: color \.15s var\(--ease-ui\); \}/)
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.eb-tree-chart \{ animation: none; \}\s*\.eb-tree-nm, \.eb-tree-fan-text \{ transition: none; \}/)
  })
})
