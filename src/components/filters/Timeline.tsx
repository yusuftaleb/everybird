'use client'
// The Time panel: a strip of months from the first lifer to today, a bar per month (new species that month, scaled to
// the busiest month; empty months a baseline tick), a year axis under it, and two handles that choose a range of
// months; Clear (top right, as the Places panel's) resets the range to the whole span. While a handle is held (or keys repeat) the collage previews the range over its current
// layout (birds outside it hidden, no re-pack); on release (or KEY_COMMIT_MS after the last key) the range is
// committed: one re-pack, one travel. Layouts are cached by range. On phones the strip scrolls sideways; the handles are sliders for keyboards (arrows a
// month, PageUp/PageDown a year, Home/End). Logic in src/lib/list/timeline.ts.
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyFilter, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { barHeight, boundaryAt, monthAxis, monthBins, monthName, monthShort, pickHandle, rangeFilter, rangeIndices, rangeLabel, sliderKey, timeless, type Month } from '@/lib/list/timeline'
import type { SeenIndex } from '@/lib/list/seen'
import type { SpeciesIndex } from '@/lib/species/load'
import './timeline.css'

/** Narrowest month on screen (px): below it the strip scrolls sideways. (A collapsed gap's months are narrower.) */
export const MONTH_PX = 6
/** Keyboard steps commit the range this long after the last key (a pointer drag commits on release). */
export const KEY_COMMIT_MS = 350

type Props = {
  entries: ListEntry[]
  /** Seen-here, for the Places filter of the other dimensions. */
  seen?: SeenIndex
  filter: Filter
  species: SpeciesIndex
  /** The whole list's months (first lifer to today). */
  months: Month[]
  today: Month
  onFilter: (f: Filter) => void
  /** The range being dragged (open at the span's edges), or null once committed. */
  onPreview?: (r: { from?: Month; to?: Month } | null) => void
}

const n = (x: number) => x.toLocaleString('en-US')

