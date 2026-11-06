'use client'
// The collage block shared by the landing sample, the birder's own collage and the shared view: the stats line, the
// controls bar (view tabs, True size or the list's direction, Scientific, the search), the filters, the collage or
// the list, the legend, the hover tooltip and the bird card. Composition after LifeList.tsx (framer-site).
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BirdCard } from '@/components/collage/BirdCard'
import { BirdTip } from '@/components/collage/BirdTip'
import { Collage, revealBird } from '@/components/collage/Collage'
import { reduced } from '@/components/collage/collage-motion'
import { ListView } from '@/components/collage/ListView'
import { FilterBar } from '@/components/filters/FilterBar'
import { FilterDropdowns, type Panel, type PlacesNote } from '@/components/filters/FilterDropdowns'
import { formatDate } from '@/lib/format'
import { latestLifer } from '@/lib/list/build-list'
import { applyFilter, drillTo, filterKey, filterToShow } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { monthBins, todayMonth } from '@/lib/list/timeline'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CollageHit } from '@/lib/species/name-search'
import type { Regions } from '@/lib/species/types'
import type { StateLayout } from '@/lib/layout/layout-client'
import { ControlsBar } from './ControlsBar'
import { useCollageLayout } from './use-collage-layout'
import './app.css'

/** The stage re-renders only when its own props change (not when a card or tooltip opens). */
const Stage = memo(Collage)

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** Accessible name of the block. */
  label: string
  /** Extra actions in the bird card (EditBird on the birder's own collage). `close` closes the card. */
  cardActions?: (entry: ListEntry, close: () => void) => ReactNode
  /** The Places and Time dropdowns to leave out. */
  hidePanels?: readonly Panel[]
  /** Every place on the list is a lifer place: the Places dropdown says so, and how to get more (the birder's own collage). */
  placesNote?: PlacesNote
  /** Before the stats ("Sample: Yusuf's life list"). */
  statsPrefix?: string
  /** A line under the stats (the unmatched-rows note on the birder's own collage). */
  notice?: ReactNode
  /** Under the filters (what a shared link leaves out). */
  filterNote?: ReactNode
  /** The filters as one scrollable strip (the landing sample: the birds keep the first screen). */
  compactFilters?: boolean
  /** Whose list the search speaks of when nothing matches: "your" (the birder's own) or "this" (default). */
  whose?: 'your' | 'this'
  /** Full layouts packed ahead of time, shown until the layout worker answers (the landing sample). */
  seed?: readonly StateLayout[]
}

