'use client'
// The filters, as on LifeList (framer-site): one level at a time. Before a choice, the level's row (a mono rank
// label, then chips with muted counts); once a parent is chosen, a breadcrumb ("All birds / Perching birds") and the
// next level's row. A level with one choice is never a step of its own (round 6): an order with one family shows its
// genera (the breadcrumb names the lone family), a family with one genus no genera (it keeps its families row, as a
// leaf). A leaf level's row stays, with the choice in Accent and the other chips stepped back. On phones the row is one button ("Choose an order 18") that
// opens the chips in a sheet.
// Taxonomy (orders, then families, then genera: scientific names, in italics) is the only filter outside the controls
// bar: Places and Time are the bar's Filters panel (Filters.tsx). The same on every page: the landing's sample, the
// birder's collage, a shared one. In the Tree view it is the tree's path (`tree`, from CollageView): the chosen order,
// family and genus are the branch the tree has open, and the breadcrumb ends with what the tree opens past the filter
// (a family or genus the shown index lacks), its steps going back.
import { memo, useMemo } from 'react'
import { useIsSheet } from '@/components/dialog-utils'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { options, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import { familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import { orderLabel } from '@/lib/species/orders'
import { LevelRow } from './LevelRow'
import './filters.css'

/** The Tree view's steps past the filter: each crumb's `open` goes back to it; `close` back to the filter's own last
 *  step. Given (even with no crumbs): the row is the tree's path. */
export type TreePath = { crumbs: { label: string; latin: boolean; open: () => void }[]; close: () => void }

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  /** Species index (family names). */
  species: SpeciesIndex
  /** In the Tree view: the tree's steps past the filter. */
  tree?: TreePath
}

type Level = 'order' | 'family' | 'genus'
/** The one taxonomy group: orders, then families, then genera; its words from `t.filters`. */
const LEVELS: readonly Level[] = ['order', 'family', 'genus']
const birds = (t: Ui) => ({ nav: t.filters.nav, all: t.filters.all })

/** The filter with `level` set to `value` and every level under it cleared (a family needs its order, a genus its
 *  family: `implied` gives the lone values a skipped step stands for). */
function withLevel(f: Filter, level: Level, value: string | undefined, implied: Partial<Record<Level, string>> = {}): Filter {
  const next: Filter = { ...f }
  const at = LEVELS.indexOf(level)
  LEVELS.forEach((l, i) => {
    if (i > at) delete next[l]
    else if (i < at && !next[l] && implied[l]) next[l] = implied[l]
  })
  next[level] = value
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

type Crumb = { label: string; latin: boolean; to?: Filter; onClick?: () => void }

export const FilterBar = memo(function FilterBar({ state, dispatch, species, tree }: Props) {
  const sheet = useIsSheet()
  const { t } = useI18n()
  const names = useNames() // family names follow the names file and the English switch
  const { list, filter, sci, seen } = state
  const BIRDS = birds(t)

  // The levels: each chosen one, or (its parent chosen) the one with a choice to make, counted on the list under the
  // other filters. A level with one option and nothing chosen is a lone step: named, never a row (`implied`).
  const steps = useMemo(() => {
    const out: { level: Level; value?: string; implied?: boolean; opts: ChipOption[] }[] = []
    let f: Filter = filter
    for (const level of LEVELS) {
      if (out.length && !out[out.length - 1].value) break
      const opts = level === 'order' || f[level === 'family' ? 'order' : 'family'] ? options(list, f, level, species, undefined, seen, familyName) : []
      if (filter[level]) out.push({ level, value: filter[level], opts })
      else if (level !== 'order' && opts.length === 1) {
        out.push({ level, value: opts[0].value, implied: true, opts })
        f = { ...f, [level]: opts[0].value }
      } else { if (opts.length) out.push({ level, opts }); break }
    }
    // A family's one genus is not named: the chosen family keeps its row (a leaf's), a lone family names itself.
    if (out[out.length - 1]?.implied && out[out.length - 1].level === 'genus') out.pop()
    return out
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  }, [list, filter, species, seen, names])
  const implied: Partial<Record<Level, string>> = {}
  for (const st of steps) if (st.implied) implied[st.level] = st.value

  const set = (level: Level, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value, implied) })
  const toggle = (level: Level, value: string) => set(level, filter[level] === value ? undefined : value)

  /** A level's value as shown: orders in the UI language, families by their names (the scientific names in Latin mode),
   *  genera always by their scientific name. */
  const latinAt = (level: Level) => level === 'genus' || sci
  const nameOf = (level: Level, v: string): string => {
    if (latinAt(level)) return v
    if (level === 'order') return orderLabel(v, t)
    return steps.find((st) => st.level === 'family')?.opts.find((o) => o.value === v)?.label ?? (() => { const r = species.rows.find((x) => x.fam === v); return r ? familyName(r) : v })()
  }
  const chipLabel = (level: FilterLevel, o: ChipOption) => (latinAt(level as Level) ? o.value : level === 'order' ? orderLabel(o.value, t) : o.label)

  // The level on show: the last step, when it has a choice to make or is chosen (a leaf keeps its row, its choice in
  // Accent); none when the path ends on a lone step. The breadcrumb, once an order is chosen: "All birds / Perching
  // birds / Crows". The last step is the current place; a step with a chosen level under it goes back to it; the
  // others (a lone step, or one with nothing chosen under it) are named, not buttons.
  const last = steps[steps.length - 1]
  const row = last && !last.implied ? last : undefined
  const crumbs: Crumb[] = []
  if (filter.order) {
    crumbs.push({ label: BIRDS.all, latin: false, to: withLevel(filter, 'order', undefined) })
    for (const st of steps) {
      if (!st.value) continue
      const under = LEVELS[LEVELS.indexOf(st.level) + 1]
      crumbs.push({ label: nameOf(st.level, st.value), latin: latinAt(st.level), ...(under && filter[under] ? { to: withLevel(filter, under, undefined) } : {}) })
    }
    // The tree's steps past the filter: the filter's last step goes back to it, each but the last to itself.
    if (tree?.crumbs.length) {
      crumbs[crumbs.length - 1].onClick = tree.close
      tree.crumbs.forEach((c, i) => crumbs.push({ label: c.label, latin: c.latin, onClick: i < tree.crumbs.length - 1 ? c.open : undefined }))
    }
  }
  const level = row?.level

  return (
    <section className="eb-filters" aria-label={t.filters.label} data-testid="filter-bar">
      <nav aria-label={BIRDS.nav} className="eb-levels">
        {crumbs.length > 0 && (
          <p className="eb-path">
            {crumbs.map((c, i) => {
              const end = i === crumbs.length - 1
              const lang = c.latin ? 'la' : undefined
              return (
                <span key={i} className="eb-path-item">
                  {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
                  {end ? <span aria-current="location" lang={lang}>{c.label}</span>
                    : c.onClick ? <button type="button" lang={lang} onClick={c.onClick}>{c.label}</button>
                      : c.to ? <button type="button" lang={lang} onClick={() => dispatch({ type: 'filter', filter: c.to! })}>{c.label}</button> : <span lang={lang}>{c.label}</span>}
                </span>
              )
            })}
          </p>
        )}
        {row && level && (
          <LevelRow
            level={level}
            options={row.opts}
            label={chipLabel}
            latin={latinAt(level)}
            value={row.value}
            chosenName={row.value ? nameOf(level, row.value) : undefined}
            sheet={sheet}
            onPick={(v) => toggle(level, v)}
          />
        )}
      </nav>
    </section>
  )
})
