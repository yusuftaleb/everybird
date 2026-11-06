'use client'
// The Time panel: a strip of months from the first lifer to today, a bar per month (new species that month, scaled to
// the busiest month; empty months a baseline tick), the trips as labelled brackets under it, and two handles that
// choose a range of months. The collage follows a drag live (debounced; layouts are cached by range). Play grows the
// collage month by month. On phones the strip scrolls sideways; the handles are sliders for keyboards (arrows a
// month, PageUp/PageDown a year, Home/End). Logic in src/lib/list/timeline.ts.
import { Pause, Play, Stop } from '@phosphor-icons/react'
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { applyFilter, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { monthBins, monthName, monthShort, rangeFilter, rangeIndices, rangeLabel, sliderKey, timeless, tripFilter, type Month } from '@/lib/list/timeline'
import type { Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'
import { TripBrackets } from './TripBrackets'
import type { PlayControls } from './use-play'
import './timeline.css'

/** Narrowest month on screen (px): below it the strip scrolls sideways. */
export const MONTH_PX = 8
/** A drag or held key settles this long before the collage follows. */
export const DRAG_DEBOUNCE_MS = 140

type Props = {
  entries: ListEntry[]
  trips: Trip[]
  filter: Filter
  species: SpeciesIndex
  /** The whole list's months (first lifer to today). */
  months: Month[]
  today: Month
  onFilter: (f: Filter) => void
  countryName: (iso2: string) => string
  play: PlayControls
  /** Start (or resume) Play. */
  onPlay: () => void
}

const n = (x: number) => x.toLocaleString('en-US')
const pct = (i: number, total: number) => `${(i / total) * 100}%`

export const Timeline = memo(function Timeline({ entries, trips, filter, species, months, today, onFilter, countryName, play, onPlay }: Props) {
  const N = months.length
  // Bars count the birds of the other filters (birds, places) over the whole span, so the handles never jump.
  const others = useMemo(() => applyFilter(entries, timeless(filter), species, trips), [entries, filter, species, trips])
  const bins = useMemo(() => monthBins(others, today, entries), [others, today, entries])
  const chosen = useMemo(() => rangeIndices(filter, months), [filter, months])
  const [drag, setDrag] = useState<[number, number] | null>(null)
  const [lo, hi] = drag ?? chosen
  const playing = play.state
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef({ filter, months, onFilter })
  useLayoutEffect(() => { latest.current = { filter, months, onFilter } })
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  /** Move the range now on screen; the filter follows after DRAG_DEBOUNCE_MS (or at once with `now`). */
  const move = useCallback((a: number, b: number, now = false) => {
    setDrag([a, b])
    if (playing) play.stop()
    if (timer.current) clearTimeout(timer.current)
    const commit = () => {
      timer.current = null
      const { filter: f, months: ms, onFilter: set } = latest.current
      set(rangeFilter(f, a, b, ms))
      setDrag(null)
    }
    if (now) commit()
    else timer.current = setTimeout(commit, DRAG_DEBOUNCE_MS)
  }, [playing, play])

  // The track and its width (a month's width decides the trips' label room).
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
  // A strip wider than the screen opens on the chosen range's end (today, when nothing is chosen).
  useEffect(() => {
    const s = scroller.current
    if (!s || s.scrollWidth <= s.clientWidth) return
    s.scrollLeft = Math.max(0, ((chosen[1] + 1) / Math.max(1, N)) * s.scrollWidth - s.clientWidth + 24)
    // only when the panel opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dragging = useRef<'lo' | 'hi' | null>(null)
  const indexAt = (clientX: number, which: 'lo' | 'hi') => {
    const r = track.current!.getBoundingClientRect()
    const edge = Math.round(((clientX - r.left) / Math.max(1, r.width)) * N)
    return which === 'lo' ? Math.min(hi, Math.max(0, edge)) : Math.max(lo, Math.min(N - 1, edge - 1))
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
      style: { left: pct(which === 'lo' ? lo : hi + 1, N) },
      onKeyDown: (e: React.KeyboardEvent) => {
        const next = sliderKey(e.key, v, min, max)
        if (next === null) return
        e.preventDefault()
        if (next !== v) move(which === 'lo' ? next : lo, which === 'lo' ? hi : next)
      },
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture?.(e.pointerId)
        e.currentTarget.focus({ preventScroll: true })
        dragging.current = which
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (dragging.current !== which) return
        const i = indexAt(e.clientX, which)
        if (i !== v) move(which === 'lo' ? i : lo, which === 'lo' ? hi : i)
      },
      onPointerUp: () => {
        if (dragging.current !== which) return
        dragging.current = null
        if (timer.current) move(lo, hi, true) // land the last position at once
      },
      onPointerCancel: () => { dragging.current = null },
    } as const
  }

  // Readout: Play's month and running count, else the range and its species.
  const ranged = lo > 0 || hi < N - 1
  const upTo = (i: number) => bins.counts.slice(0, i + 1).reduce((a, b) => a + b, 0) + (i >= N - 1 ? bins.undated : 0)
  const inRange = bins.counts.slice(lo, hi + 1).reduce((a, b) => a + b, 0) + (ranged ? 0 : bins.undated)
  const trip = filter.trip ? trips.find((t) => t.id === filter.trip) : undefined
  const read = playing
    ? `${monthShort(months[playing.i])} · ${n(upTo(playing.i))} species`
    : `${trip && !drag ? trip.label : ranged ? rangeLabel(months[lo], months[hi]) : `${monthShort(months[0])} to ${monthShort(months[N - 1])}`} · ${n(trip && !drag ? others.filter((e) => trip.codes.includes(e.code)).length : inRange)} species`

  const tripCounts = useMemo(() => {
    const shown = new Set(others.map((e) => e.code))
    return new Map(trips.map((t) => [t.id, t.codes.filter((c) => shown.has(c)).length]))
  }, [others, trips])

  if (!N) return <p className="eb-note" data-testid="timeline-empty">This list has no dates, so there is no timeline.</p>
  const max = Math.max(1, bins.max)
  const width = `max(100%, ${N * MONTH_PX}px)`
  const monthPx = trackPx ? trackPx / N : MONTH_PX

  return (
    <div className="eb-time" data-testid="timeline">
      <div className="eb-time-head">
        <p className="eb-mono eb-time-read" data-testid="timeline-read" aria-live={playing?.running ? 'off' : 'polite'}>{read}</p>
        <div className="eb-time-actions">
          <button type="button" className="eb-tab eb-time-btn" data-testid="time-play" aria-pressed={!!playing?.running} onClick={playing?.running ? play.pause : onPlay}>
            {playing?.running ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
            {playing?.running ? 'Pause' : playing ? 'Resume' : 'Play'}
          </button>
          {playing && (
            <button type="button" className="eb-tab eb-time-btn" data-testid="time-stop" onClick={play.stop}>
              <Stop aria-hidden="true" />Stop
            </button>
          )}
        </div>
      </div>
      <div ref={scroller} className="eb-time-scroll">
        <div ref={track} className="eb-time-track" style={{ width }} data-playing={playing ? '' : undefined} data-ranged={ranged ? '' : undefined}>
          <div className="eb-time-bars" aria-hidden="true">
            <div className="eb-time-sel" style={{ left: pct(lo, N), width: pct(hi + 1 - lo, N) }} data-ranged={ranged ? '' : undefined} />
            <svg viewBox={`0 0 ${N} 100`} preserveAspectRatio="none">
              {bins.counts.map((c, i) => {
                const on = playing ? i <= playing.i : i >= lo && i <= hi
                return <rect key={i} x={i + 0.15} width={0.7} y={c ? 100 - (c / max) * 100 : 98} height={c ? (c / max) * 100 : 2} data-on={on ? '' : undefined} data-empty={c ? undefined : ''} />
              })}
            </svg>
            {playing && <div className="eb-time-head-line" style={{ left: pct(playing.i + 1, N) }} data-testid="time-playhead" />}
          </div>
          <div {...handleProps('lo')}><span className="eb-time-knob" /></div>
          <div {...handleProps('hi')}><span className="eb-time-knob" /></div>
          <div className="eb-time-years eb-mono" aria-hidden="true">
            {months.map((m, i) => (m.endsWith('-01') || i === 0) && (i === 0 || (N - i) * monthPx > 28) ? (
              <span key={m} style={{ left: pct(i, N) }}>{m.slice(0, 4)}</span>
            ) : null)}
          </div>
          <TripBrackets
            trips={trips}
            counts={tripCounts}
            months={months}
            monthPx={monthPx}
            selected={filter.trip}
            countryName={countryName}
            onPick={(t) => { if (playing) play.stop(); onFilter(tripFilter(filter, t)) }}
          />
        </div>
      </div>
    </div>
  )
})
