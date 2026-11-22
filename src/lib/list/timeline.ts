// The Time panel's pure logic: months across the list's span, new species per month, the range handles' keyboard
// steps and the range filter.
//
// The filter's time model (see filters.ts): a date range `from`/`to` (YYYY-MM, both inclusive, either end open)
// replaces the year chips. A year is the range Jan..Dec of that year (`year` still filters, and the store turns it into
// that range).
import { fmt } from '@/i18n/core'
import { formatMonth } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { Filter } from './filters'
import type { ListEntry } from './model'

export type Month = string // 'YYYY-MM'

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
/** "March 2020" (the sliders' aria-valuetext), in `t`'s language ("marzo de 2020"). */
export const monthName = (m: Month, t: Ui): string =>
  fmt(t.filters.timeline.month, { month: t.filters.timeline.months[Number(m.slice(5, 7)) - 1], year: m.slice(0, 4) })
/** "Mar 2020" ("sept 2020"). */
export const monthShort = (m: Month, t: Pick<Ui, 'date'>): string => formatMonth(m, t.date.months)
/** The current month (UTC). */
export const todayMonth = (now = new Date()): Month => `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

type MonthBins = { months: Month[]; counts: number[]; max: number; undated: number }

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
const GAP_MIN_MONTHS = 12
/** How many months' width a collapsed gap takes. */
const GAP_UNITS = 2

/**
 * The strip's horizontal scale. Every month is one unit wide, except runs of GAP_MIN_MONTHS or more empty months
 * (`counts`, the whole list's, so the axis never moves under a filter), which share GAP_UNITS: a lone early lifer and a
 * long gap before regular birding no longer stretch the strip off screen. `start[i]` is month i's left edge in units
 * (`start[N]` = `units`); `gaps` are the collapsed runs (month indices, inclusive).
 */
type MonthAxis = { units: number; start: number[]; gaps: { from: number; to: number }[] }
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

/**
 * The year labels the axis can show without touching: a label at each January and at the first month, dropped when its
 * left edge is within the previous kept label's width (`chars` · `charPx`, plus the 3px rule padding and `gap`) of it, or
 * when it is within `endClear` px of the strip's end. A partial first year (the strip starts after January) gives way to the
 * next, full year rather than the other way round. `unitPx` is one axis unit in px.
 */
export function yearLabels(
  months: readonly Month[],
  axis: Pick<MonthAxis, 'units' | 'start'>,
  unitPx: number,
  { charPx = 6.6, gap = 6, pad = 3, endClear = 28 }: { charPx?: number; gap?: number; pad?: number; endClear?: number } = {},
): { m: Month; i: number }[] {
  const out: { m: Month; i: number }[] = []
  let lastX = -Infinity
  let lastW = 0
  months.forEach((m, i) => {
    const jan = m.endsWith('-01')
    if (!(jan || i === 0)) return
    const x = axis.start[i] * unitPx
    if (i > 0 && (axis.units - axis.start[i]) * unitPx <= endClear) return
    const w = m.slice(0, 4).length * charPx + pad
    if (out.length && x - lastX < lastW + gap) {
      // Only a partial first year (index 0, not January) is replaced by the later one.
      const first = out[0]
      if (out.length === 1 && first.i === 0 && !first.m.endsWith('-01') && jan) out.pop()
      else return
    }
    out.push({ m, i })
    lastX = x
    lastW = w
  })
  return out
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
  delete rest.year; delete rest.from; delete rest.to
  return rest
}

const clean = (f: Filter): Filter => {
  for (const k of Object.keys(f) as (keyof Filter)[]) if (!f[k]) delete f[k]
  return f
}

/** The filter with the range lo..hi (indices into `months`); an end at the span's edge stays open. Clears the year. */
export function rangeFilter(f: Filter, lo: number, hi: number, months: readonly Month[]): Filter {
  const [a, b] = lo <= hi ? [lo, hi] : [hi, lo]
  const next: Filter = { ...f, from: a > 0 ? months[a] : undefined, to: b < months.length - 1 ? months[b] : undefined }
  delete next.year
  return clean(next)
}

/**
 * The range as the Time chip, the Time button and the timeline's readout say it, in `t`'s language: whole years
 * "2020–2024" ("2020" for one), one month "Sep 2021", else months on both sides "Apr 2020–Sep 2024" / "Jan 2020–Mar 2020";
 * open ends "from Apr 2020" / "to Sep 2024" ("from 2020" when `from` is a January, "to 2024" when `to` is a December;
 * the words are `timeline.sumFrom` / `sumTo`). Undefined with neither end.
 */
export function rangeShort(from: Month | undefined, to: Month | undefined, t: Pick<Ui, 'filters' | 'date'>): string | undefined {
  const y = (m: Month) => m.slice(0, 4)
  const tl = t.filters.timeline
  const start = (m: Month) => (m.endsWith('-01') ? y(m) : monthShort(m, t))
  const end = (m: Month) => (m.endsWith('-12') ? y(m) : monthShort(m, t))
  if (from && to) {
    if (from === to) return monthShort(from, t)
    // Whole years only when both ends are: "2020–2024"; otherwise months on both sides ("Jan 2020–Mar 2020").
    if (from.endsWith('-01') && to.endsWith('-12')) return y(from) === y(to) ? y(from) : `${y(from)}–${y(to)}`
    return `${monthShort(from, t)}–${monthShort(to, t)}`
  }
  if (from) return fmt(tl.sumFrom, { year: start(from) })
  if (to) return fmt(tl.sumTo, { year: end(to) })
  return undefined
}

/** The range in words, in `t`'s language: "2020", "Sep 2020", "Mar 2020 to Jun 2021", "From Mar 2020", "Up to Jun 2021". */
export function rangeLabel(from: Month | undefined, to: Month | undefined, t: Pick<Ui, 'filters' | 'date'>): string | undefined {
  const tl = t.filters.timeline
  if (from && to) {
    if (from === to) return monthShort(from, t)
    if (from.slice(0, 4) === to.slice(0, 4) && from.endsWith('-01') && to.endsWith('-12')) return from.slice(0, 4)
    return fmt(tl.range, { from: monthShort(from, t), to: monthShort(to, t) })
  }
  if (from) return fmt(tl.from, { month: monthShort(from, t) })
  if (to) return fmt(tl.upTo, { month: monthShort(to, t) })
  return undefined
}
