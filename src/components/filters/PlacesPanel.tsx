'use client'
// The Places panel: the dotted world map (countries only; tapping one selects it), then the drill-down under it: a
// breadcrumb (World › Canada › British Columbia › county) and the chips: countries (with flags), the chosen country's
// provinces and states, the chosen province's counties. Every count is species SEEN there (seen-here), not lifers there. A list whose places are only lifer places (the eBird life list download, ticks by
// hand) says so. `depth: 'country'` (a shared link, whose places are display strings) stops at countries.
import Link from 'next/link'
import { useMemo } from 'react'
import { CountryMap } from '@/components/map/CountryMap'
import { flagEmoji } from '@/lib/flag'
import { stripBracket } from '@/lib/import/places'
import { options, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { SeenIndex } from '@/lib/list/seen'
import type { Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
import { LevelRow } from './LevelRow'

type Props = {
  filter: Filter
  list: ListEntry[]
  seen?: SeenIndex
  trips: Trip[]
  species: SpeciesIndex
  regions: Regions
  dots?: CountryDots
  depth?: 'country' | 'county'
  /** Every place is a lifer place: say so, with a way to add the files that know more. */
  liferOnly?: boolean
  sheet: boolean
  onFilter: (f: Filter) => void
}
type PlaceLevel = 'country' | 'sub1' | 'sub2'

/** A place change: a new country clears the province and county, a new province the county; the same value clears it. */
export function withPlace(f: Filter, level: PlaceLevel, value: string | undefined): Filter {
  const next: Filter = { ...f, [level]: f[level] === value ? undefined : value }
  if (level === 'country') { delete next.sub1; delete next.sub2 }
  if (level === 'sub1') delete next.sub2
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

export function PlacesPanel({ filter, list, seen, trips, species, regions, dots, depth = 'county', liferOnly, sheet, onFilter }: Props) {
  const deep = depth === 'county'
  const name = useMemo(() => {
    const strip = (s: string | undefined, code: string) => (s ? stripBracket(s) : code)
    return (code: string) => (code.includes('-') ? strip(regions.sub1[code], code) : strip(regions.countries[code], code))
  }, [regions])
  const countries = useMemo(() => options(list, filter, 'country', species, trips, name, seen), [list, filter, species, trips, name, seen])
  const provinces = useMemo(() => (deep && filter.country ? options(list, filter, 'sub1', species, trips, name, seen) : []), [deep, list, filter, species, trips, name, seen])
  const counties = useMemo(() => (deep && filter.sub1 ? options(list, filter, 'sub2', species, trips, name, seen) : []), [deep, list, filter, species, trips, name, seen])
  const countryCounts = useMemo(() => new Map(countries.map((c) => [c.value, c.count])), [countries])

  const pick = (level: PlaceLevel) => (v: string | undefined) => onFilter(withPlace(filter, level, v))
  const label = (level: FilterLevel, o: ChipOption) => {
    const flag = level === 'country' ? flagEmoji(o.value) : undefined
    return flag ? <><span className="eb-flag" aria-hidden="true">{flag}</span>{o.label}</> : o.label
  }

  // World › Canada › British Columbia › county: each step back up is a button; the current place is in Accent.
  const crumbs: { label: string; to?: Filter }[] = []
  if (filter.country) {
    const up = (f: Filter, ...drop: (keyof Filter)[]) => { const n = { ...f }; for (const k of drop) delete n[k]; return n }
    crumbs.push({ label: 'World', to: up(filter, 'country', 'sub1', 'sub2') })
    crumbs.push({ label: name(filter.country), to: filter.sub1 ? up(filter, 'sub1', 'sub2') : undefined })
    if (filter.sub1) crumbs.push({ label: name(filter.sub1), to: filter.sub2 ? up(filter, 'sub2') : undefined })
    if (filter.sub2) crumbs.push({ label: filter.sub2 })
  }

  return (
    <>
      {dots && <CountryMap dots={dots} counts={countryCounts} selected={filter.country} onSelect={pick('country')} countryName={name} />}
      {liferOnly && (
        <p className="eb-note eb-places-note" data-testid="places-lifer-only">
          Showing where each lifer was first seen. <Link href="/settings">Add MyEBirdData or iNaturalist</Link> for full country lists.
        </p>
      )}
      {crumbs.length > 0 && (
        <nav aria-label="Place" className="eb-places-path" data-testid="places-path">
          <p className="eb-path">
            {crumbs.map((c, i) => (
              <span key={i} className="eb-path-item">
                {i > 0 && <span className="eb-path-sep" aria-hidden="true">›</span>}
                {i === crumbs.length - 1 ? <span aria-current="location">{c.label}</span> : <button type="button" onClick={() => onFilter(c.to!)}>{c.label}</button>}
              </span>
            ))}
          </p>
        </nav>
      )}
      <nav aria-label="Filter by place" className="eb-levels">
        <LevelRow level="country" options={countries} label={label} latin={false} value={filter.country} chosenName={filter.country ? name(filter.country) : undefined} sheet={sheet} onPick={pick('country')} />
        <LevelRow level="sub1" options={provinces} label={label} latin={false} value={filter.sub1} chosenName={filter.sub1 ? name(filter.sub1) : undefined} sheet={sheet} onPick={pick('sub1')} />
        <LevelRow level="sub2" options={counties} label={label} latin={false} value={filter.sub2} chosenName={filter.sub2} sheet={sheet} onPick={pick('sub2')} />
      </nav>
    </>
  )
}
