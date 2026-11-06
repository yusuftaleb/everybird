'use client'
// The filters, as on LifeList (framer-site): one level at a time. Before a choice, the level's row (a mono rank
// label, then chips with muted counts); once a parent is chosen, a breadcrumb ("All birds / Perching birds") and the
// next level's row (none for an order with one family: the breadcrumb ends with that family). A leaf level's row
// stays, with the choice in Accent and the other chips stepped back. On phones the row is one button ("Choose an
// order 18") that opens the chips in a sheet.
// Taxonomy (orders, then families) is always on show. Everybird's extra dimensions, Places (the map, then countries)
// and Time (the timeline: a range of months, trips, Play; Timeline.tsx), are toggles that open their panel (one at a
// time; tap again to close). Opening or closing a panel never changes the filter; what a closed panel has chosen shows as a
// removable chip beside the toggles.
import { memo, useId, useMemo, useState } from 'react'
import { useIsSheet } from '@/components/dialog-utils'
import { ChevronDownIcon, CloseIcon } from '@/components/collage/icons'
import { CountryMap } from '@/components/map/CountryMap'
import { flagEmoji } from '@/lib/flag'
import { closedPanelLevels, togglePanel, type Panel, type PanelKey } from '@/lib/list/filter-panels'
import { options, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { rangeLabel, type Month } from '@/lib/list/timeline'
import type { Action, AppState } from '@/lib/list/store'
import { stripBracket } from '@/lib/import/places'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import type { CountryDots, Regions } from '@/lib/species/types'
import { Chip } from './Chip'
import { SheetPicker } from './SheetPicker'
import { Timeline } from './Timeline'
import type { PlayControls } from './use-play'
import './filters.css'

export type { Panel } from '@/lib/list/filter-panels'

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  /** Species index (family names). */
  species: SpeciesIndex
  /** Country names. */
  regions: Regions
  /** Dotted map data; without it the Places panel shows only chips. */
  dots?: CountryDots
  /** Panels to leave out (a shared link that carries no places or dates). */
  hidePanels?: readonly Panel[]
  /** The open panel, when the parent keeps it. */
  panel?: Panel | null
  onPanel?: (p: Panel | null) => void
  /**
   * One scrollable strip (the landing sample, so the birds keep the first screen): the Places and Time toggles, then
   * the taxonomy's breadcrumb and chips on one line at every width (no phone sheet for taxonomy), as /lifelist's
   * phone row does. An open panel still opens below the strip.
   */
  compact?: boolean
  /** The Time panel's timeline: the known entries, the whole list's months, today, and Play. */
  time?: { entries: ListEntry[]; months: Month[]; today: Month; play: PlayControls; onPlay: () => void; onPreview?: (r: { from?: Month; to?: Month } | null) => void }
}

type Level = FilterLevel
type Group = { id: 'birds' | Panel; label: string; nav: string; all: string; levels: [Level, Level?] }
const BIRDS: Group = { id: 'birds', label: 'Birds', nav: 'Filter by group', all: 'All birds', levels: ['order', 'family'] }
const PANELS: (Group & { id: Panel })[] = [
  { id: 'places', label: 'Places', nav: 'Filter by place', all: 'All places', levels: ['country'] },
  { id: 'time', label: 'Time', nav: 'Filter by time', all: 'All time', levels: ['trip'] }, // the timeline, not chips
]
const RANK: Record<Level, string> = { order: 'Orders', family: 'Families', country: 'Countries', year: 'Years', trip: 'Trips' }
/** Levels named by a scientific name (shown in Latin when Scientific names are on). */
const LATIN = new Set<Level>(['order', 'family'])

