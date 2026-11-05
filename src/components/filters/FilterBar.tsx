'use client'
import { Airplane, Bird, CalendarBlank, CaretRight, Feather, Globe, MapPin, type Icon } from '@phosphor-icons/react'
import { Fragment, memo, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useIsSheet } from '@/components/dialog-utils'
import { CountryMap } from '@/components/map/CountryMap'
import { options, type ChipOption, type Filter } from '@/lib/list/filters'
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
}

type Tab = 'birds' | 'places' | 'time'
type Level = 'order' | 'family' | 'country' | 'year' | 'trip'
const TABS: { id: Tab; label: string; icon: Icon; levels: Level[] }[] = [
  { id: 'birds', label: 'Birds', icon: Bird, levels: ['order', 'family'] },
  { id: 'places', label: 'Places', icon: Globe, levels: ['country'] },
  { id: 'time', label: 'Time', icon: CalendarBlank, levels: ['year', 'trip'] },
]
const LEVEL_ICON: Record<Level, Icon> = { order: Bird, family: Feather, country: MapPin, year: CalendarBlank, trip: Airplane }
const NOUN: Record<Level, string> = { order: 'an order', family: 'a family', country: 'a country', year: 'a year', trip: 'a trip' }
const ALL: Record<Tab, string> = { birds: 'All birds', places: 'All places', time: 'All time' }

