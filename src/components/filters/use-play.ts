'use client'
// Play's clock: one step per month (playInterval), from the first month to the last, then a short hold and the
// collage returns to the chosen filter. Pause keeps the month; Stop ends Play.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { reduced } from '@/components/collage/collage-motion'
import { playInterval } from '@/lib/list/timeline'

/** The month reached (index) and whether the clock runs; null when not playing. */
export type PlayState = { i: number; running: boolean } | null
export type PlayControls = { state: PlayState; start: () => void; pause: () => void; stop: () => void }

/** How long the last month stays on screen before Play ends. */
export const HOLD_MS = 1200

export function usePlay(months: number): PlayControls {
  const [state, setState] = useState<PlayState>(null)
  const start = useCallback(() => setState((s) => (s && s.i < months - 1 ? { i: s.i, running: true } : { i: 0, running: true })), [months])
  const pause = useCallback(() => setState((s) => (s ? { ...s, running: false } : s)), [])
  const stop = useCallback(() => setState(null), [])

  useEffect(() => {
    if (!state?.running) return
    const last = state.i >= months - 1
    const t = setTimeout(
      () => setState((s) => (!s || !s.running ? s : s.i >= months - 1 ? null : { i: s.i + 1, running: true })),
      last ? HOLD_MS : playInterval(months, reduced()),
    )
    return () => clearTimeout(t)
  }, [state, months])

  // A list whose span shrinks under a paused Play: end it.
  useEffect(() => {
    if (state && state.i >= months) {
      const t = setTimeout(() => setState(null), 0)
      return () => clearTimeout(t)
    }
  }, [state, months])

  return useMemo(() => ({ state, start, pause, stop }), [state, start, pause, stop])
}
