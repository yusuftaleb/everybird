// @vitest-environment jsdom
// The Tree tab (TreeView.tsx) on a synthetic tree: the orders first, with counts and stickers, always the one rank under
// the open branch (round 6: no Level menu), drilling to families, genera and species with the focus following (from the
// keyboard, never scrolling), a branch never opening on one lone tip, the Layout choice (in the Display panel's slot),
// the taxonomy path under the dock and the Taxa panel's chips as the tree's path (in CollageView, the genus a chip too),
// one name per row, the bird card from a tip, the birds the tree lacks, the oldest lineage as the legend, and the tab in
// CollageView.
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
import type { TreeShown } from '@/components/tree/TreeView'
import { setTreeDown, setTreeMine, TREE_DOWN_KEY, TREE_LAYOUT_KEY, TREE_MINE_KEY } from '@/lib/tree-mine'

// The tree file, and the full species file TreeView loads itself (the shown index may be the landing sample's own).
const { fetchData, rows } = vi.hoisted(() => {
  const file: TreeFile = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: '2026', newick: '((((a1:1,a3:1):2,a2:3):7,(b1:4,b2:4):6):1,((c1:1,c2:1):1,(c3:1,c4:1):1):9,((d1:1,d2:1):1,(d3:1,(d4:0.5,d5:0.5):0.5):1):9,((((pa1:1,pb1:1):1,pa2:2):1,((qa1:1.5,(qb1:1,(qc1:0.5,qd1:0.5):0.5):0.5):0.5,qa2:2):1,(ra1:1,ra2:1,ra3:1,ra4:1,ra5:1,ra6:1):2,sa1:3):5,g1:8,ar1:8,ps1:8):3);', taxOnly: 'Q' }
  // b2, the fifth tip, is placed without genetic data. Genus Aa's row holds Ab, Ca's holds Cb, Da's holds Db, Dc and Dd;
  // in the rails, Pa's holds Pb and Qa's holds Qb, Qc and Qd.
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
  // Cranes and rails: four families (more than SMALL_STEP), so the order opens at its families; the rails (15 species,
  // more than SPECIES_AT, in four rows) open at their genera (Pa with Pb, Qa with three, Ra, Sa), the cranes, limpkins
  // and trumpeters (one species each) at it.
  sp('pa1', 'Rail One', 'Pa one', 'Gruiformes', 'Rallidae', 'Rails', 16), sp('pb1', 'Rail Two', 'Pb two', 'Gruiformes', 'Rallidae', 'Rails', 17),
  sp('pa2', 'Rail Three', 'Pa three', 'Gruiformes', 'Rallidae', 'Rails', 18),
  sp('qa1', 'Crake One', 'Qa one', 'Gruiformes', 'Rallidae', 'Rails', 19), sp('qb1', 'Crake Two', 'Qb two', 'Gruiformes', 'Rallidae', 'Rails', 20),
  sp('qc1', 'Crake Three', 'Qc three', 'Gruiformes', 'Rallidae', 'Rails', 21), sp('qd1', 'Crake Four', 'Qd four', 'Gruiformes', 'Rallidae', 'Rails', 22),
  sp('qa2', 'Crake Five', 'Qa five', 'Gruiformes', 'Rallidae', 'Rails', 23),
  ...[1, 2, 3, 4, 5, 6].map((n) => sp(`ra${n}`, `Coot ${n}`, `Ra c${n}`, 'Gruiformes', 'Rallidae', 'Rails', 23 + n)),
  sp('sa1', 'Rail Four', 'Sa four', 'Gruiformes', 'Rallidae', 'Rails', 30),
  sp('g1', 'Crane One', 'Gg one', 'Gruiformes', 'Gruidae', 'Cranes', 31), sp('ar1', 'Limpkin One', 'Ar one', 'Gruiformes', 'Aramidae', 'Limpkins', 32),
  sp('ps1', 'Trumpeter One', 'Ps one', 'Gruiformes', 'Psophiidae', 'Trumpeters', 33),
)
const entry = (code: string): ListEntry => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry)