const n = (x: number) => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`
const pad = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
/** How long a bird picked from the search wears its Accent ring. */
const RING_MS = 1600
/** The collage's glide to a new layout (640 ms) and a little slack: then a bird picked from outside the view is shown. */
const GLIDE_MS = 760
/** How long an out-of-view pick waits for its layout before it lapses. */
const PENDING_MS = 4000

/** "197 species · 20 orders · 50 families · since Jan 2020", or "12 of 197 species · 3 families" when filtered. */
export function statsLine(all: ListEntry[], shown: ListEntry[], species: SpeciesIndex): string {
  const ords = new Set<string>(), fams = new Set<string>()
  for (const e of shown) {
    const r = species.byCode.get(e.code)
    if (r) { ords.add(r.ord); fams.add(r.fam) }
  }
  if (shown.length < all.length) return `${n(shown.length)} of ${plural(all.length, 'species', 'species')} · ${plural(fams.size, 'family', 'families')}`
  let first: string | undefined
  for (const e of all) if (e.date && (!first || pad(e.date) < pad(first))) first = e.date
  const parts = [plural(all.length, 'species', 'species'), plural(ords.size, 'order', 'orders'), plural(fams.size, 'family', 'families')]
  if (first && formatDate(first)) parts.push(`since ${formatDate(first)}`)
  return parts.join(' · ')
}

export function CollageView({ state, dispatch, species, regions, label, cardActions, hidePanels, placesNote, statsPrefix, notice, filterNote, compactFilters, seed, whose = 'this' }: Props) {
  const { list, filter, mode, view, massOrder, sci, seen } = state
  const box = useRef<HTMLElement>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const [pick, setPick] = useState<{ code: string; anchor: HTMLElement | null } | null>(null)
  const [tip, setTip] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)

  const entries = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  // The timeline's months (first lifer to today).
  const today = useMemo(() => todayMonth(), [])
  const months = useMemo(() => monthBins(entries, today).months, [entries, today])
  // A range drag's preview (Timeline): shown over the current layout until the committed range's layout lands.
  const [preview, setPreview] = useState<{ from?: string; to?: string; committed?: boolean } | null>(null)
  const onPreview = useCallback((r: { from?: string; to?: string } | null) => setPreview((p) => (r ? r : p ? { ...p, committed: true } : null)), [])
  const lay = useCollageLayout({ list, seen, filter, mode, species, container: box, seed, preview })
  const layKey = lay ? lay.layout.key.split('|').slice(2).join('|') : undefined
  useEffect(() => {
    if (!preview?.committed || layKey !== filterKey(filter)) return
    const t = setTimeout(() => setPreview((p) => (p?.committed ? null : p)), 0)
    return () => clearTimeout(t)
  }, [preview, layKey, filter])
  const time = useMemo(() => ({ entries, months, today, onPreview }), [entries, months, today, onPreview])
  const fk = filterKey(filter)
  const shownList = useMemo(() => (fk ? applyFilter(entries, filter, species, seen) : entries), [entries, filter, fk, species, seen])
  const stats = useMemo(() => statsLine(entries, shownList, species), [entries, shownList, species])
  const shownCodes = useMemo(() => new Set(shownList.map((e) => e.code)), [shownList])
  const latest = useMemo(() => latestLifer(entries, (c) => species.byCode.get(c)?.to ?? 0), [entries, species])

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
    const el = box.current?.querySelector<HTMLElement>(collage ? `.eb-bird[data-code="${code}"]` : `.eb-row-btn[data-code="${code}"]`)
    if (!el) return
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
    if (!fk || shownList.some((x) => x.code === h.value)) { show(h.value); return }
    const next = filterToShow(filter, e, species, seen)
    dispatch({ type: 'filter', filter: next })
    setPending({ code: h.value, key: filterKey(next), at: Date.now() })
  }, [filter, fk, shownList, entries, species, seen, dispatch, show])
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
  const sizes = mode === 'true' ? 'Sizes follow body mass at true scale' : 'Sizes follow body mass, evened out so small birds stay visible'
  const latestRow = latest ? species.byCode.get(latest.code) : undefined

  return (
    <section ref={box} className="eb-view" aria-label={label}>
      <p className="eb-mono eb-stats" data-testid="collage-stats">
        {/* Each part keeps its words on one line ("since May 2022" never splits); the line wraps between parts. */}
        {(statsPrefix ? `${statsPrefix} · ${stats}` : stats).split(' · ').map((part, i) => (
          <Fragment key={i}>{i > 0 && ' · '}<span className="eb-stat">{part}</span></Fragment>
        ))}
      </p>
      {notice}
      <ControlsBar
        view={view}
        onView={(v) => { setPick(null); setTip(null); dispatch({ type: 'view', view: v }) }}
        trueSize={mode === 'true'}
        onTrueSize={(on) => dispatch({ type: 'mode', mode: on ? 'true' : 'even' })}
        lightFirst={massOrder === 'lightest'}
        onDirection={() => dispatch({ type: 'massOrder', massOrder: massOrder === 'heaviest' ? 'lightest' : 'heaviest' })}
        sci={sci}
        onSci={(on) => dispatch({ type: 'sci', sci: on })}
        search={{ entries, shown: fk ? shownCodes : undefined, species, onPick: onSearchPick, whose }}
        filters={(inert) => (
          <FilterDropdowns state={state} dispatch={dispatch} species={species} regions={regions} open={panel} onOpen={setPanel} hide={hidePanels} placesNote={placesNote} time={time} inert={inert} />
        )}
      />

      <FilterBar state={state} dispatch={dispatch} species={species} compact={compactFilters} />
      {filterNote}

      {view === 'collage' ? (
        lay ? (
          <div ref={wrap} className="eb-stagewrap">
            <Stage entries={entries} species={species} layout={lay.layout} visible={lay.visible} mode={mode} onPick={onPickBird} onHover={onHover} still={lay.still} />
            {tipEntry && <BirdTip key={tipEntry.code} entry={tipEntry} row={species.byCode.get(tipEntry.code)!} regions={regions} sci={sci} wrap={wrap} />}
          </div>
        ) : (
          <div className="eb-stage-wait" aria-hidden="true">
            <span className="eb-num">{n(shownList.length)}</span>
            <span className="eb-mono">{entries.length ? 'arranging the stickers' : 'species'}</span>
          </div>
        )
      ) : (
        <ListView entries={shownList} species={species} regions={regions} order={massOrder} sci={sci} onPick={onPickRow} />
      )}

      <div className="eb-mono eb-legend">
        <p>
          {latest && latestRow ? <>Latest: {latestRow.com}{latest.date ? <>, <time dateTime={latest.date}>{formatDate(latest.date)}</time></> : null} · </> : null}
          {sizes}
        </p>
        <p>* heard only · † found dead</p>
      </div>

      {picked && pick && (
        <BirdCard
          key={picked.code}
          entry={picked}
          species={species}
          regions={regions}
          anchor={pick.anchor}
          sci={sci}
          onClose={close}
          actions={cardActions?.(picked, close)}
        />
      )}
    </section>
  )
}
