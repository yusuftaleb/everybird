'use client'
import { useLayoutEffect, useRef, type CSSProperties } from 'react'
import { plural } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { countDisplay, countScale, countText } from '@/lib/layout/count-box'
import { MOVE_MS, reduced } from './collage-motion'

/**
 * The species count in the hole at the stage centre. The number ticks from the old total to the new one
 * over the travel time (ease-out quart), as LifeList's Tally; with reduced motion it jumps. The ticking
 * number is written straight to its text node each frame (no React render per frame). The visible count is
 * decorative; a polite live region carries the settled text ("12 species"). A filtered view shows only its own count,
 * as /lifelist's .yt-ll-mid: the filters and the stats line say what it is out of.
 * The packer keeps the hole for this text (count-box.ts collageHole: the number at F · countScale, the 12px label), so a
 * five-digit count is drawn at countScale of F here too (--fs), for the whole tick towards it.
 * The number and label are drawn in the UI language ("1.089", `count.word`, upper-cased by .eb-mono); the hole and the
 * scale key on the en-US geometry text (countText) and an 8-character label, so every language shares one hole.
 * `label` defaults to the language's `count.word`, its form for `value` (H7: "1 Art", "5 видов"; the hole holds every form).
 */
export function Tally({ value, label }: { value: number; label?: string }) {
  const { t } = useI18n()
  const numFmt = t.num
  const num = useRef<HTMLSpanElement>(null)
  const from = useRef<number | null>(null)
  useLayoutEffect(() => {
    const el = num.current
    if (!el) return
    const a = from.current ?? value
    from.current = value
    const show = (n: number) => { el.textContent = countDisplay(n, numFmt) }
    if (a === value || reduced() || typeof requestAnimationFrame !== 'function') { show(value); return }
    show(a)
    let raf = 0, last = a
    const t0 = performance.now()
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / MOVE_MS))
      const n = Math.round(a + (value - a) * (1 - Math.pow(1 - k, 4)))
      if (n !== last) { last = n; show(n) }
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); show(value) }
  }, [value, numFmt])
  return (
    <>
      <div className="eb-mid" aria-hidden="true" style={{ '--fs': countScale(countText(value)) } as CSSProperties}>
        <span className="eb-num" ref={num} />
        <span className="eb-mono">{label ?? plural(t.count.word, value)}</span>
      </div>
      <p className="eb-sr" aria-live="polite">{plural(t.count.live, value, { n: countDisplay(value, numFmt) })}</p>
    </>
  )
}
