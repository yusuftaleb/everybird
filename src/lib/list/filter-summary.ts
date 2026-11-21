// What the Filters button in the controls bar and its chips say about the active filter, and the places and
// status labels the share image uses. Pure, so the bar, the share image and the tests agree.
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { ContinentId } from '@/lib/places/continents'
import type { RegionPresetId } from '@/lib/places/presets'
import { THREATENED } from '@/lib/species/iucn'
import type { StatusFilterCat } from '@/lib/species/status-filter'
import type { Regions } from '@/lib/species/types'
import { filterPlaceKeys, hasPlaces, seenBasis, type Filter } from './filters'
import { placeName, placeNameLong } from './place-keys'
import { notCountedCodes } from './source-counts'
import type { Saved } from './storage'
import { monthName, rangeLabel, rangeShort } from './timeline'

type Names = Pick<Regions, 'countries' | 'sub1'>

/** Names worded as a short list: "Canada", "Canada + Egypt", "Canada and 2 more" (`t.places.andMore`); undefined for none. */
export function namesLabel(names: readonly string[], t: Pick<Ui, 'places'>): string | undefined {
  if (!names.length) return undefined
  const [first, second] = names
  if (names.length === 1) return first
  if (names.length === 2) return `${first} + ${second}`
  return fmt(t.places.andMore, { first, n: names.length - 1 })
}

/** "Canada", "Canada + Egypt", "Canada and 2 more" (sorted as the filter keeps them); undefined for none. */
export function countriesLabel(countries: readonly string[] | undefined, name: (iso2: string) => string, t: Pick<Ui, 'places'>): string | undefined {
  return countries?.length ? namesLabel(countries.map(name), t) : undefined
}

/** The names of a filter's continents in `t`'s language, in CONTINENTS order (the filter keeps them so). */
export function continentNames(continents: readonly ContinentId[] | undefined, t: Pick<Ui, 'places'>): string[] {
  return (continents ?? []).map((id) => t.places.continents[id])
}

export function regionNames(regions: readonly RegionPresetId[] | undefined, t: Pick<Ui, 'places'>): string[] {
  return (regions ?? []).map((id) => t.places.regions[id])
}

/**
 * The share image's places at every level by their short names, worded as `countriesLabel`, continents first:
 * "Africa + Canada", "British Columbia", "Kenya + British Columbia", "Capital and 2 more" (keys in `filterPlaceKeys`
 * order); undefined for none.
 */
export function placesLabel(f: Filter, regions: Names, t: Pick<Ui, 'places'>): string | undefined {
  return namesLabel([...new Set(filterPlaceKeys(f).map((k) => placeName(k, regions, t.places.continents, t.places.regions)))], t)
}

/**
 * The Places button's accessible description of the filter, each place with its parent: "Canada, Egypt" for
 * countries only; "Kenya; British Columbia, Canada" once a province or county is in (the names hold commas). The
 * continents come first, as their own items: "Africa; Kenya, Egypt". The names are `regions`' (pass the language's
 * country names, src/lib/i18n-places.ts regionsIn) and `t`'s continents.
 */
export function placesSpoken(f: Filter, regions: Names, t: Pick<Ui, 'places'>): string | undefined {
  const keys = filterPlaceKeys(f).filter((k) => !k.startsWith('n:') && !k.startsWith('r:'))
  const top = [...continentNames(f.continents, t), ...regionNames(f.regions, t)]
  if (!keys.length && !top.length) return undefined
  const sep = f.provinces?.length || f.counties?.length ? '; ' : ', '
  const items = keys.length ? [keys.map((k) => placeNameLong(k, regions, t.places.continents, t.places.regions)).join(sep)] : []
  return [...(top.length ? [top.join(', ')] : []), ...items].join('; ')
}

/** The Filters button's accessible description of the status filter: the full names in `STATUS_FILTER_CATS` order ("Vulnerable, Endangered", "Not evaluated"), in `t`'s language. */
export function statusSpoken(f: Filter, t: Pick<Ui, 'iucn'>): string | undefined {
  return f.statuses?.length ? f.statuses.map((c) => t.iucn.names[c]).join(', ') : undefined
}

