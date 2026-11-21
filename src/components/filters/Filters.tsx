'use client'
// One Filters button in the controls bar and one panel behind it (item 10). The button ("Filters" and its glyph, in Accent
// while any of the bird group, Places, Time and Conservation status is in use; how many only in its accessible name) is the
// last of the bar's panel buttons (Taxa, Display, Filters: DockPanelButton, one look), before the search. The panel's
// frame (DockPanel) is the bar's other panels' too (TaxaPanel.tsx, DisplayPanel.tsx). It opens one panel holding the Time, Places and Conservation status sections, each keeping its own control: Time
// (Timeline.tsx; "Count repeat sightings" at the right of its head on a list with month sets) across the top, Places
// (PlacesList.tsx, the drill-down with its breadcrumb) about 2/3 and Conservation status (StatusList.tsx) 1/3 beside each
// other below it. From 600px the panel is a popover the dock's full width right under the dock (over the chip row),
// inside `.eb-dockwrap`, the same in every view (collage, list, map, tree): the filters drive them all; everything
// after the dock wrap dims and goes inert while it is open (CollageView's `.eb-view-below`), and a press there, Esc or a
// second press of the button closes it. On phones it is the modal bottom sheet, its head the count of species and its
// bottom button "Show N species". Filters apply live. The active filters show as chips under the dock (ChipRow.tsx).
// Every word is the language's (`t.filters`, `t.filters.panel`), place names `regionsIn(regions, lang)`.
import { CalendarBlank, CaretDown, GlobeHemisphereWest } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { CloseIcon, FilterLinesIcon } from '@/components/collage/icons'
import { revealInScroller, trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { regionsIn } from '@/lib/i18n-places'
import { filterChips, withoutFilterChip } from '@/lib/list/chips'
import { filtersCount, filtersSpoken, panelHead, showLabel } from '@/lib/list/filter-summary'
import { pressCloses } from '@/lib/dock-panels'
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
import { RepeatSwitch, Timeline } from './Timeline'
import './filters.css'

export type FilterSection = 'places' | 'time' | 'status'
/** Open: from the button (at undefined: focus the dialog) or a collapsed chip (focus that section). */
type FiltersOpen = { at?: FilterSection }
// The lifer-only notice's kinds and the search field's threshold live with the Places panel (places-shared.tsx).
export { SEARCH_FROM, type PlacesNote } from './places-shared'

const SECTION_ORDER: readonly FilterSection[] = ['time', 'places', 'status']
const ICONS: Record<FilterSection, typeof GlobeHemisphereWest> = { places: GlobeHemisphereWest, time: CalendarBlank, status: STATUS_ICON }

/** The sections shown: SECTION_ORDER less `hide`, and Status only when a species on the list has a status or one is checked. */
function useFilterSections(state: AppState, species: SpeciesIndex, hide?: readonly FilterSection[]): FilterSection[] {
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

/**
 * A panel button in the controls bar (Filters, Taxa, Display: one look). The label and a caret, the Surface fill while
 * its panel is open; `active` (something chosen) gives Accent text, and no count: how many is said only in the
 * accessible name (`spoken`; FiltersButton's "Filters, 2 in use: …").
 */
export function DockPanelButton({ label, spoken, open, onToggle, panelId, buttonRef, active, glyph, testId, tour }: {
  label: string
  /** The accessible name (default: the label). */
  spoken?: string
  open: boolean
  onToggle: () => void
  panelId: string
  buttonRef?: RefObject<HTMLButtonElement | null>
  active?: boolean
  glyph?: ReactNode
  testId?: string
  tour?: string
}): ReactNode {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="eb-dock-tab eb-dock-drop"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-haspopup="dialog"
      aria-label={spoken ?? label}
      data-active={active ? '' : undefined}
      data-testid={testId}
      data-tour={tour}
      onClick={onToggle}
    >
      {glyph}
      <span className="eb-drop-label">{label}</span>
      <CaretDown aria-hidden="true" focusable="false" className="eb-drop-caret" />
    </button>
  )
}

/** In the dock's `filters` slot (ControlsBar's `.eb-dock-filters` group). Renders null when `sections` is empty. */
export function FiltersButton({ state, regions, sections, open, onOpen, groupName, buttonRef, panelId }: Shared & { buttonRef: RefObject<HTMLButtonElement | null>; panelId: string }): ReactNode {
  const { lang, t } = useI18n()
  if (!sections.length) return null
  const n = filtersCount(state.filter)
  const said = filtersSpoken(state.filter, regionsIn(regions, lang), t, groupName)
  const name = n > 0 ? plural(t.collage.controls.inUse, n, { label: t.filters.label, n: formatInt(n, t.num) }) : t.filters.label
  return (
    <DockPanelButton
      label={t.filters.label} spoken={said ? `${name}: ${said}` : name} open={!!open} onToggle={() => onOpen(open ? null : {})}
      panelId={panelId} buttonRef={buttonRef} active={n > 0} glyph={<FilterLinesIcon />} testId="filters-button" tour="filter"
    />
  )
}

/** The room a popover has from its top down to the window's bottom, less a small margin (px), at least MIN_DROP. */
export const DROP_MARGIN = 16
const MIN_DROP = 240
export const dropRoom = (top: number, windowH: number): number => Math.max(MIN_DROP, Math.floor(windowH - top - DROP_MARGIN))

/**
 * The controls bar's panels' one frame (Filters, Taxa, Display): from 600px a popover in `.eb-dockwrap` right under the
 * dock (over the chip row, if any), as tall as its content up to the window's bottom less DROP_MARGIN (`--drop-max`, measured on
 * open, scroll and resize); under 600px the modal bottom sheet (portalled to the body: the bar is a size container,
 * which would otherwise be the fixed sheet's containing block), which may take the window's full height, with a head
 * (`sheetHead`, then the close button) and an optional `foot`. Esc, a press outside the dock wrap or on the dock's own
 * empty part (the popover; dock-panels.ts pressCloses), or on the scrim (the sheet) closes it; focus moves in on open
 * and back to `returnFocus()` (if still connected) or the button on close; the top bar keeps its state (frozen, headroom.ts) while it is open.
 */
export function DockPanel({ id, label, kind, testId, buttonRef, returnFocus, onClose, panelRef, sheetHead, foot, children }: {
  id: string
  label: string
  kind: 'filters' | 'taxa' | 'display'
  testId?: string
  buttonRef: RefObject<HTMLButtonElement | null>
  returnFocus?: () => HTMLElement | null
  onClose: () => void
  panelRef?: RefObject<HTMLDivElement | null>
  sheetHead?: ReactNode
  foot?: ReactNode
  children: ReactNode
}): ReactNode {
  const { t } = useI18n()
  const sheet = useIsSheet()
  const own = useRef<HTMLDivElement>(null)
  const ref = panelRef ?? own
  useEscapeCapture(onClose)
  useFocusInAndBack(ref, () => {
    const el = returnFocus?.()
    return el?.isConnected ? el : buttonRef.current
  })
  // The top bar keeps its state while the panel is open (headroom.ts): opening never shows it nor scrolls the page.
  useHoldTopBar()
  // A press outside the dock wrap, or on the dock's own empty part, closes the popover (the dock's controls, the chips and
  // the panel itself stay live: pressCloses); the sheet has its scrim.
  useEffect(() => {
    if (sheet) return
    const down = (e: PointerEvent) => {
      if (pressCloses(e.target as Node, ref.current?.closest('.eb-dockwrap'))) onClose()
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [sheet, onClose, ref])
  // The popover's top: right under the dock (`--dock-bottom`, the dock's bottom edge in the wrap), over whatever shows
  // below it (the chip row), at every width (the dock may wrap to two rows). Its height: down to the window's bottom,
  // never past it (its top moves as the page scrolls).
  useLayoutEffect(() => {
    const el = ref.current
    if (sheet || !el) return
    let frame = 0
    const fit = () => {
      frame = 0
      const dock = el.parentElement?.querySelector<HTMLElement>(':scope > .eb-dock')
      if (dock) el.style.setProperty('--dock-bottom', `${dock.offsetTop + dock.offsetHeight}px`)
      el.style.setProperty('--drop-max', `${dropRoom(el.getBoundingClientRect().top, window.innerHeight)}px`)
    }
    const later = () => { if (!frame) frame = requestAnimationFrame(fit) }
    fit()
    window.addEventListener('resize', later)
    window.addEventListener('scroll', later, { passive: true })
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', later); window.removeEventListener('scroll', later) }
  }, [sheet, ref])
  const body = (
    <div
      ref={ref}
      id={id}
      className={sheet ? 'eb-sheet eb-drop-sheet' : 'eb-drop'}
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={label}
      tabIndex={-1}
      data-kind={kind}
      data-testid={testId}
      onKeyDown={sheet ? (e) => trapTab(e, ref.current) : undefined}
    >
      {sheet && (
        <div className="eb-sheet-head">
          {sheetHead}
          <button type="button" className="eb-sheet-close" aria-label={t.collage.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="eb-drop-body">{children}</div>
      {sheet && foot && <div className="eb-fpanel-foot">{foot}</div>}
    </div>
  )
  return sheet
    ? createPortal(<div className="eb-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{body}</div>, document.body)
    : body
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
  /** Species under the whole filter (CollageView's shownList.length): the head and the sheet's button. */
  shown: number
}

/** In ControlsBar's `below` slot, after the chip row (the popover sits right under the dock, over it), or portalled as the sheet. */
function FiltersPanel({ state, onChange, species, regions, sections, open, onOpen, id, buttonRef, returnFocus, placesNote, placesUnplaced, time, shown }: PanelProps): ReactNode {
  const { t } = useI18n()
  const sheet = useIsSheet()
  const ref = useRef<HTMLDivElement>(null)
  const titles = useId()
  const { filter } = state
  const onClose = useCallback(() => onOpen(null), [onOpen])
  const onFilter = onChange
  // Opened from a collapsed chip (or pressed again while open): focus goes to that section.
  useLayoutEffect(() => {
    if (!open?.at) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-testid="filter-panel-${open.at}"]`)
    if (!el) return
    el.focus({ preventScroll: true })
    if (sheet) revealInScroller(el) // inside the sheet's body, never the page
  }, [open, sheet])

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
        {s === 'time' ? (
          <div className="eb-fsec-head">
            <h3 id={`${titles}-${s}`} className="eb-mono eb-fsec-title">
              <Icon aria-hidden="true" focusable="false" />
              {t.filters[s]}
            </h3>
            <RepeatSwitch filter={filter} seen={state.seen} onFilter={onFilter} />
          </div>
        ) : (
          <h3 id={`${titles}-${s}`} className="eb-mono eb-fsec-title">
            <Icon aria-hidden="true" focusable="false" />
            {t.filters[s]}
          </h3>
        )}
        {s === 'places' ? (
          <PlacesSection state={state} species={species} regions={regions} note={placesNote} unplaced={placesUnplaced} onFilter={onFilter} />
        ) : s === 'status' ? (
          <StatusSection state={state} species={species} onFilter={onFilter} />
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

  return (
    <DockPanel
      id={id} label={t.filters.label} kind="filters" testId="filters-panel" buttonRef={buttonRef} returnFocus={returnFocus} onClose={onClose} panelRef={ref}
      sheetHead={<><span className="eb-mono" role="status" data-testid="filters-head">{head}</span>{clearButton}</>}
      foot={<button type="button" className="eb-btn" data-testid="filters-show" onClick={onClose}>{showLabel(shown, t)}</button>}
    >
      {!sheet && (
        <div className="eb-fpanel-headrow">
          <p className="eb-mono eb-fpanel-head" role="status" data-testid="filters-head">{head}</p>
          {clearButton}
        </div>
      )}
      {has('time') && section('time')}
      {sheet ? lower.map(section) : lower.length > 0 && <div className="eb-fpanel-row">{lower.map(section)}</div>}
    </DockPanel>
  )
}

/** What a filter change must find again: the window's and each popover scroller's position, and the focused control. */
type Kept = { y: number; scrolls: number[]; focus: HTMLElement | null }

/** The panel's scrollers in document order: the body, then Places' list and Status' checklist. */
function panelScrollers(panel: HTMLElement | null): HTMLElement[] {
  return panel ? Array.from(panel.querySelectorAll<HTMLElement>('.eb-drop-body, .eb-places-scroll, [data-sec="status"] .eb-checklist')) : []
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
  shown: number
  /** The panel is opening: the caller closes the bar's other panels (one open at a time). */
  onOpening?: () => void
}

/**
 * The button, the chip row and the panel, wired together as CollageView uses them: `button` for the dock's
 * `filters` slot, `below` for ControlsBar's, `dimmed` for the content after the dock wrap.
 */
export function useFiltersUi({ state, dispatch, species, regions, hide, placesNote, placesUnplaced, time, shown, onOpening }: UiArgs): {
  button: ReactNode
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
  const opening = useRef(onOpening)
  useLayoutEffect(() => { opening.current = onOpening })
  const onOpen = useCallback((o: FiltersOpen | null) => {
    if (o) { opener.current = null; opening.current?.() } // closing keeps it: focus goes back to the chip that opened the panel
    setOpen(o)
  }, [])
  const close = useCallback(() => setOpen(null), [])
  const returnFocus = useCallback(() => opener.current, [])
  const onEmpty = useCallback(() => buttonRef.current?.focus({ preventScroll: true }), [])
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
    opening.current?.()
    opener.current = el
    setOpen({ at: c.kind === 'place' ? 'places' : 'status' })
  }, [])
  const groupName = useCallback((id: string) => { const g = species.groups?.get(id); return g && nameOfGroup(g, lang) }, [species.groups, lang])
  const shared = { state, regions, sections, open, onOpen, groupName }
  return {
    button: <FiltersButton {...shared} buttonRef={buttonRef} panelId={panelId} />,
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
