'use client'
// Places and Time: two dropdown buttons in the controls bar, between Scientific and the search. Each button says what
// it filters when active ("Places · 2", "Time · 2022–2024"), so the bar itself shows every active place or time filter;
// taxonomy is the strip under the bar. A button opens its panel (one at a time; a second tap, Esc or a press outside
// closes it and focus returns to the button): a popover under the bar on wider screens, a bottom sheet on phones.
// Filters apply live.
//  - Places: a checklist of countries (flag, name, species seen there), sorted by count; several may be checked (the
//    collage keeps species seen in ANY of them); Clear; a search field once there are more than SEARCH_FROM countries.
//    A list whose places are all lifer places says so (PlacesNote).
//  - Time: the timeline (Timeline.tsx): month bars, a year axis, a range of months; Clear.
import { CalendarBlank, CaretDown, GlobeHemisphereWest } from '@phosphor-icons/react'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { CloseIcon, SearchIcon } from '@/components/collage/icons'
import { Flag } from '@/components/Flag'
import { trapTab, useEscapeCapture, useFocusInAndBack, useIsSheet } from '@/components/dialog-utils'
import { stripBracket } from '@/lib/import/places'
import { placesSpoken, placesSummary, timeSpoken, timeSummary } from '@/lib/list/filter-summary'
import { options, toggleCountry, withCountries, type ChipOption, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Action, AppState } from '@/lib/list/store'
import type { Month } from '@/lib/list/timeline'
import { searchKey } from '@/lib/species/name-search'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { Timeline } from './Timeline'
import './filters.css'

export type Panel = 'places' | 'time'
/**
 * The lifer-only notice: every place on the list is where a lifer was first seen. 'add': no file that knows every
 * sighting yet (bring MyEBirdData or iNaturalist); 'reimport': a MyEBirdData import saved before seen-here existed.
 */
export type PlacesNote = 'add' | 'reimport'

/** More countries than this, and the Places panel gets a search field. */
export const SEARCH_FROM = 12

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** The open panel (one at a time), kept by the parent. */
  open: Panel | null
  onOpen: (p: Panel | null) => void
  /** Buttons to leave out (a shared link that carries no places or dates). */
  hide?: readonly Panel[]
  placesNote?: PlacesNote
  /** The Time panel's timeline: the known entries, the whole list's months, today. */
  time: { entries: ListEntry[]; months: Month[]; today: Month; onPreview?: (r: { from?: Month; to?: Month } | null) => void }
  /** The search covers the bar: the buttons are inert. */
  inert?: boolean
}

const PANELS: { id: Panel; label: string; Icon: typeof GlobeHemisphereWest }[] = [
  { id: 'places', label: 'Places', Icon: GlobeHemisphereWest },
  { id: 'time', label: 'Time', Icon: CalendarBlank },
]

export function FilterDropdowns({ state, dispatch, species, regions, open, onOpen, hide, placesNote, time, inert }: Props) {
  const base = useId()
  const sheet = useIsSheet()
  const { filter } = state
  const buttons = useRef<Partial<Record<Panel, HTMLButtonElement | null>>>({})
  const countryName = useMemo(() => (iso: string) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso), [regions])
  const shown = PANELS.filter((p) => !hide?.includes(p.id))
  const current = shown.find((p) => p.id === open)
  if (!shown.length) return null
  const onFilter = (f: Filter) => dispatch({ type: 'filter', filter: f })

  const summary = (p: Panel) => (p === 'places' ? placesSummary(filter) : timeSummary(filter))
  const spoken = (p: Panel) => (p === 'places' ? placesSpoken(filter, countryName) : timeSpoken(filter))

  return (
    <>
      <div className="eb-dock-filters" role="group" aria-label="Places and time" inert={inert}>
        {shown.map(({ id, label, Icon }) => {
          const s = summary(id)
          const said = spoken(id)
          return (
            <button
              key={id}
              ref={(el) => { buttons.current[id] = el }}
              type="button"
              className="eb-dock-tab eb-dock-drop"
              aria-expanded={open === id}
              aria-controls={open === id ? `${base}-${id}` : undefined}
              aria-haspopup="dialog"
              aria-label={said ? `${label}: ${said}` : label}
              data-active={s ? '' : undefined}
              data-testid={`filter-tab-${id}`}
              onClick={() => onOpen(open === id ? null : id)}
            >
              <Icon aria-hidden="true" focusable="false" />
              <span className="eb-drop-label">
                {label}
                {s && <span className="eb-drop-sum"> · {s}</span>}
              </span>
              <CaretDown aria-hidden="true" focusable="false" className="eb-drop-caret" />
            </button>
          )
        })}
      </div>
      {current && (
        <DropPanel
          key={current.id}
          id={`${base}-${current.id}`}
          kind={current.id}
          title={current.label}
          sheet={sheet}
          button={() => buttons.current[current.id] ?? null}
          onClose={() => onOpen(null)}
        >
          {current.id === 'places' ? (
            <PlacesList state={state} species={species} name={countryName} note={placesNote} onFilter={onFilter} />
          ) : (
            <Timeline
              entries={time.entries}
              seen={state.seen}
              filter={filter}
              species={species}
              months={time.months}
              today={time.today}
              onFilter={onFilter}
              onPreview={time.onPreview}
            />
          )}
        </DropPanel>
      )}
    </>
  )
}