/**
 * The share image's status label: exactly Vulnerable, Endangered and Critically Endangered read "Threatened"; else
 * worded as `countriesLabel`: "Endangered", "Vulnerable + Endangered", "Near Threatened and 3 more"; undefined for none.
 */
export function statusLabel(statuses: readonly StatusFilterCat[] | undefined, t: Pick<Ui, 'iucn' | 'places'>): string | undefined {
  if (statuses?.length === THREATENED.length && THREATENED.every((c) => statuses.includes(c))) return t.iucn.threatened
  return countriesLabel(statuses, (c) => t.iucn.names[c as StatusFilterCat], t)
}

/** Time words under basis 'seen': "Seen: 2026" ("Seen: from 2022"); as they are otherwise (and for no words). */
function seenTime(f: Filter, time: string | undefined, t: Pick<Ui, 'filters'>): string | undefined {
  return time && f.basis === 'seen' ? fmt(t.filters.basis.seenTime, { time }) : time
}

/**
 * The share image's place and time words for the basis: with places and a range under basis 'seen' the places read
 * "Seen in Canada" and the range stays ("2026"); a range alone reads "Seen: 2026". Without a range, or under the first-seen
 * basis, both stand as given.
 */
export function seenLabels(f: Filter, place: string | undefined, range: string | undefined, t: Pick<Ui, 'filters'>): { place?: string; range?: string } {
  if (!seenBasis(f) || !range) return { place, range }
  if (place) return { place: fmt(t.filters.basis.seenIn, { places: place }), range }
  return { range: fmt(t.filters.basis.seenTime, { time: range }) }
}

/**
 * The Time chip's and button's short summary, `rangeShort` (the timeline's readout wording): "2022–2024" for whole
 * years, "Apr 2022–Sep 2024", "Sep 2021", "from Apr 2022", "to 2024"; undefined with no time chosen.
 */
export function timeSummary(f: Filter, t: Ui): string | undefined {
  return seenTime(f, rangeShort(f.from, f.to, t), t)
}

/** The Time button's accessible description: "March 2020 to June 2021", "September 2021". */
export function timeSpoken(f: Filter, t: Ui): string | undefined {
  return seenTime(f, plainTimeSpoken(f, t), t)
}
function plainTimeSpoken(f: Filter, t: Ui): string | undefined {
  const { from, to } = f
  const tl = t.filters.timeline
  if (from && to) return from === to ? monthName(from, t) : fmt(tl.range, { from: monthName(from, t), to: monthName(to, t) })
  if (from) return fmt(tl.spokenFrom, { month: monthName(from, t) })
  if (to) return fmt(tl.spokenUpTo, { month: monthName(to, t) })
  return rangeLabel(from, to, t)
}

/**
 * The file that knows every place each bird was recorded: Settings' anchor that opens its Add panel (EbirdDrop reads
 * it; the Places panel's note links to it). One source today (MyEBirdData); another plugs in as another of these. The
 * notes' words are the strings files': `ui.places.note` (the Places panel, and Settings' import-again line) and
 * `ui.import.ebird.liferNote` (Settings' lifer-only note); never "seen", since heard-only birds count too.
 */
export type FullPlacesSource = { anchor: string }
export const MYEBIRDDATA_PLACES: FullPlacesSource = { anchor: 'add-mydata' }

/** Settings' anchor that opens observation.org's observations Add panel (the Places panel's unplaced line links to it; the words are `t.places.unplaced`). */
export const OBSORG_PLACES = { anchor: 'add-obsorg' } as const

/**
 * Whether the Places dropdown says its places are only lifer places, and what to do: undefined for an empty list or
 * one with seen-here (some record knows every place a species was seen); 'reimport' when the MyEBirdData slot holds
 * records but none carries seen-here (an import saved before seen-here existed: importing the file again fills it);
 * else 'add' (bring MyEBirdData or iNaturalist).
 */
export function placesNoteFor(saved: Pick<Saved, 'records'>, listLength: number, seenFull: boolean): 'add' | 'reimport' | undefined {
  if (!listLength || seenFull) return undefined
  const { records } = saved
  const eBirdOrInat = !!(records.ebird?.length || records['ebird-list']?.length || records.inat?.length)
  const obsorg = !!(records.obsorg?.length || records['obsorg-list']?.length)
  if (!eBirdOrInat && obsorg) return undefined // the MyEBirdData pitch is only for eBird birders
  const full = records.ebird ?? []
  return full.length && !full.some((r) => Array.isArray(r.seen)) ? 'reimport' : 'add'
}