export const Timeline = memo(function Timeline({ entries, seen, filter, species, months, today, onFilter, onPreview }: Props) {
  const N = months.length
  // Bars count the birds of the other filters (birds, places) over the whole span, so the handles never jump.
  const others = useMemo(() => applyFilter(entries, timeless(filter), species, seen), [entries, filter, species, seen])
  const bins = useMemo(() => monthBins(others, today, entries), [others, today, entries])
  // The scale comes from the whole list (long empty stretches collapse to a short break), so it never moves under a filter.
  const axis = useMemo(() => monthAxis(monthBins(entries, today).counts), [entries, today])
  const frac = (i: number) => axis.start[i] / Math.max(1e-9, axis.units)
  const pct = (i: number) => `${frac(i) * 100}%`
  const chosen = useMemo(() => rangeIndices(filter, months), [filter, months])
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const [lo, hi] = drag ?? chosen
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<[number, number] | null>(null) // the previewed range, not yet committed
  const dragging = useRef<{ which: 'lo' | 'hi' | null; x: number } | null>(null) // the handle a press drags
  const latest = useRef({ filter, months, onFilter, onPreview })
  useLayoutEffect(() => { latest.current = { filter, months, onFilter, onPreview } })
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  /** Commit the previewed range: the filter changes (one re-pack) and the preview ends. */
  const commit = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const r = pending.current
    pending.current = null
    if (!r) return
    const { filter: f, months: ms, onFilter: set, onPreview: prev } = latest.current
    set(rangeFilter(f, r[0], r[1], ms))
    prev?.(null)
    setDrag(null)
  }, [])
  /** Preview a range now (handles, readout, bars and the collage's visible birds); `key`: commit KEY_COMMIT_MS later. */
  const move = useCallback((a: number, b: number, key = false) => {
    setDrag([a, b])
    pending.current = [a, b]
    const ms = latest.current.months
    latest.current.onPreview?.({ from: a > 0 ? ms[a] : undefined, to: b < ms.length - 1 ? ms[b] : undefined })
    if (timer.current) clearTimeout(timer.current)
    timer.current = key ? setTimeout(commit, KEY_COMMIT_MS) : null
  }, [commit])
  /** Clear: the whole span again (any preview and pending commit dropped); the other filters stay. */
  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    pending.current = null
    dragging.current = null
    const { filter: f, onFilter: set, onPreview: prev } = latest.current
    set(timeless(f))
    prev?.(null)
    setDrag(null)
  }, [])

  // The track and its width (a month's width decides where the year labels fit).
  const track = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [trackPx, setTrackPx] = useState(0)
  useEffect(() => {
    const el = track.current
    if (!el) return
    setTrackPx(el.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([e]) => setTrackPx(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Which edges have more strip beyond them (they fade; the scrollbar is hidden).
  const [more, setMore] = useState('')
  const edges = useCallback(() => {
    const s = scroller.current
    if (!s) return
    const left = s.scrollLeft > 1, right = s.scrollLeft + s.clientWidth < s.scrollWidth - 1
    setMore(left && right ? 'both' : left ? 'left' : right ? 'right' : '')
  }, [])
  useEffect(() => { edges() }, [edges, trackPx])
  // A strip wider than the screen opens on the chosen range's end (today, when nothing is chosen).
  useEffect(() => {
    const s = scroller.current
    if (!s || s.scrollWidth <= s.clientWidth) return
    s.scrollLeft = Math.max(0, frac(chosen[1] + 1) * s.scrollWidth - s.clientWidth + 24)
    // only when the panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Which handle a press drags: the nearer one; with both under the pointer (a short range), the first move decides.
  const xOf = (i: number) => { const r = track.current!.getBoundingClientRect(); return r.left + frac(i) * r.width }
  const indexAt = (clientX: number, which: 'lo' | 'hi') => {
    const r = track.current!.getBoundingClientRect()
    const edge = boundaryAt(axis, (clientX - r.left) / Math.max(1, r.width))
    return which === 'lo' ? Math.min(hi, Math.max(0, edge)) : Math.max(lo, Math.min(N - 1, edge - 1))
  }
  const pointer = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault()
      e.currentTarget.setPointerCapture?.(e.pointerId)
      e.currentTarget.focus({ preventScroll: true })
      dragging.current = { which: pickHandle(e.clientX, xOf(lo), xOf(hi + 1)), x: e.clientX }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const d = dragging.current
      if (!d) return
      if (!d.which) {
        if (Math.abs(e.clientX - d.x) < 2) return
        d.which = e.clientX < d.x ? 'lo' : 'hi'
      }
      const i = indexAt(e.clientX, d.which)
      const [a, b] = d.which === 'lo' ? [i, hi] : [lo, i]
      if (a !== lo || b !== hi) move(a, b)
    },
    onPointerUp: () => { if (dragging.current) { dragging.current = null; commit() } },
    onPointerCancel: () => { if (dragging.current) { dragging.current = null; commit() } },
  }
  const handleProps = (which: 'lo' | 'hi') => {
    const v = which === 'lo' ? lo : hi
    const [min, max] = which === 'lo' ? [0, hi] : [lo, N - 1]
    return {
      role: 'slider',
      tabIndex: 0,
      className: 'eb-time-handle',
      'data-end': which,
      'data-testid': `time-handle-${which}`,
      'aria-label': which === 'lo' ? 'Start month' : 'End month',
      'aria-valuemin': min,
      'aria-valuemax': max,
      'aria-valuenow': v,
      'aria-valuetext': monthName(months[v]),
      style: { left: pct(which === 'lo' ? lo : hi + 1) },
      onKeyDown: (e: React.KeyboardEvent) => {
        const next = sliderKey(e.key, v, min, max)
        if (next === null) return
        e.preventDefault()
        if (next !== v) move(which === 'lo' ? next : lo, which === 'lo' ? hi : next, true)
      },
      ...pointer,
    } as const
  }

  // Readout: the range and its species.
  const ranged = lo > 0 || hi < N - 1
  const inRange = bins.counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0) + (ranged ? 0 : bins.undated)
  const read = `${ranged ? rangeLabel(months[lo], months[hi]) : `${monthShort(months[0])} to ${monthShort(months[N - 1])}`} · ${n(inRange)} species`

  if (!N) return <p className="eb-note" data-testid="timeline-empty">This list has no dates, so there is no timeline.</p>
  const width = `max(100%, ${axis.units * MONTH_PX}px)`
  const unitPx = trackPx ? trackPx / axis.units : MONTH_PX
  // Year labels where they fit: at least 30px after the previous one and before the end.
  const years: { m: Month; i: number }[] = []
  let lastX = -Infinity
  months.forEach((m, i) => {
    if (!(m.endsWith('-01') || i === 0)) return
    const x = axis.start[i] * unitPx
    if (x - lastX < 30 || (i > 0 && (axis.units - axis.start[i]) * unitPx <= 28)) return
    years.push({ m, i })
    lastX = x
  })

  return (
    <div className="eb-time" data-testid="timeline">
      <div className="eb-time-head">
        <p className="eb-mono eb-time-read" data-testid="timeline-read" aria-live="polite">
          {/* Wraps only between its parts, never inside a date or the count. */}
          {read.split(' · ').map((part, i) => <span key={i}>{i > 0 && ' · '}<span className="eb-nowrap">{part}</span></span>)}
        </p>
        {ranged && (
          <button type="button" className="eb-textbtn" data-testid="time-clear" onClick={clear}>Clear</button>
        )}
      </div>
      <div ref={scroller} className="eb-time-scroll" onScroll={edges} data-more={more || undefined}>
        <div ref={track} className="eb-time-track" style={{ width }} data-ranged={ranged ? '' : undefined}>
          <div className="eb-time-bars" aria-hidden="true">
            <div className="eb-time-sel" style={{ left: pct(lo), width: `${(frac(hi + 1) - frac(lo)) * 100}%` }} data-ranged={ranged ? '' : undefined} />
            <svg viewBox={`0 0 ${axis.units} 100`} preserveAspectRatio="none">
              {bins.counts.map((c, i) => {
                const on = i >= lo && i <= hi
                const w = axis.start[i + 1] - axis.start[i]
                if (!c && w < 1) return null // inside a collapsed gap: the break mark stands for these months
                const h = c ? barHeight(c, bins.max) : 2
                return <rect key={i} x={axis.start[i] + 0.15 * w} width={0.7 * w} y={100 - h} height={h} data-on={on ? '' : undefined} data-empty={c ? undefined : ''} />
              })}
            </svg>
            {axis.gaps.map((g) => (
              <span key={g.from} className="eb-time-gap" style={{ left: `${((frac(g.from) + frac(g.to + 1)) / 2) * 100}%` }} data-testid="time-gap" />
            ))}
          </div>
          <div {...handleProps('lo')}><span className="eb-time-knob" /></div>
          <div {...handleProps('hi')}><span className="eb-time-knob" /></div>
          <div className="eb-time-years eb-mono" aria-hidden="true">
            {years.map(({ m, i }) => <span key={m} style={{ left: pct(i) }}>{m.slice(0, 4)}</span>)}
          </div>
        </div>
      </div>
    </div>
  )
})
