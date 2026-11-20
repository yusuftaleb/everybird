'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site), with Photography's search: the views on
// the left (Collage / List / Map / Tree); then, at even gaps, the view's own controls and the one Filters button
// (Filters.tsx), then the magnifier. Each switch is one press and shows only in the view it applies to: True size in
// Collage, the sort direction in List, Lifers only in Tree, Scientific in all three; none in Map. In Tree, the Level and
// Layout menus come first: TreeView renders them into the slot `treeMenus` hands it (a portal), since the levels on
// offer come from the tree it loads. The magnifier turns the dock into the search field (DockSearch.tsx); everything
// else sits under it, inert, while it is open. Under 820px of bar (1200px in Tree, whose controls need more room) the
// view's controls and Filters take a second row of their own, wrapping whole (the menus together, the switches
// together) rather than overflowing; under 600px Filters fills what the switches leave and the Tree's menus take a row
// to themselves (app.css); under 1100px the views are icons only; under 540px of bar (and on phones) the switches
// shorten ("True", "Sci."; "Heaviest" in list view; Lifers only keeps its words), and under 330px and 310px everything
// tightens, so row one (the views and the magnifier) never breaks between 280 and 1200px of bar.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ArrowDownIcon, CollageIcon, ListIcon, MapIcon, TreeIcon } from '@/components/collage/icons'
import { useI18n } from '@/i18n/I18nProvider'
import { setTreeMine, useTreeMine } from '@/lib/tree-mine'
import { useOfferResume, useTakeResume } from '@/lib/use-resume'
import type { ViewKind } from '@/lib/view-resume'
import { DockSearchField, SearchButton, type DockSearchProps } from './DockSearch'

type Props = {
  view: ViewKind
  onView: (v: ViewKind) => void
  /** No Map tab (a view with no places). */
  noMap?: boolean
  trueSize: boolean
  onTrueSize: (on: boolean) => void
  lightFirst: boolean
  onDirection: () => void
  sci: boolean
  onSci: (on: boolean) => void
  /** The search (left out: no magnifier). */
  search?: DockSearchProps
  /** The Filters button (inert with its group while the search covers the bar). */
  filters?: ReactNode
  /** After the dock, inside the wrap: the active-filter chips, then the Filters popover (it anchors under them). */
  below?: ReactNode
  /** The search is opening (pointer or keyboard): the caller closes whatever else is open over the bar. */
  onFind?: () => void
  /** In Tree view: given the element the Level and Layout menus go in (TreeView fills it). */
  treeMenus?: (el: HTMLDivElement | null) => void
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

export function ControlsBar({ view, onView, noMap, trueSize, onTrueSize, lightFirst, onDirection, sci, onSci, search, filters, below, onFind, treeMenus }: Props) {
  const [finding, setFinding] = useState(false)
  // Whether the search is open is carried over a language switch (view-resume.ts); the typed text is not.
  const hasSearch = !!search
  useTakeResume('search', (r) => { if (hasSearch) setFinding(r.open) })
  useOfferResume('search', () => (hasSearch ? { open: finding } : undefined))
  const { t } = useI18n()
  const c = t.collage.controls
  const mine = useTreeMine()
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
  const tools = view === 'collage' ? (
    <>
      <DockSwitch on={trueSize} onChange={onTrueSize} long={c.trueSize} short={c.trueShort} sr={c.trueSr} title={c.trueTitle} testId="dock-true" />
      {sciSwitch}
    </>
  ) : view === 'list' ? (
    <>
      <button type="button" className="eb-dock-tab eb-dock-sw eb-dock-dir" aria-label={lightFirst ? c.sortedLightest : c.sortedHeaviest} data-testid="dock-sort" onClick={onDirection}>
        <span>
          <span className="eb-long">{lightFirst ? c.lightestFirst : c.heaviestFirst}</span>
          <span className="eb-short">{lightFirst ? c.lightest : c.heaviest}</span>
        </span>
        <ArrowDownIcon up={lightFirst} />
      </button>
      {sciSwitch}
    </>
  ) : view === 'tree' ? (
    <>
      <DockSwitch on={mine} onChange={setTreeMine} long={c.lifersOnly} testId="tree-mine" />
      {sciSwitch}
    </>
  ) : null
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
          {view === 'tree' && <div ref={treeMenus} className="eb-dock-menus" />}
          {tools && <div className="eb-dock-tools">{tools}</div>}
          {filters}
        </div>
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => { onFind?.(); setFinding(true) }} buttonRef={findBtn} /></div>}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
      {below}
    </div>
  )
}