// The Display panel's slot the Layout choice goes in (CollageView hands TreeView the panel's own).
let slot: HTMLDivElement
beforeEach(() => {
  fetchData.mockClear()
  slot = document.body.appendChild(document.createElement('div'))
})
afterEach(() => { cleanup(); slot.remove() })
/** The keyboard was the last input: the tree moves focus as branches open and close (a pointer press never does). */
const viaKeyboard = () => fireEvent.keyDown(document.body, { key: 'Tab' })
/** TreeView alone, its open branch held as CollageView holds it (without the filter). */
function Tree(props: { entries: ListEntry[]; sci?: boolean; onPick?: (code: string, el: HTMLElement) => void; onLevel?: (at: TreeShown) => void }) {
  const [branch, setBranch] = useState<OpenBranch>({})
  return <TreeView layoutSlot={slot} entries={props.entries} sci={props.sci ?? false} onPick={props.onPick ?? (() => {})} onLevel={props.onLevel} branch={branch} onOpen={(b) => setBranch(b)} />
}
/** The Layout choice in the slot: a segmented group. */
const layoutBtn = (name: string) => within(within(slot).getByRole('group', { name: 'Layout' })).getByRole('button', { name })

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

  it('a third view tab; the tree loads only when it opens, without the size switch; its legend is the oldest lineage', async () => {
    const { container } = render(<Harness codes={['a1', 'b2']} index={partial} />)
    expect(fetchData).not.toHaveBeenCalledWith('tree.v1.json')
    const view = screen.getByRole('group', { name: 'View' })
    openTree()
    expect(within(view).getByRole('button', { name: 'Tree' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(fetchData).toHaveBeenCalledWith('tree.v1.json')
    expect(screen.queryByRole('switch', { name: /True size/ })).toBeNull()
    // Round 6: the oldest lineage under the tree, in the Collage legend's place and style.
    await waitFor(() => expect(container.querySelector('.eb-legend')).toHaveTextContent('Oldest lineage on this list: Beta Two, which split from its closest relatives about 4 million years ago (an estimate).'))
    expect(container.querySelector('.eb-tree-fact')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: /^Woodpeckers, 1 of 2 on the list$/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Waterfowl, 1 of 4 on the list$/ })).toBeInTheDocument()
    // Round 6: nothing but the panel buttons in the Tree's bar (no Level menu at all); the Display panel holds the
    // Layout choice first, then Lifers only, Time scale and Scientific names.
    const dock = container.querySelector('.eb-dock')!
    expect(dock).toHaveAttribute('data-view', 'tree')
    expect(within(dock as HTMLElement).queryAllByRole('switch')).toEqual([])
    expect(screen.queryByTestId('tree-level')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Level / })).toBeNull()
    expect(dock.querySelector('.eb-dock-tools')).toBeNull()
    fireEvent.click(screen.getByTestId('display-button'))
    const panel = screen.getByTestId('display-panel')
    const layout = within(panel).getByRole('group', { name: 'Layout' })
    expect(layout).toHaveAttribute('data-testid', 'tree-layout')
    expect(within(layout).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Fan', 'false'], ['Radial', 'false'], ['Rectangular', 'true']])
    expect(within(panel).getAllByRole('switch').map((b) => b.getAttribute('data-testid'))).toEqual(['tree-mine', 'tree-time', 'dock-sci'])
    expect(layout.compareDocumentPosition(within(panel).getByTestId('tree-mine')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // P9 (the Tree brief, item 13): the oldest lineage follows the Scientific switch, as every tip does.
    fireEvent.click(within(panel).getByTestId('dock-sci'))
    expect(container.querySelector('.eb-legend')).toHaveTextContent('Oldest lineage on this list: Bb two, which split')
    fireEvent.click(within(panel).getByTestId('dock-sci'))
    expect(container.querySelector('.eb-legend')).toHaveTextContent('Oldest lineage on this list: Beta Two, which split')
    fireEvent.click(screen.getByTestId('display-button'))
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull() // only while the panel is open
    expect(screen.queryByRole('group', { name: 'Show tips as' })).toBeNull()
    // No path of the tree's own: the taxonomy path is its path. No count line either: with Lifers only off the page's
    // stats line counts against the taxonomy, from the full species file (the shown index here holds only the list's birds).
    expect(screen.queryByRole('navigation', { name: 'Tree levels' })).toBeNull()
    expect(screen.queryByText('2 of 5 orders')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('collage-stats')).toHaveTextContent('2 / 33 species · 2 / 5 orders · 2 / 8 families · since Jan 2024'))
    // Every other view keeps today's line.
    fireEvent.click(within(view).getByRole('button', { name: 'Collage' }))
    expect(screen.getByTestId('collage-stats')).toHaveTextContent('2 species · 2 orders · 2 families · since Jan 2024')
    // P9: the Collage's latest-lifer line follows the Scientific switch the same way.
    const legend = () => container.querySelector('.eb-legend')!.textContent!
    expect(legend()).toMatch(/Latest: (Alpha One|Beta Two)/)
    fireEvent.click(screen.getByTestId('display-button'))
    fireEvent.click(within(screen.getByTestId('display-panel')).getByTestId('dock-sci'))
    expect(legend()).toMatch(/Latest: (Aa one|Bb two)/)
  })

  it("the taxonomy path is the tree's path: a chip opens the branch, a tip picks the chip, a genus is a chip too, and the steps go back", async () => {
    render(<Harness codes={['a1', 'b2', 'pa1', 'g1']} index={full} />)
    openTree()
    await screen.findByRole('button', { name: /^Waterfowl, 1 of 4/ })
    const taxa = () => screen.getByTestId('taxa-button')
    // An order chip (the Taxa panel's) opens it in the tree: one family of three species with a tip, so straight at the
    // species (round 6); the path names the lone family.
    fireEvent.click(taxa())
    fireEvent.click(within(screen.getByRole('group', { name: 'Orders' })).getByRole('button', { name: /^Waterfowl/ }))
    fireEvent.click(taxa())
    expect(within(tipList()).getByRole('button', { name: 'Alpha One, on the list' })).toBeInTheDocument()
    expect(path()).toHaveTextContent('All birds/Waterfowl/Ducks')
    // Back in the path closes the branch.
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'All birds' }))
    expect(within(tipList()).getByRole('button', { name: /^Woodpeckers, / })).toBeInTheDocument()
    expect(path()).toBeNull()
    // A tip opens its branch and picks its chips: the order (four families: its families), then the family (its genera).
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Cranes and rails/ }))
    expect(path()).toHaveTextContent(/^All birds\/Cranes and rails$/)
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Rails, / }))
    expect(path()).toHaveTextContent('All birds/Cranes and rails/Rails')
    fireEvent.click(taxa())
    expect(within(screen.getByRole('group', { name: 'Families' })).getByRole('button', { name: /^Rails/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(taxa())
    // A genus opened in the tree is the genus chip (round 6); a marked one reads as its row does; the family's step goes back.
    viaKeyboard()
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Pa with Pb/ }))
    expect(path()).toHaveTextContent('All birds/Cranes and rails/Rails/Pa with Pb')
    expect(document.querySelector('.eb-filters [aria-current]')).toHaveTextContent(/^Pa with Pb$/)
    // Opening from the keyboard focuses the new branch's first tip, without a scroll.
    expect(within(tipList()).getByRole('button', { name: 'Rail One, on the list' })).toHaveFocus()
    expect(screen.getByText('Pa is not one branch in this tree. The smallest branch with all of it also holds Pb, so both are shown.')).toBeInTheDocument()
    fireEvent.click(taxa())
    expect(within(screen.getByRole('group', { name: 'Genera' })).getByRole('button', { name: /^Pa/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(taxa())
    act(() => within(tipList()).getByRole('button', { name: /^Rail One/ }).focus()) // the panel gave focus back to its button
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Rails' }))
    expect(path()).toHaveTextContent(/^All birds\/Cranes and rails\/Rails$/)
    expect(within(tipList()).getByRole('button', { name: /^Pa with Pb/ })).toHaveFocus() // back to the tip it came from
    // Up to the order: its families again.
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Cranes and rails' }))
    expect(path()).toHaveTextContent(/^All birds\/Cranes and rails$/)
    expect(within(tipList()).getByRole('button', { name: /^Rails, / })).toBeInTheDocument()
  })

  it("a family the filter cannot hold (the sample's index lacks it) still opens, as a step of the path", async () => {
    render(<Harness codes={['a1', 'b2']} index={partial} />)
    openTree()
    fireEvent.click(await screen.findByRole('button', { name: /^Cranes and rails/ }))
    expect(path()).toHaveTextContent('All birds/Cranes and rails')
    fireEvent.click(within(tipList()).getByRole('button', { name: /^Rails, / }))
    expect(path()).toHaveTextContent('All birds/Cranes and rails/Rails')
    // Its genera, one step under it.
    expect(within(tipList()).getByRole('button', { name: /^Pa with Pb/ })).toBeInTheDocument()
    fireEvent.click(within(path() as HTMLElement).getByRole('button', { name: 'Cranes and rails' }))
    expect(path()).toHaveTextContent(/^All birds\/Cranes and rails$/)
    expect(within(tipList()).getByRole('button', { name: /^Rails, / })).toBeInTheDocument()
  })
})

