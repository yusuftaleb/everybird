'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site), with Photography's search: Collage /
// List / Map tabs on the left (in the Map view the size and name switches give up their room, unseen); then four groups at even gaps: the view tabs | True size in collage view (or the list's
// direction in list view) and Scientific | the one Filters button (Filters.tsx) | the magnifier. The magnifier turns the dock into the search field
// (DockSearch.tsx); everything else sits under it, inert, while it is open. Under 820px of bar the
// Filters button takes a second row of its own, under 600px filling it (app.css); under
// 460px the tabs are icons only; under 540px the switches shorten ("True", "Sci."; "Heaviest" in list view), and
// under 330px and 310px everything tightens, so row one never breaks between 280 and 1200px of bar. On phones (600px of screen and under, as /lifelist) the short form holds whatever the width: row
// one is the icons, the two switches (or "Heaviest") and the magnifier; row two the Filters button.
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ArrowDownIcon, CollageIcon, ListIcon, MapIcon } from '@/components/collage/icons'
import { useI18n } from '@/i18n/I18nProvider'
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
  marks?: {
    newest: boolean
    first: boolean
    onNewest: (on: boolean) => void
    onFirst: (on: boolean) => void
  }
  /** The search (left out: no magnifier). */
  search?: DockSearchProps
  /** The Filters button; `inert` while the search covers the bar. */
  filters?: (inert: boolean) => ReactNode
  /** After the dock, inside the wrap: the active-filter chips, then the Filters popover (it anchors under them). */
  below?: ReactNode
  /** The search is opening (pointer or keyboard): the caller closes whatever else is open over the bar. */
  onFind?: () => void
}

export function ControlsBar({ view, onView, noMap, trueSize, onTrueSize, lightFirst, onDirection, sci, onSci, marks, search, filters, below, onFind }: Props) {
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
  return (
    <div ref={wrap} className="eb-dockwrap">
      <div className="eb-dock" data-finding={finding || undefined}>
        <div className="eb-dock-tabs" role="group" aria-label={c.view} inert={finding}>
          {(noMap ? (['collage', 'list'] as const) : (['collage', 'list', 'map'] as const)).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={c[v]} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : v === 'list' ? <ListIcon /> : <MapIcon />}
              <span>{c[v]}</span>
            </button>
          ))}
        </div>
        <div className="eb-dock-tools" inert={finding || view === 'map'} data-off={view === 'map' || undefined}>
          {view === 'list' ? (
            <button
              type="button"
              className="eb-dock-tab eb-dock-sw eb-dock-dir"
              aria-label={lightFirst ? c.sortedLightest : c.sortedHeaviest}
              onClick={onDirection}
            >
              <span>
                <span className="eb-long">{lightFirst ? c.lightestFirst : c.heaviestFirst}</span>
                <span className="eb-short">{lightFirst ? c.lightest : c.heaviest}</span>
              </span>
              <ArrowDownIcon up={lightFirst} />
            </button>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={trueSize}
              className="eb-dock-tab eb-dock-sw"
              title={c.trueTitle}
              onClick={() => onTrueSize(!trueSize)}
            >
              <span><span className="eb-long">{c.trueSize}</span><span className="eb-short">{c.trueShort}</span><span className="eb-sr">{` ${c.trueSr}`}</span></span>
              <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
            </button>
          )}
          <button type="button" role="switch" aria-checked={sci} className="eb-dock-tab eb-dock-sw eb-dock-sci" onClick={() => onSci(!sci)}>
            <span><span className="eb-long">{c.sci}</span><span className="eb-short">{c.sciShort}</span><span className="eb-sr">{` ${c.sciSr}`}</span></span>
            <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
          </button>
        </div>
        {filters?.(finding)}
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => { onFind?.(); setFinding(true) }} buttonRef={findBtn} /></div>}
        {view === 'collage' && marks && (
          <div className="eb-dock-marks" inert={finding}>
            <button type="button" role="switch" aria-checked={marks.newest} className="eb-dock-tab eb-dock-sw" onClick={() => marks.onNewest(!marks.newest)}>
              <span>{c.markNewest}</span>
              <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
            </button>
            <button type="button" role="switch" aria-checked={marks.first} className="eb-dock-tab eb-dock-sw" onClick={() => marks.onFirst(!marks.first)}>
              <span>{c.markFirst}</span>
              <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
            </button>
          </div>
        )}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
      {below}
    </div>
  )
}
