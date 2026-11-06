// What the Places and Time buttons in the controls bar say about the active filter, and the multi-country label the
// share image uses. Pure, so the bar, the share image and the tests agree.
import type { Filter } from './filters'
import type { Saved } from './storage'
import { monthName, monthShort, rangeLabel } from './timeline'
import type { Trip } from './trips'

/** "Canada", "Canada + Egypt", "Canada and 2 more" (sorted as the filter keeps them); undefined for none. */
export function countriesLabel(countries: readonly string[] | undefined, name: (iso2: string) => string): string | undefined {
  if (!countries?.length) return undefined
  const [first, second] = countries.map(name)
  if (countries.length === 1) return first
  if (countries.length === 2) return `${first} + ${second}`
  return `${first} and ${countries.length - 1} more`
}

/** The Places button's short summary: the number of checked countries ("2"), or undefined for none. */
export function placesSummary(f: Filter): string | undefined {
  return f.countries?.length ? String(f.countries.length) : undefined
}

/** The Places button's accessible description of the filter: "Canada, Egypt". */
export function placesSpoken(f: Filter, name: (iso2: string) => string): string | undefined {
  return f.countries?.length ? f.countries.map(name).join(', ') : undefined
}

const year = (m: string) => m.slice(0, 4)

/**
 * The Time button's short summary: a trip's month ("Sep 2021"); a range by years ("2022–2024", "2022" within one
 * year, "Sep 2021" for one month, "from 2022", "to 2024"); undefined with no time chosen.
 */
export function timeSummary(f: Filter, trips: readonly Trip[]): string | undefined {
  const trip = f.trip ? trips.find((t) => t.id === f.trip) : undefined
  if (trip) return monthShort(trip.start.slice(0, 7))
  const { from, to } = f
  if (from && to) {
    if (from === to) return monthShort(from)
    return year(from) === year(to) ? year(from) : `${year(from)}–${year(to)}`
  }
  if (from) return `from ${year(from)}`
  if (to) return `to ${year(to)}`
  return undefined
}

/** The Time button's accessible description: "Egypt trip, September 2021", "March 2020 to June 2021". */
export function timeSpoken(f: Filter, trips: readonly Trip[], name: (iso2: string) => string): string | undefined {
  const trip = f.trip ? trips.find((t) => t.id === f.trip) : undefined
  if (trip) return `${name(trip.country)} trip, ${monthName(trip.start.slice(0, 7))}`
  const { from, to } = f
  if (from && to) return from === to ? monthName(from) : `${monthName(from)} to ${monthName(to)}`
  if (from) return `from ${monthName(from)}`
  if (to) return `up to ${monthName(to)}`
  return rangeLabel(from, to)
}

/**
 * Whether the Places dropdown says its places are only lifer places, and what to do: undefined for an empty list or
 * one with seen-here (some record knows every place a species was seen); 'reimport' when the MyEBirdData slot holds
 * records but none carries seen-here (an import saved before seen-here existed: importing the file again fills it);
 * else 'add' (bring MyEBirdData or iNaturalist).
 */
export function placesNoteFor(saved: Pick<Saved, 'records'>, listLength: number, seenFull: boolean): 'add' | 'reimport' | undefined {
  if (!listLength || seenFull) return undefined
  const full = saved.records.ebird ?? []
  return full.length && !full.some((r) => Array.isArray(r.seen)) ? 'reimport' : 'add'
}
