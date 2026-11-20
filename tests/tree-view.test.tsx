// @vitest-environment jsdom
// The Tree tab (TreeView.tsx) on a synthetic tree: the orders first, with counts and stickers, the Level and Layout menus
// (in the controls bar's slot), drilling to families, genera and species with the focus following (from the keyboard,
// never scrolling), the chip row under the dock as the tree's path (in CollageView), one name per row, the bird card from
// a tip, the birds the tree lacks, the short credit, and the tab in CollageView.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducer, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListEntry, SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import type { TreeFile } from '@/lib/tree/tree'
import type { OpenBranch } from '@/lib/tree/path'
import type { TreeLevel } from '@/lib/tree/levels'
import type { TreeLayout } from '@/lib/tree-mine'
import { setTreeMine, TREE_LAYOUT_KEY, TREE_MINE_KEY } from '@/lib/tree-mine'

// The tree file, and the full species file TreeView loads itself (the shown index may be the landing sample's own).
const { fetchData, rows } = vi.hoisted(() => {
  const file: TreeFile = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: '2026', newick: '((((a1:1,a3:1):2,a2:3):7,(b1:4,b2:4):6):1,((c1:1,c2:1):1,(c3:1,c4:1):1):9,((d1:1,d2:1):1,(d3:1,(d4:0.5,d5:0.5):0.5):1):9);', taxOnly: 'Q' }
  // b2, the fifth tip, is placed without genetic data. Genus Aa's row holds Ab, Ca's holds Cb, Da's holds Db, Dc and Dd.
  const rows: SpeciesRow[] = []
  const fetchData = vi.fn(async (name: string) => {
    if (name === 'tree.v1.json') return file
    if (name === 'species.v1.json') return { v: 1, ebirdTaxonomy: '2026', species: rows }
    throw new Error(`no ${name}`)
  })
  return { fetchData, rows }
})
vi.mock('@/lib/data-url', () => ({ fetchData, fetchAllMasks: vi.fn(() => new Promise(() => {})) }))

const { default: TreeView } = await import('@/components/tree/TreeView')
const { CollageView } = await import('@/components/app/CollageView')
const { MenuSelect } = await import('@/components/share/MenuSelect')

const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
rows.push(
  sp('a1', 'Alpha One', 'Aa one', 'Anseriformes', 'Anatidae', 'Ducks', 1), sp('a2', 'Alpha Two', 'Aa two', 'Anseriformes', 'Anatidae', 'Ducks', 2),
  sp('a3', 'Alpha Three', 'Ab three', 'Anseriformes', 'Anatidae', 'Ducks', 3), sp('x1', 'Lost Duck', 'Aa four', 'Anseriformes', 'Anatidae', 'Ducks', 4),
  sp('b1', 'Beta One', 'Bb one', 'Piciformes', 'Picidae', 'Woodpeckers', 5), sp('b2', 'Beta Two', 'Bb two', 'Piciformes', 'Picidae', 'Woodpeckers', 6),
  sp('c1', 'Gamma One', 'Ca one', 'Cuculiformes', 'Cuculidae', 'Cuckoos', 7), sp('c2', 'Gamma Two', 'Cb two', 'Cuculiformes', 'Cuculidae', 'Cuckoos', 8),
  sp('c3', 'Gamma Three', 'Ca three', 'Cuculiformes', 'Cuculidae', 'Cuckoos', 9), sp('c4', 'Gamma Four', 'Cb four', 'Cuculiformes', 'Cuculidae', 'Cuckoos', 10),
  sp('d1', 'Delta One', 'Da one', 'Columbiformes', 'Columbidae', 'Pigeons', 11), sp('d2', 'Delta Two', 'Db two', 'Columbiformes', 'Columbidae', 'Pigeons', 12),
  sp('d3', 'Delta Three', 'Dc three', 'Columbiformes', 'Columbidae', 'Pigeons', 13), sp('d4', 'Delta Four', 'Dd four', 'Columbiformes', 'Columbidae', 'Pigeons', 14),
  sp('d5', 'Delta Five', 'Da five', 'Columbiformes', 'Columbidae', 'Pigeons', 15),
)
const entry = (code: string): ListEntry => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry)

