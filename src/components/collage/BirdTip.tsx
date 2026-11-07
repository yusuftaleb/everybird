'use client'
// The hover tooltip, as on /lifelist: the card's facts (name, scientific name, mass, date, place, marks) in a
// non-interactive bubble over the bird under the mouse, the bird with keyboard focus, or a bird picked from the
// search. It takes no pointer events and is hidden from screen readers (the bird's own label carries the facts);
// a click or tap still opens the card, with its edit actions.
import { useLayoutEffect, useRef, type RefObject } from 'react'
import type { ListEntry } from '@/lib/list/model'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { BirdFacts } from './BirdCard'
import { tipPosition } from './tip-position'
import './card-list.css'

type Props = {
  entry: ListEntry
  row: SpeciesRow
  regions: Regions
  sci?: boolean
  /** The positioned wrapper the tip is placed in; the bird (`.eb-bird[data-code]`, its rect with its scale) is in it. */
  wrap: RefObject<HTMLElement | null>
}

export function BirdTip({ entry, row, regions, sci, wrap }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const w = wrap.current
    const bird = w?.querySelector<HTMLElement>(`.eb-bird[data-code="${entry.code}"]`)
    if (!el || !w || !bird) return
    const place = () => {
      // The top bar, when shown, takes the top of the screen (headroom): no room above means under the bar.
      const bar = document.querySelector<HTMLElement>('.eb-topbar:not([data-hidden])')
      const viewTop = bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 0
      const p = tipPosition(bird.getBoundingClientRect(), w.getBoundingClientRect(), { w: el.offsetWidth, h: el.offsetHeight }, viewTop)
      el.style.left = `${p.left}px`
      el.style.top = `${p.top}px`
    }
    place()
    // Above or below depends on where the bird sits on screen, so a scroll (a search pick scrolls the bird into view)
    // places the tip again, once per frame.
    let raf = 0
    const again = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; place() }) }
    window.addEventListener('resize', again, { passive: true })
    window.addEventListener('scroll', again, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', again)
      window.removeEventListener('scroll', again)
    }
  }, [wrap, entry.code])
  return (
    <div ref={ref} className="eb-card eb-tip" aria-hidden="true" data-testid="bird-tip">
      <BirdFacts entry={entry} row={row} regions={regions} sci={sci} heading={false} />
    </div>
  )
}
