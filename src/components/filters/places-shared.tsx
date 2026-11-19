'use client'
// What the Places panel's parts share (PlacesList.tsx and PlacesDrill.tsx): a level's rows, one checkbox row, the
// search field, the level's words, and the panel's props. A leaf: it imports neither the shell, the drill nor
// Filters, so none of them import each other in a cycle.
import { useMemo } from 'react'
import { SearchIcon } from '@/components/collage/icons'
import { Flag } from '@/components/Flag'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import type { Ui } from '@/i18n/messages/en'
import { isContinentId } from '@/lib/places/continents'
import { ContinentGlobe } from './ContinentGlobe'
import { clearPlaces, countryRows, filterKey, filterPlaceKeys, placeCounts, placeRows, regionRows, type Filter, type PlaceCounts, type PlaceOption } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { SeenIndex } from '@/lib/list/seen'
import { parentKey, parsePlaceKey, placeName, type PlaceLevel } from '@/lib/list/place-keys'
import type { AppState } from '@/lib/list/store'
import { searchKey } from '@/lib/species/name-search'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'

/**
 * The lifer-only notice: every place on the list is where a lifer was first seen. 'add': no file that knows every
 * sighting yet (bring MyEBirdData or iNaturalist); 'reimport': a MyEBirdData import saved before seen-here existed.
 */
export type PlacesNote = 'add' | 'reimport'

/** More rows than this at a level, and the Places panel gets its search field ("Find a country", from 9). */
export const SEARCH_FROM = 8

/** What a design of the panel gets. */
export type PlacesBodyProps = {
  state: AppState
  species: SpeciesIndex
  regions: Regions
  onFilter: (f: Filter) => void
  /** Told the level shown (its parent's key; undefined: the top) whenever it changes: the Map view draws that level. */
  onLevel?: (at: string | undefined) => void
}

/**
 * The level of the places under `parent`: continents with none (countries when `flat`: the one-continent list skips the
 * continent level), a continent's countries, a country's provinces, a province's counties.
 */
export function levelUnder(parent: string | undefined, flat = false): PlaceLevel {
  if (parent === undefined) return flat ? 'country' : 'continent'
  const level = parsePlaceKey(parent)?.level
  return level === 'continent' ? 'country' : level === 'country' ? 'province' : 'county'
}

/** `parentKey` as the panel walks it: with the continent level skipped, a country's parent is the top level. */
export function upKey(key: string, flat: boolean): string | undefined {
  const up = parentKey(key)
  return flat && up?.startsWith('n:') ? undefined : up
}

// A level's head word (also its checklist's accessible name), its search field and what a search matching no row
// says: `t.places.head`, `.find`, `.noMatch`.

// The last counts per list (list and seen keep their identities across filter changes, store.ts): every level
// reads the same pass, made again only when the other filters, the list or seen-here change.
const lastCounts = new WeakMap<ListEntry[], { key: string; species: SpeciesIndex; seen: SeenIndex; counts: PlaceCounts }>()

/** Every Places level counted under the filter's other dimensions (placeCounts), once per change of those. */
export function placeCountsFor(state: AppState, species: SpeciesIndex): PlaceCounts {
  const { list, filter, seen } = state
  const others = clearPlaces(filter)
  const key = filterKey(others)
  const hit = lastCounts.get(list)
  if (hit && hit.key === key && hit.species === species && hit.seen === seen) return hit.counts
  const counts = placeCounts(list, others, species, seen)
  lastCounts.set(list, { key, species, seen, counts })
  return counts
}

/**
 * What a drilled level with no places says: the other filters (taxonomy, time, status) left it none, or, with none set, the
 * list no longer has a bird seen there (a source was removed or replaced since the panel drilled in).
 */
export function emptyHere(f: Filter, t: Ui): string {
  return f.order || f.family || f.year || f.from || f.to || f.statuses?.length ? t.places.emptyFiltered : t.places.emptyNow
}

/**
 * The rows of the level under `parent` (placeRows over `counts`), and, at 0, any place at that level they lack (another
 * filter left it no species) that is checked or holds a checked place: so every checked place can still be reached and
 * unchecked. A row that holds checked places counts them among its children (listed or not), so it drills.
 * A checkbox changes only the held rows: the counted rows stay as they were.
 */
