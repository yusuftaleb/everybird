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

const FILE: TreeFile = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: '2026', newick: '(((a1:1,a3:1):2,a2:3):7,(b1:4,b2:4):6);' }
const fetchData = vi.fn(async () => FILE)
vi.mock('@/lib/data-url', () => ({ fetchData, fetchAllMasks: vi.fn(() => new Promise(() => {})) }))

const { default: TreeView } = await import('@/components/tree/TreeView')
const { CollageView } = await import('@/components/app/CollageView')

const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true })
const species = buildSpeciesIndex([
  sp('a1', 'Alpha One', 'Aa one', 'Anseriformes', 'Anatidae', 'Ducks', 1), sp('a2', 'Alpha Two', 'Aa two', 'Anseriformes', 'Anatidae', 'Ducks', 2),
  sp('a3', 'Alpha Three', 'Ab three', 'Anseriformes', 'Anatidae', 'Ducks', 3), sp('x1', 'Lost Duck', 'Aa four', 'Anseriformes', 'Anatidae', 'Ducks', 4),
  sp('b1', 'Beta One', 'Bb one', 'Piciformes', 'Picidae', 'Woodpeckers', 5), sp('b2', 'Beta Two', 'Bb two', 'Piciformes', 'Picidae', 'Woodpeckers', 6),
])
const entry = (code: string): ListEntry => ({ code, date: '2024-01-01', place: { country: 'CA' } } as ListEntry)

beforeEach(() => fetchData.mockClear())
afterEach(cleanup)

describe('TreeView', () => {
  it('shows every family with its count, the fact line, the birds without a tip and the source', async () => {
    render(<TreeView entries={['a1', 'b2', 'x1'].map(entry)} species={species} sci={false} onPick={() => {}} />)
    const tips = await screen.findByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(fetchData).toHaveBeenCalledWith('tree.v1.json')
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
    render(<TreeView entries={['a1', 'b2'].map(entry)} species={species} sci={false} onPick={onPick} />)
    fireEvent.click(await screen.findByRole('button', { name: /^Ducks/ }))
    expect(screen.getByText('Ducks', { selector: '[aria-current]' })).toHaveFocus()
    const genera = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(genera).getAllByRole('button')).toHaveLength(3)
    expect(within(genera).getByRole('button', { name: 'Aa part 1 of 2, 1 of 1 on the list' })).toHaveAttribute('data-on')
    expect(within(genera).getByRole('button', { name: 'Ab, 0 of 1 on the list' })).not.toHaveAttribute('data-on')
    expect(within(genera).getByRole('button', { name: 'Aa part 2 of 2, 0 of 1 on the list' })).toBeInTheDocument()
    fireEvent.click(within(genera).getAllByRole('button')[0])
    expect(screen.getByText('Aa is not one clade in this tree, so this drawing shows its species alone.')).toBeInTheDocument()
    const tips = screen.getByRole('list', { name: 'Tips of the tree, top to bottom' })
    expect(within(tips).getByText('Alpha Two')).toBeInTheDocument()
    expect(within(tips).queryByRole('button', { name: /Alpha Two/ })).toBeNull() // not on the list: grey, no card
    fireEvent.click(within(tips).getByRole('button', { name: 'Alpha One, on the list' }))
    expect(onPick).toHaveBeenCalledWith('a1', expect.any(HTMLElement))
    fireEvent.click(screen.getByRole('button', { name: 'All families' }))
    expect(screen.getByRole('button', { name: /^Ducks/ })).toHaveFocus()
  })

  it('a smaller list changes the counts and the marked tips', async () => {
    const { rerender } = render(<TreeView entries={['a1', 'b2'].map(entry)} species={species} sci={false} onPick={() => {}} />)
    const duck = await screen.findByRole('button', { name: /^Ducks/ })
    expect(duck).toHaveAttribute('data-on')
    rerender(<TreeView entries={['b2'].map(entry)} species={species} sci={false} onPick={() => {}} />)
    expect(screen.getByRole('button', { name: /^Ducks Anatidae, 0 of 4 on the list$/ })).not.toHaveAttribute('data-on')
    expect(screen.getByText('Every bird on this list has a place in the tree.')).toBeInTheDocument()
  })
})

describe('the Tree tab in CollageView', () => {
  const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: {} }
  const reduce = makeReducer({ species })
  const rec = (code: string): SourceRecord => ({ code, source: 'ebird', date: '2024-01-02', place: { country: 'CA' } })
  function seeded(): AppState {
    const saved = emptySaved()
    saved.records.ebird = [rec('a1'), rec('b2')]
    return reduce(initialState(), { type: 'restore', saved })
  }
  function Harness() {
    const [state, dispatch] = useReducer(reduce, undefined, seeded)
    return <CollageView state={state} dispatch={dispatch} species={species} regions={regions} label="Test collage" />
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
  })
})
