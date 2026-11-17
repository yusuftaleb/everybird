// @vitest-environment jsdom
// Item 9, part D: the dock search's "Understood as" chips, Enter and "Show these birds", the seen-dates note, and
// the picks that worked before (a bird name, an order). The groups file is mocked; the list is a synthetic one.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DockSearchField } from '@/components/app/DockSearch'
import type { Filter } from '@/lib/list/filters'
import type { BirdGroup } from '@/lib/search/groups'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { withI18n } from './i18n-render'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number, g: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom, to, g, gSrc: 'avonet', st: true, ar: 1, q: true })
const group = (id: string, en: string, lo: number, hi: number): BirdGroup => ({ id, name: { en, es: en, pt: en, nl: en, pl: en }, lo, hi })
const groupMap = new Map([group('waterfowl', 'Waterfowl', 1, 20), group('owls', 'Owls', 50, 60)].map((g) => [g.id, g]))
const rows = [
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 1, 2700),
  sp('cangoo', 'Canada Goose', 'Branta canadensis', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 2, 4000),
  sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 'Turdidae', 'Thrushes', 80, 77),
  sp('tenwar', 'Tennessee Warbler', 'Leiothlypis peregrina', 'Passeriformes', 'Parulidae', 'Wood-Warblers', 81, 10),
  sp('virrai', 'Virginia Rail', 'Rallus limicola', 'Gruiformes', 'Rallidae', 'Rails', 40, 90),
  sp('barowl', 'Barn Owl', 'Tyto alba', 'Strigiformes', 'Tytonidae', 'Barn-Owls', 55, 500),
]
const species = { ...buildSpeciesIndex(rows), groups: groupMap }
const regions: Regions = { v: 1, countries: { CA: 'Canada', US: 'United States' }, sub1: { 'CA-BC': 'British Columbia', 'US-TN': 'Tennessee', 'US-VA': 'Virginia' } }
const entries = rows.map((r) => ({ code: r.code }))

type Props = Partial<Parameters<typeof DockSearchField>[0]>
function renderSearch(over: Props = {}) {
  const onApply = vi.fn<(f: Filter) => void>()
  const onPick = vi.fn()
  const onClose = vi.fn()
  const props = {
    entries,
    species,
    onPick,
    open: true,
    onClose,
    within: createRef<HTMLElement>(),
    filter: {} as Filter,
    onApply,
    regions,
    listPlaces: ['c:CA', 's:CA-BC', 'c:US', 's:US-TN', 's:US-VA'],
    hasMonths: true,
    whose: 'your' as const,
    ...over,
  }
  const view = render(<DockSearchField {...props} />, { wrapper: withI18n('en') })
  return { ...view, onApply, onPick, onClose }
}

const box = () => screen.getByRole('combobox')
const type = async (text: string) => {
  await act(async () => { fireEvent.change(box(), { target: { value: text } }) })
}
const understood = () => screen.queryByRole('group', { name: 'Understood as' })

afterEach(() => {
  cleanup()
})

