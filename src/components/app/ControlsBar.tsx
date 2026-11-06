'use client'
// The one horizontal bar above the filters, as LifeList's dock (framer-site): Collage / List tabs, then (with the
// search between them on wide screens) True size in collage view or the list's direction in list view, then
// Scientific. Under 460px of bar the tabs are icons only; under 400px the switches shorten ("True", "Sci.").
import type { ReactNode } from 'react'
import { ArrowDownIcon, CollageIcon, ListIcon } from '@/components/collage/icons'

type Props = {
  view: 'collage' | 'list'
  onView: (v: 'collage' | 'list') => void
  trueSize: boolean
  onTrueSize: (on: boolean) => void
  lightFirst: boolean
  onDirection: () => void
  sci: boolean
  onSci: (on: boolean) => void
  /** The search field. */
  search?: ReactNode
}

export function ControlsBar({ view, onView, trueSize, onTrueSize, lightFirst, onDirection, sci, onSci, search }: Props) {
  return (
    <div className="eb-dockwrap">
      <div className="eb-dock">
        <div className="eb-dock-tabs" role="group" aria-label="View">
          {(['collage', 'list'] as const).map((v) => (
            <button key={v} type="button" className="eb-dock-tab" aria-pressed={view === v} aria-label={v === 'collage' ? 'Collage' : 'List'} onClick={() => onView(v)}>
              {v === 'collage' ? <CollageIcon /> : <ListIcon />}
              <span>{v === 'collage' ? 'Collage' : 'List'}</span>
            </button>
          ))}
        </div>
        {search && <div className="eb-dock-search">{search}</div>}
        {view === 'list' ? (
          <button
            type="button"
            className="eb-dock-tab eb-dock-sw eb-dock-push eb-dock-dir"
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
            className="eb-dock-tab eb-dock-sw eb-dock-push"
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
      </div>
    </div>
  )
}