/** The Places panel's unplaced line: 'add' with its link to the observations' Add panel, 'plain' its first sentence
 *  only (the observations are on the list already, so adding them is no advice). */
export type PlacesUnplaced = 'add' | 'plain'

/**
 * Whether some bird on the observation.org life list ('obsorg-list', no places) has no record in any slot carrying a
 * place or seen-here: those birds drop out of any place filter, and the Places panel says so. An observations import
 * (or MyEBirdData, iNaturalist) that places the same birds turns it off for them. Birds the birder removed are off the
 * list and don't count, and so are species a source marks not countable; only records do (a hand tick in `edits.added`
 * places nothing). With the observations on the list (`records.obsorg`), the line has no link ('plain'); else 'add'.
 * Undefined: no line.
 */
export function placesUnplacedFor(saved: Pick<Saved, 'records' | 'notCountable'> & { edits?: Pick<Saved['edits'], 'removed'> }): PlacesUnplaced | undefined {
  const removed = new Set(saved.edits?.removed ?? [])
  const off = notCountedCodes(saved)
  const listed = (saved.records['obsorg-list'] ?? []).filter((r) => !removed.has(r.code) && !off.has(r.code))
  if (!listed.length) return undefined
  const placed = new Set<string>()
  for (const recs of Object.values(saved.records)) {
    for (const r of recs ?? []) if (r.place || r.seen?.length) placed.add(r.code)
  }
  if (!listed.some((r) => !placed.has(r.code))) return undefined
  return saved.records.obsorg?.length ? 'plain' : 'add'
}

/** A panel section's head: the count first, then " · N checked" only when some are ("20 countries · 7 checked"). */
export function countHead(n: number, kind: 'continent' | 'region' | 'country' | 'province' | 'county' | 'status', checked: number, t: Ui): string {
  const head = plural(t.filters.countHead[kind], n, { n: formatInt(n, t.num) })
  return checked > 0 ? `${head} · ${fmt(t.filters.countHead.checked, { n: formatInt(checked, t.num) })}` : head
}

/** The Filters button's count (its badge, and the panel head's "Filters · N"): the filter groups in use (bird group, Places, Time, Conservation status), 0 to 4, not checked boxes; it matches the chips shown by kind. */
export function filtersCount(f: Filter): number {
  return (f.group ? 1 : 0) + (hasPlaces(f) ? 1 : 0) + (f.from || f.to ? 1 : 0) + (f.statuses?.length ? 1 : 0)
}

/** The Filters button's accessible description: each section in use, "Places: Kenya. Time: March 2020 to June 2021"; undefined for none. */
export function filtersSpoken(f: Filter, regions: Names, t: Ui, groupName?: (id: string) => string | undefined): string | undefined {
  const parts: string[] = []
  if (f.group) parts.push(`${t.filters.group}: ${groupName?.(f.group) ?? f.group}`)
  const places = placesSpoken(f, regions, t)
  if (places) parts.push(`${t.filters.places}: ${places}`)
  if (f.from || f.to) parts.push(`${t.filters.time}: ${timeSpoken(f, t)}`)
  const status = statusSpoken(f, t)
  if (status) parts.push(`${t.filters.status}: ${status}`)
  return parts.length ? parts.join('. ') : undefined
}

const speciesOf = (shown: number, t: Ui) => plural(t.collage.stats.species, shown, { n: formatInt(shown, t.num) })

/** The panel's head: "Filters · 3 · 118 species", or "Filters · 118 species" with no filter in use. */
export function panelHead(n: number, shown: number, t: Ui): string {
  const species = speciesOf(shown, t)
  return n > 0 ? fmt(t.filters.panel.head, { n: formatInt(n, t.num), species }) : fmt(t.filters.panel.headNone, { species })
}

/** The sheet's bottom button: "Show 118 species". */
export function showLabel(shown: number, t: Ui): string {
  return fmt(t.filters.panel.show, { species: speciesOf(shown, t) })
}