// The controls bar's slot the menus go in (CollageView hands TreeView the bar's own).
let slot: HTMLDivElement
beforeEach(() => {
  fetchData.mockClear()
  slot = document.body.appendChild(document.createElement('div'))
})
afterEach(() => { cleanup(); slot.remove() })
/** The keyboard was the last input: the tree moves focus as branches open and close (a pointer press never does). */
const viaKeyboard = () => fireEvent.keyDown(document.body, { key: 'Tab' })
/** TreeView alone, its open branch held as CollageView holds it (without the filter). */
function Tree(props: { entries: ListEntry[]; sci?: boolean; onPick?: (code: string, el: HTMLElement) => void; onLevel?: (level: TreeLevel, mine: boolean, layout: TreeLayout) => void }) {
  const [branch, setBranch] = useState<OpenBranch>({})
  return <TreeView menus={slot} entries={props.entries} sci={props.sci ?? false} onPick={props.onPick ?? (() => {})} onLevel={props.onLevel} branch={branch} onOpen={(b) => setBranch(b)} />
}
/** Picks a rank in the Level menu. */
function chooseLevel(name: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Level / }))
  fireEvent.click(screen.getByRole('menuitemradio', { name }))
}

// First: TreeView keeps the parsed tree for the page, so only the first test in this file sees the fetch.
describe('the Tree tab in CollageView', () => {
  const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }
  const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2024-01-02', place: { country: 'CA' } })
  /** CollageView in the Tree view over `codes`, with the shown index `index` (the landing sample's holds only its birds). */
  function Harness({ codes, index }: { codes: string[]; index: ReturnType<typeof buildSpeciesIndex> }) {
    const reduce = makeReducer({ species: index })
    const [state, dispatch] = useReducer(reduce, undefined, () => {
      const saved = emptySaved()
      saved.records.ebird = codes.map(rec)
      return reduce(initialState(), { type: 'restore', saved })
    })
    return <CollageView state={state} dispatch={dispatch} species={index} regions={regions} label="Test collage" />
  }
  const full = buildSpeciesIndex(rows)
  const partial = buildSpeciesIndex(rows.filter((r) => r.code === 'a1' || r.code === 'b2'))
  const tipList = () => screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
  const path = () => document.querySelector('.eb-filters .eb-path')
  const openTree = () => fireEvent.click(within(screen.getByRole('group', { name: 'View' })).getByRole('button', { name: 'Tree' }))

  it('a third view tab; the tree loads only when it opens, without the size switch or the legend', async () => {
    const { container } = render(<Harness codes={['a1', 'b2']} index={partial} />)
    expect(fetchData).not.toHaveBeenCalledWith('tree.v1.json')
    const view = screen.getByRole('group', { name: 'View' })
    openTree()
    expect(within(view).getByRole('button', { name: 'Tree' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(fetchData).toHaveBeenCalledWith('tree.v1.json')
    expect(screen.queryByRole('switch', { name: /True size/ })).toBeNull()
    expect(container.querySelector('.eb-legend')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: /^Woodpeckers, 1 of 2 on the list$/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Waterfowl, 1 of 4 on the list$/ })).toBeInTheDocument()
    // The Level and Layout menus and the Scientific switch sit in the controls bar, in its Tree tools.
    const dock = container.querySelector('.eb-dock')!
    expect(dock).toHaveAttribute('data-view', 'tree')
    expect(within(dock as HTMLElement).getByRole('button', { name: 'Level Orders' })).toBeInTheDocument()
    expect(within(dock as HTMLElement).getByRole('button', { name: 'Layout Rectangular' })).toBeInTheDocument()
    expect(within(dock as HTMLElement).getByRole('switch', { name: /Scientific/ })).toBeInTheDocument()
    // Round 3: the switches first, then the Level and Layout menus, then Filters.
    const kids = [...dock.querySelector('.eb-dock-filters')!.children].map((el) => el.className)
    expect(kids.indexOf('eb-dock-tools')).toBeLessThan(kids.indexOf('eb-dock-menus'))
    expect(kids.indexOf('eb-dock-menus')).toBe(1)
    expect(screen.queryByRole('group', { name: 'Show tips as' })).toBeNull()
    // No path of the tree's own: the chip row is its path. No count line either: with Lifers only off the page's stats
    // line counts against the taxonomy, from the full species file (the shown index here holds only the list's birds).
    expect(screen.queryByRole('navigation', { name: 'Tree levels' })).toBeNull()
    expect(screen.queryByText('2 of 4 orders')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('collage-stats')).toHaveTextContent('2 / 15 species · 2 / 4 orders · 2 / 4 families · since Jan 2024'))
    // Every other view keeps today's line.
    fireEvent.click(within(view).getByRole('button', { name: 'Collage' }))
    expect(screen.getByTestId('collage-stats')).toHaveTextContent('2 species · 2 orders · 2 families · since Jan 2024')
  })

  it("the chip row is the tree's path: a chip opens the branch, a tip picks the chip, a genus adds a step, and the steps go back", async () => {
    render(<Harness codes={['a1', 'b2']} index={full} />)
    openTree()
    await screen.findByRole('button', { name: /^Waterfowl, 1 of 4/ })
    // An order chip opens it in the tree.
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Waterfowl/ }))
    expect(within(tipList()).getByRole('button', { name: /^Ducks, / })).toBeInTheDocument()
    expect(path()).toHaveTextContent('All birds/Waterfowl')
    // Back in the chip row closes the branch.
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'All birds' }))
    expect(within(tipList()).getByRole('button', { name: /^Woodpeckers, / })).toBeInTheDocument()
    expect(path()).toBeNull()
    // A tip opens its branch and picks its chips: the order, then the family (the other views follow the filter).
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Waterfowl/ }))
    expect(path()).toHaveTextContent('All birds/Waterfowl')
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Ducks/ }))
    expect(path()).toHaveTextContent('All birds/Waterfowl/Ducks')
    expect(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Ducks/ })).toHaveAttribute('aria-pressed', 'true')
    // A genus opens in the tree, a step of its own at the path's end; the family's step closes it.
    viaKeyboard()
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Aa with Ab/ }))
    expect(path()).toHaveTextContent('All birds/Waterfowl/Ducks/Aa')
    expect(screen.getByText('Aa', { selector: '[aria-current]' })).toBeInTheDocument()
    expect(screen.getByText('In this tree, Ab sits inside Aa.')).toBeInTheDocument()
    // Opening from the keyboard focuses the new branch's first tip, without a scroll.
    expect(within(tipList()).getByRole('button', { name: 'Alpha One, on the list' })).toHaveFocus()
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Ducks' }))
    expect(path()).toHaveTextContent('All birds/Waterfowl/Ducks')
    expect(within(tipList()).getByRole('button', { name: /^Aa with Ab/ })).toHaveFocus() // back to the tip it came from
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Waterfowl' }))
    expect(within(tipList()).getByRole('button', { name: /^Ducks/ })).toHaveFocus()
  })

  it("a family the filter cannot hold (the sample's index lacks it) still opens, as a step of the path", async () => {
    render(<Harness codes={['a1', 'b2']} index={partial} />)
    openTree()
    fireEvent.click(await screen.findByRole('button', { name: /^Pigeons and doves/ }))
    expect(path()).toHaveTextContent('All birds/Pigeons and doves')
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Pigeons, / }))
    expect(path()).toHaveTextContent('All birds/Pigeons and doves/Pigeons')
    expect(within(tipList()).getByRole('button', { name: /^Da, / })).toBeInTheDocument()
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Pigeons and doves' }))
    expect(path()).toHaveTextContent(/^All birds\/Pigeons and doves$/)
    expect(within(tipList()).getByRole('button', { name: /^Pigeons, / })).toBeInTheDocument()
  })
})