/** A change of one level; clearing a parent also clears its child (family under order, trip under year). */
function withLevel(f: Filter, level: Level, value: string | undefined): Filter {
  const next: Filter = { ...f, [level]: value }
  if (level === 'order') delete next.family
  if (level === 'year') delete next.trip
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

export const FilterBar = memo(function FilterBar({ state, dispatch, species, regions, dots }: Props) {
  const [tab, setTab] = useState<Tab>('birds')
  const sheet = useIsSheet()
  const base = useId()
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const { list, trips, filter } = state

  const countryName = useMemo(
    () => (iso: string) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso),
    [regions],
  )
  // Only the active tab's levels are counted (the Places tab counts countries for the map too).
  const activeLevels = TABS.find((t) => t.id === tab)!.levels
  const opts = useMemo(() => {
    const out: Partial<Record<Level, ChipOption[]>> = {}
    for (const l of activeLevels) out[l] = options(list, filter, l, species, trips, countryName)
    return out as Record<Level, ChipOption[]>
  }, [list, filter, species, trips, countryName, activeLevels])
  const countryCounts = useMemo(() => new Map((opts.country ?? []).map((c) => [c.value, c.count])), [opts.country])

  const set = (level: Level, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value) })
  const toggle = (level: Level, value: string) => set(level, filter[level] === value ? undefined : value)

  /** The label of whatever is chosen at a level, if anything. */
  const chosenLabel = (level: Level): string | undefined => {
    const v = filter[level]
    if (!v) return undefined
    if (level === 'order') return orderLabel(v)
    if (level === 'country') return countryName(v)
    if (level === 'trip') return trips.find((t) => t.id === v)?.label ?? v
    if (level === 'family') return opts.family?.find((o) => o.value === v)?.label ?? species.rows.find((r) => r.fam === v)?.famCom ?? v
    return v
  }

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const j = e.key === 'ArrowRight' ? (i + 1) % TABS.length : e.key === 'ArrowLeft' ? (i + TABS.length - 1) % TABS.length : e.key === 'Home' ? 0 : e.key === 'End' ? TABS.length - 1 : -1
    if (j < 0) return
    e.preventDefault()
    setTab(TABS[j].id)
    tabRefs.current[TABS[j].id]?.focus()
  }

  const active = TABS.find((t) => t.id === tab)!
  // Active filters from the other tabs, as removable chips.
  const others = TABS.filter((t) => t.id !== tab).flatMap((t) => t.levels.filter((l) => filter[l]))

  const crumbs = (() => {
    const items: { label: string; to: Filter }[] = [{ label: ALL[tab], to: active.levels.reduce<Filter>((f, l) => withLevel(f, l, undefined), filter) }]
    active.levels.forEach((l, i) => {
      if (!filter[l]) return
      const upTo = active.levels.slice(i + 1).reduce<Filter>((f, k) => withLevel(f, k, undefined), filter)
      items.push({ label: chosenLabel(l) ?? '', to: upTo })
    })
    return items
  })()

  const chipRow = (level: Level): ReactNode => (
    <div className="eb-chip-row" role="group" aria-label={`${level[0].toUpperCase()}${level.slice(1)} chips`}>
      {(opts[level] ?? []).map((o) => (
        <Chip key={o.value} icon={LEVEL_ICON[level]} label={o.label} count={o.count} selected={filter[level] === o.value} onClick={() => toggle(level, o.value)} />
      ))}
    </div>
  )

  const levelControl = (level: Level): ReactNode => {
    if (level === 'family' && !filter.order) return null
    if (level === 'trip' && !filter.year) return null
    if (!sheet) return opts[level]?.length ? chipRow(level) : null
    return <SheetPicker key={level} level={level} options={opts[level] ?? []} chosen={chosenLabel(level)} value={filter[level]} onPick={(v) => toggle(level, v)} />
  }

  return (
    <section className="eb-filters" aria-label="Filters" data-testid="filter-bar">
      <div className="eb-tabs" role="tablist" aria-label="Filter by">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => { tabRefs.current[t.id] = el }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={tab === t.id ? `${base}-panel-${t.id}` : undefined}
            tabIndex={tab === t.id ? 0 : -1}
            className="eb-tab"
            data-testid={`filter-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKey(e, i)}
          >
            <t.icon aria-hidden="true" focusable="false" weight={tab === t.id ? 'fill' : 'regular'} />
            {t.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${base}-panel-${tab}`} aria-labelledby={`${base}-tab-${tab}`} className="eb-panel">
        <nav aria-label="Breadcrumb" className="eb-crumbs eb-mono">
          <ol>
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1
              return (
                <li key={i} aria-current={last ? 'step' : undefined}>
                  {i > 0 && <CaretRight aria-hidden="true" focusable="false" weight="bold" className="eb-crumb-sep" />}
                  {last ? c.label : <button type="button" onClick={() => dispatch({ type: 'filter', filter: c.to })}>{c.label}</button>}
                </li>
              )
            })}
          </ol>
        </nav>

        {tab === 'places' && dots && (
          <CountryMap dots={dots} counts={countryCounts} selected={filter.country} onSelect={(iso) => set('country', iso)} countryName={countryName} />
        )}
        {active.levels.map((l) => <Fragment key={l}>{levelControl(l)}</Fragment>)}
      </div>

      {others.length > 0 && (
        <div className="eb-chip-row eb-active" role="group" aria-label="Active filters" data-testid="active-filters">
          {others.map((l) => {
            const label = chosenLabel(l) ?? ''
            return <Chip key={l} icon={LEVEL_ICON[l]} label={label} selected removeLabel={label} onClick={() => set(l, undefined)} />
          })}
        </div>
      )}
    </section>
  )
})

/** Phone: one button; it reads "Choose an order 18" or the chosen group's name, and opens the chips in a sheet. */
function SheetPicker({ level, options: opts, chosen, value, onPick }: { level: Level; options: ChipOption[]; chosen?: string; value?: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const Glyph = LEVEL_ICON[level]
  if (!opts.length && !chosen) return null
  return (
    <>
      <button type="button" className="eb-chip eb-picker" data-selected={chosen ? '' : undefined} data-testid={`picker-${level}`} onClick={() => setOpen(true)}>
        <Glyph aria-hidden="true" focusable="false" weight={chosen ? 'fill' : 'regular'} className="eb-chip-icon" />
        <span className="eb-chip-label">{chosen ?? `Choose ${NOUN[level]} ${opts.length}`}</span>
      </button>
      {open && (
        <PickerSheet title={`Choose ${NOUN[level]}`} onClose={() => setOpen(false)}>
          <div className="eb-chip-row">
            {opts.map((o) => (
              <Chip key={o.value} icon={Glyph} label={o.label} count={o.count} selected={value === o.value} onClick={() => { onPick(o.value); setOpen(false) }} />
            ))}
          </div>
        </PickerSheet>
      )}
    </>
  )
}
