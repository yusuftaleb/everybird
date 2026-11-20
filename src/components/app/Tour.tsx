'use client'
// The landing sample's guided tour, started by the welcome's "Explore the sample": four short notes, each placed beside
// the control it points at (Filter, View, a bird, Share), the last ending on "Use your own list" (what the landing's
// main button opens). Every step has Skip tour; Esc ends it; ended or skipped it never shows again (src/lib/tour.ts).
// Landing renders it, so never on a birder's own list. No library: a fixed note under (or over) the target's box. Each
// step's note takes focus, so a screen reader reads its name ("1 of 4") and its text; the target wears an Accent ring.
// Reduced motion: no fade, and the target is scrolled to at once.
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { reduced } from '@/components/collage/collage-motion'
import { useHoldTopBar } from '@/components/dialog-utils'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { rememberToured } from '@/lib/tour'

const SCOPE = '.eb-page-landing .eb-view'
type Step = 'filter' | 'view' | 'bird' | 'share'
export const TOUR_STEPS: readonly Step[] = ['filter', 'view', 'bird', 'share']

/** The step's target: its control in the sample's bar, or the first bird drawn on the stage. */
function targetOf(step: Step): HTMLElement | null {
  if (step !== 'bird') return document.querySelector<HTMLElement>(`${SCOPE} [data-tour="${step}"]`)
  for (const el of document.querySelectorAll<HTMLElement>(`${SCOPE} .eb-bird:not([data-far])`)) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0) return el
  }
  return null
}

const GAP = 12
const GUTTER = 16

export function Tour({ onOwn, onEnd }: { onOwn: () => void; onEnd: () => void }) {
  const { t } = useI18n()
  const tt = t.landing.tour
  const [i, setI] = useState(0)
  const step = TOUR_STEPS[i]
  const last = i === TOUR_STEPS.length - 1
  const [box, setBox] = useState<{ top: number; left: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const nameId = useId()
  const textId = useId()
  const end = useCallback(() => { rememberToured(); onEnd() }, [onEnd])
  // Esc ends the tour, but only an Esc nothing else took: dialogs and panels opened over it (Filters, Share, Add
  // birds) catch theirs on window's capture phase and stop it, so this listens in the bubble phase.
  const endRef = useRef(end)
  useLayoutEffect(() => { endRef.current = end })
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') endRef.current() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useHoldTopBar()

  // Find the target (the sample may still be loading), scroll it into view once, ring it, and keep the note beside it
  // as the page moves. shortcut: one rAF loop while the tour is open; it is a few seconds long and reads one box a frame.
  useEffect(() => {
    let el: HTMLElement | null = null
    let raf = 0
    let prevKey = ''
    const tick = () => {
      if (!el?.isConnected) {
        el?.removeAttribute('data-tour-on')
        el = targetOf(step)
        if (el) {
          el.setAttribute('data-tour-on', '')
          el.scrollIntoView?.({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' })
        }
      }
      const note = ref.current
      if (el && note) {
        const r = el.getBoundingClientRect()
        const h = note.offsetHeight, w = note.offsetWidth
        const below = r.bottom + GAP + h <= innerHeight - GUTTER || r.top - GAP - h < GUTTER
        const top = below ? r.bottom + GAP : r.top - GAP - h
        const left = Math.max(GUTTER, Math.min(r.left, innerWidth - GUTTER - w))
        const key = `${Math.round(top)}|${Math.round(left)}`
        if (key !== prevKey) { prevKey = key; setBox({ top, left }) }
      }
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => { cancelAnimationFrame(raf); el?.removeAttribute('data-tour-on') }
  }, [step])

  // Each step's note takes focus once it is placed, so it is announced.
  const placed = !!box
  useLayoutEffect(() => {
    if (placed) ref.current?.focus({ preventScroll: true })
  }, [placed, i])

  const own = () => { end(); onOwn() }
  return createPortal(
    <div
      ref={ref}
      className="eb-tour"
      role="dialog"
      aria-labelledby={nameId}
      aria-describedby={textId}
      tabIndex={-1}
      data-testid="tour"
      data-step={step}
      style={box ? { top: box.top, left: box.left } : { visibility: 'hidden' }}
    >
      <p id={nameId} className="eb-mono eb-tour-count">{fmt(tt.count, { n: i + 1, total: TOUR_STEPS.length })}</p>
      <p id={textId} className="eb-tour-text">{tt[step]}</p>
      <div className="eb-tour-actions">
        {last ? (
          <>
            <button type="button" className="eb-btn" onClick={own}>{tt.own}</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={end}>{tt.end}</button>
          </>
        ) : (
          <>
            <button type="button" className="eb-btn" onClick={() => { setBox(null); setI(i + 1) }}>{tt.next}</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={end}>{tt.skip}</button>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
