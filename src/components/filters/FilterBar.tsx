'use client'
// The filters, as on LifeList (framer-site): one level at a time. Before a choice, the level's row (a mono rank
// label, then chips with muted counts); once a parent is chosen, a breadcrumb ("All birds / Perching birds") and the
// next level's row (none for an order with one family: the breadcrumb ends with that family). A leaf level's row
// stays, with the choice in Accent and the other chips stepped back. On phones the row is one button ("Choose an
// order 18") that opens the chips in a sheet.
// Taxonomy (orders, then families) is the only filter outside the controls bar: Places and Time are the bar's
// dropdowns (FilterDropdowns.tsx). The same on every page: the landing's sample, the birder's collage, a shared one.
import { memo, useMemo } from 'react'
import { useIsSheet } from '@/components/dialog-utils'
import { options, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'
import { LevelRow } from './LevelRow'
import './filters.css'

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  /** Species index (family names). */
  species: SpeciesIndex
}

type Level = 'order' | 'family'
type Group = { label: string; nav: string; all: string; levels: [Level, Level?] }
const BIRDS: Group = { label: 'Birds', nav: 'Filter by group', all: 'All birds', levels: ['order', 'family'] }
/** Levels named by a scientific name (shown in Latin when Scientific names are on). */
const LATIN = new Set<Level>(['order', 'family'])

/** A change of one level; clearing an order also clears its family. */
function withLevel(f: Filter, level: Level, value: string | undefined): Filter {
  const next: Filter = { ...f, [level]: value }
  if (level === 'order') delete next.family
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

type Crumb = { label: string; latin: boolean; to?: Filter }

export const FilterBar = memo(function FilterBar({ state, dispatch, species }: Props) {
  const sheet = useIsSheet()
  const { list, filter, sci, seen } = state

  // Only the levels on show are counted: orders always, families once an order is chosen.
  const opts = useMemo(() => {
    const out: Partial<Record<Level, ChipOption[]>> = {}
    const [top, child] = BIRDS.levels
    out[top] = options(list, filter, top, species, undefined, seen)
    if (child && filter[top]) out[child] = options(list, filter, child, species, undefined, seen)
    return out
  }, [list, filter, species, seen])

  const set = (level: Level, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value) })
  const toggle = (level: Level, value: string) => set(level, filter[level] === value ? undefined : value)

  /** The label of a level's value: plain English, or the scientific name for orders and families in Latin mode. */
  const nameOf = (level: Level, v: string): string => {
    if (sci && LATIN.has(level)) return v
    if (level === 'order') return orderLabel(v)
    return opts.family?.find((o) => o.value === v)?.label ?? species.rows.find((r) => r.fam === v)?.famCom ?? v
  }
  const chipText = (level: Level, o: ChipOption) => (sci && LATIN.has(level) ? o.value : o.label)
  const chipLabel = (level: FilterLevel, o: ChipOption) => chipText(level as Level, o)

  /** A group's breadcrumb and its level on show (chips, or the phone's sheet button). */
  const levels = (g: Group) => {
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
        {level && (
          <LevelRow
            level={level}
            options={levelOpts}
            label={chipLabel}
            latin={latin}
            value={chosen}
            chosenName={chosen ? nameOf(level, chosen) : undefined}
            sheet={sheet}
            onPick={(v) => toggle(level, v)}
          />
        )}
      </nav>
    )
  }

  return (
    <section className="eb-filters" aria-label="Filters" data-testid="filter-bar">
      {levels(BIRDS)}
    </section>
  )
})
