'use client'
// The collage block shared by the landing demo, the birder's own page and the shared view: the stats line, the
// controls bar (view tabs, search, True size or the list's direction, Scientific), the filters, the collage or the
// list, the legend and the bird card. Composition after LifeList.tsx (framer-site).
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BirdCard } from '@/components/collage/BirdCard'
import { Collage } from '@/components/collage/Collage'
import { reduced } from '@/components/collage/collage-motion'
import { ListView } from '@/components/collage/ListView'
import { FilterBar, type Tab as FilterTab } from '@/components/filters/FilterBar'
import { formatDate } from '@/lib/format'
import { latestLifer } from '@/lib/list/build-list'
import { applyFilter, filterKey, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import { suggestBirds } from '@/lib/species/name-search'
import type { CountryDots, Regions } from '@/lib/species/types'
import { CollageSearch } from './CollageSearch'
import { ControlsBar } from './ControlsBar'
import { useCollageLayout } from './use-collage-layout'
import './app.css'

/** The stage re-renders only when its own props change (not when a card opens). */
const Stage = memo(Collage)

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  dots?: CountryDots
  /** Accessible name of the block. */
  label: string
  /** Extra actions in the bird card (EditBird on the birder's own page). `close` closes the card. */
  cardActions?: (entry: ListEntry, close: () => void) => ReactNode
  /** Filter tabs to leave out. */
  hideTabs?: readonly FilterTab[]
}

const n = (x: number) => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`
const pad = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)
/** Typing settles this long before the collage re-packs for the search (suggestions follow every key). */
const SEARCH_SETTLE_MS = 140
/** How long the picked bird's Accent ring shows, and how long its card follows it while it travels. */
const RING_MS = 1600
const SUGGESTIONS = 8

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

export function CollageView({ state, dispatch, species, regions, dots, label, cardActions, hideTabs }: Props) {
  const { list, trips, filter, mode, view, massOrder, sci } = state
  const box = useRef<HTMLElement>(null)
  const [pick, setPick] = useState<{ code: string; anchor: HTMLElement | null; follow?: boolean } | null>(null)
  // The search: `text` follows every key (suggestions); `q` follows it once typing settles (the collage re-packs).
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const onText = useCallback((t: string) => {
    setText(t)
    if (!t.trim()) setQ('') // clearing shows everything at once
  }, [])
  useEffect(() => {
    if (!text.trim() || text.trim() === q.trim()) return
    const t = setTimeout(() => setQ(text), SEARCH_SETTLE_MS)
    return () => clearTimeout(t)
  }, [text, q])
  const shownFilter = useMemo<Filter>(() => (q.trim() ? { ...filter, q } : filter), [filter, q])

  const lay = useCollageLayout({ list, trips, filter: shownFilter, mode, species, container: box })

  const entries = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  const fk = filterKey(shownFilter)
  const shownList = useMemo(() => (fk ? applyFilter(entries, shownFilter, species, trips) : entries), [entries, shownFilter, fk, species, trips])
  const stats = useMemo(() => statsLine(entries, shownList, species), [entries, shownList, species])
  // Suggestions: birds under the other filters whose names match what is typed now.
  const others = useMemo(() => (filterKey(filter) ? applyFilter(entries, filter, species, trips) : entries), [entries, filter, species, trips])
  const suggestions = useMemo(() => (text.trim() ? suggestBirds(others, text, species, SUGGESTIONS) : []), [others, text, species])
  const latest = useMemo(() => latestLifer(entries, (c) => species.byCode.get(c)?.to ?? 0), [entries, species])

  const close = useCallback(() => setPick(null), [])
  const onPickBird = useCallback((code: string) => {
    const el = box.current?.querySelector<HTMLElement>(`.eb-bird[data-code="${code}"]`) ?? null
    setPick({ code, anchor: el })
  }, [])
  const onPickRow = useCallback((code: string, el: HTMLElement) => setPick({ code, anchor: el }), [])

  // A suggestion picked: clear the narrowing, bring the bird (or its row) into view with a brief Accent ring, and
  // open its card. The bird travels back to its unsearched spot, so the card follows it for a moment.
  const ring = useRef<{ el: HTMLElement; t: ReturnType<typeof setTimeout> } | null>(null)
  useEffect(() => () => { if (ring.current) clearTimeout(ring.current.t) }, [])
  const onPickSuggestion = useCallback((code: string) => {
    setText('')
    setQ('')
    const sel = view === 'collage' ? `.eb-bird[data-code="${code}"]` : `.eb-row-btn[data-code="${code}"]`
    const el = box.current?.querySelector<HTMLElement>(sel) ?? null
    if (ring.current) { clearTimeout(ring.current.t); ring.current.el.removeAttribute('data-ring') }
    if (el) {
      el.setAttribute('data-ring', '')
      ring.current = { el, t: setTimeout(() => el.removeAttribute('data-ring'), RING_MS) }
      el.scrollIntoView?.({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
    }
    setPick({ code, anchor: el, follow: true })
  }, [view])

  const picked = pick ? list.find((e) => e.code === pick.code) : undefined
  const sizes = mode === 'true' ? 'Sizes follow body mass at true scale' : 'Sizes follow body mass, evened out so small birds stay visible'
  const latestRow = latest ? species.byCode.get(latest.code) : undefined

  return (
    <section ref={box} className="eb-view" aria-label={label}>
      <p className="eb-mono eb-stats" data-testid="collage-stats">{stats}</p>
      <ControlsBar
        view={view}
        onView={(v) => { setPick(null); dispatch({ type: 'view', view: v }) }}
        trueSize={mode === 'true'}
        onTrueSize={(on) => dispatch({ type: 'mode', mode: on ? 'true' : 'even' })}
        lightFirst={massOrder === 'lightest'}
        onDirection={() => dispatch({ type: 'massOrder', massOrder: massOrder === 'heaviest' ? 'lightest' : 'heaviest' })}
        sci={sci}
        onSci={(on) => dispatch({ type: 'sci', sci: on })}
        search={<CollageSearch value={text} onChange={onText} suggestions={suggestions} onPick={onPickSuggestion} sci={sci} />}
      />

      <FilterBar state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} hideTabs={hideTabs} query={q} />

      {view === 'collage' ? (
        lay ? (
          <Stage entries={entries} species={species} layout={lay.layout} visible={lay.visible} mode={mode} onPick={onPickBird} total={entries.length} />
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
        <p>* heard only · † found dead · ◦ photo or recording</p>
      </div>

      {picked && pick && (
        <BirdCard
          key={picked.code}
          entry={picked}
          species={species}
          regions={regions}
          anchor={pick.anchor}
          follow={pick.follow ? RING_MS : undefined}
          sci={sci}
          onClose={close}
          actions={cardActions?.(picked, close)}
        />
      )}
    </section>
  )
}
