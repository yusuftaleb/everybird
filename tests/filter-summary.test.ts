import { describe, expect, it } from 'vitest'
import { countriesLabel, placesNoteFor, placesSpoken, placesSummary, timeSpoken, timeSummary } from '@/lib/list/filter-summary'

const name = (c: string) => ({ CA: 'Canada', EG: 'Egypt', US: 'United States', ZA: 'South Africa' })[c] ?? c

describe('countriesLabel (share image)', () => {
  it('one, two joined by +, three or more as "and N more"', () => {
    expect(countriesLabel(undefined, name)).toBeUndefined()
    expect(countriesLabel([], name)).toBeUndefined()
    expect(countriesLabel(['CA'], name)).toBe('Canada')
    expect(countriesLabel(['CA', 'EG'], name)).toBe('Canada + Egypt')
    expect(countriesLabel(['CA', 'EG', 'US'], name)).toBe('Canada and 2 more')
    expect(countriesLabel(['CA', 'EG', 'US', 'ZA'], name)).toBe('Canada and 3 more')
  })
})

describe('the bar buttons', () => {
  it('Places: the number checked; spoken as the names', () => {
    expect(placesSummary({})).toBeUndefined()
    expect(placesSummary({ countries: ['CA', 'EG'] })).toBe('2')
    expect(placesSpoken({ countries: ['CA', 'EG'] }, name)).toBe('Canada, Egypt')
    expect(placesSpoken({}, name)).toBeUndefined()
  })
  it('Time: years for a range, a month for one month; spoken in full', () => {
    expect(timeSummary({})).toBeUndefined()
    expect(timeSummary({ from: '2022-04', to: '2024-09' })).toBe('2022–2024')
    expect(timeSummary({ from: '2022-01', to: '2022-12' })).toBe('2022')
    expect(timeSummary({ from: '2021-09', to: '2021-09' })).toBe('Sep 2021')
    expect(timeSummary({ from: '2022-04' })).toBe('from 2022')
    expect(timeSummary({ to: '2024-09' })).toBe('to 2024')
    expect(timeSpoken({ from: '2022-04', to: '2024-09' })).toBe('April 2022 to September 2024')
    expect(timeSpoken({ from: '2021-09', to: '2021-09' })).toBe('September 2021')
    expect(timeSpoken({ to: '2024-09' })).toBe('up to September 2024')
    expect(timeSpoken({})).toBeUndefined()
  })
})

describe('placesNoteFor (the lifer-only notice)', () => {
  const rec = (seen?: string[]) => ({ code: 'a', source: 'ebird' as const, seen })
  const saved = (ebird: ReturnType<typeof rec>[], list: ReturnType<typeof rec>[] = []) => ({ records: { ebird, 'ebird-list': list, inat: [], manual: [] } })
  it('hidden on an empty list and when seen-here is known', () => {
    expect(placesNoteFor(saved([]), 0, false)).toBeUndefined()
    expect(placesNoteFor(saved([rec(['|CA'])]), 3, true)).toBeUndefined()
  })
  it('a MyEBirdData import saved before seen-here: import it again', () => {
    expect(placesNoteFor(saved([rec(), rec()]), 2, false)).toBe('reimport')
  })
  it('only the life list download or ticks by hand: add MyEBirdData or iNaturalist', () => {
    expect(placesNoteFor(saved([], [rec()]), 1, false)).toBe('add')
  })
})