describe('TreeView', () => {
  it('opens on every order with its count and sticker; an order of four families shows its families; the birds without a tip and the source', async () => {
    render(<Tree entries={['a1', 'b2', 'x1'].map(entry)} />)
    let tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getAllByRole('button').map((b) => b.getAttribute('data-key'))).toEqual(['Anseriformes', 'Piciformes', 'Cuculiformes', 'Columbiformes', 'Gruiformes'])
    const ducks = within(tips).getByRole('button', { name: /^Waterfowl, 2 of 4 on the list$/ })
    // One bird of the order on the list, the first in taxonomic order with a sticker; an order with no bird on the list
    // shows its first species with a sticker, dimmed as a species off the list (round 6).
    expect(ducks.querySelector('.eb-tree-st img')?.getAttribute('src')).toContain('a1')
    expect(ducks.querySelector('[data-off]')).toBeNull()
    const cuckoos = within(tips).getByRole('button', { name: /^Cuckoos,/ })
    expect(cuckoos.querySelector('.eb-tree-st-in[data-off] img')?.getAttribute('src')).toContain('c1')
    // Each tip reads: its dot, the sticker's box, the name; the count after the row's button(s), ending the row.
    expect([...ducks.children].map((c) => c.className)).toEqual(['eb-tree-dot', 'eb-tree-st', 'eb-tree-name', 'eb-sr'])
    expect([...ducks.closest('li')!.children].map((c) => c.className)).toEqual(['eb-tree-btn', 'eb-mono eb-tree-count'])
    expect(ducks.closest('li')!.querySelector('.eb-tree-count')).toHaveTextContent('2 / 4')
    // One name per row: the common one, or the scientific one with the Scientific switch.
    expect(within(tips).queryByText('Anseriformes')).toBeNull()
    expect(screen.queryByText('2 of 5 orders')).toBeNull() // no count line: the page's stats line has the counts
    // The rank line above the tree names the rank drawn and how many (round 6), in the Taxa panel head's mono.
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^5 orders$/)
    expect(screen.getByTestId('tree-rank')).toHaveClass('eb-mono')
    // No Level menu (round 6): an order of four families and more than SPECIES_AT species opens at its families.
    expect(screen.queryByTestId('tree-level')).toBeNull()
    fireEvent.click(within(tips).getByRole('button', { name: /^Cranes and rails/ }))
    tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? b.textContent)).toHaveLength(4)
    expect(within(tips).getByRole('button', { name: /^Rails, 0 of 15 on the list$/ })).toBeInTheDocument()
    expect(within(tips).getByRole('button', { name: /^Cranes, 0 of 1 on the list$/ })).toBeInTheDocument()
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^4 families$/)
    expect(tips.querySelector('.eb-tree-heading')).toBeNull() // no headings: the order is open and its families are the tips
    // The oldest lineage is CollageView's legend now, not the tree's own line.
    expect(screen.queryByText(/^Oldest lineage on this list/)).toBeNull()
    expect(screen.getByText('1 bird on this list has no place in this tree:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lost Duck' })).toBeInTheDocument()
    // No credit line under the tree (round 6): the full credit is on About.
    expect(screen.queryByRole('link', { name: 'AvesData' })).toBeNull()
    expect(screen.getByText('Million years ago (estimates)')).toBeInTheDocument()
  })

  it('an order with one family opens past it; a family\'s genera and a genus\'s species; a tip on the list opens the card', async () => {
    const onPick = vi.fn()
    render(<Tree entries={['a1', 'b2', 'pa1'].map(entry)} onPick={onPick} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Waterfowl/ }))
    // One family whose genera are one row (Aa with Ab), three species: straight at the species.
    expect(screen.getByRole('button', { name: 'Alpha One, on the list' })).toBeInTheDocument()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Alpha One', 'Alpha Three', 'Alpha Two'])
    // The rails (15 species in four rows) open at their genera.
    cleanup()
    render(<Tree entries={['a1', 'b2', 'pa1'].map(entry)} onPick={onPick} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Cranes and rails/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Rails, / }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    // Pa is not one branch: one row for the branch, with Pb inside it and no row of its own.
    expect([...genera.querySelectorAll('.eb-tree-btn')].map((b) => b.getAttribute('data-key'))).toEqual(['Pa', 'Qa', 'Ra', 'Sa'])
    const pa = within(genera).getByRole('button', { name: 'Pa with Pb, not one branch of its own in this tree, 1 of 3 on the list' })
    expect(pa).toHaveAttribute('data-on')
    expect(pa.querySelector('.eb-tree-mark')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.click(pa)
    expect(screen.getByText('Pa is not one branch in this tree. The smallest branch with all of it also holds Pb, so both are shown.')).toBeInTheDocument()
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    // Every species of the branch where the tree puts it, by its one name.
    expect([...tips.querySelectorAll('.eb-tree-row')].map((li) => li.querySelector('.eb-tree-name')!.textContent)).toEqual(['Rail One', 'Rail Two', 'Rail Three'])
    expect(within(tips).queryByRole('button', { name: /Rail Two/ })).toBeNull() // not on the list: grey, no card
    fireEvent.click(within(tips).getByRole('button', { name: 'Rail One, on the list' }))
    expect(onPick).toHaveBeenCalledWith('pa1', expect.any(HTMLElement))
  })

  it('a pointer press moves no focus; from the keyboard the focus moves without scrolling the page', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    const order = await screen.findByRole('button', { name: /^Cranes and rails/ })
    fireEvent.pointerDown(order)
    fireEvent.click(order)
    expect(document.body).toHaveFocus()
    const rails = screen.getByRole('button', { name: /^Rails, / })
    const focus = vi.spyOn(HTMLElement.prototype, 'focus')
    viaKeyboard()
    fireEvent.click(rails)
    expect(screen.getByRole('button', { name: /^Pa with Pb/ })).toHaveFocus()
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true })
    focus.mockRestore()
  })

  it('a species tip carries its own sticker, dimmed off the list', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Waterfowl/ }))
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect([...tips.querySelectorAll('.eb-tree-row')].map((li) => li.querySelector('.eb-tree-name')!.textContent)).toEqual(['Alpha One', 'Alpha Three', 'Alpha Two'])
    expect(within(tips).getByText('Alpha Two').closest('.eb-tree-btn')!.querySelector('[data-off] img')?.getAttribute('src')).toContain('a2')
    expect(within(tips).getByRole('button', { name: 'Alpha One, on the list' }).querySelector('[data-off]')).toBeNull()
  })

  it('a tip placed without genetic data says so, and the key under the tree explains the dotted line', async () => {
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    // An order of one family with one genus opens at its species (round 6).
    fireEvent.click(await screen.findByRole('button', { name: /^Woodpeckers/ }))
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByRole('button', { name: 'Beta Two, on the list, placed without genetic data' })).toBeInTheDocument()
    expect(within(tips).getByText('Beta One').closest('.eb-tree-btn')).not.toHaveTextContent(/genetic/)
    expect(screen.getByText('Placed without genetic data')).toBeInTheDocument()
  })

  it('a genus split across its family is one marked row, with the genus inside named; the key says what the mark means', async () => {
    render(<Tree entries={['pb1'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Cranes and rails/ }))
    expect(screen.queryByText('Not one branch of its own in this tree')).toBeNull() // the key says only what is drawn
    fireEvent.click(screen.getByRole('button', { name: /^Rails, / }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(screen.getByText('Not one branch of its own in this tree')).toBeInTheDocument()
    const pa = within(genera).getByRole('button', { name: 'Pa with Pb, not one branch of its own in this tree, 1 of 3 on the list' })
    expect(pa.querySelector('.eb-tree-other')).toHaveTextContent('with Pb')
    fireEvent.click(pa)
    expect(screen.getByText('Pa is not one branch in this tree. The smallest branch with all of it also holds Pb, so both are shown.')).toBeInTheDocument()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Rail One', 'Rail Two', 'Rail Three'])
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^3 species$/)
  })

  it('opening a marked row tells the branch with the other genera it holds (the filter\'s `with`)', async () => {
    const onOpen = vi.fn()
    render(<TreeView entries={['pb1'].map(entry)} sci={false} onPick={() => {}} branch={{ ord: 'Gruiformes', fam: 'Rallidae' }} onOpen={onOpen} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Pa with Pb/ }))
    expect(onOpen.mock.lastCall![0]).toEqual({ ord: 'Gruiformes', fam: 'Rallidae', genus: 'Pa', with: ['Pb'] })
    fireEvent.click(screen.getByRole('button', { name: /^Ra, / }))
    expect(onOpen.mock.lastCall![0]).toEqual({ ord: 'Gruiformes', fam: 'Rallidae', genus: 'Ra' })
  })

  it('more than two genera inside: a count opening their list, each genus opening its own species', async () => {
    render(<Tree entries={['qc1'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Cranes and rails/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Rails, / }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(genera).getByRole('button', { name: 'Qa, not one branch of its own in this tree, 1 of 5 on the list' })).toBeInTheDocument()
    const more = within(genera).getByRole('button', { name: 'Qa with 3 other genera' })
    expect(more).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(more)
    const sheet = screen.getByRole('dialog', { name: 'Inside the Qa branch' })
    expect(within(sheet).getByText('Inside the Qa branch · 3')).toBeInTheDocument()
    expect(within(within(sheet).getByRole('list')).getAllByRole('button').map((b) => b.textContent)).toEqual(['Qb0 / 1, 0 of 1 on the list', 'Qc1 / 1, 1 of 1 on the list', 'Qd0 / 1, 0 of 1 on the list'])
    fireEvent.click(within(sheet).getByRole('button', { name: 'Qc, 1 of 1 on the list' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Crake Three'])
  })

  it('Lifers only (the Display panel\'s switch, tree-mine.ts): off to start, keeping the rows with a bird on the list, held on the device and told to Share', async () => {
    // Node 25+ has its own unconfigured localStorage that shadows jsdom's.
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    const onLevel = vi.fn()
    const { unmount } = render(<Tree entries={['b2'].map(entry)} onLevel={onLevel} />)
    expect(await screen.findByRole('button', { name: /^Waterfowl/ })).toBeInTheDocument()
    expect(screen.queryByRole('switch')).toBeNull() // the switch is in the Display panel
    act(() => setTreeMine(true))
    expect(screen.queryByRole('button', { name: /^Waterfowl/ })).toBeNull()
    expect(screen.getByRole('button', { name: /^Woodpeckers, 1 of 2 on the list$/ })).toBeInTheDocument()
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^1 of 5 orders$/) // the Taxa panel head's words
    expect(onLevel).toHaveBeenLastCalledWith(expect.objectContaining({ tree: {}, mine: true, layout: 'rows', time: true }))
    expect(localStorage.getItem(TREE_MINE_KEY)).toBe('1')
    unmount()
    // The open family loses its last bird: one plain line.
    const branch = { ord: 'Piciformes', fam: 'Picidae' }
    const { rerender } = render(<TreeView entries={['b2'].map(entry)} sci={false} onPick={() => {}} branch={branch} onOpen={() => {}} />)
    await screen.findByRole('button', { name: /^Beta Two/ }) // one genus: its species
    rerender(<TreeView entries={['a1'].map(entry)} sci={false} onPick={() => {}} branch={branch} onOpen={() => {}} />)
    expect(screen.getByText('No bird on the list here.')).toBeInTheDocument()
    expect(screen.queryByTestId('tree-rank')).toBeNull() // nothing drawn, no rank line
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
    expect(none.querySelector('[data-off] img')?.getAttribute('src')).toContain('a1') // its first species, dimmed
    // Every bird has a tip: no line about it (round 6).
    expect(screen.queryByText(/place in (this|the) tree/)).toBeNull()
  })

  it('with the Scientific switch the rows show the scientific name alone', async () => {
    render(<Tree entries={['a1'].map(entry)} sci />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect([...tips.querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Anseriformes', 'Piciformes', 'Cuculiformes', 'Columbiformes', 'Gruiformes'])
    expect(within(tips).queryByText('Waterfowl')).toBeNull()
  })

  it('headings at the rank right above the tips (round 6, item 10): genera under their families, the order too where it changes; plain text, no mark', async () => {
    const kept = new Map<string, string>([[TREE_DOWN_KEY, 'genera']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    render(<Tree entries={['a1'].map(entry)} sci />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    const heads = [...tips.querySelectorAll('.eb-tree-heading')]
    // Where the order changes with the family the heading names both, order first; the cranes' other families, the
    // order unchanged, by their family alone.
    expect(heads.map((h) => h.textContent)).toEqual(['Anseriformes · Anatidae', 'Piciformes · Picidae', 'Cuculiformes · Cuculidae', 'Columbiformes · Columbidae', 'Gruiformes · Rallidae', 'Gruidae', 'Aramidae', 'Psophiidae'])
    // Plain: no mark or highlight element inside, the Latin parts marked as Latin.
    for (const h of heads) {
      expect(h.querySelector('mark')).toBeNull()
      expect(h.className).toBe('eb-mono eb-tree-heading')
    }
    expect([...heads[0].querySelectorAll('[lang="la"]')].map((x) => x.textContent)).toEqual(['Anseriformes', 'Anatidae'])
    vi.unstubAllGlobals()
  })

  it('the Layout choice (in the Display panel\'s slot): Fan, Radial and Rectangular, the choice kept on the device under its first names', async () => {
    const kept = new Map<string, string>([[TREE_LAYOUT_KEY, 'rows']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    render(<Tree entries={['a1'].map(entry)} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    // An old stored "rows" reads as Rectangular. No width in jsdom: rows, whatever is picked.
    const group = within(slot).getByRole('group', { name: 'Layout' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fan', 'Radial', 'Rectangular'])
    expect(layoutBtn('Rectangular')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(layoutBtn('Radial'))
    expect(localStorage.getItem(TREE_LAYOUT_KEY)).toBe('circle')
    expect(layoutBtn('Rectangular')).toHaveAttribute('aria-pressed', 'true') // still no width: rows
    vi.unstubAllGlobals()
  })

  it("Down to, under Layout: the ranks under the open branch, the one drawn pressed, the choice kept on the device and across branches", async () => {
    const kept = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    const { unmount } = render(<Tree entries={['a1', 'pa1'].map(entry)} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    const groups = within(slot).getAllByRole('group')
    expect(groups.map((g) => g.getAttribute('data-testid'))).toEqual(['tree-layout', 'tree-down'])
    const down = () => within(within(slot).getByRole('group', { name: 'Level' }))
    expect(down().getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed'), b.getAttribute('aria-disabled')])).toEqual([['Orders', 'true', null], ['Families', 'false', null], ['Genera', 'false', null], ['Species', 'false', null]])
    fireEvent.click(down().getByRole('button', { name: 'Families' }))
    expect(kept.get(TREE_DOWN_KEY)).toBe('families')
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByRole('button', { name: /^Rails, / })).toBeInTheDocument()
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/^8 families$/)
    expect(down().getByRole('button', { name: 'Families' })).toHaveAttribute('aria-pressed', 'true')
    // Opening a family shows its genera (its own step); the row offers what is under it.
    fireEvent.click(within(tips).getByRole('button', { name: /^Rails, / }))
    expect(screen.getByTestId('tree-rank')).toHaveTextContent(/genera$/)
    expect(down().getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Genera', 'true'], ['Species', 'false']])
    // In a genus, always its species: no row.
    fireEvent.click(within(screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })).getByRole('button', { name: /^Ra, / }))
    expect(within(slot).queryByRole('group', { name: 'Level' })).toBeNull()
    unmount()
    // Back at All birds (a new page), families again.
    render(<Tree entries={['a1', 'pa1'].map(entry)} />)
    expect(await screen.findByRole('button', { name: /^Rails, / })).toBeInTheDocument()
    act(() => setTreeDown(null))
    expect(kept.has(TREE_DOWN_KEY)).toBe(false)
    vi.unstubAllGlobals()
  })
  it('without a slot (the Display panel closed) no Layout choice is drawn', async () => {
    render(<TreeView entries={['a1'].map(entry)} sci={false} onPick={() => {}} branch={{}} onOpen={() => {}} />)
    await screen.findByRole('button', { name: /^Waterfowl/ })
    expect(screen.queryByRole('group', { name: 'Layout' })).toBeNull()
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
    expect(layoutBtn('Fan')).toHaveAttribute('aria-pressed', 'true')
    expect(onLevel).toHaveBeenLastCalledWith(expect.objectContaining({ tree: {}, mine: false, layout: 'fan', time: true }))
    // Every tip named, each label reading: the sticker's box, the name, the count.
    const labels = [...container.querySelectorAll('.eb-tree-fan-label')]
    expect(labels.map((l) => l.querySelector('.eb-tree-fan-text')!.textContent)).toEqual(['Waterfowl', 'Woodpeckers', 'Cuckoos', 'Pigeons and doves', 'Cranes and rails'])
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
    expect(container.querySelector('.eb-tree-fan-label .eb-tree-fan-text')).toHaveTextContent('Alpha One') // one family: its species
    undo()
  })
  it('a marked tip names the groups inside right after its mark; a press on "with 3 other genera" opens their list', async () => {
    const undo = widthOf(1100)
    const { container } = render(<Tree entries={['qc1'].map(entry)} />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    fireEvent.click(within(tips).getByRole('button', { name: /^Cranes and rails/ }))
    // The chart is keyed by the branch (AN11): the rows list is a new one.
    fireEvent.click(within(screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })).getByRole('button', { name: /^Rails, / }))
    const label = (name: string) => [...container.querySelectorAll('.eb-tree-fan-label')].find((l) => l.querySelector('.eb-tree-fan-text')!.textContent === name)!
    expect([...label('Pa').children].map((c) => c.className)).toEqual(['eb-tree-fan-st', 'eb-tree-fan-text', 'eb-tree-mark', 'eb-tree-other', 'eb-mono eb-tree-fan-count'])
    expect(label('Pa').querySelector('.eb-tree-other')).toHaveTextContent(/^with Pb$/)
    const many = label('Qa').querySelector('.eb-tree-other')!
    expect(many.previousElementSibling).toHaveClass('eb-tree-mark')
    expect(many).toHaveTextContent(/^with 3 other genera$/)
    fireEvent.click(many)
    expect(screen.getByRole('dialog', { name: 'Inside the Qa branch' })).toBeInTheDocument()
    undo()
  })
  it('Rectangular: "with 3 other genera" follows the name and its mark, the count still ending the row', async () => {
    render(<Tree entries={['qc1'].map(entry)} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Cranes and rails/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Rails, / }))
    const qa = screen.getByRole('button', { name: /^Qa, not one branch/ })
    expect(qa).toHaveAttribute('data-many')
    expect([...qa.closest('li')!.children].map((c) => c.className)).toEqual(['eb-tree-btn', 'eb-tree-with', 'eb-mono eb-tree-count'])
    expect(screen.getByRole('button', { name: /^Pa with Pb/ })).not.toHaveAttribute('data-many')
  })
  it('too narrow for full-size names: the Fan picked is still drawn, its names under the floor, a note offering Rectangular (round 6, item 12)', async () => {
    const kept = new Map<string, string>([[TREE_LAYOUT_KEY, 'fan']])
    const undo = widthOf(300)
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    const { container } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    // Every layout offered, none dimmed; the one picked drawn.
    for (const name of ['Fan', 'Radial', 'Rectangular']) expect(layoutBtn(name)).not.toHaveAttribute('aria-disabled')
    expect(layoutBtn('Fan')).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.eb-tree')).toHaveAttribute('data-round')
    const px = parseFloat((container.querySelector('.eb-tree-fan') as HTMLElement).style.getPropertyValue('--tree-px'))
    expect(px).toBeLessThan(11)
    // The dots and branches shrink with the names.
    expect(Number((container.querySelector('.eb-tree-fan') as HTMLElement).style.getPropertyValue('--tree-k'))).toBeCloseTo(px / 11)
    // The note, its layout word a button switching to Rectangular.
    const note = screen.getByTestId('tree-small')
    expect(note).toHaveTextContent('Names are small in this layout. Rectangular names every bird at full size.')
    fireEvent.click(within(note).getByRole('button', { name: 'Rectangular' }))
    expect(kept.get(TREE_LAYOUT_KEY)).toBe('rows')
    expect(layoutBtn('Rectangular')).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('.eb-tree')).not.toHaveAttribute('data-round')
    expect(screen.queryByTestId('tree-small')).toBeNull()
    undo()
  })
  it('unpicked, a column too narrow for full-size names draws Rectangular, the Fan still offered; at full size no note', async () => {
    const undo = widthOf(300)
    const { container, unmount } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(container.querySelector('.eb-tree')).not.toHaveAttribute('data-round')
    expect(layoutBtn('Fan')).not.toHaveAttribute('aria-disabled')
    unmount()
    undo()
    const wide = widthOf(1100)
    render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(layoutBtn('Fan')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('tree-small')).toBeNull()
    wide()
  })
  it('at full size a tip shows no tooltip (its name is whole on the drawing)', async () => {
    const undo = widthOf(1100)
    const { container } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    fireEvent.mouseOver(container.querySelectorAll('.eb-tree-fan-label')[2])
    expect(container.querySelector('.eb-tree-fan-label[data-i="2"]')).toHaveAttribute('data-hot')
    expect(screen.queryByTestId('tree-tip')).toBeNull()
    undo()
  })
  it('under the floor a tip under the pointer, tapped or focused shows its whole name and count in a tooltip, placed past its name', async () => {
    const kept = new Map<string, string>([[TREE_LAYOUT_KEY, 'fan']])
    const undo = widthOf(300)
    vi.stubGlobal('localStorage', { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => kept.set(k, v), removeItem: (k: string) => kept.delete(k) })
    vi.stubGlobal('sessionStorage', globalThis.localStorage)
    const { container } = render(<Tree entries={['a1', 'b2'].map(entry)} />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(screen.getByTestId('tree-small')).toBeInTheDocument()
    const labels = [...container.querySelectorAll('.eb-tree-fan-label')]
    fireEvent.mouseOver(labels[2])
    expect(screen.getByTestId('tree-tip').style.left).toMatch(/px$/)
    expect(screen.getByTestId('tree-tip')).toHaveTextContent(/^Cuckoos0 of 4$/)
    expect(screen.getByTestId('tree-tip')).toHaveAttribute('aria-hidden', 'true')
    fireEvent.mouseLeave(container.querySelector('.eb-tree-fan')!)
    expect(screen.queryByTestId('tree-tip')).toBeNull()
    viaKeyboard()
    act(() => within(tips).getByRole('button', { name: /^Woodpeckers/ }).focus())
    expect(screen.getByTestId('tree-tip')).toHaveTextContent(/^Woodpeckers1 of 2$/)
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
