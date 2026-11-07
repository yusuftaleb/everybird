'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site), with Photography's search: Collage /
// List tabs on the left; then four groups at even gaps: the view tabs | True size in collage view (or the list's
// direction in list view) and Scientific | the Places and Time dropdowns (FilterDropdowns.tsx) | the magnifier. The
// magnifier turns the dock into the search field (DockSearch.tsx); everything else sits under it, inert, while it is
// open. Under 600px of bar the Places and Time buttons take a second row of their own, split evenly (app.css); under
// 460px the tabs are icons only; under 540px the switches shorten ("True", "Sci."; "Heaviest" in list view), and
// under 330px and 310px everything tightens, so row one never breaks between 280 and 900px of bar (e2e
// dock-sweep.spec). On phones (600px of screen and under, as /lifelist) the short form holds whatever the width: row
// one is the icons, the two switches (or "Heaviest") and the magnifier; row two Places and Time.
import { InfoTip } from './InfoTip'
import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ArrowDownIcon, CollageIcon, ListIcon } from '@/components/collage/icons'
import { DockSearchField, SearchButton, type DockSearchProps } from './DockSearch'

type Props = {
  view: 'collage' | 'list'
  onView: (v: 'collage' | 'list') => void
  trueSize: boolean
  onTrueSize: (on: boolean) => void
  lightFirst: boolean
  onDirection: () => void
  sci: boolean
  onSci: (on: boolean) => void
  /** The search (left out: no magnifier). */
  search?: DockSearchProps
  /** The Places and Time dropdowns; `inert` while the search covers the bar. */
  filters?: (inert: boolean) => ReactNode
}

export function ControlsBar({ view, onView, trueSize, onTrueSize, lightFirst, onDirection, sci, onSci, search, filters }: Props) {
  const [finding, setFinding] = useState(false)
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
        <div className="eb-dock-tabs" role="group" aria-label="View" inert={finding}>
          {(['collage', 'list'] as const).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={v === 'collage' ? 'Collage' : 'List'} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : <ListIcon />}
              <span>{v === 'collage' ? 'Collage' : 'List'}</span>
            </button>
          ))}
        </div>
        <div className="eb-dock-tools" inert={finding}>
          {view === 'list' ? (
            <button
              type="button"
              className="eb-dock-tab eb-dock-sw eb-dock-dir"
              aria-label={`Sorted by body mass, ${lightFirst ? 'lightest' : 'heaviest'} first. Reverse order`}
              onClick={onDirection}
            >
              <span>
                <span className="eb-long">{lightFirst ? 'Lightest first' : 'Heaviest first'}</span>
                <span className="eb-short">{lightFirst ? 'Lightest' : 'Heaviest'}</span>
              </span>
              <ArrowDownIcon up={lightFirst} />
            </button>
          ) : (
            <button
              type="button"
              role="switch"
              aria-checked={trueSize}
              className="eb-dock-tab eb-dock-sw"
              title="Size by body mass at true scale (big birds dwarf small ones)"
              onClick={() => onTrueSize(!trueSize)}
            >
              <span><span className="eb-long">True size</span><span className="eb-short">True</span><span className="eb-sr"> sticker sizes</span></span>
              <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
            </button>
          )}
          {view !== 'list' && (
            <InfoTip label="About True size">
              Sized by body weight. Shape and pose can make some birds look bigger or smaller than they are.
            </InfoTip>
          )}
          <button type="button" role="switch" aria-checked={sci} className="eb-dock-tab eb-dock-sw eb-dock-sci" onClick={() => onSci(!sci)}>
            <span><span className="eb-long">Scientific</span><span className="eb-short">Sci.</span><span className="eb-sr"> names</span></span>
            <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
          </button>
        </div>
        {filters?.(finding)}
        {search && <div className="eb-dock-end" inert={finding}><SearchButton open={finding} onOpen={() => setFinding(true)} buttonRef={findBtn} /></div>}
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
    </div>
  )
}
