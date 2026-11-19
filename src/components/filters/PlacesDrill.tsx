'use client'
// The Places panel: one level at a time, drilled in place. "6 continents" heads the top level (a list with one
// continent skips it and opens at its countries, "All countries"); a row with places under it ends in a drill button
// (the site's chevron turned to point in). Drilled, the head names the level ("12 countries", "8 states and
// provinces", "14 counties"), the breadcrumb "All continents / North America / Canada / British Columbia" steps back,
// and the first row, "All of Canada", is the parent's own checkbox. A country in no continent is listed at the top
// beside the continents. From the top level the search field finds any country (its matches replace the continents). Drilling in
// focuses "All of …"; a step back focuses the drill button of the row it came from (scrolled into view); Esc closes the panel from any
// level (DropPanel). The search field and its query are per level.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon } from '@/components/collage/icons'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import { clearPlaces, countryRows, filterPlaceKeys, hasPlaces, onlyOneContinent, placeRows, togglePlace } from '@/lib/list/filters'
import { parentKey, parsePlaceKey, placeName } from '@/lib/list/place-keys'
import { countHead } from '@/lib/list/filter-summary'
import { emptyHere, levelUnder, matchRows, PlaceCheck, placeCountsFor, PlacesFind, placeTestId, SEARCH_FROM, upKey, usePlaceRows, useRegionRows, type PlacesBodyProps } from './places-shared'

