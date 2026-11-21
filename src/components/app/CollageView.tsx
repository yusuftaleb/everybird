'use client'
// The collage block shared by the landing sample, the birder's own collage and the shared view: the stats line, the
// controls bar (view tabs, the view's switches, Filters, the search), the filters, the collage, list, map or tree, the
// legend (in the tree, its oldest lineage), the hover tooltip and the bird card. The collage follows the Arrangement (Fit or
// Oval, arrangement.ts: the controls bar's menu in the Collage view and the share dialog's row are one setting).
// Composition after LifeList.tsx (framer-site).
import { trackFilterUsed } from '@/lib/analytics'
import { useArrangement } from '@/lib/arrangement'
import { newlySetKinds } from '@/lib/list/filter-kinds'
import { Fragment, lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BirdCard } from '@/components/collage/BirdCard'
import { BirdTip } from '@/components/collage/BirdTip'
import { Collage, revealBird } from '@/components/collage/Collage'
import { reduced } from '@/components/collage/collage-motion'
import { ListView } from '@/components/collage/ListView'
import { MapView } from '@/components/collage/MapView'
import { FilterBar, type TreePath } from '@/components/filters/FilterBar'
import { useFiltersUi, type FilterSection, type PlacesNote } from '@/components/filters/Filters'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt, formatMonth } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { latestLifer, liferOrder } from '@/lib/list/build-list'
import { hasSeenMonths } from '@/lib/list/seen'
import { applyFilter, drillTo, filterKey, filterToShow, genusOf, threatenedCount, type Filter } from '@/lib/list/filters'
import type { PlacesUnplaced } from '@/lib/list/filter-summary'
import type { ListEntry } from '@/lib/list/model'
import { monthBins, todayMonth } from '@/lib/list/timeline'
import type { Action, AppState } from '@/lib/list/store'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { CollageHit } from '@/lib/species/name-search'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { ShareAt } from '@/lib/share/view-image'
import type { TreeShown } from '@/components/tree/TreeView'
import { loadTree } from '@/lib/tree/load'
import { closeDeep, openBranch, treeBranch, type OpenBranch, type TreeDeep } from '@/lib/tree/path'
import { formatAge, oldestLineage, type Tree } from '@/lib/tree/tree'
import { useTreeMine } from '@/lib/tree-mine'
import { useVariant } from '@/lib/variants'
import { ControlsBar } from './ControlsBar'
import { useCollageLayout } from './use-collage-layout'
import './app.css'

/** The stage re-renders only when its own props change (not when a card or tooltip opens). */
const Stage = memo(Collage)
/** The Tree tab, and its data, load only when it is opened. */
const TreeView = lazy(() => import('@/components/tree/TreeView'))

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** Accessible name of the block. */
  label: string
  /** Extra actions in the bird card (EditBird on the birder's own collage). `close` closes the card. */
  cardActions?: (entry: ListEntry, close: () => void) => ReactNode
  /** The Filters panel's sections to leave out (a shared link that carries no places or dates). */
  hideSections?: readonly FilterSection[]
  /** Every place on the list is a lifer place: the Places dropdown says so, and how to get more (the birder's own collage). */
  placesNote?: PlacesNote
  /** Some birds on the observation.org life list have no places: the Places dropdown says so (the birder's own collage). */
  placesUnplaced?: PlacesUnplaced
  /** Before the stats ("Sample: a demo birder's life list"). */
  statsPrefix?: string
  /** A line under the stats (the unmatched-rows note on the birder's own collage). */
  notice?: ReactNode
  /** Under the filters (what a shared link leaves out). */
  filterNote?: ReactNode
  /** Whose list the search speaks of when nothing matches: "your" (the birder's own) or "this" (default). */
  whose?: 'your' | 'this'
  /** Full layouts packed ahead of time, shown until the layout worker answers (the landing sample). */
  seed?: readonly StateLayout[]
  /** Told the level the Map or Tree view has open as it changes, for the page's Share button to draw the same. */
  onShareAt?: (at: ShareAt) => void
  /** At the end of the stats line's row (the landing sample's Share). */
  statsAction?: ReactNode
}