describe('TreeView', () => {
  it('opens on every order with its count and sticker; Families shows every family; the fact line, the birds without a tip and the source', async () => {
    render(<Tree entries={['a1', 'b2', 'x1'].map(entry)} />)
    let tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getAllByRole('button').map((b) => b.getAttribute('data-key'))).toEqual(['Anseriformes', 'Piciformes', 'Cuculiformes', 'Columbiformes'])
    const ducks = within(tips).getByRole('button', { name: /^Waterfowl, 2 of 4 on the list$/ })
    // One bird of the order on the list, the first in taxonomic order with a sticker; none for an order without one,
    // whose sticker's box stays (every name starts at one place).
    expect(ducks.querySelector('.eb-tree-st img')?.getAttribute('src')).toContain('a1')
    const cuckoos = within(tips).getByRole('button', { name: /^Cuckoos,/ })
    expect(cuckoos.querySelector('img')).toBeNull()
    expect(cuckoos.querySelector('.eb-tree-st')).toBeInTheDocument()
    // Each tip reads: its dot, the sticker's box, the name, the count.
    expect([...ducks.children].map((c) => c.className)).toEqual(['eb-tree-dot', 'eb-tree-st', 'eb-tree-name', 'eb-mono eb-tree-count', 'eb-sr'])
    // One name per row: the common one, or the scientific one with the bar's switch.
    expect(within(tips).queryByText('Anseriformes')).toBeNull()
    expect(screen.queryByText('2 of 4 orders')).toBeNull() // no count line: the page's stats line has the counts
    fireEvent.click(within(slot).getByRole('button', { name: 'Level Orders' }))
    expect(screen.getByRole('menu', { name: 'Level' })).toBeInTheDocument()
    expect(screen.getAllByRole('menuitemradio').map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['Orders', 'true'], ['Families', 'false'], ['Genera', 'false'], ['Species', 'false']])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Families' }))
    expect(within(slot).getByRole('button', { name: 'Level Families' })).toHaveFocus()
    tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByText('Waterfowl')).toBeInTheDocument() // the order heading
    expect(within(tips).getByRole('button', { name: /^Ducks, 2 of 4 on the list$/ })).toBeInTheDocument()
    expect(within(tips).getByRole('button', { name: /^Woodpeckers, 1 of 2 on the list$/ })).toBeInTheDocument()
    expect(screen.getByText('Oldest lineage on this list: Beta Two, which split from its closest relatives about 4 million years ago (an estimate).')).toBeInTheDocument()
    expect(screen.getByText('1 bird on this list has no place in this tree:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lost Duck' })).toBeInTheDocument()
    // The one-line credit; the full one is on About.
    expect(screen.getByRole('link', { name: 'AvesData' })).toHaveAttribute('href', 'https://github.com/McTavishLab/AvesData')
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(screen.getByRole('link', { name: 'AvesData' }).closest('p')).toHaveTextContent(/^Tree: AvesData \(McTavish et al\.\), CC BY 4\.0$/)
    expect(screen.getByText('Million years ago (estimates)')).toBeInTheDocument()
  })

  it('an order opens to its families, a family to its genera, a genus to its species; a tip on the list opens the card', async () => {
    const onPick = vi.fn()
    render(<Tree entries={['a1', 'b2'].map(entry)} onPick={onPick} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Waterfowl/ }))
    // Inside an order the Level menu offers no Orders.
    fireEvent.click(within(slot).getByRole('button', { name: 'Level Families' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Families', 'Genera', 'Species'])
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Ducks/ }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    // Aa is not one branch: one row for the branch, with Ab inside it and no row of its own.
    expect(within(genera).getAllByRole('button')).toHaveLength(1)
    const aa = within(genera).getByRole('button', { name: 'Aa with Ab, not one branch of its own in this tree, 1 of 4 on the list' })
    expect(aa).toHaveAttribute('data-on')
    expect(aa.querySelector('.eb-tree-mark')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(aa)
    expect(screen.getByText('In this tree, Ab sits inside Aa.')).toBeInTheDocument()
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByText('Alpha Two')).toBeInTheDocument()
    // Every species of the branch where the tree puts it, by its one name.
    expect([...tips.querySelectorAll('.eb-tree-row')].map((li) => li.querySelector('.eb-tree-name')!.textContent)).toEqual(['Alpha One', 'Alpha Three', 'Alpha Two'])
    expect(within(tips).queryByRole('button', { name: /Alpha Two/ })).toBeNull() // not on the list: grey, no card
    fireEvent.click(within(tips).getByRole('button', { name: 'Alpha One, on the list' }))
    expect(onPick).toHaveBeenCalledWith('a1', expect.any(HTMLElement))
  })

  it('a pointer press moves no focus; from the keyboard the focus moves without scrolling the page', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    const waterfowl = await screen.findByRole('button', { name: /^Waterfowl/ })
    fireEvent.pointerDown(waterfowl)
    fireEvent.click(waterfowl)
    expect(document.body).toHaveFocus()
    const ducks = screen.getByRole('button', { name: /^Ducks/ })
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    viaKeyboard()
    fireEvent.click(ducks)
    expect(screen.getByRole('button', { name: /^Aa with Ab/ })).toHaveFocus()
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it('the Level menu shows every genus or species of the open branch at once; a species tip carries its own sticker, dimmed off the list', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Waterfowl/ }))
    chooseLevel('Species')
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect([...tips.querySelectorAll('.eb-tree-row')].map((li) => li.querySelector('.eb-tree-name')!.textContent)).toEqual(['Alpha One', 'Alpha Three', 'Alpha Two'])
    expect(within(tips).getByText('Alpha Two').closest('.eb-tree-btn')!.querySelector('[data-off] img')?.getAttribute('src')).toContain('a2')
    expect(within(tips).getByRole('button', { name: 'Alpha One, on the list' }).querySelector('[data-off]')).toBeNull()
    // Back to the order's own tips.
    chooseLevel('Families')
    expect(screen.getByRole('button', { name: /^Ducks, 1 of 4 on the list$/ })).toBeInTheDocument()
  })

  it('a tip placed without genetic data says so, and the key under the tree explains the dotted line', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    chooseLevel('Families')
    fireEvent.click(screen.getByRole('button', { name: /^Woodpeckers/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Bb,/ }))
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByRole('button', { name: 'Beta Two, on the list, placed without genetic data' })).toBeInTheDocument()
    expect(within(tips).getByText('Beta One').closest('.eb-tree-btn')).not.toHaveTextContent(/genetic/)
    expect(screen.getByText('Placed without genetic data')).toBeInTheDocument()
  })

  it('a genus split across its family is one marked row, with the genus inside named; the key says what the mark means', async () => {
    render(<Tree entries={['c3'].map(entry)} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    chooseLevel('Families')
    fireEvent.click(screen.getByRole('button', { name: /^Cuckoos/ }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(genera).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(genera).getByRole('button', { name: 'Ca with Cb, not one branch of its own in this tree, 1 of 4 on the list' }))
    expect(screen.getByText('Not one branch of its own in this tree')).toBeInTheDocument()
    expect(screen.getByText('In this tree, Cb sits inside Ca.')).toBeInTheDocument()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Gamma One', 'Gamma Two', 'Gamma Three', 'Gamma Four'])
  })

  it('more than two genera inside: a count opening their list, each genus opening its own species', async () => {
    render(<Tree entries={['d3'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Pigeons and doves/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Pigeons, / }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(genera).getByRole('button', { name: 'Da, not one branch of its own in this tree, 1 of 5 on the list' })).toBeInTheDocument()
    const more = within(genera).getByRole('button', { name: 'Da with 3 other genera' })
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(more)
    const sheet = screen.getByRole('dialog', { name: 'Inside the Da branch' })
    expect(within(sheet).getByText('Inside the Da branch · 3')).toBeInTheDocument()
    expect(within(within(sheet).getByRole('list')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Db0 / 1, 0 of 1 on the list', 'Dc1 / 1, 1 of 1 on the list', 'Dd0 / 1, 0 of 1 on the list'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Dc, 1 of 1 on the list' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Delta Three'])
  })

  it('Lifers only (the bar\'s switch, tree-mine.ts): off to start, keeping the rows with a bird on the list, held on the device and told to Share', async () => {
    // Node 25+ has its own unconfigured localStorage that shadows jsdom's.
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    const onLevel = vi.fn()
    const { unmount } = render(<Tree entries={['b2'].map(entry)} onLevel={onLevel} />)
    expect(await screen.findByRole('button', { name: /^Waterfowl/ })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull() // the switch is in the controls bar
    act(() => setTreeMine(true))
    expect(screen.queryByRole('button', { name: /^Waterfowl/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Woodpeckers, 1 of 2 on the list$/ })).toBeInTheDocument()
    expect(onLevel).toHaveBeenLastCalledWith({}, true, 'rows')
    expect(localStorage.getItem(TREE_MINE_KEY)).toBe('1')
    unmount()
    // The open family loses its last bird: one plain line.
    const branch = { ord: 'Piciformes', fam: 'Picidae' }
    const { rerender } = render(<TreeView menus={slot} entries={['b2'].map(entry)} sci={false} onPick={() => {}} branch={branch} onOpen={() => {}} />)
    await screen.findByRole('button', { name: /^Bb/ })
    rerender(<TreeView menus={slot} entries={['a1'].map(entry)} sci={false} onPick={() => {}} branch={branch} onOpen={() => {}} />)
    expect(screen.getByText('No bird on the list here.')).toBeInTheDocument()
    act(() => setTreeMine(false))
    expect(localStorage.getItem(TREE_MINE_KEY)).toBeNull()
    expect(screen.queryByText('No bird on the list here.')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('a smaller list changes the counts and the marked tips', async () => {
    const { rerender } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    const duck = await screen.findByRole('button', { name: /^Waterfowl/ })
    expect(duck).toHaveAttribute('data-on')
    rerender(<Tree entries={['b2'].map(entry)} />)
    const none = screen.getByRole('button', { name: /^Waterfowl, 0 of 4 on the list$/ })
    expect(none).not.toHaveAttribute('data-on')
    expect(none.querySelector('img')).toBeNull()
    expect(screen.getByText('Every bird on this list has a place in the tree.')).toBeInTheDocument()
  })

  it('with the Scientific switch the rows show the scientific name alone', async () => {
    render(<Tree entries={['a1'].map(entry)} sci />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect([...tips.querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Anseriformes', 'Piciformes', 'Cuculiformes', 'Columbiformes'])
    expect(within(tips).queryByText('Waterfowl')).toBeNull()
  })

  it('the Layout menu: Fan, Radial and Rectangular, the choice kept on the device under its first names', async () => {
    const kept = new Map<string, string>([[TREE_LAYOUT_KEY, 'rows']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    render(<Tree entries={['a1'].map(entry)} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    // An old stored "rows" reads as Rectangular. No width in jsdom: rows, whatever is picked.
    fireEvent.click(within(slot).getByRole('button', { name: 'Layout Rectangular' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Fan', 'Radial', 'Rectangular'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Radial' }))
    expect(localStorage.getItem(TREE_LAYOUT_KEY)).toBe('circle')
    vi.unstubAllGlobals()
  })
})

describe('the Fan and Radial on a measured width', () => {
  // A width for the tree (jsdom lays nothing out): ResizeObserver answers at once, clientWidth is `w` on .eb-tree.
  function widthOf(w: number) {
    vi.stubGlobal('ResizeObserver', class { constructor(private cb: () => void) {} observe() { this.cb() } disconnect() {} })
    const was = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return (this as HTMLElement).classList.contains('eb-tree') ? w : 0 } })
    return () => { if (was) Object.defineProperty(HTMLElement.prototype, 'clientWidth', was); vi.unstubAllGlobals() }
  }
  it('every tip has its label; the rows stay for the keyboard, whose focus marks the tip; a press on a label opens it', async () => {
    const undo = widthOf(1100)
    const onLevel = vi.fn()
    const { container } = render(<Tree entries={['a1', 'b2'].map(entry)} onLevel={onLevel} />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(container.querySelector('.eb-tree')).toHaveAttribute('data-round')
    expect(within(slot).getByRole('button', { name: 'Layout Fan' })).toBeInTheDocument()
    expect(onLevel).toHaveBeenLastCalledWith({}, false, 'fan')
    // Every tip named, each label reading: the sticker's box, the name, the count.
    const labels = [...container.querySelectorAll('.eb-tree-fan-label')]
    expect(labels.map((l) => l.querySelector('.eb-tree-fan-text')!.textContent)).toEqual(['Waterfowl', 'Woodpeckers', 'Cuckoos', 'Pigeons and doves'])
    expect([...labels[0].children].map((c) => c.className)).toEqual(['eb-tree-fan-st', 'eb-tree-fan-text', 'eb-mono eb-tree-fan-count'])
    expect(labels[0].querySelector('.eb-tree-fan-count')).toHaveTextContent('1 of 4')
    // A pointer over a tip marks it (no focus outline); the keyboard's focus on its row marks it with the outline.
    fireEvent.mouseOver(labels[1])
    expect(labels[1]).toHaveAttribute('data-hot')
    expect(labels[1]).not.toHaveAttribute('data-focus')
    fireEvent.mouseLeave(container.querySelector('.eb-tree-fan')!)
    viaKeyboard()
    act(() => within(tips).getByRole('button', { name: /^Cuckoos/ }).focus())
    expect(container.querySelector('.eb-tree-fan-label[data-i="2"]')).toHaveAttribute('data-focus')
    act(() => within(tips).getByRole('button', { name: /^Cuckoos/ }).blur())
    expect(container.querySelector('.eb-tree-fan-label[data-hot]')).toBeNull()
    // A press on a label opens its branch, as its row does.
    fireEvent.click(labels[0])
    expect(container.querySelector('.eb-tree-fan-label .eb-tree-fan-text')).toHaveTextContent('Ducks')
    undo()
  })
  it('too narrow to name every tip: Rectangular, with Fan and Radial listed but not on offer, saying why', async () => {
    const kept = new Map<string, string>([[TREE_LAYOUT_KEY, 'fan']])
    const undo = widthOf(300)
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    const { container } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(container.querySelector('.eb-tree')).not.toHaveAttribute('data-round')
    fireEvent.click(within(slot).getByRole('button', { name: 'Layout Rectangular' }))
    const fan = screen.getByRole('menuitemradio', { name: 'Fan' })
    expect(fan).toHaveAttribute('aria-disabled', 'true')
    expect(fan).toHaveAccessibleDescription('Not enough room for every name')
    expect(screen.getByRole('menuitemradio', { name: 'Radial' })).toHaveAttribute('aria-disabled', 'true')
    undo()
  })
})

describe('MenuSelect', () => {
  it('a choice with a reason stays listed, aria-disabled with the reason, and cannot be taken', () => {
    const onChange = vi.fn()
    render(
      <>
        <span id="lbl">Level</span>
        <MenuSelect labelledBy="lbl" menuLabel="Level" value="a" onChange={onChange} escapeRef={{ current: null }}
          options={[{ value: 'a', label: 'Orders' }, { value: 'b', label: 'Genera', off: 'Open a family to see its genera' }]} />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Level Orders' }))
    const off = screen.getByRole('menuitemradio', { name: 'Genera' })
    expect(off).toHaveAttribute('aria-disabled', 'true')
    expect(off).toHaveAccessibleDescription('Open a family to see its genera')
    fireEvent.click(off)
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })
})
