'use client'
// The collage block shared by the landing demo, the birder's own page (and later the shared view): the stats
// line, the view tabs and True size switch, the filters, the collage or the list, the legend and the bird card.
// Composition after LifeList.tsx (framer-site).
import { ListBullets, SquaresFour } from '@phosphor-icons/react'
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { BirdCard } from '@/components/collage/BirdCard'
import { Collage } from '@/components/collage/Collage'
import { ListView } from '@/components/collage/ListView'
import { TrueSizeSwitch } from '@/components/collage/TrueSizeSwitch'
import { FilterBar } from '@/components/filters/FilterBar'
import { formatDate } from '@/lib/format'
import { applyFilter, filterKey } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
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
}

const n = (x: number) => x.toLocaleString('en-US')
const plural = (x: number, one: string, many: string) => `${n(x)} ${x === 1 ? one : many}`
const pad = (d: string) => (d.length === 4 ? `${d}-00-00` : d.length === 7 ? `${d}-00` : d)

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

export function CollageView({ state, dispatch, species, regions, dots, label, cardActions }: Props) {
  const { list, trips, filter, mode, view, massOrder } = state
  const box = useRef<HTMLElement>(null)
  const [pick, setPick] = useState<{ code: string; anchor: HTMLElement | null } | null>(null)
  const lay = useCollageLayout({ list, trips, filter, mode, species, container: box })

  const entries = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  const fk = filterKey(filter)
  const shownList = useMemo(() => (fk ? applyFilter(entries, filter, species, trips) : entries), [entries, filter, fk, species, trips])
  const stats = useMemo(() => statsLine(entries, shownList, species), [entries, shownList, species])

  const close = useCallback(() => setPick(null), [])
  const onPickBird = useCallback((code: string) => {
    const el = box.current?.querySelector<HTMLElement>(`.eb-bird[data-code="${code}"]`) ?? null
    setPick({ code, anchor: el })
  }, [])
  const onPickRow = useCallback((code: string, el: HTMLElement) => setPick({ code, anchor: el }), [])
  const picked = pick ? list.find((e) => e.code === pick.code) : undefined

  return (
    <section ref={box} className="eb-view" aria-label={label}>
      <p className="eb-mono eb-stats" data-testid="collage-stats">{stats}</p>
      <div className="eb-dock">
        <div className="eb-seg" role="group" aria-label="View">
          {(['collage', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className="eb-seg-btn"
              aria-pressed={view === v}
              onClick={() => { setPick(null); dispatch({ type: 'view', view: v }) }}
            >
              {v === 'collage' ? <SquaresFour aria-hidden="true" focusable="false" weight={view === v ? 'fill' : 'regular'} /> : <ListBullets aria-hidden="true" focusable="false" weight={view === v ? 'bold' : 'regular'} />}
              {v === 'collage' ? 'Collage' : 'List'}
            </button>
          ))}
        </div>
        {view === 'collage' && <TrueSizeSwitch checked={mode === 'true'} onChange={(on) => dispatch({ type: 'mode', mode: on ? 'true' : 'even' })} />}
      </div>

      <FilterBar state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} />

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
        <ListView
          entries={shownList}
          species={species}
          regions={regions}
          order={massOrder}
          onToggle={() => dispatch({ type: 'massOrder', massOrder: massOrder === 'heaviest' ? 'lightest' : 'heaviest' })}
          onPick={onPickRow}
        />
      )}

      <div className="eb-mono eb-legend">
        {view === 'collage' && <p>{mode === 'true' ? 'Sizes follow body mass at true scale' : 'Sizes follow body mass, evened out so small birds stay visible'}</p>}
        <p>* heard only · † found dead · ◦ photo or recording</p>
      </div>

      {picked && pick && (
        <BirdCard
          key={picked.code}
          entry={picked}
          species={species}
          regions={regions}
          anchor={pick.anchor}
          onClose={close}
          actions={cardActions?.(picked, close)}
        />
      )}
    </section>
  )
}
