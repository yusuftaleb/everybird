'use client'
// The one horizontal bar above the views, as LifeList's dock (framer-site), with Photography's search: the views on the
// left (Collage / List / Map / Tree); then the panel buttons, all in the Filters button's look (Filters.tsx
// DockPanelButton; round 6, Yusuf, 2026-11-20): Taxa (the taxonomy chips), Display (what changes how the view looks:
// Collage and Tree only) and Filters, one panel open at a time (CollageView, dock-panels.ts); then the magnifier. In
// Collage and Tree nothing else sits in the bar: their switches and choices are the Display panel's (DisplayPanel.tsx).
// List and Map keep their few controls in the bar, before the panel buttons: the Sort menu (List: Family (with family
// headings, ListView), Newest first (the default), Oldest first, Heaviest first, Lightest first; a dock button showing the current order and a caret, opening
// MenuSelect's small menu with its keyboard) and the Scientific switch (both; in Map it changes nothing on the map, so the setting can be changed from any view). The
// magnifier turns the dock into the search field (DockSearch.tsx); everything else sits under it, inert, while it is
// open. Under 820px of bar the controls and panel buttons take a second row of their own; under 1100px the views are
// icons only; under 540px of bar (and on phones) the switches and the sort shorten ("Sci."; "Newest" in list view), and under 330px
// and 310px everything tightens, so row one (the views and the magnifier) never breaks from 280px of bar.
import { CaretDown } from '@phosphor-icons/react'
import { useCallback, useId, useRef, useState, type ReactNode } from 'react'
import { CollageIcon, ListIcon, MapIcon, TreeIcon } from '@/components/collage/icons'
import { MenuList } from '@/components/share/MenuSelect'
import { useI18n } from '@/i18n/I18nProvider'
import { LIST_ORDERS, type ListOrder } from '@/lib/list/list-order'
import { useOfferResume, useTakeResume } from '@/lib/use-resume'
import type { ViewKind } from '@/lib/view-resume'
import { DockSearchField, SearchButton, type DockSearchProps } from './DockSearch'

type Props = {
  view: ViewKind
  onView: (v: ViewKind) => void
  /** No Map tab (a view with no places). */
  noMap?: boolean
  listOrder: ListOrder
  onListOrder: (o: ListOrder) => void
  sci: boolean
  onSci: (on: boolean) => void
  /** The search (left out: no magnifier). */
  search?: DockSearchProps
  /** The panel buttons before Filters: Taxa, and Display in Collage and Tree (inert with their group while the search
   *  covers the bar). */
  panels?: ReactNode
  /** The Filters button. */
  filters?: ReactNode
  /** After the dock, inside the wrap: the active-filter chips, then the open panel's popover (it anchors under them). */
  below?: ReactNode
  /** The search is opening (pointer or keyboard): the caller closes whatever else is open over the bar. */
  onFind?: () => void
}

/** A one-press switch in the bar: the label, its short form on narrow bars and phones (none: the label at every
 *  width), and words for screen readers only. */
function DockSwitch({ on, onChange, long, short, sr, className, title, testId }: {
  on: boolean; onChange: (on: boolean) => void; long: string; short?: string; sr?: string; className?: string; title?: string; testId?: string
}) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`eb-dock-tab eb-dock-sw${className ? ` ${className}` : ''}`} title={title} data-testid={testId} onClick={() => onChange(!on)}>
      <span>{short ? <><span className="eb-long">{long}</span><span className="eb-short">{short}</span></> : long}{sr && <span className="eb-sr">{` ${sr}`}</span>}</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
}

/** The List view's Sort menu: a dock button with the current order (its short form on narrow bars and phones) and a
 *  caret, named "Sort: Newest first"; the menu is MenuSelect's (a check on the current order, arrows, Home, End,
 *  Escape back to the button, Tab or a press outside closes it). */
function SortMenu({ value, onChange }: { value: ListOrder; onChange: (o: ListOrder) => void }) {
  const { t } = useI18n()
  const c = t.collage.controls
  const id = useId()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const esc = useRef<(() => void) | null>(null) // MenuList's hook for a dialog's Escape; the menu takes its own here
  const long = (o: ListOrder) => (o === 'family' ? c.family : c[`${o}First`])
  const short = (o: ListOrder) => (o === 'family' ? c.family : c[o])
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  return (
    <div className="eb-dock-sortwrap">
      <button
        ref={btn} type="button" className="eb-dock-tab eb-dock-sw eb-dock-dir"
        aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined}
        aria-label={`${c.sort}: ${long(value)}`} data-testid="dock-sort"
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>
          <span className="eb-long">{long(value)}</span>
          <span className="eb-short">{short(value)}</span>
        </span>
        <CaretDown aria-hidden="true" focusable="false" className="eb-drop-caret" />
      </button>
      {open && (
        <MenuList
          id={`${id}-menu`} label={c.sort} options={LIST_ORDERS.map((o) => ({ value: o, label: long(o) }))} value={value}
          btn={btn} escapeRef={esc} onPick={(o) => { close(true); if (o !== value) onChange(o) }} onClose={close}
        />
      )}
    </div>
  )
}

export function ControlsBar({ view, onView, noMap, listOrder, onListOrder, sci, onSci, search, panels, filters, below, onFind }: Props) {
  const [finding, setFinding] = useState(false)
  // Whether the search is open is carried over a language switch (view-resume.ts); the typed text is not.
  const hasSearch = !!search
  useTakeResume('search', (r) => { if (hasSearch) setFinding(r.open) })
  useOfferResume('search', () => (hasSearch ? { open: finding } : undefined))
  const { t } = useI18n()
  const c = t.collage.controls
  const wrap = useRef<HTMLDivElement>(null)
  const findBtn = useRef<HTMLButtonElement>(null)
  const close = useCallback((restore: boolean) => {
    setFinding(false)
    if (restore) requestAnimationFrame(() => findBtn.current?.focus({ preventScroll: true }))
  }, [])
  const onPick: DockSearchProps['onPick'] = (h) => {
    setFinding(false)
    search?.onPick(h)
  }
  const sciSwitch = <DockSwitch on={sci} onChange={onSci} long={c.sci} short={c.sciShort} sr={c.sciSr} className="eb-dock-sci" testId="dock-sci" />
  // Only List and Map keep controls in the bar (Collage's and Tree's are the Display panel's).
  const tools = view === 'list' ? (
    <>
      <SortMenu value={listOrder} onChange={onListOrder} />
      {sciSwitch}
    </>
  ) : view === 'map' ? sciSwitch : null
  return (
    <div ref={wrap} className="eb-dockwrap">
      <div className="eb-dock" data-view={view} data-finding={finding || undefined}>
        <div className="eb-dock-tabs" role="group" aria-label={c.view} inert={finding} data-tour="view">
          {(noMap ? (['collage', 'list', 'tree'] as const) : (['collage', 'list', 'map', 'tree'] as const)).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={c[v]} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : v === 'list' ? <ListIcon /> : v === 'map' ? <MapIcon /> : <TreeIcon />}
              <span>{c[v]}</span>
            </button>
          ))}
        </div>
        <div className="eb-dock-filters" inert={finding}>
          {tools && <div className="eb-dock-tools">{tools}</div>}
          {panels}
          {filters}
        </div>
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => { onFind?.(); setFinding(true) }} buttonRef={findBtn} /></div>}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
      {below}
    </div>
  )
}