export function PlacesDrill({ state, species, regions, onFilter }: PlacesBodyProps) {
  const { filter } = state
  const { t, lang } = useI18n()
  const counts = placeCountsFor(state, species)
  // One continent on the list (under the other filters): the continent level is skipped, as the taxonomy skips an only family.
  const flat = onlyOneContinent(counts, filter)
  // Opens at the selection's level: every checked place under one parent starts drilled there (the breadcrumb built),
  // so a checked province or county is in view; else (none, continents, or several parents) the top level.
  const [atRaw, setAt] = useState<string | undefined>(() => startLevel(filterPlaceKeys(filter)))
  const at = flat && atRaw?.startsWith('n:') ? undefined : atRaw
  const [q, setQ] = useState('')
  // Test ids to focus, first found wins, once the new level has rendered (set by the drill and breadcrumb handlers).
  const focusNext = useRef<string[] | null>(null)
  const headRef = useRef<HTMLDivElement>(null)
  // From the continent level the search field finds a country anywhere: the matches replace the continents.
  const searching = at === undefined && !flat && q.trim() !== ''
  const level = levelUnder(at, flat)
  const shownLevel = searching ? 'country' : level
  const name = (k: string) => placeName(k, regions, t.places.continents, t.places.regions)
  const rows = usePlaceRows(counts, filter, at, regions, flat)
  const regionList = useRegionRows(counts, filter, regions)
  const foundRegions = searching ? matchRows(regionList, q) : []
  const foundContinents = searching ? matchRows(rows, q) : []
  // The search also finds a checked country, or one holding a checked place, that the counts have emptied (count 0).
  const found = (() => {
    if (!searching) return []
    const rowsAll = countryRows(counts, name, HTML_LANG[lang])
    const have = new Set(rowsAll.map((r) => r.value))
    for (const key of filterPlaceKeys(filter)) {
      let k: string | undefined = key
      while (k && parsePlaceKey(k)?.level !== 'country') k = parentKey(k)
      if (!k || have.has(k)) continue
      have.add(k)
      rowsAll.push({ value: k, label: name(k), count: 0, children: 0 })
    }
    return matchRows(rowsAll, q)
  })()
  const checked = useMemo(() => new Set(filterPlaceKeys(filter)), [filter])
  // "All of <parent>": the parent's own count, as its row one level up shows it (from the same counts).
  const allCount = at ? (placeRows(counts, parentKey(at), (k) => k).find((o) => o.value === at)?.count ?? 0) : 0
  const path: string[] = []
  for (let k = at; k; k = upKey(k, flat)) path.unshift(k)

  const go = (next: string | undefined, focus: string[]) => {
    focusNext.current = focus
    setAt(next)
    setQ('')
  }
  // Back to `target`'s level (undefined: the top): focus the drill button of the row the panel came from.
  const stepTo = (target: string | undefined) => {
    let k = at
    while (k && upKey(k, flat) !== target) k = upKey(k, flat)
    go(target, k ? [`drill-${k}`, placeTestId(k)] : [])
  }

  // Opened at the selection's level: the first checked row scrolled into the panel's view (focus stays with the panel).
  useLayoutEffect(() => {
    if (!at) return
    headRef.current?.closest<HTMLElement>('.eb-places')?.querySelector<HTMLElement>('.eb-places-level input:checked')?.scrollIntoView?.({ block: 'nearest' })
    // Only on opening: later levels place their own focus below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useLayoutEffect(() => {
    const ids = focusNext.current
    if (!ids) return
    focusNext.current = null
    const root = headRef.current?.closest<HTMLElement>('.eb-places')
    const body = root?.closest<HTMLElement>('.eb-drop-body')
    if (body) body.scrollTop = 0
    const all = Array.from(root?.querySelectorAll<HTMLElement>('[data-testid]') ?? [])
    const target = ids.map((id) => all.find((el) => el.dataset.testid === id)).find(Boolean) ?? root?.closest<HTMLElement>('[role="dialog"]')
    target?.focus({ preventScroll: true })
    // A step back to a row far down the level: scroll the body to it, so the focus is in view.
    target?.scrollIntoView?.({ block: 'nearest' })
  }, [at])

  const shown = searching ? found : rows
  const showFind = at === undefined && !flat ? (rows.length > 0 || regionList.length > 0) : rows.length > SEARCH_FROM
  const visible = searching ? found : rows.length > SEARCH_FROM ? matchRows(rows, q) : rows
  const visibleRegions = at === undefined ? (searching ? foundRegions : flat && rows.length > SEARCH_FROM ? matchRows(regionList, q) : regionList) : []
  // Where some row drills, the others keep the button's room, so every count lines up.
  // At the counties the room is kept too, so the counts stay in the column they had a level up.
  const drills = shownLevel !== 'county' && shown.some((r) => r.children > 0)
  const gap = drills || shownLevel === 'county' ? <span className="eb-drill-space" aria-hidden="true" /> : null
  const drillLabel = (key: string, place: string) => {
    const l = parsePlaceKey(key)?.level
    return fmt(l === 'continent' ? t.places.drill.continent : l === 'country' ? t.places.drill.country : t.places.drill.province, { place })
  }

  return (
    <>
      <div className="eb-places-head" ref={headRef}>
        <span className="eb-mono">{countHead(rows.length, level, rows.filter((r) => checked.has(r.value)).length, t)}</span>
        {hasPlaces(filter) && (
          <button type="button" className="eb-textbtn" data-testid="places-clear" onClick={() => onFilter(clearPlaces(filter))}>{t.filters.clear}</button>
        )}
      </div>
      {at && (
        <p className="eb-path eb-places-path" data-testid="places-path">
          {[undefined, ...path].map((k, i) => (
            <span key={k ?? ''} className="eb-path-item">
              {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
              {k === at ? (
                <span aria-current="location">{name(k)}</span>
              ) : (
                <button type="button" onClick={() => stepTo(k)}>{k ? name(k) : flat ? t.places.allCountries : t.places.allContinents}</button>
              )}
            </span>
          ))}
        </p>
      )}
      {showFind && <PlacesFind level={shownLevel} q={q} onQ={setQ} />}
      {rows.length === 0 && regionList.length === 0 && !at ? (
        <p className="eb-note">{t.places.none}</p>
      ) : (
        <>
          <ul key={at ?? ''} className="eb-checklist eb-places-level" aria-label={t.places.head[shownLevel]}>
            {at && (
              <li className="eb-places-row">
                <PlaceCheck
                  option={{ value: at, label: fmt(t.places.allOf, { place: name(at) }), count: allCount, children: 0 }}
                  checked={checked.has(at)}
                  onToggle={() => onFilter(togglePlace(filter, at))}
                  testId="place-all"
                />
                {gap}
              </li>
            )}
            {searching && foundContinents.map((r) => (
              <li key={r.value} className="eb-places-row">
                <PlaceCheck option={r} checked={checked.has(r.value)} onToggle={() => onFilter(togglePlace(filter, r.value))} flag />
                {drills && r.children > 0 ? (
                  <button type="button" className="eb-drill" aria-label={drillLabel(r.value, r.label)} data-testid={`drill-${r.value}`} onClick={() => go(r.value, ['place-all'])}>
                    <ChevronDownIcon />
                  </button>
                ) : gap}
              </li>
            ))}
            {visible.map((r) => (
              <li key={r.value} className="eb-places-row">
                <PlaceCheck option={r} checked={checked.has(r.value)} onToggle={() => onFilter(togglePlace(filter, r.value))} flag={shownLevel === 'country' || shownLevel === 'continent'} />
                {drills && r.children > 0 ? (
                  <button type="button" className="eb-drill" aria-label={drillLabel(r.value, r.label)} data-testid={`drill-${r.value}`} onClick={() => go(r.value, ['place-all'])}>
                    <ChevronDownIcon />
                  </button>
                ) : gap}
              </li>
            ))}
            {rows.length === 0 && !searching ? (
              <li className="eb-note eb-check-none" data-testid="places-empty">{emptyHere(filter, t)}</li>
            ) : visible.length === 0 && foundContinents.length === 0 && visibleRegions.length === 0 && <li className="eb-note eb-check-none">{t.places.noMatch[shownLevel]}</li>}
          </ul>
          {visibleRegions.length > 0 && (
            <>
              <div className="eb-places-subhead">
                <span className="eb-mono">{countHead(visibleRegions.length, 'region', visibleRegions.filter((r) => checked.has(r.value)).length, t)}</span>
              </div>
              <ul className="eb-checklist eb-places-level" aria-label={t.places.head.region}>
                {visibleRegions.map((r) => (
                  <li key={r.value} className="eb-places-row">
                    <PlaceCheck option={r} checked={checked.has(r.value)} onToggle={() => onFilter(togglePlace(filter, r.value))} />
                    {gap}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </>
  )
}

/** The parent every checked place shares, or undefined (the top level) when there are none or they have several. */
export function startLevel(keys: string[]): string | undefined {
  if (!keys.length) return undefined
  const first = parentKey(keys[0])
  return keys.every((k) => parentKey(k) === first) ? first : undefined
}
