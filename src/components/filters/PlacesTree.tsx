'use client'
// The Places panel: one list that opens in place. The top level is the continents, headed "6 continents" (a list with one
// continent skips that level and lists its countries; a country in no continent sits beside the continents). A row with
// places under it starts with a disclosure chevron (`drill-<key>`, `aria-expanded`, "Show countries in Africa"): pressed,
// its places open indented right under it, a country's states and provinces the same way, then the counties. Several
// branches may be open at once; nothing replaces the list and there is no breadcrumb. When the panel opens, every branch
// holding a checked place is open (openFor). Each row is a real checkbox with the name and, right beside it, the count;
// a parent's checkbox covers the places under it (togglePlace). The search field at the top finds any continent,
// country or region (its matches replace the list, and open in place too). Esc closes the panel (DropPanel).
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronDownIcon } from '@/components/collage/icons'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG } from '@/i18n/langs'
import type { Ui } from '@/i18n/messages/en'
import { clearPlaces, countryRows, filterPlaceKeys, hasPlaces, onlyOneContinent, togglePlace, type Filter, type PlaceCounts, type PlaceOption } from '@/lib/list/filters'
import { parentKey, parsePlaceKey, placeName } from '@/lib/list/place-keys'
import { countHead } from '@/lib/list/filter-summary'
import type { Regions } from '@/lib/species/types'
import { emptyHere, levelUnder, matchRows, PlaceCheck, placeCountsFor, PlacesFind, SEARCH_FROM, usePlaceRows, useRegionRows, type PlacesBodyProps } from './places-shared'

/** The branches open when the panel opens: every place above a checked one (its continent, country and province). */
export function openFor(keys: readonly string[]): Set<string> {
  const out = new Set<string>()
  for (const key of keys) for (let k = parentKey(key); k; k = parentKey(k)) out.add(k)
  return out
}

/** What every row of the tree reads. */
type Tree = {
  counts: PlaceCounts
  filter: Filter
  regions: Regions
  flat: boolean
  checked: ReadonlySet<string>
  open: ReadonlySet<string>
  toggleOpen: (key: string) => void
  onToggle: (key: string) => void
  t: Ui
}

/** A disclosure's name ("Show countries in Africa") and its open group's ("Countries in Africa"), by the row's level. */
function words(key: string, place: string, t: Ui): { show: string; group: string } {
  const l = parsePlaceKey(key)?.level
  const k = l === 'continent' ? 'continent' : l === 'country' ? 'country' : 'province'
  return { show: fmt(t.places.drill[k], { place }), group: fmt(t.places.group[k], { place }) }
}

/** One place: its row (the chevron or its room, the checkbox, name and count) and, when open, the places under it. */
function PlaceNode({ row, depth, tree }: { row: PlaceOption; depth: number; tree: Tree }) {
  const id = useId()
  const opens = row.children > 0
  const isOpen = opens && tree.open.has(row.value)
  const w = words(row.value, row.label, tree.t)
  return (
    <li className="eb-places-node">
      <div className="eb-places-row" style={depth ? { paddingLeft: `calc(${depth} * var(--eb-places-indent))` } : undefined}>
        {opens ? (
          <button type="button" className="eb-drill" aria-expanded={isOpen} aria-controls={isOpen ? id : undefined} aria-label={w.show} data-testid={`drill-${row.value}`} onClick={() => tree.toggleOpen(row.value)}>
            <ChevronDownIcon />
          </button>
        ) : (
          <span className="eb-drill-space" aria-hidden="true" />
        )}
        <PlaceCheck option={row} checked={tree.checked.has(row.value)} onToggle={() => tree.onToggle(row.value)} flag />
      </div>
      {isOpen && <PlaceBranch id={id} parent={row.value} label={w.group} depth={depth + 1} tree={tree} />}
    </li>
  )
}

/** The places under an open row, indented one step. */
function PlaceBranch({ id, parent, label, depth, tree }: { id: string; parent: string; label: string; depth: number; tree: Tree }) {
  const rows = usePlaceRows(tree.counts, tree.filter, parent, tree.regions, tree.flat)
  return (
    <ul id={id} className="eb-checklist eb-places-sub" aria-label={label}>
      {rows.length ? rows.map((r) => <PlaceNode key={r.value} row={r} depth={depth} tree={tree} />) : (
        <li className="eb-note eb-check-none" style={{ paddingLeft: `calc(${depth} * var(--eb-places-indent) + 8px)` }} data-testid="places-empty">{emptyHere(tree.filter, tree.t)}</li>
      )}
    </ul>
  )
}

