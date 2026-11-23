// @vitest-environment jsdom
// Add by hand (TickList): the search, the list, then "When and where" (the layout before 2026-11-22's round 1), with
// one "Date or year" field and Country beside State or province.
import '@testing-library/jest-dom/vitest'
import { readFileSync } from 'node:fs'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TickList } from '@/components/import/TickList'
import { parseDateOrYear } from '@/components/import/manual-date'
import type { Action } from '@/lib/list/store'
import { EMPTY_EDITS } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { withI18n } from './i18n-render'

const sp = (code: string, com: string, sci: string, ord: string, fam: string, to: number): SpeciesRow =>
  ({ code, com, sci, ord, fam, famCom: fam, to, g: 10, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([
  sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 1),
  sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 2),
])
const regions: Regions = { v: 1, countries: { US: 'United States', FR: 'France' }, sub1: { 'US-UT': 'Utah', 'US-CA': 'California' } }
const mount = () => {
  const dispatch = vi.fn<(a: Action) => void>()
  render(<TickList species={species} regions={regions} edits={EMPTY_EDITS} dispatch={dispatch} onList={new Set()} />, { wrapper: withI18n('en') })
  return dispatch
}
const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
const addSnowGoose = (dispatch: ReturnType<typeof mount>) => {
  fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'snow' } })
  fireEvent.click(screen.getByRole('option', { name: /^Snow Goose/ }))
  const a = dispatch.mock.calls.at(-1)?.[0]
  return a?.type === 'edit' ? a.edits.added : undefined
}

afterEach(cleanup)

describe('parseDateOrYear', () => {
  it('takes a year alone or a full date, from 1800 to now; nothing else', () => {
    const y = new Date().getFullYear()
    expect(parseDateOrYear('')).toBe('')
    expect(parseDateOrYear(' 2018 ')).toBe('2018')
    expect(parseDateOrYear('1800')).toBe('1800')
    expect(parseDateOrYear(String(y))).toBe(String(y))
    expect(parseDateOrYear('2024-05-12')).toBe('2024-05-12')
    for (const bad of ['1799', String(y + 1), '20x9', '2024-05', '2024-02-30', '12 May 2024', `${y + 1}-01-01`]) expect(parseDateOrYear(bad), bad).toBeNull()
  })
})

describe('Add by hand (TickList)', () => {
  it('the search, then the list, then "When and where" (as before round 1), the search a plain field', () => {
    mount()
    const search = screen.getByLabelText('Search birds')
    const bar = screen.getByRole('group', { name: 'When and where' })
    expect(follows(search, screen.getByTestId('tick-tree'))).toBe(true)
    expect(follows(screen.getByTestId('tick-tree'), bar)).toBe(true)
    expect(search).toHaveClass('eb-input', 'eb-tick-q')
    expect(search).not.toHaveClass('eb-input-search')
    // The counts as they were: the total alone.
    expect(screen.getByTestId('tick-group-Piciformes')).toHaveAccessibleName('Woodpeckers, 1 species')
  })

  it('one "Date or year" field: a year as typed, a date from the calendar button in words, stored as before', () => {
    const dispatch = mount()
    const field = screen.getByLabelText('Date or year')
    expect(screen.queryByLabelText('Or a year')).toBeNull()
    expect(field.closest('.eb-tickfield')).toHaveClass('eb-tickfield-when')
    fireEvent.change(field, { target: { value: '2018' } })
    expect(addSnowGoose(dispatch)).toEqual([{ code: 'snogoo', source: 'manual', date: '2018' }])
    // The calendar button is the system date input; its date shows in words and is stored as YYYY-MM-DD.
    const pick = screen.getByLabelText('Pick a date')
    expect(pick).toHaveAttribute('type', 'date')
    fireEvent.change(pick, { target: { value: '2024-05-12' } })
    expect(field).toHaveValue('12 May 2024')
    expect(field).not.toHaveAttribute('aria-invalid')
    expect(addSnowGoose(dispatch)?.at(-1)).toEqual({ code: 'snogoo', source: 'manual', date: '2024-05-12' })
    // A full date typed reads in words once the field is left.
    fireEvent.change(field, { target: { value: '2020-01-31' } })
    fireEvent.blur(field)
    expect(field).toHaveValue('31 Jan 2020')
  })

  it('a year outside 1800 to now is refused with the old message, and nothing is added', () => {
    const dispatch = mount()
    const field = screen.getByLabelText('Date or year')
    fireEvent.change(field, { target: { value: '1799' } })
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Use a year from 1800 to this year.')).toBeInTheDocument()
    expect(addSnowGoose(dispatch)).toBeUndefined()
    expect(field).toHaveFocus()
  })

  it('Country and State or province share one row; State is off until a country with subdivisions, then Whole country first', () => {
    mount()
    const country = screen.getByLabelText('Country (optional)') as HTMLSelectElement
    const state = screen.getByLabelText('State or province') as HTMLSelectElement
    const fields = country.closest('.eb-tick-fields')!
    expect(state.closest('.eb-tick-fields')).toBe(fields)
    expect([...fields.children].map((f) => f.className)).toEqual(['eb-tickfield eb-tickfield-when', 'eb-tickfield', 'eb-tickfield'])
    expect(state).toBeDisabled()
    expect([...state.options].map((o) => o.textContent)).toEqual(['Pick a country'])
    fireEvent.change(country, { target: { value: 'US' } })
    expect(state).toBeEnabled()
    expect([...state.options].map((o) => o.textContent)).toEqual(['Whole country', 'California', 'Utah'])
    fireEvent.change(country, { target: { value: 'FR' } }) // no subdivisions in the data
    expect(state).toBeDisabled()
    expect([...state.options].map((o) => o.textContent)).toEqual(['Whole country'])
  })

  it('the CSS keeps the two columns at every width, the date across both, and every box the site\'s 44px field', () => {
    const css = readFileSync('src/components/import/import.css', 'utf8')
    const rules = css.match(/\.eb-tick-fields\s*\{[^}]*\}/g) ?? []
    expect(rules).toEqual([expect.stringContaining('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)')]) // no media query changes it
    expect(css).toMatch(/\.eb-tickfield-when \{ grid-column: 1 \/ -1; \}/)
    expect(css).toMatch(/\.eb-tickfield \{[^}]*justify-content: flex-end[^}]*min-width: 0/)
    expect(css).toMatch(/\.eb-tickpick \{[^}]*position: absolute[^}]*height: 44px[^}]*-webkit-appearance: none/)
  })
})
