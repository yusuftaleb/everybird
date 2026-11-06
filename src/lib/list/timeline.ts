// The Time panel's pure logic: months across the list's span, new species per month, trips laid out in lanes under
// the bars, the range handles' keyboard steps and the range and trip filters.
//
// The filter's time model (see filters.ts): a date range `from`/`to` (YYYY-MM, both inclusive, either end open)
// replaces the year chips. A year is the range Jan..Dec of that year (`year` still filters, and the store turns it into
// that range). A trip stays its own dimension (its species, not every bird of its months): choosing one also sets the
// range to its months, so the handles show it; moving a handle drops the trip.
import { formatDate } from '../format'
import type { Filter } from './filters'
import type { ListEntry } from './model'
import type { Trip } from './trips'

export type Month = string // 'YYYY-MM'

const FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** 'YYYY-MM-DD' | 'YYYY-MM' -> 'YYYY-MM'; 'YYYY' -> 'YYYY-01' (a year-only date counts as its January); else undefined. */
export function monthOf(date: string | undefined): Month | undefined {
  const m = date && /^(\d{4})(?:-(\d{2}))?(?:-\d{2})?$/.exec(date)
  if (!m) return undefined
  const mo = m[2] ?? '01'
  const n = Number(mo)
  return n >= 1 && n <= 12 ? `${m[1]}-${mo}` : undefined
}

