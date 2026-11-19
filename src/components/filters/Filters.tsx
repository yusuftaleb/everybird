'use client'
// One Filters button in the controls bar and one panel behind it (item 10). The button ("Filters · 2": how many of the bird group,
// Places, Time and Conservation status are in use, not checked boxes) sits in the controls bar between Scientific and the
// search. It opens one panel holding the Time, Places and Conservation status sections, each keeping its own control: Time (Timeline.tsx) across the top, Places
// (PlacesList.tsx, the drill-down) about 2/3 and Conservation status (StatusList.tsx) 1/3 beside each other below it. From
// 600px the panel is a popover under the chip row (or under the dock with none), inside `.eb-dockwrap`; everything
// after the dock wrap dims and goes inert while it is open (CollageView's `.eb-view-below`), and a press there, Esc or a
// second press of the button closes it. On phones it is the modal bottom sheet, its head the count of species and its
// bottom button "Show N species". Filters apply live. The active filters show as chips under the dock (ChipRow.tsx).
// Every word is the language's (`t.filters`, `t.filters.panel`), place names `regionsIn(regions, lang)`.
import { CalendarBlank, CaretDown, GlobeHemisphereWest } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CloseIcon, FilterLinesIcon } from '@/components/collage/icons'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { useI18n } from '@/i18n/I18nProvider'
import { regionsIn } from '@/lib/i18n-places'
import { filterChips, withoutFilterChip } from '@/lib/list/chips'
import { filtersCount, filtersSpoken, panelHead, showLabel } from '@/lib/list/filter-summary'
import { emptyFilter, filterActive, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Action, AppState } from '@/lib/list/store'
import type { Month } from '@/lib/list/timeline'
import { groupName as nameOfGroup } from '@/lib/search/groups'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { useOfferResume, useTakeResume } from '@/lib/use-resume'
import { ChipRow } from './ChipRow'
import { PlacesList } from './PlacesList'
import { STATUS_ICON } from './status-icon'
import type { PlacesNote } from './places-shared'
import type { PlacesUnplaced } from '@/lib/list/filter-summary'
import { StatusList } from './StatusList'
import { Timeline } from './Timeline'
import './filters.css'

export type FilterSection = 'places' | 'time' | 'status'
/** Open: from the button (at undefined: focus the dialog) or a collapsed chip (focus that section). */
export type FiltersOpen = { at?: FilterSection }
// The lifer-only notice's kinds and the search field's threshold live with the Places panel (places-shared.tsx).
export { SEARCH_FROM, type PlacesNote } from './places-shared'

export const SECTION_ORDER: readonly FilterSection[] = ['time', 'places', 'status']
const ICONS: Record<FilterSection, typeof GlobeHemisphereWest> = { places: GlobeHemisphereWest, time: CalendarBlank, status: STATUS_ICON }

/** The sections shown: SECTION_ORDER less `hide`, and Status only when a species on the list has a status or one is checked. */
export function useFilterSections(state: AppState, species: SpeciesIndex, hide?: readonly FilterSection[]): FilterSection[] {
  const listHasStatus = useMemo(() => state.list.some((e) => species.byCode.get(e.code)?.iu), [state.list, species])
  const hasStatus = listHasStatus || !!state.filter.statuses?.length
  return useMemo(
    () => SECTION_ORDER.filter((s) => !hide?.includes(s) && (s !== 'status' || hasStatus)),
    [hide, hasStatus],
  )
}

type Shared = {
  state: AppState
  regions: Regions
  sections: readonly FilterSection[]
  open: FiltersOpen | null
  onOpen: (o: FiltersOpen | null) => void
  /** The bird group's name in the language (for the button's spoken text). */
  groupName?: (id: string) => string | undefined
}