/** A change of one level; clearing an order also clears its family. (Time is the timeline's: no year or trip chips.) */
function withLevel(f: Filter, level: Level, value: string | undefined): Filter {
  const next: Filter = { ...f, [level]: value }
  if (level === 'order') delete next.family
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

type Crumb = { label: string; latin: boolean; to?: Filter }

/** A country chip's label: the flag (decorative, hidden from screen readers) before the name. */
function CountryLabel({ iso, name }: { iso: string; name: string }) {
  const flag = flagEmoji(iso)
  return flag ? <><span className="eb-flag" aria-hidden="true">{flag}</span>{name}</> : <>{name}</>
}

export const FilterBar = memo(function FilterBar({ state, dispatch, species, regions, dots, hidePanels, panel: panelProp, onPanel, compact, time }: Props) {
  const panels = useMemo(() => (hidePanels?.length ? PANELS.filter((p) => !hidePanels.includes(p.id)) : PANELS), [hidePanels])
  const [ownPanel, setOwnPanel] = useState<Panel | null>(null)
  const requested = panelProp !== undefined ? panelProp : ownPanel
  const open = panels.find((p) => p.id === requested) ?? null
  const setPanel = (p: Panel | null) => { setOwnPanel(p); onPanel?.(p) }
  const sheet = useIsSheet()
  const base = useId()
  const { list, trips, filter, sci } = state

  const countryName = useMemo(
    () => (iso: string) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso),
    [regions],
  )
  // Only the levels on show are counted: orders always and the open panel's top level (Places counts countries for the
  // map); a child level (families, trips) only once its parent is chosen.
  const opts = useMemo(() => {
    const out: Partial<Record<Level, ChipOption[]>> = {}
    for (const g of [BIRDS, ...(open && open.id !== 'time' ? [open] : [])]) {
      const [top, child] = g.levels
      out[top] = options(list, filter, top, species, trips, countryName)
      if (child && filter[top]) out[child] = options(list, filter, child, species, trips, countryName)
    }
    return out
  }, [list, filter, species, trips, countryName, open])
  const countryCounts = useMemo(() => new Map((opts.country ?? []).map((c) => [c.value, c.count])), [opts.country])

  const set = (level: Level, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value) })
  /** Remove a closed panel's choice: a range takes its ends, a trip its months too. */
  const remove = (k: PanelKey) => {
    if (k !== 'range' && k !== 'trip') return set(k, undefined)
    const next: Filter = { ...filter }
    delete next.from; delete next.to; delete next.trip
    dispatch({ type: 'filter', filter: next })
  }
  const panelName = (k: PanelKey) => (k === 'range' ? rangeLabel(filter.from, filter.to) ?? '' : nameOf(k, filter[k]!))
  const toggle = (level: Level, value: string) => set(level, filter[level] === value ? undefined : value)

  /** The label of a level's value: plain English, or the scientific name for orders and families in Latin mode. */
  const nameOf = (level: Level, v: string): string => {
    if (sci && LATIN.has(level)) return v
    if (level === 'order') return orderLabel(v)
    if (level === 'country') return countryName(v)
    if (level === 'trip') return trips.find((t) => t.id === v)?.label ?? v
    if (level === 'family') return opts.family?.find((o) => o.value === v)?.label ?? species.rows.find((r) => r.fam === v)?.famCom ?? v
    return v
  }
  const chipText = (level: Level, o: ChipOption) => (sci && LATIN.has(level) ? o.value : o.label)
  const chipLabel = (level: Level, o: ChipOption) => (level === 'country' ? <CountryLabel iso={o.value} name={o.label} /> : chipText(level, o))

  /** A group's breadcrumb and its level on show (chips, or the phone's sheet button; chips always in the strip). */
  const levels = (g: Group, strip = false) => {
    // The level on show: the first level with nothing chosen whose parent is chosen, else the deepest chosen one (a
    // leaf keeps its row). An order with one family skips the families row: the breadcrumb names that family instead
    // (every bird of the order is in it).
    const [top, child] = g.levels
    const childOpts = child ? opts[child] ?? [] : []
    const onlyChild = top === 'order' && !!child && !!filter[top] && !filter[child] && childOpts.length === 1
    const level: Level | null = !filter[top] ? top : child ? (onlyChild || !childOpts.length ? null : child) : top

    // The breadcrumb, once the top level has a choice: "All birds / Perching birds / Crows". The current place is in
    // Accent; the others go back up. A single family is named but not a button (there is no level to go back to).
    const crumbs: Crumb[] = []
    if (filter[top]) {
      crumbs.push({ label: g.all, latin: false, to: g.levels.reduce<Filter>((f, l) => (l ? withLevel(f, l, undefined) : f), filter) })
      const topCrumb: Crumb = { label: nameOf(top, filter[top]!), latin: sci && LATIN.has(top) }
      if (child && filter[child]) {
        crumbs.push({ ...topCrumb, to: withLevel(filter, child, undefined) })
        crumbs.push({ label: nameOf(child, filter[child]!), latin: sci && LATIN.has(child) })
      } else if (onlyChild && child) {
        crumbs.push(topCrumb)
        crumbs.push({ label: chipText(child, childOpts[0]), latin: sci && LATIN.has(child) })
      } else crumbs.push(topCrumb)
    }
    const levelOpts = level ? opts[level] ?? [] : []
    const chosen = level ? filter[level] : undefined
    const latin = !!level && sci && LATIN.has(level)
    return (
      <nav aria-label={g.nav} className="eb-levels">
        {crumbs.length > 0 && (
          <p className="eb-path">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1
              const lang = c.latin ? 'la' : undefined
              return (
                <span key={i} className="eb-path-item">
                  {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
                  {last ? <span aria-current="location" lang={lang}>{c.label}</span> : c.to ? <button type="button" lang={lang} onClick={() => dispatch({ type: 'filter', filter: c.to! })}>{c.label}</button> : <span lang={lang}>{c.label}</span>}
                </span>
              )
            })}
          </p>
        )}
        {level && levelOpts.length > 0 && (
          sheet && !strip ? (
            <SheetPicker
              key={level}
              level={level}
              options={levelOpts}
              label={chipLabel}
              latin={latin}
              chosen={chosen ? nameOf(level, chosen) : undefined}
              value={chosen}
              onPick={(v) => toggle(level, v)}
            />
          ) : (
            <div className="eb-level" role="group" aria-label={RANK[level]} data-chosen={chosen ? '' : undefined} data-testid={`level-${level}`}>
              <span className="eb-mono eb-level-label" aria-hidden="true">{RANK[level]}</span>
              {levelOpts.map((o) => (
                <Chip key={o.value} label={chipLabel(level, o)} latin={latin} count={o.count} selected={chosen === o.value} onClick={() => toggle(level, o.value)} />
              ))}
            </div>
          )
        )}
      </nav>
    )
  }

  // What closed panels have chosen, as removable chips beside the toggles.
  const others = closedPanelLevels(filter, open?.id ?? null, hidePanels)
  const toggles = (panels.length > 0 || others.length > 0) && (
    <div className="eb-toggles">
      {panels.map((p) => (
        <button
          key={p.id}
          type="button"
          className="eb-tab eb-toggle"
          aria-expanded={open?.id === p.id}
          aria-controls={open?.id === p.id ? `${base}-panel-${p.id}` : undefined}
          data-testid={`filter-tab-${p.id}`}
          onClick={() => setPanel(togglePanel(open?.id ?? null, p.id))}
        >
          {p.label}
          <ChevronDownIcon className="eb-toggle-caret" />
        </button>
      ))}
      {others.length > 0 && (
        <div className="eb-level eb-active" role="group" aria-label="Active filters" data-testid="active-filters">
          {others.map((l) => {
            const label = panelName(l)
            return (
              <Chip key={l} label={l === 'country' ? <CountryLabel iso={filter.country!} name={label} /> : label} selected removeLabel={label} onClick={() => remove(l)}>
                <CloseIcon className="eb-chip-x" />
              </Chip>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <section className="eb-filters" aria-label="Filters" data-testid="filter-bar" data-compact={compact ? '' : undefined}>
      {compact ? (
        <div className="eb-strip" data-testid="filter-strip">
          {toggles}
          {levels(BIRDS, true)}
        </div>
      ) : toggles}

      {open && (
        <div id={`${base}-panel-${open.id}`} role="region" aria-label={open.label} className="eb-panel" data-map={open.id === 'places' && dots ? '' : undefined} data-testid={`filter-panel-${open.id}`}>
          {open.id === 'places' && dots && (
            <CountryMap dots={dots} counts={countryCounts} selected={filter.country} onSelect={(iso) => set('country', iso)} countryName={countryName} />
          )}
          {open.id === 'time' ? (time && (
            <Timeline
              entries={time.entries}
              trips={trips}
              filter={filter}
              species={species}
              months={time.months}
              today={time.today}
              onFilter={(f) => dispatch({ type: 'filter', filter: f })}
              countryName={countryName}
              play={time.play}
              onPlay={time.onPlay}
              onPreview={time.onPreview}
            />
          )) : levels(open)}
        </div>
      )}

      {!compact && levels(BIRDS)}
    </section>
  )
})