const toIndex = (m: Month) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1
const fromIndex = (i: number): Month => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`

export const addMonths = (m: Month, k: number): Month => fromIndex(toIndex(m) + k)
/** "March 2020" (the sliders' aria-valuetext). */
export const monthName = (m: Month): string => `${FULL[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`
/** "Mar 2020". */
export const monthShort = (m: Month): string => formatDate(m)
/** The current month (UTC). */
export const todayMonth = (now = new Date()): Month => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

export type MonthBins = { months: Month[]; counts: number[]; max: number; undated: number }

/**
 * New species per month of `list`, over the months from the first lifer of `spanOf` (default: `list`) to `today` (or
 * its latest date, if later). So a filtered list keeps the whole list's span and the handles never jump.
 */
export function monthBins(list: readonly ListEntry[], today: Month, spanOf: readonly ListEntry[] = list): MonthBins {
  let lo = Infinity, hi = -Infinity, undated = 0
  for (const e of spanOf) {
    const m = monthOf(e.date)
    if (!m) continue
    const i = toIndex(m)
    if (i < lo) lo = i
    if (i > hi) hi = i
  }
  const idx: number[] = []
  for (const e of list) {
    const m = monthOf(e.date)
    if (!m) { undated++; continue }
    const i = toIndex(m)
    if (i >= lo && i <= hi) idx.push(i)
  }
  if (lo === Infinity) return { months: [], counts: [], max: 0, undated }
  hi = Math.max(hi, toIndex(today))
  const counts = new Array<number>(hi - lo + 1).fill(0)
  for (const i of idx) counts[i - lo]++
  const months = counts.map((_, k) => fromIndex(lo + k))
  return { months, counts, max: Math.max(...counts), undated }
}

/** An empty stretch at least this many months long is drawn as a short break (monthAxis). */
export const GAP_MIN_MONTHS = 12
/** How many months' width a collapsed gap takes. */
export const GAP_UNITS = 2

/**
 * The strip's horizontal scale. Every month is one unit wide, except runs of GAP_MIN_MONTHS or more empty months
 * (`counts`, the whole list's, so the axis never moves under a filter), which share GAP_UNITS: a lone early lifer and a
 * long gap before regular birding no longer stretch the strip off screen. `start[i]` is month i's left edge in units
 * (`start[N]` = `units`); `gaps` are the collapsed runs (month indices, inclusive).
 */
export type MonthAxis = { units: number; start: number[]; gaps: { from: number; to: number }[] }
export function monthAxis(counts: readonly number[], minGap = GAP_MIN_MONTHS, gapUnits = GAP_UNITS): MonthAxis {
  const N = counts.length
  const width = new Array<number>(N).fill(1)
  const gaps: { from: number; to: number }[] = []
  for (let i = 0; i < N; ) {
    if (counts[i]) { i++; continue }
    let j = i
    while (j + 1 < N && !counts[j + 1]) j++
    if (j - i + 1 >= minGap) {
      gaps.push({ from: i, to: j })
      for (let k = i; k <= j; k++) width[k] = gapUnits / (j - i + 1)
    }
    i = j + 1
  }
  const start = [0]
  for (let i = 0; i < N; i++) start.push(start[i] + width[i])
  return { units: start[N], start, gaps }
}

/** The month boundary (0..N) nearest to `frac` of the track's width. */
export function boundaryAt(axis: MonthAxis, frac: number): number {
  const u = Math.min(1, Math.max(0, frac)) * axis.units
  const s = axis.start
  let lo = 0, hi = s.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (s[mid] <= u) lo = mid
    else hi = mid
  }
  return u - s[lo] <= s[hi] - u ? lo : hi
}

/**
 * A month's bar height in % of the strip: a square-root scale over the busiest month, at least 12%, so a month with one
 * new species is a clear bar beside a big trip's month (and never mistaken for an empty month's tick). 0 when empty.
 */
export function barHeight(count: number, max: number): number {
  if (!count) return 0
  return Math.min(100, Math.max(12, Math.sqrt(count / Math.max(1, max)) * 100))
}

export type TripLane = { trip: Trip; start: number; end: number; lane: number; flip: boolean }

/**
 * How many months a label `px` wide needs on the strip (`axis`, `unitPx` px per unit). Rightwards (`dir` 1) it runs
 * from month `at`'s left edge: months at..at+k-1; past the strip's end it returns more than the months left
 * (N - at + 1), the sign to flip it. Leftwards (`dir` -1) it ends at month `at`'s right edge: months at-k+1..at,
 * stopping at the first month.
 */
export function labelMonths(axis: MonthAxis, unitPx: number, px: number, at: number, dir: 1 | -1): number {
  const N = axis.start.length - 1
  const need = px / Math.max(1e-9, unitPx)
  let k = 1
  if (dir === 1) {
    while (at + k < N && axis.start[at + k] - axis.start[at] < need) k++
    return axis.start[Math.min(N, at + k)] - axis.start[at] < need ? N - at + 1 : k
  }
  while (at + 1 - k > 0 && axis.start[at + 1] - axis.start[at + 1 - k] < need) k++
  return k
}

/**
 * Trips as brackets under the bars: each spans its months (indices into `months`) and takes the first lane where
 * neither it nor its label touches another's. A label needs `minSpan` months of room: a number, or per trip from a
 * month and a direction (labelMonths: it depends on the label's width and, on an uneven axis, on where it sits).
 * A label runs rightwards from the trip's start; one that would run past the strip's end is flipped (`flip`) and runs
 * leftwards from the trip's end, so it claims the months before the end instead.
 * Trips outside the months are left out. Sorted by start.
 */
export function tripLanes(
  trips: readonly Trip[], months: readonly Month[], minSpan: number | ((t: Trip, at: number, dir: 1 | -1) => number),
): TripLane[] {
  if (!months.length) return []
  const N = months.length
  const first = toIndex(months[0]), last = first + N - 1
  const span = (t: Trip, at: number, dir: 1 | -1) => Math.max(1, typeof minSpan === 'number' ? minSpan : minSpan(t, at, dir))
  const taken: [number, number][][] = [] // per lane, the month ranges (inclusive) its brackets and labels hold
  const out: TripLane[] = []
  const sorted = [...trips].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  for (const t of sorted) {
    const s = monthOf(t.start), e = monthOf(t.end) ?? s
    if (!s || !e) continue
    const si = toIndex(s), ei = toIndex(e)
    if (ei < first || si > last) continue
    const start = Math.max(si, first) - first, end = Math.min(ei, last) - first
    const right = span(t, start, 1)
    const flip = start + right > N
    const lo = flip ? Math.max(0, Math.min(start, end + 1 - span(t, end, -1))) : start
    const hi = flip ? end : Math.max(end, start + right - 1)
    let lane = taken.findIndex((rs) => rs.every(([a, b]) => b < lo || a > hi))
    if (lane < 0) { lane = taken.length; taken.push([]) }
    taken[lane].push([lo, hi])
    out.push({ trip: t, start, end, lane, flip })
  }
  return out
}

/** A range slider's value after a key: arrows a month, PageUp/PageDown a year, Home/End the ends; null for other keys. */
export function sliderKey(key: string, value: number, min: number, max: number): number | null {
  const step: Record<string, number> = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 12, PageDown: -12 }
  let v: number
  if (key in step) v = value + step[key]
  else if (key === 'Home') v = min
  else if (key === 'End') v = max
  else return null
  return Math.min(max, Math.max(min, v))
}

/**
 * Which range handle a press at `x` drags (client px; `loX`/`hiX` the handles' positions): the nearer one, or null when
 * both are within `tie` px of each other and the pointer (stacked handles on a short range): the first move decides,
 * leftwards the start handle, rightwards the end handle.
 */
export function pickHandle(x: number, loX: number, hiX: number, tie = 8): 'lo' | 'hi' | null {
  const dl = Math.abs(x - loX), dh = Math.abs(x - hiX)
  if (Math.abs(dl - dh) <= tie && hiX - loX <= 2 * tie) return null
  return dl < dh ? 'lo' : 'hi'
}

/** The filter's range as indices into `months` (a year is Jan..Dec), clamped; no range is the whole span. */
export function rangeIndices(f: Filter, months: readonly Month[]): [number, number] {
  const n = months.length
  if (!n) return [0, 0]
  const from = f.from ?? (f.year ? `${f.year}-01` : undefined)
  const to = f.to ?? (f.year ? `${f.year}-12` : undefined)
  const first = toIndex(months[0])
  const clamp = (i: number) => Math.min(n - 1, Math.max(0, i))
  return [from ? clamp(toIndex(from) - first) : 0, to ? clamp(toIndex(to) - first) : n - 1]
}

/** The filter without its time dimensions (the bars count the birds of the rest over the whole span). */
export function timeless(f: Filter): Filter {
  const rest: Filter = { ...f }
  delete rest.year; delete rest.from; delete rest.to; delete rest.trip
  return rest
}

const clean = (f: Filter): Filter => {
  for (const k of Object.keys(f) as (keyof Filter)[]) if (!f[k]) delete f[k]
  return f
}

/** The filter with the range lo..hi (indices into `months`); an end at the span's edge stays open. Clears year and trip. */
export function rangeFilter(f: Filter, lo: number, hi: number, months: readonly Month[]): Filter {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
  const next: Filter = { ...f, from: a > 0 ? months[a] : undefined, to: b < months.length - 1 ? months[b] : undefined }
  delete next.year
  delete next.trip
  return clean(next)
}

/** Select a trip (and its months as the range); selecting the chosen trip again clears both. */
export function tripFilter(f: Filter, t: Trip): Filter {
  const next: Filter = { ...f }
  delete next.year
  if (f.trip === t.id) {
    delete next.trip; delete next.from; delete next.to
    return clean(next)
  }
  return clean({ ...next, trip: t.id, from: monthOf(t.start), to: monthOf(t.end) ?? monthOf(t.start) })
}

/** The range in words: "2020", "Sep 2020", "Mar 2020 to Jun 2021", "From Mar 2020", "Up to Jun 2021". */
export function rangeLabel(from: Month | undefined, to: Month | undefined): string | undefined {
  if (from && to) {
    if (from === to) return monthShort(from)
    if (from.slice(0, 4) === to.slice(0, 4) && from.endsWith('-01') && to.endsWith('-12')) return from.slice(0, 4)
    return `${monthShort(from)} to ${monthShort(to)}`
  }
  if (from) return `From ${monthShort(from)}`
  if (to) return `Up to ${monthShort(to)}`
  return undefined
}