/** In the dock's `filters` slot. Renders null when `sections` is empty. */
export function FiltersButton({ state, regions, sections, open, onOpen, groupName, inert, buttonRef, panelId }: Shared & { inert?: boolean; buttonRef: RefObject<HTMLButtonElement | null>; panelId: string }): ReactNode {
  const { lang, t } = useI18n()
  if (!sections.length) return null
  const n = filtersCount(state.filter)
  const said = filtersSpoken(state.filter, regionsIn(regions, lang), t, groupName)
  return (
    <div className="eb-dock-filters" inert={inert}>
      <button
        ref={buttonRef}
        type="button"
        className="eb-dock-tab eb-dock-drop"
        aria-expanded={!!open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={said ? `${t.filters.label}: ${said}` : t.filters.label}
        data-active={n > 0 ? '' : undefined}
        data-testid="filters-button"
        onClick={() => onOpen(open ? null : {})}
      >
        <FilterLinesIcon />
        <span className="eb-drop-label">
          {t.filters.label}
          {n > 0 && <span className="eb-drop-sum"> · {n}</span>}
        </span>
        <CaretDown aria-hidden="true" focusable="false" className="eb-drop-caret" />
      </button>
    </div>
  )
}

const PlacesSection = memo(PlacesList)
const StatusSection = memo(StatusList)

type PanelProps = Shared & {
  /** Every filter change goes through here (useFiltersUi keeps the place around it); stable. */
  onChange: (f: Filter) => void
  species: SpeciesIndex
  id: string
  buttonRef: RefObject<HTMLButtonElement | null>
  /** Where focus goes on close, if still connected (the chip that opened it); else the Filters button. */
  returnFocus?: () => HTMLElement | null
  placesNote?: PlacesNote
  /** The Places section's line about observation.org birds with no places. */
  placesUnplaced?: PlacesUnplaced
  time: { entries: ListEntry[]; months: Month[]; today: Month; onPreview?: (r: { from?: Month; to?: Month } | null) => void }
  threatLine?: number
  /** Species under the whole filter (CollageView's shownList.length): the head and the sheet's button. */
  shown: number
}

/** In ControlsBar's `below` slot, after the chip row (the popover anchors under it), or portalled as the sheet. */
export function FiltersPanel({ state, onChange, species, regions, sections, open, onOpen, id, buttonRef, returnFocus, placesNote, placesUnplaced, time, threatLine, shown }: PanelProps): ReactNode {
  const { t } = useI18n()
  const sheet = useIsSheet()
  const ref = useRef<HTMLDivElement>(null)
  const titles = useId()
  const { filter } = state
  const onClose = useCallback(() => onOpen(null), [onOpen])
  const onFilter = onChange
  useEscapeCapture(onClose)
  useFocusInAndBack(ref, () => {
    const el = returnFocus?.()
    return el?.isConnected ? el : buttonRef.current
  })
  // Shown, the top bar must not cover the popover or its controls bar (a sheet sits above it anyway).
  useHoldTopBar(() => (sheet ? null : ref.current?.closest<HTMLElement>('.eb-dockwrap')))
  // Opened from a collapsed chip (or pressed again while open): focus goes to that section.
  useLayoutEffect(() => {
    if (!open?.at) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-testid="filter-panel-${open.at}"]`)
    if (!el) return
    el.focus({ preventScroll: true })
    if (sheet) el.scrollIntoView?.({ block: 'nearest' })
  }, [open, sheet])
  // A press outside the dock wrap (the dock, the chips and the panel itself stay live) closes the popover; the sheet has its scrim.
  useEffect(() => {
    if (sheet) return
    const down = (e: PointerEvent) => {
      const wrap = ref.current?.closest('.eb-dockwrap')
      if (wrap?.contains(e.target as Node)) return
      onClose()
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [sheet, onClose])

  const n = filtersCount(filter)
  const head = panelHead(n, shown, t)
  // Every filter off in one dispatch; the button may vanish with the last filter, so focus stays on the dialog.
  const clearAll = () => {
    onFilter(emptyFilter())
    ref.current?.focus({ preventScroll: true })
  }
  const clearButton = filterActive(filter) && (
    <button type="button" className="eb-textbtn" aria-label={t.filters.panel.clearAllLabel} data-testid="filters-clear-all" onClick={clearAll}>
      {t.filters.panel.clearAll}
    </button>
  )
  const section = (s: FilterSection) => {
    const Icon = ICONS[s]
    return (
      <div key={s} className="eb-fsec" role="group" aria-labelledby={`${titles}-${s}`} tabIndex={-1} data-sec={s} data-testid={`filter-panel-${s}`}>
        <h3 id={`${titles}-${s}`} className="eb-mono eb-fsec-title">
          <Icon aria-hidden="true" focusable="false" />
          {t.filters[s]}
        </h3>
        {s === 'places' ? (
          <PlacesSection state={state} species={species} regions={regions} note={placesNote} unplaced={placesUnplaced} onFilter={onFilter} />
        ) : s === 'status' ? (
          <StatusSection state={state} species={species} threatLine={threatLine} onFilter={onFilter} />
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
      </div>
    )
  }
  const has = (s: FilterSection) => sections.includes(s)
  const lower = (['places', 'status'] as const).filter(has)

  const body = (
    <div
      ref={ref}
      id={id}
      className={sheet ? 'eb-sheet eb-drop-sheet' : 'eb-drop'}
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={t.filters.label}
      tabIndex={-1}
      data-kind="filters"
      data-testid="filters-panel"
      onKeyDown={sheet ? (e) => trapTab(e, ref.current) : undefined}
    >
      {sheet && (
        <div className="eb-sheet-head">
          <span className="eb-mono" role="status" data-testid="filters-head">{head}</span>
          {clearButton}
          <button type="button" className="eb-sheet-close" aria-label={t.collage.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="eb-drop-body">
        {!sheet && (
          <div className="eb-fpanel-headrow">
            <p className="eb-mono eb-fpanel-head" role="status" data-testid="filters-head">{head}</p>
            {clearButton}
          </div>
        )}
        {has('time') && section('time')}
        {sheet ? lower.map(section) : lower.length > 0 && <div className="eb-fpanel-row">{lower.map(section)}</div>}
      </div>
      {sheet && (
        <div className="eb-fpanel-foot">
          <button type="button" className="eb-btn" data-testid="filters-show" onClick={onClose}>{showLabel(shown, t)}</button>
        </div>
      )}
    </div>
  )
  // The sheet goes to <body>: the bar is a size container, which would otherwise be the fixed sheet's containing block.
  return sheet
    ? createPortal(<div className="eb-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{body}</div>, document.body)
    : body
}

/** What a filter change must find again: the window's and each popover scroller's position, and the focused control. */
type Kept = { y: number; scrolls: number[]; focus: HTMLElement | null }

/** The panel's scrollers in document order: the body, then each Places or Status checklist. */
function panelScrollers(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('.eb-drop-body, .eb-checklist')) : []
}

function keepPlace(panel: HTMLElement | null): Kept {
  const a = document.activeElement
  return {
    y: window.scrollY,
    scrolls: panelScrollers(panel).map((el) => el.scrollTop),
    focus: a instanceof HTMLElement && a !== document.body ? a : null,
  }
}

/** Puts back what a change moved: only what moved, so nothing scrolls that did not. Focus returns only if it was lost. */
function restorePlace(k: Kept, panel: HTMLElement | null): void {
  if (window.scrollY !== k.y) window.scrollTo(0, k.y)
  panelScrollers(panel).forEach((el, i) => {
    const top = k.scrolls[i]
    if (top !== undefined && el.scrollTop !== top) el.scrollTop = top
  })
  const active = document.activeElement
  if (k.focus?.isConnected && (!active || active === document.body)) k.focus.focus({ preventScroll: true })
}

type UiArgs = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  hide?: readonly FilterSection[]
  placesNote?: PlacesNote
  placesUnplaced?: PlacesUnplaced
  time: PanelProps['time']
  threatLine?: number
  shown: number
}

/**
 * The button, the chip row and the panel, wired together as CollageView uses them: `button(inert)` for the dock's
 * `filters` slot, `below` for ControlsBar's, `dimmed` for the content after the dock wrap.
 */
export function useFiltersUi({ state, dispatch, species, regions, hide, placesNote, placesUnplaced, time, threatLine, shown }: UiArgs): {
  button: (inert: boolean) => ReactNode
  below: ReactNode
  dimmed: boolean
  /** The panel is open (popover or sheet): CollageView freezes the height of the collage column while it is. */
  frozen: boolean
  /** Closes the panel (the search opening calls it). */
  close: () => void
} {
  const base = useId()
  const { lang, t } = useI18n()
  const sheet = useIsSheet()
  const [open, setOpen] = useState<FiltersOpen | null>(null)
  // Carried over a language switch (view-resume.ts): the section it was open at, if the birder had it open.
  useTakeResume('panel', (r) => setOpen(r.open ? { at: r.at } : null))
  useOfferResume('panel', () => ({ open: !!open, at: open?.at }))
  const opener = useRef<HTMLElement | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const sections = useFilterSections(state, species, hide)
  const { filter } = state
  const chips = useMemo(() => filterChips(filter, regionsIn(regions, lang), t, (id) => { const g = species.groups?.get(id); return g && nameOfGroup(g, lang) }), [filter, regions, lang, t, species.groups])
  const panelId = `${base}-filters`
  const live = !!open && sections.length > 0
  // Every filter change while the panel is open keeps the window's scroll, the scrollers' and the focus (restored in the
  // layout effect below, once the change has committed). The snapshot is used by the first commit after it, or dropped
  // at the end of the event when nothing re-rendered.
  const liveRef = useRef(live)
  useLayoutEffect(() => { liveRef.current = live })
  const kept = useRef<Kept | null>(null)
  const change = useCallback((f: Filter) => {
    kept.current = liveRef.current ? keepPlace(document.getElementById(panelId)) : null
    dispatch({ type: 'filter', filter: f })
    queueMicrotask(() => { kept.current = null })
  }, [dispatch, panelId])
  useLayoutEffect(() => {
    const k = kept.current
    if (!k) return
    kept.current = null
    restorePlace(k, document.getElementById(panelId))
  })
  const onOpen = useCallback((o: FiltersOpen | null) => {
    if (o) opener.current = null // closing keeps it: focus goes back to the chip that opened the panel
    setOpen(o)
  }, [])
  const close = useCallback(() => setOpen(null), [])
  const returnFocus = useCallback(() => opener.current, [])
  const onEmpty = useCallback(() => buttonRef.current?.focus(), [])
  // The chips' scope: group, places, time (and its basis) and statuses; the taxonomy path has its own breadcrumb.
  // The same as the panel's Clear all: every filter, the taxonomy choice too.
  const onClearAll = useCallback(() => change(emptyFilter()), [change])
  const active = chips.length + (filter.order || filter.family ? 1 : 0)
  // Every removal changes the filter, so the chips change and ChipRow's remembered index is used up.
  const onRemove = useCallback(
    (c: (typeof chips)[number]) => change(withoutFilterChip(filter, c)),
    [change, filter],
  )
  const onChip = useCallback((c: (typeof chips)[number], el: HTMLElement) => {
    opener.current = el
    setOpen({ at: c.kind === 'place' ? 'places' : 'status' })
  }, [])
  const groupName = useCallback((id: string) => { const g = species.groups?.get(id); return g && nameOfGroup(g, lang) }, [species.groups, lang])
  const shared = { state, regions, sections, open, onOpen, groupName }
  return {
    button: (inert) => <FiltersButton {...shared} inert={inert} buttonRef={buttonRef} panelId={panelId} />,
    below: (
      <>
        <ChipRow chips={chips} label={t.filters.panel.chips} testId="filter-chips" onRemove={onRemove} onOpen={onChip} onEmpty={onEmpty} onClearAll={onClearAll} active={active} />
        {live && (
          <FiltersPanel
            {...shared}
            onChange={change}
            species={species}
            id={panelId}
            buttonRef={buttonRef}
            returnFocus={returnFocus}
            placesNote={placesNote}
            placesUnplaced={placesUnplaced}
            time={time}
            threatLine={threatLine}
            shown={shown}
          />
        )}
      </>
    ),
    dimmed: live && !sheet,
    frozen: live,
    close,
  }
}