describe('the understood chips', () => {
  it('appear under the field for a group, a place and a period, and a plain name shows none', async () => {
    renderSearch()
    await type('waterfowl canada 2026')
    const row = understood()!
    expect(row).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Remove Waterfowl filter' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Remove Canada filter' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Remove Seen: 2026 filter' })).toBeInTheDocument()
    await type('robin')
    expect(understood()).toBeNull()
  })

  it('a × removes that chip\'s words from the query, and the others stay', async () => {
    renderSearch()
    await type('waterfowl canada 2026')
    fireEvent.click(within(understood()!).getByRole('button', { name: 'Remove Canada filter' }))
    expect(box()).toHaveValue('waterfowl 2026')
    expect(within(understood()!).queryByRole('button', { name: 'Remove Canada filter' })).toBeNull()
    expect(within(understood()!).getByRole('button', { name: 'Remove Seen: 2026 filter' })).toBeInTheDocument()
  })

  it('Enter applies the chips in one filter, and closes the search with focus back on the magnifier', async () => {
    const { onApply, onClose } = renderSearch()
    await type('waterfowl canada 2026')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toEqual({ group: 'waterfowl', countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
    expect(onClose).toHaveBeenCalledWith(true)
  })

  it('"Show these birds" applies the same filter', async () => {
    const { onApply } = renderSearch()
    await type('canada 2026')
    fireEvent.click(screen.getByRole('button', { name: 'Show these birds' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply.mock.calls[0][0]).toEqual({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
  })

  it('typing applies nothing', async () => {
    const { onApply } = renderSearch()
    await type('waterfowl canada 2026')
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('the seen-dates note', () => {
  it('shows for a dates query on your own list without per-place months, and not with them or on a shared view', async () => {
    const { unmount } = renderSearch({ hasMonths: false })
    await type('canada 2026')
    expect(screen.getByText('Your list only has first-seen dates; import MyEBirdData.csv for every sighting')).toBeInTheDocument()
    unmount()
    const withMonths = renderSearch({ hasMonths: true })
    await type('canada 2026')
    expect(screen.queryByText(/first-seen dates/)).toBeNull()
    withMonths.unmount()
    renderSearch({ hasMonths: false, whose: 'this' })
    await type('canada 2026')
    expect(screen.queryByText(/first-seen dates/)).toBeNull()
  })
})

describe('the picks that worked before', () => {
  it('a bird name still lists and Enter picks the first bird', async () => {
    const { onPick, onApply } = renderSearch()
    await type('robin')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'species', value: 'amerob' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('a bird name with a place still lists the name, and Enter applies the place', async () => {
    const { onPick, onApply } = renderSearch()
    await type('robin canada')
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1)
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onApply).toHaveBeenCalledWith({ countries: ['CA'] })
    expect(onPick).not.toHaveBeenCalled()
  })

  it('an order still lists and a click on it picks the order', async () => {
    const { onPick } = renderSearch()
    await type('anseriformes')
    const option = within(screen.getByRole('listbox')).getAllByRole('option').find((o) => o.textContent?.includes('Anseriformes') || o.textContent?.includes('Waterfowl') || o.textContent?.includes('Ducks'))
    expect(option).toBeDefined()
    fireEvent.click(option!)
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'order' }))
  })

  it('a query with no bird and no chip still says so', async () => {
    renderSearch()
    await type('zzzz')
    expect(screen.getByRole('listbox')).toHaveTextContent('No bird on your list matches “zzzz”.')
  })
})

describe('Enter picks an exact bird name before it applies chips', () => {
  it.each(['canada goose', 'tennessee warbler', 'virginia rail', 'Canada Goose', 'Branta canadensis'])('"%s" picks the bird and shows no chips', async (q) => {
    const { onPick, onApply } = renderSearch()
    await type(q)
    expect(understood()).toBeNull()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'species' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it('"owls" picks the order hit, as before', async () => {
    const { onPick, onApply } = renderSearch()
    await type('owls')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ kind: 'order' }))
    expect(onApply).not.toHaveBeenCalled()
  })

  it.each(['canada', 'owls canada', 'waterfowl canada 2026', 'ducks 2026', 'june'])('"%s" shows chips and Enter applies them', async (q) => {
    const { onPick, onApply } = renderSearch()
    await type(q)
    expect(understood()).toBeInTheDocument()
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('an arrowed-to hit is still picked, chips or not', async () => {
    const { onPick, onApply } = renderSearch()
    await type('canada')
    fireEvent.keyDown(box(), { key: 'ArrowDown' })
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })
})

describe('groups come from the species index', () => {
  it('offer a group chip with them, and none without', async () => {
    const { unmount } = renderSearch()
    await type('owls canada')
    expect(within(understood()!).getByRole('button', { name: 'Remove Owls filter' })).toBeInTheDocument()
    unmount()
    renderSearch({ species: { ...species, groups: undefined } })
    await type('waterfowl canada')
    expect(within(understood()!).queryByRole('button', { name: /Waterfowl/ })).toBeNull()
    expect(within(understood()!).getByRole('button', { name: 'Remove Canada filter' })).toBeInTheDocument()
  })
})

describe('applying without month sets', () => {
  it('leaves the "seen any time" basis out, and keeps it with them', async () => {
    const without = renderSearch({ hasMonths: false })
    await type('canada 2026')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(without.onApply.mock.calls[0][0]).toEqual({ countries: ['CA'], from: '2026-01', to: '2026-12' })
    without.unmount()
    const withMonths = renderSearch({ hasMonths: true })
    await type('canada 2026')
    fireEvent.keyDown(box(), { key: 'Enter' })
    expect(withMonths.onApply.mock.calls[0][0]).toEqual({ countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
  })
})
