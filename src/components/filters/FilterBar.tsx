'use client'
// The taxonomy filter, as on LifeList (framer-site): one level at a time. Before a choice, the level's chips (a mono rank
// label, then chips with muted counts); once a parent is chosen, a breadcrumb ("All birds / Perching birds") and the
// next level's chips. A level with one choice is never a step of its own (round 6): an order with one family shows its
// genera (the breadcrumb names the lone family), a family with one genus no genera (it keeps its families row, as a
// leaf). A leaf level's row stays, with the choice in Accent and the other chips stepped back.
// The chips live in the controls bar's Taxa panel (TaxaChips, in TaxaPanel.tsx; Yusuf, 2026-11-20, round 6): on the page
// only the breadcrumb stays under the dock once a taxon is picked (FilterBar), its earlier steps going back. The same on
// every page: the landing's sample, the birder's collage, a shared one. In the Tree view it is the tree's path (`tree`,
// from CollageView): the chosen order, family and genus are the branch the tree has open, and the breadcrumb ends with
// what the tree opens past the filter (a family or genus the shown index lacks), its steps going back. A marked tree
// branch opened as a filter (Filter.with) reads as the row does: "Netta with Aythya".
import { memo, useMemo, type ReactNode } from 'react'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { options, taxonLevel, type ChipOption, type Filter, type FilterLevel } from '@/lib/list/filters'
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

export type TaxonLevel = 'order' | 'family' | 'genus'
/** The one taxonomy group: orders, then families, then genera; its words from `t.filters`. */
const LEVELS: readonly TaxonLevel[] = ['order', 'family', 'genus']

/** The filter with `level` set to `value` and every level under it cleared (a family needs its order, a genus its
 *  family: `implied` gives the lone values a skipped step stands for); a marked branch's `with` always goes. */
function withLevel(f: Filter, level: TaxonLevel, value: string | undefined, implied: Partial<Record<TaxonLevel, string>> = {}): Filter {
  const next: Filter = { ...f }
  delete next.with
  const at = LEVELS.indexOf(level)
  LEVELS.forEach((l, i) => {
    if (i > at) delete next[l]
    else if (i < at && !next[l] && implied[l]) next[l] = implied[l]
  })
  next[level] = value
  for (const k of Object.keys(next) as (keyof Filter)[]) if (!next[k]) delete next[k]
  return next
}

/** A breadcrumb step: `text` its words in one string (the Taxa button's spoken name). */
type Crumb = { label: ReactNode; text: string; latin: boolean; to?: Filter; onClick?: () => void }

export type Taxa = {
  crumbs: Crumb[]
  /** The level whose chips show (none: the path ends on a lone step, or nothing to choose). */
  row?: { level: TaxonLevel; value?: string; opts: ChipOption[] }
  /** The row's parent's values (the order and family, a skipped lone step's included), for the head's totals. */
  parent: Partial<Record<TaxonLevel, string>>
  chipLabel: (level: FilterLevel, o: ChipOption) => ReactNode
  latin: (level: TaxonLevel) => boolean
  nameOf: (level: TaxonLevel, v: string) => string
  toggle: (level: TaxonLevel, v: string) => void
  go: (to: Filter) => void
}