type PanelProps = { id: string; kind: Panel; title: string; sheet: boolean; button: () => HTMLButtonElement | null; onClose: () => void; children: ReactNode }

/** A popover under the bar (non-modal: a press outside closes it) or, on phones, a modal bottom sheet. */
function DropPanel({ id, kind, title, sheet, button, onClose, children }: PanelProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEscapeCapture(onClose)
  useFocusInAndBack(ref, button)
  // A press outside the popover and its button closes it (the sheet has its scrim).
  useEffect(() => {
    if (sheet) return
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (ref.current?.contains(t) || button()?.contains(t)) return
      onClose()
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [sheet, button, onClose])

  const body = (
    <div
      ref={ref}
      id={id}
      className={sheet ? 'eb-sheet eb-drop-sheet' : 'eb-drop'}
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={title}
      tabIndex={-1}
      data-kind={kind}
      data-testid={`filter-panel-${kind}`}
      onKeyDown={sheet ? (e) => trapTab(e, ref.current) : undefined}
    >
      {sheet && (
        <div className="eb-sheet-head">
          <span className="eb-mono">{title}</span>
          <button type="button" className="eb-sheet-close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="eb-drop-body">{children}</div>
    </div>
  )
  // The sheet goes to <body>: the bar is a size container, which would otherwise be the fixed sheet's containing block.
  return sheet
    ? createPortal(<div className="eb-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{body}</div>, document.body)
    : body
}

/** "Showing where each lifer was first seen", and how to get every country a species was seen in. */
function PlacesNoteLine({ note }: { note: PlacesNote }) {
  return (
    <p className="eb-note eb-places-note" data-testid="places-lifer-only">
      Showing where each lifer was first seen.{' '}
      {note === 'reimport' ? (
        <><Link href="/settings">Import Download My Data again</Link> for full country lists.</>
      ) : (
        <><Link href="/settings">Add MyEBirdData or iNaturalist</Link> for full country lists.</>
      )}
    </p>
  )
}

function PlacesList({ state, species, name, note, onFilter }: { state: AppState; species: SpeciesIndex; name: (iso: string) => string; note?: PlacesNote; onFilter: (f: Filter) => void }) {
  const { list, filter, seen } = state
  const [q, setQ] = useState('')
  const checked = useMemo(() => new Set(filter.countries ?? []), [filter.countries])
  // Every country with a species under the other filters, and any checked one that has none now (so it can be unchecked).
  const rows = useMemo(() => {
    const opts = options(list, filter, 'country', species, name, seen)
    const missing: ChipOption[] = [...checked].filter((c) => !opts.some((o) => o.value === c)).map((c) => ({ value: c, label: name(c), count: 0 }))
    return [...opts, ...missing]
  }, [list, filter, species, name, seen, checked])
  const searchable = rows.length > SEARCH_FROM
  // Word prefixes, accent- and case-insensitive (as the bird search): "new z" finds New Zealand.
  const key = searchable ? searchKey(q) : ''
  const visible = key ? rows.filter((r) => { const ws = searchKey(r.label).split(' '); return key.split(' ').every((t) => ws.some((w) => w.startsWith(t))) }) : rows
  const n = (x: number) => x.toLocaleString('en-US')

  return (
    <div className="eb-places">
      <div className="eb-places-head">
        <span className="eb-mono">Countries · {n(rows.length)}</span>
        {checked.size > 0 && (
          <button type="button" className="eb-textbtn" data-testid="places-clear" onClick={() => onFilter(withCountries(filter, []))}>Clear</button>
        )}
      </div>
      {note && <PlacesNoteLine note={note} />}
      {searchable && (
        // The app's one field style (globals.css .eb-input), with the site's lens.
        <div className="eb-input-wrap">
          <SearchIcon className="eb-input-icon" />
          <input
            type="search"
            className="eb-input eb-input-search"
            placeholder="Find a country"
            aria-label="Find a country"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            data-testid="places-find"
          />
        </div>
      )}
      {rows.length === 0 ? (
        <p className="eb-note">No places on this list.</p>
      ) : (
        <ul className="eb-checklist" aria-label="Countries">
          {visible.map((r) => {
            return (
              <li key={r.value}>
                <label className="eb-check" data-checked={checked.has(r.value) ? '' : undefined}>
                  <input type="checkbox" checked={checked.has(r.value)} onChange={() => onFilter(toggleCountry(filter, r.value))} data-testid={`country-${r.value}`} />
                  <Flag iso={r.value} />
                  <span className="eb-check-name">{r.label}</span>
                  <span className="eb-count" aria-hidden="true">{n(r.count)}</span>
                  <span className="eb-sr">, {n(r.count)} species</span>
                </label>
              </li>
            )
          })}
          {visible.length === 0 && <li className="eb-note eb-check-none">No country matches.</li>}
        </ul>
      )}
    </div>
  )
}
