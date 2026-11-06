'use client'
// The filters, as on LifeList (framer-site): one level at a time. Before a choice, the level's row (a mono rank
// label, then chips with muted counts); once a parent is chosen, a breadcrumb ("All birds / Perching birds") and the
// next level's row (none for an order with one family: the breadcrumb ends with that family). A leaf level's row
// stays, with the choice in Accent and the other chips stepped back. On phones the row is one button ("Choose an
// order 18") that opens the chips in a sheet. Everybird's extra dimensions, Places (with the map) and Time (years,
// then trips), sit in tabs and follow the same pattern.
import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useIsSheet } from '@/components/dialog-utils'
import { CloseIcon, FilterLinesIcon } from '@/components/collage/icons'
import { CountryMap } from '@/components/map/CountryMap'
import { options, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { Action, AppState } from '@/lib/list/store'
import { stripBracket } from '@/lib/import/places'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import type { CountryDots, Regions } from '@/lib/species/types'
import { Chip } from './Chip'
import { PickerSheet } from './PickerSheet'
import './filters.css'

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  /** Species index (family names). */
  species: SpeciesIndex
  /** Country names. */
  regions: Regions
  /** Dotted map data; without it the Places tab shows only chips. */
  dots?: CountryDots
  /** Tabs to leave out (a shared link that carries no places or dates). */
  hideTabs?: readonly Tab[]
  /** The open tab, when the parent keeps it (a search pick of an order or family opens Birds). */
  tab?: Tab
  onTab?: (t: Tab) => void
}

export type Tab = 'birds' | 'places' | 'time'
type Level = FilterLevel
const ALL_TABS: { id: Tab; label: string; nav: string; all: string; levels: Level[] }[] = [
  { id: 'birds', label: 'Birds', nav: 'Filter by group', all: 'All birds', levels: ['order', 'family'] },
  { id: 'places', label: 'Places', nav: 'Filter by place', all: 'All places', levels: ['country'] },
  { id: 'time', label: 'Time', nav: 'Filter by time', all: 'All time', levels: ['year', 'trip'] },
]
const RANK: Record<Level, string> = { order: 'Orders', family: 'Families', country: 'Countries', year: 'Years', trip: 'Trips' }
const NOUN: Record<Level, string> = { order: 'an order', family: 'a family', country: 'a country', year: 'a year', trip: 'a trip' }
/** Levels named by a scientific name (shown in Latin when Scientific names are on). */
const LATIN = new Set<Level>(['order', 'family'])

