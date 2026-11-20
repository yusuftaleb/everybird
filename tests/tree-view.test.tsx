// @vitest-environment jsdom
// The Tree tab (TreeView.tsx) on a synthetic tree: families with counts, drilling to genera and species with the
// focus following, the bird card from a tip, the birds the tree lacks, the source line, and the tab in CollageView.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListEntry, SourceRecord } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { initialState, makeReducer, type AppState } from '@/lib/list/store'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import type { TreeFile } from '@/lib/tree/tree'

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

beforeEach(() => { fetchData.mockClear() }) // braces: a returned function would run as a teardown
afterEach(cleanup)

// First: TreeView keeps the parsed tree for the page, so only the first test in this file sees the fetch.
describe('the Tree tab in CollageView', () => {
  const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }
  // The shown index holds only the list's birds, as the landing sample's does: the tree still has every family and total.
  const partial = buildSpeciesIndex(rows.filter((r) => r.code === 'a1' || r.code === 'b2'))
  const reduce = makeReducer({ species: partial })
  const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2024-01-02', place: { country: 'CA' } })
  function seeded(): AppState {
    const saved = emptySaved()
    saved.records.ebird = [rec('a1'), rec('b2')]
    return reduce(initialState(), { type: 'restore', saved })
  }
  function Harness() {
    const [state, dispatch] = useReducer(reduce, undefined, seeded)
    return <CollageView state={state} dispatch={dispatch} species={partial} regions={regions} label="Test collage" />
  }
  it('a third view tab; the tree loads only when it opens, without the size switch or the legend', async () => {
    const { container } = render(<Harness />)
    expect(fetchData).not.toHaveBeenCalledWith('tree.v1.json')
    const view = screen.getByRole('group', { name: 'View' })
    fireEvent.click(within(view).getByRole('button', { name: 'Tree' }))
    expect(within(view).getByRole('button', { name: 'Tree' })).toHaveAttribute('aria-pressed', 'true')
    await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(fetchData).toHaveBeenCalledWith('tree.v1.json')
    expect(screen.queryByRole('switch', { name: /True size/ })).toBeNull()
    expect(container.querySelector('.eb-legend')).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: /^Woodpeckers Picidae, 1 of 2 on the list$/ })).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /^Ducks Anatidae, 1 of 4 on the list$/ })).toBeInTheDocument()
  })
})

describe('TreeView', () => {
  it('shows every family with its count, the fact line, the birds without a tip and the source', async () => {
    render(<TreeView entries={['a1', 'b2', 'x1'].map(entry)} sci={false} onPick={() => {}} />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByText('Waterfowl')).toBeInTheDocument() // the order heading
    expect(within(tips).getByRole('button', { name: /^Ducks Anatidae, 2 of 4 on the list$/ })).toBeInTheDocument()
    expect(within(tips).getByRole('button', { name: /^Woodpeckers Picidae, 1 of 2 on the list$/ })).toBeInTheDocument()
    expect(screen.getByText('Oldest lineage on this list: Beta Two, which split from its closest relatives about 4 million years ago (an estimate).')).toBeInTheDocument()
    expect(screen.getByText('1 bird on this list has no place in this tree:')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lost Duck' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'AvesData v1.7' })).toHaveAttribute('href', 'https://github.com/McTavishLab/AvesData')
    expect(screen.getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    expect(screen.getByText(/matched to the eBird 2026 taxonomy/)).toBeInTheDocument()
    expect(screen.getByText('Million years ago (estimates)')).toBeInTheDocument()
  })

  it('a family opens to its genera, a genus to its species; a tip on the list opens the card; the breadcrumb goes back', async () => {
    const onPick = vi.fn()
    render(<TreeView entries={['a1', 'b2'].map(entry)} sci={false} onPick={onPick} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ducks/ }))
    expect(screen.getByText('Ducks', { selector: '[aria-current]' })).toHaveFocus()
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
    // Every species of the branch where the tree puts it; Ab's names its genus.
    expect([...tips.querySelectorAll('.eb-tree-row')].map((li) => li.querySelector('.eb-tree-name')!.textContent)).toEqual(['Alpha One', 'Alpha Three Ab', 'Alpha Two'])
    expect(within(tips).queryByRole('button', { name: /Alpha Two/ })).toBeNull() // not on the list: grey, no card
    fireEvent.click(within(tips).getByRole('button', { name: 'Alpha One, on the list' }))
    expect(onPick).toHaveBeenCalledWith('a1', expect.any(HTMLElement))
    fireEvent.click(screen.getByRole('button', { name: 'All families' }))
    expect(screen.getByRole('button', { name: /^Ducks/ })).toHaveFocus()
  })

  it('a tip placed without genetic data says so, and the key under the tree explains the dotted line', async () => {
    render(<TreeView entries={['a1', 'b2'].map(entry)} sci={false} onPick={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Woodpeckers/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Bb,/ }))
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByRole('button', { name: 'Beta Two, on the list, placed without genetic data' })).toBeInTheDocument()
    expect(within(tips).getByText('Beta One').closest('.eb-tree-btn')).not.toHaveTextContent(/genetic/)
    expect(screen.getByText('Placed without genetic data')).toBeInTheDocument()
  })

  it('a genus split across its family is one marked row, with the genus inside named; the key says what the mark means', async () => {
    render(<TreeView entries={['c3'].map(entry)} sci={false} onPick={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Cuckoos/ }))
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(genera).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(genera).getByRole('button', { name: 'Ca with Cb, not one branch of its own in this tree, 1 of 4 on the list' }))
    expect(screen.getByText('Not one branch of its own in this tree')).toBeInTheDocument()
    expect(screen.getByText('In this tree, Cb sits inside Ca.')).toBeInTheDocument()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Gamma One', 'Gamma Two Cb', 'Gamma Three', 'Gamma Four Cb'])
  })

  it('more than two genera inside: a count opening their list, each genus opening its own species, and back to the count', async () => {
    render(<TreeView entries={['d3'].map(entry)} sci={false} onPick={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Pigeons/ }))
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
    expect(screen.getByText('Dc', { selector: '[aria-current]' })).toHaveFocus()
    expect([...screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-name')].map((n) => n.textContent)).toEqual(['Delta Three'])
    fireEvent.click(screen.getByRole('button', { name: 'Pigeons' }))
    expect(screen.getByRole('button', { name: 'Da with 3 other genera' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: /^Da, / }))
    expect(screen.getByText('In this tree, 3 other genera sit inside Da.')).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Tips of the tree, top to bottom' }).querySelectorAll('.eb-tree-row')).toHaveLength(5)
  })

  it('a smaller list changes the counts and the marked tips', async () => {
    const { rerender } = render(<TreeView entries={['a1', 'b2'].map(entry)} sci={false} onPick={() => {}} />)
    const duck = await screen.findByRole('button', { name: /^Ducks/ })
    expect(duck).toHaveAttribute('data-on')
    rerender(<TreeView entries={['b2'].map(entry)} sci={false} onPick={() => {}} />)
    expect(screen.getByRole('button', { name: /^Ducks Anatidae, 0 of 4 on the list$/ })).not.toHaveAttribute('data-on')
    expect(screen.getByText('Every bird on this list has a place in the tree.')).toBeInTheDocument()
  })
})