const pad = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
/** Preview variants of the threatened count: a "12 threatened" on the stats line, b "12 globally threatened", c in
 *  the Status panel instead. */
const THREAT_VARIANTS = ['a', 'b', 'c'] as const
type ThreatVariant = (typeof THREAT_VARIANTS)[number]
/** The stats line's threatened part ("12 threatened", "1,200 globally threatened"); screen readers hear
 *  `t.collage.stats.threatenedSr` after it: the categories it counts, which the visible line leaves to the Status panel. */
function threatText(count: number, threat: ThreatVariant, t: Ui): string {
  return fmt(threat === 'b' ? t.collage.stats.threatenedGlobal : t.collage.stats.threatened, { n: formatInt(count, t.num) })
}
/** How long a bird picked from the search wears its Accent ring. */
const RING_MS = 1600
/** The collage's glide to a new layout (640 ms) and a little slack: then a bird picked from outside the view is shown. */
const GLIDE_MS = 760
/** How long an out-of-view pick waits for its layout before it lapses. */
const PENDING_MS = 4000

/** The taxonomy's species, orders and families: the totals the Tree counts against (levels.ts taxonCover's). */
export type TaxonomyTotals = { species: number; orders: number; families: number }
export function taxonomyTotals(rows: readonly SpeciesRow[]): TaxonomyTotals {
  return { species: new Set(rows.map((r) => r.code)).size, orders: new Set(rows.map((r) => r.ord)).size, families: new Set(rows.map((r) => r.fam)).size }
}

/**
 * "197 species · 20 orders · 50 families · 12 threatened · since Jan 2020", or "12 of 197 species · 3 families" when
 * filtered, in `t`'s language. The threatened count (VU + EN + CR) is left out at 0 and in variant c; b reads
 * "12 globally threatened". With `totals` (the Tree with Lifers only off) the unfiltered line counts against the
 * taxonomy: "197 / 11,201 species · 20 / 45 orders · 50 / 250 families · …".
 */
export function statsLine(all: ListEntry[], shown: ListEntry[], species: SpeciesIndex, t: Ui, threat: ThreatVariant = 'a', totals?: TaxonomyTotals): string {
  const ords = new Set<string>(), fams = new Set<string>()
  for (const e of shown) {
    const r = species.byCode.get(e.code)
    if (r) { ords.add(r.ord); fams.add(r.fam) }
  }
  const s = t.collage.stats
  const count = (p: typeof s.species, x: number) => plural(p, x, { n: formatInt(x, t.num) })
  if (shown.length < all.length) {
    const of = plural(s.of, all.length, { n: formatInt(shown.length, t.num), total: formatInt(all.length, t.num) })
    return `${of} · ${count(s.families, fams.size)}`
  }
  let first: string | undefined
  for (const e of all) if (e.date && (!first || pad(e.date) < pad(first))) first = e.date
  // Against a total: the number, then the total in the count's own words ("197 / 11,201 species").
  const part = (p: typeof s.species, x: number, total?: number) => (total === undefined ? count(p, x) : `${formatInt(x, t.num)} / ${count(p, total)}`)
  const parts = [part(s.species, all.length, totals?.species), part(s.orders, ords.size, totals?.orders), part(s.families, fams.size, totals?.families)]
  const threatened = threat === 'c' ? 0 : threatenedCount(all, species)
  if (threatened > 0) parts.push(threatText(threatened, threat, t))
  const since = formatMonth(first, t.date.months)
  if (since) parts.push(fmt(s.since, { date: since }))
  return parts.join(' · ')
}

/** The legend's "Latest: Snow Goose, Sep 2026" (the date a <time> element). */
function latestLine(name: string, date: string | undefined, t: Ui): ReactNode {
  const shown = formatMonth(date, t.date.months)
  if (!shown) return fmt(t.collage.legend.latest, { name })
  return rich(fmt(t.collage.legend.latestOn, { name, date: shown }), { time: (chunk) => <time dateTime={date}>{chunk}</time> })
}