/** A change of one level; clearing a parent also clears its child (family under order, trip under year). */
function withLevel(f: Filter, level: Level, value: string | undefined): Filter {
  const next: Filter = { ...f, [level]: value }
  if (level === 'order') delete next.family
  if (level === 'year') delete next.trip
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

type Crumb = { label: string; latin: boolean; to?: Filter }

export const FilterBar = memo(function FilterBar({ state, dispatch, species, regions, dots, hideTabs, tab: tabProp, onTab }: Props) {
  const TABS = useMemo(() => (hideTabs?.length ? ALL_TABS.filter((t) => !hideTabs.includes(t.id)) : ALL_TABS), [hideTabs])
  const [ownTab, setOwnTab] = useState<Tab>('birds')
  const tab = tabProp ?? ownTab
  const setTab = (t: Tab) => { setOwnTab(t); onTab?.(t) }
  const sheet = useIsSheet()
  const base = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const { list, trips, filter, sci } = state

  const countryName = useMemo(
    () => (iso: string) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso),
    [regions],
  )
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  // Only the active tab's levels are counted (the Places tab counts countries for the map too).
  const opts = useMemo(() => {
    const out: Partial<Record<Level, ChipOption[]>> = {}
    for (const l of active.levels) out[l] = options(list, filter, l, species, trips, countryName)
    return out as Record<Level, ChipOption[]>
  }, [list, filter, species, trips, countryName, active])
  const countryCounts = useMemo(() => new Map((opts.country ?? []).map((c) => [c.value, c.count])), [opts.country])

  const set = (level: Level, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value) })
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
  const chipLabel = (level: Level, o: ChipOption) => (sci && LATIN.has(level) ? o.value : o.label)

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (j < 0) return
    e.preventDefault()
    setTab(TABS[j].id)
    tabRefs.current[TABS[j].id]?.focus()
  }

  // The level on show: the first level with nothing chosen whose parent is chosen, else the deepest chosen one (a
  // leaf keeps its row). An order with one family skips the families row: the breadcrumb names that family instead
  // (every bird of the order is in it; a year's one trip is not the whole year, so trips keep their row).
  const [top, child] = active.levels as [Level, Level | undefined]
  const childOpts = child ? opts[child] ?? [] : []
  const families = useMemo(
    () => (active.id === 'birds' && filter.order && !filter.family ? options(list, filter, 'family', species, trips, countryName) : null),
    [active.id, list, filter, species, trips, countryName],
  )
  const onlyChild = top === 'order' && !!child && !!filter[top] && !filter[child] && families?.length === 1
  const level: Level | null = !filter[top] ? top : child ? (onlyChild || !childOpts.length ? null : child) : top

  // The breadcrumb, once the top level has a choice: "All birds / Perching birds / Crows". The current place is in
  // Accent; the others go back up. A single family is named but not a button (there is no level to go back to).
  const crumbs: Crumb[] = []
  if (filter[top]) {
    crumbs.push({ label: active.all, latin: false, to: active.levels.reduce<Filter>((f, l) => withLevel(f, l, undefined), filter) })
    const topCrumb: Crumb = { label: nameOf(top, filter[top]!), latin: sci && LATIN.has(top) }
    if (child && filter[child]) {
      crumbs.push({ ...topCrumb, to: withLevel(filter, child, undefined) })
      crumbs.push({ label: nameOf(child, filter[child]!), latin: sci && LATIN.has(child) })
    } else if (onlyChild && child) {
      crumbs.push(topCrumb)
      crumbs.push({ label: chipLabel(child, families![0]), latin: sci && LATIN.has(child) })
    } else crumbs.push(topCrumb)
  }

  // Active filters from the other tabs, as removable chips.
  const others = TABS.filter((t) => t.id !== active.id).flatMap((t) => t.levels.filter((l) => filter[l]))
  const levelOpts = level ? opts[level] ?? [] : []
  const chosen = level ? filter[level] : undefined

  return (
    <section className="eb-filters" aria-label="Filters" data-testid="filter-bar">
      {TABS.length > 1 && (
        <div className="eb-tabs" role="tablist" aria-label="Filter by">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => { tabRefs.current[t.id] = el }}
              type="button"
              role="tab"
              id={`${base}-tab-${t.id}`}
              aria-selected={active.id === t.id}
              aria-controls={active.id === t.id ? `${base}-panel-${t.id}` : undefined}
              tabIndex={active.id === t.id ? 0 : -1}
              className="eb-tab"
              data-testid={`filter-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              onKeyDown={(e) => onTabKey(e, i)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div role="tabpanel" id={`${base}-panel-${active.id}`} aria-labelledby={TABS.length > 1 ? `${base}-tab-${active.id}` : undefined} className="eb-panel" data-map={active.id === 'places' && dots ? '' : undefined}>
        {active.id === 'places' && dots && (
          <CountryMap dots={dots} counts={countryCounts} selected={filter.country} onSelect={(iso) => set('country', iso)} countryName={countryName} />
        )}
        <nav aria-label={active.nav} className="eb-levels">
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
            sheet ? (
              <SheetPicker
                key={level}
                level={level}
                options={levelOpts}
                label={chipLabel}
                latin={sci && LATIN.has(level)}
                chosen={chosen ? nameOf(level, chosen) : undefined}
                value={chosen}
                onPick={(v) => toggle(level, v)}
              />
            ) : (
              <div className="eb-level" role="group" aria-label={RANK[level]} data-chosen={chosen ? '' : undefined} data-testid={`level-${level}`}>
                <span className="eb-mono eb-level-label" aria-hidden="true">{RANK[level]}</span>
                {levelOpts.map((o) => (
                  <Chip key={o.value} label={chipLabel(level, o)} latin={sci && LATIN.has(level)} count={o.count} selected={chosen === o.value} onClick={() => toggle(level, o.value)} />
                ))}
              </div>
            )
          )}
        </nav>
      </div>

      {others.length > 0 && (
        <div className="eb-level eb-active" role="group" aria-label="Active filters" data-testid="active-filters">
          {others.map((l) => {
            const label = nameOf(l, filter[l]!)
            return (
              <Chip key={l} label={label} latin={sci && LATIN.has(l)} selected removeLabel={label} onClick={() => set(l, undefined)}>
                <CloseIcon className="eb-chip-x" />
              </Chip>
            )
          })}
        </div>
      )}
    </section>
  )
})

type PickerProps = {
  level: Level
  options: ChipOption[]
  label: (level: Level, o: ChipOption) => string
  latin: boolean
  chosen?: string
  value?: string
  onPick: (v: string) => void
}

/** Phone: one button; it reads "Choose an order 18" or the chosen group's name, and opens the chips in a sheet. */
function SheetPicker({ level, options: opts, label, latin, chosen, value, onPick }: PickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        className="eb-pick"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-selected={chosen ? '' : undefined}
        data-testid={`picker-${level}`}
        onClick={() => setOpen(true)}
      >
        <FilterLinesIcon />
        <span className="eb-pick-label" lang={chosen && latin ? 'la' : undefined}>{chosen ?? `Choose ${NOUN[level]}`}</span>{' '}
        <span className="eb-count">{opts.length}</span>
      </button>
      {open && (
        <PickerSheet title={RANK[level]} count={opts.length} onClose={() => setOpen(false)}>
          <div className="eb-picklist" data-chosen={value ? '' : undefined}>
            {opts.map((o) => (
              <Chip key={o.value} label={label(level, o)} latin={latin} count={o.count} selected={value === o.value} onClick={() => { onPick(o.value); setOpen(false) }} />
            ))}
          </div>
        </PickerSheet>
      )}
    </>
  )
}
