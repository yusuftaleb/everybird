// The chip model: what an active filter (or, for item 9's smart search, an understood phrase) shows as a removable chip.
// Pure. `filterChips` reads a Filter into chips (places, time, statuses); `withoutFilterChip` removes one.
import { fmt } from '@/i18n/core'
import type { Ui } from '@/i18n/messages/en'
import { formatInt } from '@/i18n/format'
import type { Regions } from '@/lib/species/types'
import { clearPlaces, filterPlaceKeys, withPlaces, withStatuses, type Filter } from './filters'
import { placesSpoken, timeSpoken, timeSummary } from './filter-summary'
import { placeName, placeNameLong } from './place-keys'
import { timeless } from './timeline'

/** Item 9's kinds, verbatim. */
export type ChipKind = 'date' | 'place' | 'group' | 'order' | 'family' | 'status' | 'basis'

/**
 * `token` is what the chip stands for: for a filter chip, the value it removes (a place key such as `c:CA` or
 * `n:AF` for a continent, a category such as `VU`, `from..to` for time, or `ALL` for a collapsed chip). `spoken` is
 * its accessible name, when it differs.
 */
export type Chip = { kind: ChipKind; label: string; token: string; spoken?: string }

/** The token of a collapsed chip ("5 places"): every value of its kind. */
export const ALL = '*'
/** More values than this in one kind collapse to a single "N places" chip. */
const MAX_CHIPS = 3

type Names = Pick<Regions, 'countries' | 'sub1'>

/**
 * The filter's chips: the bird group (`groupName` says its name in the language), places (the place keys in `filterPlaceKeys`
 * order, continents first; a continent counts as one place), then time, then statuses (in Red List order, NE last). Place
 * names come from `regions` (pass the language's, src/lib/i18n-places.ts regionsIn) and `t`'s continents; the rest from `t`.
 */
export function filterChips(f: Filter, regions: Names, t: Ui, groupName?: (id: string) => string | undefined): Chip[] {
  const out: Chip[] = []
  if (f.group) out.push({ kind: 'group', label: groupName?.(f.group) ?? f.group, token: f.group })
  const keys = filterPlaceKeys(f)
  const count = keys.length
  if (count > MAX_CHIPS) {
    out.push({ kind: 'place', label: fmt(t.filters.panel.manyPlaces, { n: formatInt(count, t.num) }), token: ALL, spoken: placesSpoken(f, regions, t) })
  } else {
    for (const k of keys) out.push({ kind: 'place', label: placeName(k, regions, t.places.continents, t.places.regions), token: k, spoken: placeNameLong(k, regions, t.places.continents, t.places.regions) })
  }
  const time = timeSummary(f, t)
  if (time) out.push({ kind: 'date', label: time, token: `${f.from ?? ''}..${f.to ?? ''}`, spoken: timeSpoken(f, t) })
  const cats = f.statuses ?? []
  if (cats.length > MAX_CHIPS) {
    out.push({ kind: 'status', label: fmt(t.filters.panel.manyStatuses, { n: formatInt(cats.length, t.num) }), token: ALL })
  } else {
    for (const c of cats) out.push({ kind: 'status', label: t.iucn.names[c], token: c })
  }
  return out
}


/** The filter without what `chip` stands for; a chip of any other kind leaves it as it is. */
export function withoutFilterChip(f: Filter, chip: Chip): Filter {
  if (chip.kind === 'group') {
    const next: Filter = { ...f }
    delete next.group
    return next
  }
  if (chip.kind === 'place' && chip.token === ALL) return clearPlaces(f)
  if (chip.kind === 'place') return withPlaces(f, filterPlaceKeys(f).filter((k) => k !== chip.token))
  if (chip.kind === 'date') {
    const next = timeless(f)
    delete next.basis // the chip said "Seen: …": removing it removes that choice too
    return next
  }
  if (chip.kind === 'status') return withStatuses(f, chip.token === ALL ? [] : (f.statuses ?? []).filter((c) => c !== chip.token))
  return f
}
