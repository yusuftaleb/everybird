// The Time panel's pure logic: months across the list's span, new species per month, trips laid out in lanes under
// the bars, the range handles' keyboard steps, the range and trip filters, and Play's timing.
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

export type TripLane = { trip: Trip; start: number; end: number; lane: number }

/**
 * Trips as brackets under the bars: each spans its months (indices into `months`) and takes the first lane where it
 * doesn't touch an earlier one. A bracket's label needs `minSpan` months of room, so a short trip claims that much.
 * Trips outside the months are left out. Sorted by start.
 */
export function tripLanes(trips: readonly Trip[], months: readonly Month[], minSpan: number | ((t: Trip) => number)): TripLane[] {
  if (!months.length) return []
  const first = toIndex(months[0]), last = first + months.length - 1
  const ends: number[] = [] // per lane, the last month index taken
  const out: TripLane[] = []
  const sorted = [...trips].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  for (const t of sorted) {
    const s = monthOf(t.start), e = monthOf(t.end) ?? s
    if (!s || !e) continue
    const si = toIndex(s), ei = toIndex(e)
    if (ei < first || si > last) continue
    const start = Math.max(si, first) - first, end = Math.min(ei, last) - first
    const room = Math.max(end, start + Math.max(1, typeof minSpan === 'number' ? minSpan : minSpan(t)) - 1)
    let lane = ends.findIndex((x) => x < start)
    if (lane < 0) { lane = ends.length; ends.push(room) } else ends[lane] = room
    out.push({ trip: t, start, end, lane })
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

/** The filter without its time dimensions (Play reveals the birds of the rest over time; the bars count them). */
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

/** Play: ms per month, 3 to 12 s in all; reduced motion steps a month at a time, slowly enough to read. */
export function playInterval(months: number, reducedMotion: boolean): number {
  if (reducedMotion) return 600
  return Math.round(Math.min(12_000, Math.max(3_000, months * 90)) / Math.max(1, months))
}

/** The birds Play has revealed by `until`: dated ones up to that month; undated ones only at the last month. */
export function revealUntil(codes: Iterable<string>, monthByCode: ReadonlyMap<string, Month | undefined>, until: Month, last: boolean): Set<string> {
  const out = new Set<string>()
  for (const c of codes) {
    const m = monthByCode.get(c)
    if (m ? m <= until : last) out.add(c)
  }
  return out
}