export function usePlaceRows(counts: PlaceCounts, filter: Filter, parent: string | undefined, regions: Regions, flat = false): PlaceOption[] {
  const { t, lang } = useI18n()
  const cn = t.places.continents
  const rn = t.places.regions
  const opts = useMemo(
    () => (flat && parent === undefined ? countryRows(counts, (k) => placeName(k, regions, cn, rn), HTML_LANG[lang]) : placeRows(counts, parent, (k) => placeName(k, regions, cn, rn), HTML_LANG[lang])),
    [counts, parent, regions, lang, flat, cn, rn],
  )
  // Each place at this level that is checked or holds a checked place -> the distinct ones one level under it.
  const held = useMemo(() => {
    const out = new Map<string, Set<string>>()
    for (const key of filterPlaceKeys(filter)) {
      let child: string | undefined
      for (let k: string | undefined = key; k; child = k, k = upKey(k, flat)) {
        if (upKey(k, flat) !== parent) continue
        const kids = out.get(k) ?? new Set<string>()
        if (child) kids.add(child)
        out.set(k, kids)
      }
    }
    return out
  }, [filter, parent, flat])
  return useMemo(() => {
    if (!held.size) return opts
    const listed = opts.map((o) => (o.children === 0 && held.get(o.value)?.size ? { ...o, children: held.get(o.value)!.size } : o))
    const have = new Set(opts.map((o) => o.value))
    const zero = [...held]
      .filter(([k]) => !have.has(k))
      .map(([k, kids]): PlaceOption => ({ value: k, label: placeName(k, regions, cn, rn), count: 0, children: kids.size }))
    return [...listed, ...zero]
  }, [opts, held, regions, cn, rn])
}

export function useRegionRows(counts: PlaceCounts, filter: Filter, regions: Regions): PlaceOption[] {
  const { t, lang } = useI18n()
  const cn = t.places.continents
  const rn = t.places.regions
  const opts = useMemo(
    () => regionRows(counts, (k) => placeName(k, regions, cn, rn), HTML_LANG[lang]),
    [counts, regions, lang, cn, rn],
  )
  return useMemo(() => {
    if (!filter.regions?.length) return opts
    const have = new Set(opts.map((o) => o.value))
    const zero = filter.regions
      .map((id) => `r:${id}`)
      .filter((k) => !have.has(k))
      .map((k): PlaceOption => ({ value: k, label: placeName(k, regions, cn, rn), count: 0, children: 0 }))
    return zero.length ? [...opts, ...zero] : opts
  }, [opts, filter.regions, regions, cn, rn])
}

/** The rows whose names hold every word of `q` as a word prefix, accent- and case-insensitive ("new z": New Zealand). */
export function matchRows<T extends { label: string }>(rows: T[], q: string): T[] {
  const key = searchKey(q)
  if (!key) return rows
  const terms = key.split(' ')
  return rows.filter((r) => {
    const ws = searchKey(r.label).split(' ')
    return terms.every((t) => ws.some((w) => w.startsWith(t)))
  })
}

/** A place's checkbox test id: `continent-<ID>`, `country-<ISO2>` (`country-FR@SA` for an overseas part), `place-<key>` below. */
export function placeTestId(key: string): string {
  const p = parsePlaceKey(key)
  if (p?.level === 'continent') return `continent-${p.continent}`
  if (p?.level === 'region') return `region-${p.region}`
  return p?.level === 'country' ? `country-${key.slice(2)}` : `place-${key}`
}

type CheckProps = { option: PlaceOption; checked: boolean; onToggle: () => void; flag?: boolean; testId?: string }

/** One checklist row: the whole row is the label (box, flag on countries, name, Muted count, the spoken count). */
export function PlaceCheck({ option, checked, onToggle, flag, testId }: CheckProps) {
  const { t } = useI18n()
  const p = flag ? parsePlaceKey(option.value) : undefined
  const n = formatInt(option.count, t.num)
  return (
    <label className="eb-check" data-checked={checked ? '' : undefined}>
      <input type="checkbox" checked={checked} onChange={onToggle} data-testid={testId ?? placeTestId(option.value)} />
      {p?.level === 'country' && <Flag iso={p.country} />}
      {p?.level === 'continent' && isContinentId(p.continent) && <ContinentGlobe id={p.continent} />}
      <span className="eb-check-name">{option.label}</span>
      <span className="eb-count" aria-hidden="true">{n}</span>
      <span className="eb-sr">, {plural(t.collage.stats.species, option.count, { n })}</span>
    </label>
  )
}

/** The search field for a level with many rows: the app's one field style (globals.css .eb-input), the site's lens. */
export function PlacesFind({ level, q, onQ }: { level: PlaceLevel; q: string; onQ: (q: string) => void }) {
  const { t } = useI18n()
  return (
    <div className="eb-input-wrap">
      <SearchIcon className="eb-input-icon" />
      <input
        type="search"
        className="eb-input eb-input-search"
        placeholder={t.places.find[level]}
        aria-label={t.places.find[level]}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        value={q}
        onChange={(e) => onQ(e.target.value)}
        data-testid="places-find"
      />
    </div>
  )
}
