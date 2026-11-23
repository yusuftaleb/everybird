// @vitest-environment jsdom
// Add by hand (TickList) on phones (2026-11-22): "When and where" comes before the list, the state or province select
// is always there (off until a country is picked), and each group's count says how many of it are on the list.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TickList } from '@/components/import/TickList'
import { EMPTY_EDITS } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { withI18n } from './i18n-render'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom: fam, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 1),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 2),
  sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 'Picidae', 3),
])
const regions: Regions = { v: 1, countries: { US: 'United States', FR: 'France' }, sub1: { 'US-UT': 'Utah', 'US-CA': 'California' } }
const mount = (onList: string[] = []) =>
  render(<TickList species={species} regions={regions} edits={EMPTY_EDITS} dispatch={() => {}} onList={new Set(onList)} />, { wrapper: withI18n('en') })

afterEach(cleanup)

describe('Add by hand (TickList)', () => {
  it('"When and where" comes before the search and the list', () => {
    mount()
    const bar = screen.getByRole('group', { name: 'When and where' })
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(bar, screen.getByLabelText('Search birds'))).toBe(true)
    expect(follows(bar, screen.getByTestId('tick-tree'))).toBe(true)
    // The search is the site's search field: the lens before it.
    expect(screen.getByLabelText('Search birds')).toHaveClass('eb-input-search')
    expect(screen.getByLabelText('Search birds').parentElement!.querySelector('.eb-input-icon')).not.toBeNull()
  })

  it('the empty date field carries a hint, gone once a date is picked', () => {
    mount()
    const date = screen.getByLabelText('Date (optional)')
    expect(date).toHaveAttribute('data-empty')
    expect(date.parentElement).toHaveTextContent('Pick a date')
    fireEvent.change(date, { target: { value: '2024-05-12' } })
    expect(date).not.toHaveAttribute('data-empty')
    expect(date.parentElement).not.toHaveTextContent('Pick a date')
  })

  it('the state or province select is there and off with no country, on with the country\'s subdivisions after', () => {
    mount()
    const region = screen.getByLabelText('State or province (optional)') as HTMLSelectElement
    expect(region).toBeDisabled()
    expect([...region.options].map((o) => o.textContent)).toEqual(['Pick a country first'])
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'US' } })
    expect(region).toBeEnabled()
    expect([...region.options].map((o) => o.textContent)).toEqual(['Whole country', 'California', 'Utah'])
    // A country with no subdivisions in the data: Whole country, nothing to pick.
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'FR' } })
    expect(region).toBeDisabled()
    expect([...region.options].map((o) => o.textContent)).toEqual(['Whole country'])
  })

  it('a group\'s count is the total alone with none on the list, "1 / 2" with some, named for screen readers', () => {
    mount(['norfli'])
    const tree = screen.getByRole('list', { name: 'Species to tick' })
    expect(within(tree).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Waterfowl, 1 species', 'Woodpeckers, 1 of 2 on your list'])
    const geese = screen.getByTestId('tick-group-Anseriformes').querySelector('.eb-tickgroup-n')!
    expect(geese).toHaveTextContent(/^1$/)
    expect(geese.querySelector('.eb-tickgroup-on')).toBeNull()
    const picids = screen.getByTestId('tick-group-Piciformes').querySelector('.eb-tickgroup-n')!
    expect(picids).toHaveTextContent(/^1 \/ 2$/)
    expect(picids.querySelector('.eb-tickgroup-on')).toHaveTextContent('1')
  })
})
