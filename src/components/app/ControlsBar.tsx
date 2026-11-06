'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site), with Photography's search: Collage /
// List tabs on the left; True size in collage view (or the list's direction in list view), Scientific and the
// magnifier on the right. The magnifier turns the whole dock into the search field (DockSearch.tsx); the tabs and
// tools sit under it, inert, while it is open. Under 460px of bar the tabs are icons only; under 400px the switches
// shorten ("True", "Sci."). One row at every width.
import { useCallback, useRef, useState } from 'react'
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
}

export function ControlsBar({ view, onView, trueSize, onTrueSize, lightFirst, onDirection, sci, onSci, search }: Props) {
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
          <button type="button" role="switch" aria-checked={sci} className="eb-dock-tab eb-dock-sw eb-dock-sci" onClick={() => onSci(!sci)}>
            <span><span className="eb-long">Scientific</span><span className="eb-short">Sci.</span><span className="eb-sr"> names</span></span>
            <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
          </button>
          {search && <SearchButton open={finding} onOpen={() => setFinding(true)} buttonRef={findBtn} />}
        </div>
        {search && <DockSearchField {...search} onPick={onPick} open={finding} onClose={close} within={wrap} />}
      </div>
    </div>
  )
}