export function PlacesTree({ state, species, regions, onFilter }: PlacesBodyProps) {
  const { filter } = state
  const { t, lang } = useI18n()
  const counts = placeCountsFor(state, species)
  // One continent on the list (under the other filters): the continent level is skipped, as the taxonomy skips an only family.
  const flat = onlyOneContinent(counts, filter)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => openFor(filterPlaceKeys(filter)))
  const [q, setQ] = useState('')
  const headRef = useRef<HTMLDivElement>(null)
  const level = levelUnder(undefined, flat)
  const name = (k: string) => placeName(k, regions, t.places.continents, t.places.regions)
  const rows = usePlaceRows(counts, filter, undefined, regions, flat)
  const regionList = useRegionRows(counts, filter, regions)
  const checked = useMemo(() => new Set(filterPlaceKeys(filter)), [filter])
  const searching = q.trim() !== ''
  // The search finds a continent, a country anywhere, or a region; also a checked country (or one holding a checked
  // place) that the counts have emptied (count 0).
  const found = (() => {
    if (!searching) return []
    const all = countryRows(counts, name, HTML_LANG[lang])
    const have = new Set(all.map((r) => r.value))
    for (const key of filterPlaceKeys(filter)) {
      let k: string | undefined = key
      while (k && parsePlaceKey(k)?.level !== 'country') k = parentKey(k)
      if (!k || have.has(k)) continue
      have.add(k)
      all.push({ value: k, label: name(k), count: 0, children: 0 })
    }
    return [...matchRows(rows.filter((r) => r.value.startsWith('n:')), q), ...matchRows(all, q)]
  })()
  const shown = searching ? found : rows
  const shownRegions = searching ? matchRows(regionList, q) : regionList
  const showFind = flat ? rows.length > SEARCH_FROM : rows.length > 0 || regionList.length > 0

  const toggleOpen = useCallback((key: string) => setOpen((prev) => {
    const next = new Set(prev)
    if (!next.delete(key)) next.add(key)
    return next
  }), [])
  const tree: Tree = { counts, filter, regions, flat, checked, open, toggleOpen, onToggle: (key) => onFilter(togglePlace(filter, key)), t }

  // Opened with places checked: the first checked row scrolled into the panel's view (focus stays with the panel).
  useLayoutEffect(() => {
    if (!checked.size) return
    headRef.current?.closest<HTMLElement>('.eb-places')?.querySelector<HTMLElement>('.eb-places-level input:checked')?.scrollIntoView?.({ block: 'nearest' })
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <div className="eb-places-head" ref={headRef}>
        <span className="eb-mono">{countHead(rows.length, level, rows.filter((r) => checked.has(r.value)).length, t)}</span>
        {hasPlaces(filter) && (
          <button type="button" className="eb-textbtn" data-testid="places-clear" onClick={() => onFilter(clearPlaces(filter))}>{t.filters.clear}</button>
        )}
      </div>
      {showFind && <PlacesFind level={level} q={q} onQ={setQ} />}
      {rows.length === 0 && regionList.length === 0 ? (
        <p className="eb-note">{t.places.none}</p>
      ) : (
        <>
          {(shown.length > 0 || shownRegions.length === 0) && (
            <ul className="eb-checklist eb-places-level" aria-label={t.places.head[level]}>
              {shown.map((r) => <PlaceNode key={r.value} row={r} depth={0} tree={tree} />)}
              {shown.length === 0 && <li className="eb-note eb-check-none">{t.places.noMatch[level]}</li>}
            </ul>
          )}
          {shownRegions.length > 0 && (
            <>
              <div className="eb-places-subhead">
                <span className="eb-mono">{countHead(shownRegions.length, 'region', shownRegions.filter((r) => checked.has(r.value)).length, t)}</span>
              </div>
              <ul className="eb-checklist eb-places-level" aria-label={t.places.head.region}>
                {shownRegions.map((r) => <PlaceNode key={r.value} row={r} depth={0} tree={tree} />)}
              </ul>
            </>
          )}
        </>
      )}
    </>
  )
}
