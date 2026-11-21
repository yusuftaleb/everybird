// @vitest-environment jsdom
// The Filters button: its label is always "Filters" and it shows no count; with a filter on it is Accent (data-active)
// and its accessible name says how many filter groups are in use (filtersCount) and what they are.
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { FiltersButton } from '@/components/filters/Filters'
import { initialState } from '@/lib/list/store'
import type { Filter } from '@/lib/list/filters'
import type { Regions } from '@/lib/species/types'

const regions: Regions = { v: 1, countries: { KE: 'Kenya' }, sub1: {} }
const button = (filter: Filter) => {
  render(<FiltersButton state={{ ...initialState(), filter }} regions={regions} sections={['places', 'time', 'status']} open={null} onOpen={() => {}} buttonRef={createRef()} panelId="p" />)
  return screen.getByTestId('filters-button')
}
afterEach(cleanup)

describe('the Filters button', () => {
  it('with no filter: "Filters", not active', () => {
    const b = button({})
    expect(b).not.toHaveAttribute('data-active')
    expect(b).toHaveTextContent(/^Filters$/)
    expect(screen.queryByTestId('filters-count')).toBeNull()
    expect(b).toHaveAccessibleName('Filters')
  })

  it('no badge: Accent only; the name counts the groups in use and says them', () => {
    const b = button({ countries: ['KE'], from: '2020-01', statuses: ['VU', 'EN'] })
    expect(screen.queryByTestId('filters-count')).toBeNull()
    expect(b).toHaveTextContent(/^Filters$/)
    expect(b).toHaveAttribute('data-active')
    expect(b).toHaveAccessibleName('Filters, 3 in use: Places: Kenya. Time: from January 2020. Conservation status: Vulnerable, Endangered')
  })
})
