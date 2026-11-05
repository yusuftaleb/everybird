'use client'
import { useEffect, useRef, useState } from 'react'
import { MOVE_MS, reduced } from './collage-motion'

const fmt = (n: number) => n.toLocaleString('en-US')

/**
 * The species count in the hole at the stage centre. The number ticks from the old total to the new one
 * over the travel time (ease-out quart), as LifeList's Tally; with reduced motion it jumps. The visible
 * count is decorative; a polite live region carries the settled text ("12 species", "4 of 175 species").
 */
export function Tally({ value, total }: { value: number; total?: number }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const a = from.current
    from.current = value
    if (a === value || reduced() || typeof requestAnimationFrame !== 'function') { setShown(value); return }
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / MOVE_MS))
      setShown(Math.round(a + (value - a) * (1 - Math.pow(1 - k, 4))))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  const filtered = total !== undefined && value < total
  return (
    <>
      <div className="eb-mid" aria-hidden="true">
        <span className="eb-num">{fmt(shown)}</span>
        <span className="eb-mono">{filtered ? `of ${fmt(total)} species` : 'species'}</span>
      </div>
      <p className="eb-sr" aria-live="polite">{filtered ? `${fmt(value)} of ${fmt(total)} species` : `${fmt(value)} species`}</p>
    </>
  )
}