export function CollageView({ state, dispatch, species, regions, label, cardActions, hideSections, placesNote, placesUnplaced, statsPrefix, notice, filterNote, seed, onShareAt, statsAction, whose = 'this' }: Props) {
  const { list, filter, mode, massOrder, sci, seen } = state
  // No places to map (a shared link without them): no Map tab, and a carried-over Map view shows the collage.
  const noMap = !!hideSections?.includes('places')
  const view = noMap && state.view === 'map' ? 'collage' : state.view
  const { t } = useI18n()
  useNames() // the legend's latest lifer, the search results and the filters follow the names
  const box = useRef<HTMLElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ code: string; anchor: HTMLElement | null } | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  // The level the Map or Tree view has open (their own state, told up as it changes), for Share to draw the same.
  const onMapLevel = useCallback((place: string | undefined, names: (key: string) => string) => onShareAt?.({ place, names }), [onShareAt])
  const onTreeLevel = useCallback((at: TreeShown) => onShareAt?.(at), [onShareAt])
  // The controls bar's slot for the Tree's Level and Layout menus, which TreeView fills.
  const [treeMenus, setTreeMenus] = useState<HTMLDivElement | null>(null)
  // The tree's open branch is the taxonomy filter's order, family and genus (the chip row is its path, path.ts), with
  // what the tree opens past them (a family or genus the shown index lacks) kept here while they stay.
  const [treeDeep, setTreeDeep] = useState<TreeDeep | null>(null)
  const branch = useMemo(() => treeBranch(filter, treeDeep), [filter, treeDeep])
  const onTreeOpen = useCallback((b: OpenBranch, famName?: string) => {
    // The filter keeps a family (a genus) only when the shown index has it in that order (family; applyFilterValidity).
    const next = openBranch(filter, b, (ord, fam, genus) => species.rows.some((r) => r.ord === ord && r.fam === fam && (!genus || genusOf(r.sci) === genus)), famName)
    setTreeDeep(next.deep)
    if (filterKey(next.filter) !== filterKey(filter)) dispatch({ type: 'filter', filter: next.filter })
  }, [filter, species, dispatch])
  const treePath = useMemo((): TreePath | undefined => {
    if (view !== 'tree') return undefined
    const crumbs: TreePath['crumbs'] = []
    if (branch.fam && !filter.family) crumbs.push({ label: sci ? branch.fam : treeDeep?.famName ?? branch.fam, latin: sci, open: () => setTreeDeep((d) => closeDeep(d, 1)) })
    if (branch.genus && !filter.genus) crumbs.push({ label: branch.genus, latin: true, open: () => {} })
    return { crumbs, close: () => setTreeDeep(null) }
  }, [view, branch, filter.family, filter.genus, sci, treeDeep?.famName])

  const entries = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  // The timeline's months (first lifer to today).
  const today = useMemo(() => todayMonth(), [])
  const months = useMemo(() => monthBins(entries, today).months, [entries, today])
  // A range drag's preview (Timeline): shown over the current layout until the committed range's layout lands.
  const [preview, setPreview] = useState<{ from?: string; to?: string; committed?: boolean } | null>(null)
  const onPreview = useCallback((r: { from?: string; to?: string } | null) => setPreview((p) => (r ? r : p ? { ...p, committed: true } : null)), [])
  const oval = useArrangement() === 'oval'
  const lay = useCollageLayout({ list, seen, filter, mode, species, container: box, seed, preview, oval })
  const layKey = lay ? lay.layout.key.split('|').slice(2).join('|') : undefined
  useEffect(() => {
    if (!preview?.committed || layKey !== filterKey(filter)) return
    const t = setTimeout(() => setPreview((p) => (p?.committed ? null : p)), 0)
    return () => clearTimeout(t)
  }, [preview, layKey, filter])
  const time = useMemo(() => ({ entries, months, today, onPreview }), [entries, months, today, onPreview])
  const fk = filterKey(filter)
  const shownList = useMemo(() => (fk ? applyFilter(entries, filter, species, seen) : entries), [entries, filter, fk, species, seen])
  const threat = useVariant('threat', THREAT_VARIANTS)
  // The Tree with Lifers only off draws the whole taxonomy, so the line counts against it: the full species file's
  // totals (the Tree's own data; the landing sample's index holds only its birds), fetched the first time.
  const treeMine = useTreeMine()
  const wantTotals = view === 'tree' && !treeMine
  const [taxonomy, setTaxonomy] = useState<TaxonomyTotals | null>(null)
  useEffect(() => {
    if (!wantTotals || taxonomy) return
    let live = true
    loadSpecies().then((all) => { if (live) setTaxonomy(taxonomyTotals(all.rows)) }, () => {})
    return () => { live = false }
  }, [wantTotals, taxonomy])
  const totals = wantTotals ? taxonomy ?? undefined : undefined
  const stats = useMemo(() => statsLine(entries, shownList, species, t, threat, totals), [entries, shownList, species, t, threat, totals])
  // Variant c: the count moves to the Status panel.
  const threatPart = useMemo(() => (threat === 'c' ? undefined : threatText(threatenedCount(entries, species), threat, t)), [threat, entries, species, t])
  const threatLine = useMemo(() => (threat === 'c' ? threatenedCount(entries, species) : undefined), [threat, entries, species])
  const shownCodes = useMemo(() => new Set(shownList.map((e) => e.code)), [shownList])
  const order = useMemo(() => liferOrder(species.byCode), [species])
  // The legend's latest lifer: the newest bird shown, as the share image's latest lifer row.
  const latest = useMemo(() => latestLifer(shownList, order), [shownList, order])
  // The search's understood chips: the places the list has (every level), and whether its records keep their months.
  const listPlaces = useMemo(() => {
    const keys = new Set<string>()
    for (const e of seen.byCode.values()) for (const k of e.keys) keys.add(k)
    return [...keys]
  }, [seen])
  const hasMonths = useMemo(() => hasSeenMonths(seen), [seen])
  // Anonymous count of which kinds of filter get used (once per kind per page load; the kind only, never its value).
  const prevFilter = useRef(filter)
  useEffect(() => {
    for (const kind of newlySetKinds(prevFilter.current, filter)) trackFilterUsed(kind)
    prevFilter.current = filter
  }, [filter])
  const onApply = useCallback((f: Filter) => dispatch({ type: 'filter', filter: f }), [dispatch])

  const filtersUi = useFiltersUi({ state, dispatch, species, regions, hide: hideSections, placesNote, placesUnplaced, time, threatLine, shown: shownList.length })
  // While the Filters panel is open the column keeps its height: a filter that empties the collage would otherwise shorten
  // the page and the browser would clamp the scroll (the panel's own restore puts the position back, but not in time to
  // avoid the jump). `.eb-view-below` is display: contents, so the freeze goes on this section, which is a box. Only
  // growth still shows; the height is released on close.
  const frozen = filtersUi.frozen
  useLayoutEffect(() => {
    const el = box.current
    if (!frozen || !el) return
    el.style.minHeight = `${el.getBoundingClientRect().height}px`
    return () => { el.style.minHeight = '' }
  }, [frozen])
  const close = useCallback(() => setPick(null), [])
  const onPickBird = useCallback((code: string) => {
    const el = box.current?.querySelector<HTMLElement>(`.eb-bird[data-code="${code}"]`) ?? null
    setTip(null)
    setPick({ code, anchor: el })
  }, [])
  const onPickRow = useCallback((code: string, el: HTMLElement) => setPick({ code, anchor: el }), [])
  const onHover = useCallback((code: string | null) => setTip(code), [])

  // A bird shown from the search keeps its tooltip until the next press, hover or Esc.
  useEffect(() => {
    if (!tip) return
    const down = () => setTip(null)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setTip(null) }
    document.addEventListener('pointerdown', down)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('keydown', key) }
  }, [tip])

  // The search covers the whole list. An order or family drills the filter into it (taxonomy is always on show). A species is shown
  // where it stands: scrolled into view, ringed briefly in Accent, focused, its tooltip open (its row, in list view).
  // One outside the current view first clears the filters that hide it; it is shown once the collage has glided to
  // the new layout.
  const ring = useRef<{ el: HTMLElement; t: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => () => { if (ring.current) clearTimeout(ring.current.t) }, [])
  const show = useCallback((code: string) => {
    const collage = view === 'collage'
    const el = box.current?.querySelector<HTMLElement>(collage ? `.eb-bird[data-code="${code}"]` : ['.eb-row-btn', '.eb-tree-btn', '.eb-tree-link'].map((c) => `${c}[data-code="${code}"]`).join())
    if (!el) { if (view === 'tree') setPick({ code, anchor: null }); return } // a species the open tree level doesn't show: its card
    if (ring.current) { clearTimeout(ring.current.t); ring.current.el.removeAttribute('data-ring') }
    if (collage) revealBird(el) // a big list renders only the birds near the viewport
    el.setAttribute('data-ring', '')
    ring.current = { el, t: setTimeout(() => el.removeAttribute('data-ring'), RING_MS) }
    el.scrollIntoView?.({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
    el.focus({ preventScroll: true })
    if (collage) requestAnimationFrame(() => setTip(code))
  }, [view])
  const [pending, setPending] = useState<{ code: string; key: string; at: number } | null>(null)
  const onSearchPick = useCallback((h: CollageHit) => {
    if (h.kind !== 'species') {
      dispatch({ type: 'filter', filter: drillTo(filter, { order: h.kind === 'order' ? h.value : h.order, family: h.kind === 'family' ? h.value : undefined }, entries, species, seen) })
      return
    }
    const e = entries.find((x) => x.code === h.value)
    if (!e) return
    // The map has no birds to show: a species picked there is shown on the collage.
    if (view === 'map') {
      const next = !fk || shownList.some((x) => x.code === h.value) ? filter : filterToShow(filter, e, species, seen)
      dispatch({ type: 'view', view: 'collage' })
      if (next !== filter) dispatch({ type: 'filter', filter: next })
      setPending({ code: h.value, key: filterKey(next), at: Date.now() })
      return
    }
    if (!fk || shownList.some((x) => x.code === h.value)) { show(h.value); return }
    const next = filterToShow(filter, e, species, seen)
    dispatch({ type: 'filter', filter: next })
    setPending({ code: h.value, key: filterKey(next), at: Date.now() })
  }, [filter, fk, shownList, entries, species, seen, dispatch, show, view])
  // The out-of-view pick: wait for the new filter's layout (the list re-renders at once), then for the glide. It lapses
  // when the filter is changed by hand meanwhile, or after PENDING_MS, so a stale tooltip can't pop up later.
  useEffect(() => {
    if (!pending) return
    if (fk !== pending.key || Date.now() - pending.at > PENDING_MS) {
      const t = setTimeout(() => setPending(null), 0)
      return () => clearTimeout(t)
    }
    const collage = view === 'collage'
    if (collage && (!lay || lay.layout.key.split('|').slice(2).join('|') !== pending.key || !lay.visible.has(pending.code))) return
    const t = setTimeout(() => { setPending(null); show(pending.code) }, collage && !reduced() ? GLIDE_MS : 0)
    return () => clearTimeout(t)
  }, [pending, fk, lay, view, show])

  const picked = pick ? list.find((e) => e.code === pick.code) : undefined
  const tipEntry = tip && !pick && view === 'collage' ? entries.find((e) => e.code === tip) : undefined
  const sizes = mode === 'true' ? t.collage.legend.sizesTrue : t.collage.legend.sizesEven
  const latestRow = latest ? species.byCode.get(latest.code) : undefined
  // The tree's legend: the oldest lineage among the birds shown (the tree is fetched once per page, with the Tree tab).
  const [tree, setTree] = useState<Tree | null>(null)
  useEffect(() => {
    if (view !== 'tree' || tree) return
    let live = true
    loadTree().then((d) => { if (live) setTree(d.tree) }, () => {})
    return () => { live = false }
  }, [view, tree])
  const oldest = useMemo(() => (view === 'tree' && tree ? oldestLineage(tree, shownCodes) : undefined), [view, tree, shownCodes])
  const oldestRow = oldest ? species.byCode.get(oldest.code) : undefined

  const statsP = (
    <p className="eb-mono eb-stats" data-testid="collage-stats">
      {/* Each part keeps its words on one line ("since May 2022" never splits); the line wraps between parts. */}
      {(statsPrefix ? `${statsPrefix} · ${stats}` : stats).split(' · ').map((part, i) => (
        <Fragment key={i}>{i > 0 && ' · '}<span className="eb-stat">{part}{part === threatPart && <span className="eb-sr"> {t.collage.stats.threatenedSr}</span>}</span></Fragment>
      ))}
    </p>
  )

  return (
    <section ref={box} className="eb-view" aria-label={label}>
      {statsAction ? <div className="eb-stats-row">{statsP}{statsAction}</div> : statsP}
      {notice}
      <ControlsBar
        view={view}
        noMap={noMap}
        onView={(v) => { setPick(null); setTip(null); dispatch({ type: 'view', view: v }) }}
        trueSize={mode === 'true'}
        onTrueSize={(on) => dispatch({ type: 'mode', mode: on ? 'true' : 'even' })}
        lightFirst={massOrder === 'lightest'}
        onDirection={() => dispatch({ type: 'massOrder', massOrder: massOrder === 'heaviest' ? 'lightest' : 'heaviest' })}
        sci={sci}
        onSci={(on) => dispatch({ type: 'sci', sci: on })}
        search={{ entries, shown: fk ? shownCodes : undefined, species, onPick: onSearchPick, whose, filter, onApply, regions, listPlaces, hasMonths }}
        filters={filtersUi.button}
        below={filtersUi.below}
        onFind={filtersUi.close}
        treeMenus={setTreeMenus}
      />

      {/* Everything under the dock: dimmed and inert while the Filters popover is open (a press there closes it). */}
      <div className="eb-view-below" inert={filtersUi.dimmed || undefined} data-dim={filtersUi.dimmed || undefined}>
      <FilterBar state={state} dispatch={dispatch} species={species} tree={treePath} />
      {filterNote}

      {view === 'collage' ? (
        lay ? (
          <div ref={wrap} className="eb-stagewrap">
            <Stage entries={entries} species={species} layout={lay.layout} visible={lay.visible} mode={mode} onPick={onPickBird} onHover={onHover} still={lay.still} />
            {tipEntry && <BirdTip key={tipEntry.code} entry={tipEntry} row={species.byCode.get(tipEntry.code)!} regions={regions} sci={sci} wrap={wrap} filter={filter} seen={seen} />}
          </div>
        ) : (
          <div className="eb-stage-wait" aria-hidden="true">
            <span className="eb-num">{formatInt(shownList.length, t.num)}</span>
            <span className="eb-mono">{entries.length ? t.collage.arranging : t.count.label}</span>
          </div>
        )
      ) : view === 'map' ? (
        <MapView state={state} species={species} regions={regions} onLevel={onMapLevel} />
      ) : view === 'list' ? (
        <ListView entries={shownList} species={species} regions={regions} order={massOrder} sci={sci} onPick={onPickRow} />
      ) : (
        <Suspense fallback={<p className="eb-mono">{t.collage.tree.loading}</p>}>
          <TreeView entries={shownList} sci={sci} onPick={onPickRow} branch={branch} onOpen={onTreeOpen} onLevel={onTreeLevel} menus={treeMenus} />
        </Suspense>
      )}

      {view !== 'map' && view !== 'tree' && <div className="eb-mono eb-legend">
        <p>
          {latest && latestRow ? <>{latestLine(displayName(latestRow), latest.date, t)} · </> : null}
          {sizes}
        </p>
        <p>{t.collage.legend.marks}</p>
      </div>}
      {view === 'tree' && oldest && oldestRow && <div className="eb-mono eb-legend">
        <p>{fmt(t.collage.tree.oldest, { name: displayName(oldestRow), age: formatAge(oldest.age, t.num) })}</p>
      </div>}
      </div>

      {picked && pick && (
        <BirdCard
          key={picked.code}
          entry={picked}
          species={species}
          regions={regions}
          anchor={pick.anchor}
          sci={sci}
          filter={filter}
          seen={seen}
          onClose={close}
          actions={cardActions?.(picked, close)}
        />
      )}
    </section>
  )
}
