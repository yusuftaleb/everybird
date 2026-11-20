'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site), with Photography's search: the views on
// the left (Collage / List / Map / Tree); then, at even gaps, the view's own controls and the one Filters button
// (Filters.tsx), then the magnifier. Each switch is one press and shows only in the view it applies to: True size in
// Collage, the sort direction in List, Lifers only in Tree, Scientific in every view, last among them (in Map it is the
// only one, so the setting can be changed from any view; the map itself has no names to change). In Tree, the Level and
// Layout menus follow the switches, before Filters (Yusuf, 2026-11-20, round 3): TreeView renders them into the slot
// `treeMenus` hands it (a portal), since the levels on offer come from the tree it loads. The magnifier turns the dock into the search field (DockSearch.tsx); everything
// else sits under it, inert, while it is open. Under 820px of bar the view's controls and Filters take a second row of
// their own, wrapping whole (the menus together, the switches together) rather than overflowing. Tree, whose controls
// need more room, also takes the second row from 820px whenever its controls don't fit on one (`data-wrap`, measured:
// `dockRowWidth`); under 600px Filters fills what the switches leave and the Tree's menus fill the rest of their row
// (app.css); under 1100px the views are icons only; under 540px of bar (and on phones) the switches shorten ("True",
// "Sci."; "Heaviest" in list view; Lifers only keeps its words), and under 330px and 310px everything tightens, so row
// one (the views and the magnifier) never breaks from 280px of bar. In Collage, the Arrangement menu (Fit or Oval,
// arrangement.ts: the share dialog's setting too) follows the switches as the Tree's menus do, in their look; under
// 600px of bar it shows its glyph alone, and if True, Sci., the menu and Filters still don't fit on row two, Filters
// takes a row of its own rather than cut its label.
import { useCallback, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDownIcon, CollageIcon, ListIcon, MapIcon, TreeIcon } from '@/components/collage/icons'
import { MenuSelect } from '@/components/share/MenuSelect'
import { useI18n } from '@/i18n/I18nProvider'
import { ARRANGEMENTS, ARRANGE_ICON, setArrangement, useArrangement } from '@/lib/arrangement'
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

const px = (v: string) => parseFloat(v) || 0
const shown = (el: Element) => { const s = getComputedStyle(el); return s.display !== 'none' && s.position !== 'absolute' }
const outer = (el: Element) => { const s = getComputedStyle(el); return (el as HTMLElement).offsetWidth + px(s.marginLeft) + px(s.marginRight) }

/**
 * The width the dock's content needs on one row: the views, every control of the view-and-Filters group side by side
 * (each at its own width: they never stretch or shrink on the Tree's bar, wrapped from 600px or not), and the
 * magnifier, with their margins and the gaps. The group's own margin is left out (its `auto` reads as the room left).
 */
export function dockRowWidth(dock: HTMLElement): number {
  const gap = (el: Element) => px(getComputedStyle(el).columnGap)
  const parts = [...dock.children].filter(shown)
  let w = gap(dock) * Math.max(0, parts.length - 1)
  for (const p of parts) {
    if (!p.classList.contains('eb-dock-filters')) { w += outer(p); continue }
    const kids = [...p.children].filter(shown)
    w += kids.reduce((a, k) => a + outer(k), 0) + gap(p) * Math.max(0, kids.length - 1)
  }
  return w
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
  const arrangement = useArrangement()
  const arrangeId = useId()
  const arrangeEscape = useRef<(() => void) | null>(null) // MenuSelect's hook for a dialog's Escape: none here
  const wrap = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  // Tree: the controls take the second row only when they don't fit on one (measured before paint, again on every
  // change of the bar's or a control's width; left as it is while the search covers the bar).
  const [treeWrap, setTreeWrap] = useState(false)
  useLayoutEffect(() => {
    const el = dock.current
    if (view !== 'tree' || finding || !el || typeof ResizeObserver === 'undefined') return
    const check = () => {
      const s = getComputedStyle(el)
      setTreeWrap(dockRowWidth(el) > el.clientWidth - px(s.paddingLeft) - px(s.paddingRight) + 0.5)
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    const group = el.querySelector('.eb-dock-filters')
    if (group) { ro.observe(group); for (const k of group.children) ro.observe(k) }
    return () => ro.disconnect()
  }, [view, finding])
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
  ) : sciSwitch
  return (
    <div ref={wrap} className="eb-dockwrap">
      <div ref={dock} className="eb-dock" data-view={view} data-wrap={(view === 'tree' && treeWrap) || undefined} data-finding={finding || undefined}>
        <div className="eb-dock-tabs" role="group" aria-label={c.view} inert={finding} data-tour="view">
          {(noMap ? (['collage', 'list', 'tree'] as const) : (['collage', 'list', 'map', 'tree'] as const)).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={c[v]} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : v === 'list' ? <ListIcon /> : v === 'map' ? <MapIcon /> : <TreeIcon />}
              <span>{c[v]}</span>
            </button>
          ))}
        </div>
        <div className="eb-dock-filters" inert={finding}>
          <div className="eb-dock-tools">{tools}</div>
          {view === 'tree' && <div ref={treeMenus} className="eb-dock-menus" />}
          {view === 'collage' && (
            <div className="eb-dock-menus eb-dock-arrange">
              <span id={arrangeId} className="eb-sr">{t.share.arrange.label}</span>
              <MenuSelect
                labelledBy={arrangeId} menuLabel={t.share.arrange.label} value={arrangement} escapeRef={arrangeEscape} testId="dock-arrange"
                options={ARRANGEMENTS.map((a) => ({ value: a, label: t.share.arrange[a], icon: ARRANGE_ICON[a] }))}
                onChange={setArrangement}
              />
            </div>
          )}
          {filters}
        </div>
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => { onFind?.(); setFinding(true) }} buttonRef={findBtn} /></div>}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
      {below}
    </div>
  )
}
