// @vitest-environment jsdom
// The Filters button: its label is always "Filters"; how many filter groups are in use (filtersCount) shows as a small
// badge on its glyph, hidden from screen readers since the button's name says it in full; with none, no badge.
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
  it('with no filter: "Filters" and no badge', () => {
    const b = button({})
    expect(b).toHaveTextContent(/^Filters$/)
    expect(screen.queryByTestId('filters-count')).toBeNull()
    expect(b).toHaveAccessibleName('Filters')
  })

  it('the badge counts the groups in use, on the glyph, out of the label; the name says them', () => {
    const b = button({ countries: ['KE'], from: '2020-01', statuses: ['VU', 'EN'] })
    const badge = screen.getByTestId('filters-count')
    expect(badge).toHaveTextContent(/^3$/)
    expect(badge).toHaveAttribute('aria-hidden', 'true')
    expect(badge.parentElement).toHaveClass('eb-drop-icon')
    expect(b.querySelector('.eb-drop-label')).toHaveTextContent(/^Filters$/)
    expect(b).toHaveAccessibleName('Filters: Places: Kenya. Time: from January 2020. Conservation status: Vulnerable, Endangered')
  })
})