/** The taxonomy's levels, breadcrumb and chips for `state` (FilterBar's path on the page, TaxaChips in the Taxa panel). */
export function useTaxa({ state, dispatch, species, tree }: Props): Taxa {
  const { t } = useI18n()
  const names = useNames() // family names follow the names file and the English switch
  const { list, filter, sci, seen } = state

  // The levels: each chosen one, or (its parent chosen) the one with a choice to make, counted on the list under the
  // other filters. A level with one option and nothing chosen is a lone step: named, never a row (`implied`).
  const steps = useMemo(() => {
    const out: { level: TaxonLevel; value?: string; implied?: boolean; opts: ChipOption[] }[] = []
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
  const implied: Partial<Record<TaxonLevel, string>> = {}
  for (const st of steps) if (st.implied) implied[st.level] = st.value

  const set = (level: TaxonLevel, value: string | undefined) => dispatch({ type: 'filter', filter: withLevel(filter, level, value, implied) })
  // The chosen chip clears its level; with a marked branch's `with` on that level it first narrows to the chip alone.
  const toggle = (level: TaxonLevel, value: string) => set(level, filter[level] === value && !(filter.with?.length && taxonLevel(filter) === level) ? undefined : value)

  /** A level's value as shown: orders in the UI language, families by their names (the scientific names in Latin mode),
   *  genera always by their scientific name. */
  const latin = (level: TaxonLevel) => level === 'genus' || sci
  const nameOf = (level: TaxonLevel, v: string): string => {
    if (latin(level)) return v
    if (level === 'order') return orderLabel(v, t)
    return steps.find((st) => st.level === 'family')?.opts.find((o) => o.value === v)?.label ?? (() => { const r = species.rows.find((x) => x.fam === v); return r ? familyName(r) : v })()
  }
  const chipLabel = (level: FilterLevel, o: ChipOption) => (latin(level as TaxonLevel) ? o.value : level === 'order' ? orderLabel(o.value, t) : o.label)

  // The level on show: the last step, when it has a choice to make or is chosen (a leaf keeps its row, its choice in
  // Accent); none when the path ends on a lone step. The breadcrumb, once an order is chosen: "All birds / Perching
  // birds / Crows". The last step is the current place; a step with a chosen level under it goes back to it; the
  // others (a lone step, or one with nothing chosen under it) are named, not buttons.
  const last = steps[steps.length - 1]
  const row = last && !last.implied ? last : undefined
  const crumbs: Crumb[] = []
  if (filter.order) {
    crumbs.push({ label: t.filters.all, text: t.filters.all, latin: false, to: withLevel(filter, 'order', undefined) })
    const deepest = steps.filter((st) => st.value && !st.implied).pop()
    for (const st of steps) {
      if (!st.value) continue
      const under = LEVELS[LEVELS.indexOf(st.level) + 1]
      const to = under && filter[under] ? { to: withLevel(filter, under, undefined) } : {}
      const name = nameOf(st.level, st.value)
      if (st === deepest && filter.with?.length) {
        const w = withLabel(name, filter.with.map((v) => nameOf(st.level, v)), latin(st.level), st.level, t)
        crumbs.push({ ...w, latin: false, ...to })
      } else crumbs.push({ label: name, text: name, latin: latin(st.level), ...to })
    }
    // The tree's steps past the filter: the filter's last step goes back to it, each but the last to itself.
    if (tree?.crumbs.length) {
      crumbs[crumbs.length - 1].onClick = tree.close
      tree.crumbs.forEach((c, i) => crumbs.push({ label: c.label, text: c.label, latin: c.latin, onClick: i < tree.crumbs.length - 1 ? c.open : undefined }))
    }
  }
  const parent: Partial<Record<TaxonLevel, string>> = { order: filter.order ?? implied.order, family: filter.family ?? implied.family }
  return { crumbs, row, parent, chipLabel, latin, nameOf, toggle, go: (to) => dispatch({ type: 'filter', filter: to }) }
}

/** "Netta with Aythya", "Macropygia with Turacoena and Reinwardtoena", "Vauriella with 12 other genera": a marked tree
 *  branch's pick, in the tree row's own words (`t.collage.tree.withOne`, `withTwo`, `withMany`). */
function withLabel(name: string, others: string[], latin: boolean, level: TaxonLevel, t: Ui): { label: ReactNode; text: string } {
  const tt = t.collage.tree
  const words = level === 'genus' && others.length > 2
    ? plural(tt.withMany, others.length, { n: formatInt(others.length, t.num) })
    : others.length > 1 ? fmt(tt.withTwo, { a: others.slice(0, -1).join(', '), b: others[others.length - 1] }) : fmt(tt.withOne, { a: others[0] })
  const lang = latin ? 'la' : undefined
  const tag = (chunk: string) => <span lang={lang}>{chunk}</span>
  return { label: <><span lang={lang}>{name}</span> {rich(words, { a: tag, b: tag })}</>, text: `${name} ${words.replace(/<\/?\w+>/g, '')}` }
}

/** The deepest taxon `f` picks, in words ("Ducks, Geese, and Waterfowl", "Netta with Aythya"): the Taxa button's spoken
 *  name after "Taxa: ". Undefined with none picked. */
export function pickWords(f: Filter, species: SpeciesIndex, sci: boolean, t: Ui): string | undefined {
  const level: TaxonLevel | undefined = f.genus ? 'genus' : f.family ? 'family' : f.order ? 'order' : undefined
  if (!level) return undefined
  const latin = level === 'genus' || sci
  const name = (v: string) => {
    if (latin) return v
    if (level === 'order') return orderLabel(v, t)
    const r = species.rows.find((x) => x.fam === v)
    return r ? familyName(r) : v
  }
  const v = f[level]!
  return f.with?.length ? withLabel(name(v), f.with.map(name), latin, level, t).text : name(v)
}

/** The breadcrumb ("All birds / Waterfowl / Ducks"): the current place in Accent, earlier steps going back. */
export function TaxaPath({ crumbs, go, className }: { crumbs: Taxa['crumbs']; go: Taxa['go']; className?: string }): ReactNode {
  if (!crumbs.length) return null
  return (
    <p className={className ? `eb-path ${className}` : 'eb-path'}>
      {crumbs.map((c, i) => {
        const end = i === crumbs.length - 1
        const lang = c.latin ? 'la' : undefined
        return (
          <span key={i} className="eb-path-item">
            {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
            {end ? <span aria-current="location" lang={lang}>{c.label}</span>
              : c.onClick ? <button type="button" lang={lang} onClick={c.onClick}>{c.label}</button>
                : c.to ? <button type="button" lang={lang} onClick={() => go(c.to!)}>{c.label}</button> : <span lang={lang}>{c.label}</span>}
          </span>
        )
      })}
    </p>
  )
}

/** The level's chips (LevelRow): the Taxa panel's body after its head and path. */
export function TaxaLevel({ taxa }: { taxa: Taxa }): ReactNode {
  const { row } = taxa
  if (!row) return null
  return (
    <LevelRow
      level={row.level}
      options={row.opts}
      label={taxa.chipLabel}
      latin={taxa.latin(row.level)}
      value={row.value}
      onPick={(v) => taxa.toggle(row.level, v)}
    />
  )
}

/** On the page, under the dock: only the breadcrumb, once a taxon is picked (the chips are the Taxa panel's). */
export const FilterBar = memo(function FilterBar(props: Props) {
  const { t } = useI18n()
  const taxa = useTaxa(props)
  if (!taxa.crumbs.length) return null
  return (
    <nav aria-label={t.filters.nav} className="eb-filters" data-testid="filter-bar">
      <TaxaPath crumbs={taxa.crumbs} go={taxa.go} />
    </nav>
  )
})
