import { describe, expect, it } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import {
  addMonths, barHeight, boundaryAt, monthAxis, monthBins, pickHandle, monthName, monthOf, rangeFilter, rangeIndices, rangeLabel, sliderKey,
  todayMonth, tripFilter, tripLanes, labelMonths, type Month,
} from '@/lib/list/timeline'

const e = (code: string, date?: string, country = 'CA'): ListEntry => ({ code, date, place: { country }, heard: false, dead: false, media: false, sources: [] })
const trip = (id: string, start: string, end: string, country = 'EG'): Trip => ({ id, country, start, end, label: `${country} trip`, codes: [] })

describe('months', () => {
  it('monthOf reads full dates and months; a year-only date counts as its January; junk is undefined', () => {
    expect(monthOf('2020-03-04')).toBe('2020-03')
    expect(monthOf('2020-03')).toBe('2020-03')
    expect(monthOf('2020')).toBe('2020-01')
    expect(monthOf('2020-13')).toBeUndefined()
    expect(monthOf(undefined)).toBeUndefined()
    expect(monthOf('soon')).toBeUndefined()
  })
  it('addMonths crosses years both ways; names and today', () => {
    expect(addMonths('2020-11', 3)).toBe('2021-02')
    expect(addMonths('2020-01', -1)).toBe('2019-12')
    expect(monthName('2020-03')).toBe('March 2020')
    expect(todayMonth(new Date(Date.UTC(2026, 10, 5)))).toBe('2026-11')
  })
})

describe('monthBins', () => {
  it('one bin per month from the first lifer to today, counting new species; empty months are 0', () => {
    const b = monthBins([e('a', '2020-01-05'), e('b', '2020-01-20'), e('c', '2020-03'), e('d'), e('f', '2020')], '2020-04')
    expect(b.months).toEqual(['2020-01', '2020-02', '2020-03', '2020-04'])
    expect(b.counts).toEqual([3, 0, 1, 0])
    expect(b.max).toBe(3)
    expect(b.undated).toBe(1)
  })
  it('a date after "today" stretches the span to it; no dates means no months', () => {
    expect(monthBins([e('a', '2020-01'), e('b', '2020-03')], '2020-02').months).toEqual(['2020-01', '2020-02', '2020-03'])
    expect(monthBins([e('a')], '2020-02')).toEqual({ months: [], counts: [], max: 0, undated: 1 })
  })
  it('a filtered list keeps the whole list\'s span', () => {
    const all = [e('a', '2020-01'), e('b', '2020-03')]
    expect(monthBins([all[1]], '2020-03', all)).toEqual({ months: ['2020-01', '2020-02', '2020-03'], counts: [0, 0, 1], max: 1, undated: 0 })
  })
})

// A list shaped like a real one: a lone early month (a trip years before birding began), a long empty gap, then dense
// months with one outlier month (a big trip) that would flatten everything else on a linear scale.
const outlier = [4, ...new Array(28).fill(0), 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1, 1, 2, 0, 1, 0, 0, 3, 0, 7, 1, 20, 1, 8, 1, 0, 63, 28, 2, 0, 8, 0, 0, 1, 0, 0, 2, 17, 13, 0, 0, 0, 7, 0, 0]

describe('monthAxis', () => {
  it('collapses a long empty gap to a short break, so a lone early month does not push the rest off screen', () => {
    const a = monthAxis(outlier)
    expect(a.gaps).toEqual([{ from: 1, to: 28 }]) // 28 empty months; the 10-month gap later stays (under 12)
    expect(a.units).toBeCloseTo(outlier.length - 28 + 2)
    expect(a.start[0]).toBe(0)
    expect(a.start[outlier.length]).toBeCloseTo(a.units)
    // The gap's months share two months' width; a month outside it keeps one.
    expect(a.start[29] - a.start[1]).toBeCloseTo(2)
    expect(a.start[30] - a.start[29]).toBeCloseTo(1)
    // Monotonic, so handles and labels keep their order.
    for (let i = 1; i <= outlier.length; i++) expect(a.start[i]).toBeGreaterThan(a.start[i - 1])
  })
  it('leaves a list without long gaps linear', () => {
    const a = monthAxis([1, 0, 2, 0, 0, 3])
    expect(a.gaps).toEqual([])
    expect(a.start).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it('collapses a trailing gap too (the last lifer long before today)', () => {
    expect(monthAxis([2, 1, ...new Array(15).fill(0)]).gaps).toEqual([{ from: 2, to: 16 }])
  })
  it('boundaryAt maps a fraction of the track back to the nearest month boundary', () => {
    const a = monthAxis(outlier)
    expect(boundaryAt(a, 0)).toBe(0)
    expect(boundaryAt(a, 1)).toBe(outlier.length)
    for (const i of [1, 29, 30, 50, outlier.length - 1]) expect(boundaryAt(a, a.start[i] / a.units)).toBe(i)
  })
})

describe('barHeight', () => {
  it('a square-root scale with a floor: one species is a clear bar next to an outlier month, empty months none', () => {
    expect(barHeight(0, 63)).toBe(0)
    expect(barHeight(63, 63)).toBe(100)
    expect(barHeight(1, 63)).toBeGreaterThanOrEqual(12) // linear would be 1.6%: invisible beside the empty ticks
    expect(barHeight(8, 63)).toBeGreaterThan(barHeight(1, 63))
    expect(barHeight(28, 63)).toBeLessThan(100)
    expect(barHeight(1, 1)).toBe(100)
  })
})

describe('tripLanes', () => {
  const months = ['2020-01', '2020-02', '2020-03', '2020-04', '2020-05', '2020-06', '2020-07', '2020-08']
  it('places each trip under its months, in the first lane where it does not touch another (labels need minSpan months)', () => {
    const lanes = tripLanes([
      trip('a', '2020-01-02', '2020-01-09'),
      trip('b', '2020-02-01', '2020-02-03'), // within a's label room (minSpan 3: months 0..2) -> lane 1
      trip('c', '2020-05-28', '2020-07-02'),
      trip('d', '2020-04-01', '2020-04-02'), // free in lane 0 (a ends its room at 2)
    ], months, 3)
    expect(lanes.map((l) => [l.trip.id, l.start, l.end, l.lane])).toEqual([
      ['a', 0, 0, 0], ['b', 1, 1, 1], ['d', 3, 3, 0], ['c', 4, 6, 1],
    ])
  })
  it('minSpan can depend on the trip (its label\'s width)', () => {
    const lanes = tripLanes([trip('a', '2020-01-02', '2020-01-03'), trip('b', '2020-02-01', '2020-02-03')], months, (t) => (t.id === 'a' ? 1 : 5))
    expect(lanes.map((l) => l.lane)).toEqual([0, 0])
  })
  it('minSpan can depend on where the trip starts (an uneven axis)', () => {
    const lanes = tripLanes([trip('a', '2020-01-02', '2020-01-03'), trip('b', '2020-02-01', '2020-02-03')], months, (_t, start) => (start === 0 ? 1 : 5))
    expect(lanes.map((l) => l.lane)).toEqual([0, 0])
  })
  it('drops trips outside the months', () => {
    expect(tripLanes([trip('x', '2019-01-01', '2019-01-04')], months, 1)).toEqual([])
  })
  it('a label that would run past the end flips and claims the months before the trip\'s end instead', () => {
    // 8 months, labels need 3: c at month 6 would run to month 8 (past the end), so it holds months 4..6, which b's
    // label (months 3..5) already holds in lane 0.
    const lanes = tripLanes([trip('b', '2020-04-01', '2020-04-03'), trip('c', '2020-07-01', '2020-07-03')], months, 3)
    expect(lanes.map((l) => [l.trip.id, l.lane, l.flip])).toEqual([['b', 0, false], ['c', 1, true]])
    // With room before it, the flipped label shares the lane.
    const free = tripLanes([trip('a', '2020-01-01', '2020-01-03'), trip('c', '2020-07-01', '2020-07-03')], months, 3)
    expect(free.map((l) => [l.trip.id, l.lane, l.flip])).toEqual([['a', 0, false], ['c', 0, true]])
  })
  it('two flipped labels at the end take two lanes', () => {
    const lanes = tripLanes([trip('a', '2020-07-01', '2020-07-03'), trip('b', '2020-08-01', '2020-08-03')], months, 3)
    expect(lanes.map((l) => [l.trip.id, l.lane, l.flip])).toEqual([['a', 0, true], ['b', 1, true]])
  })
})

describe('trip labels on a 390px column', () => {
  // A phone's strip: the 390px viewport less the strip's 22px padding each side. A gappy list (a lone early month, a
  // long empty gap, then 46 months of birding), trips with labels of the real widths (TripBrackets' labelPx).
  const TRACK = 390 - 2 * 22
  const labelPx = (name: string) => 30 + name.length * 7.5
  const counts = [4, ...new Array(30).fill(0), ...Array.from({ length: 46 }, (_, i) => (i % 3 ? 1 : 0))]
  const axis = monthAxis(counts)
  const unitPx = TRACK / axis.units
  const ms: Month[] = counts.map((_, i) => addMonths('2020-05', i))
  const names: Record<string, string> = { EG: 'Egypt', CR: 'Costa Rica', ZA: 'South Africa', MX: 'Mexico', PE: 'Peru', US: 'United States' }
  const room = (t: Trip, at: number, dir: 1 | -1) => labelMonths(axis, unitPx, labelPx(names[t.country]), at, dir)
  // Each label's px extent: rightwards from the bracket's left edge, or (flipped) leftwards from its right edge.
  const extent = (l: { trip: Trip; start: number; end: number; flip: boolean }) => {
    const w = labelPx(names[l.trip.country])
    return l.flip ? [axis.start[l.end + 1] * unitPx - w, axis.start[l.end + 1] * unitPx] : [axis.start[l.start] * unitPx, axis.start[l.start] * unitPx + w]
  }
  const noOverlap = (lanes: ReturnType<typeof tripLanes>) => {
    for (const a of lanes) for (const b of lanes) {
      if (a === b || a.lane !== b.lane) continue
      const [a0, a1] = extent(a), [b0, b1] = extent(b)
      const ra = [axis.start[a.start] * unitPx, axis.start[a.end + 1] * unitPx], rb = [axis.start[b.start] * unitPx, axis.start[b.end + 1] * unitPx]
      const lo = (x: number[], y: number[]) => Math.min(x[0], y[0]), hi = (x: number[], y: number[]) => Math.max(x[1], y[1])
      const A = [lo([a0, a1], ra), hi([a0, a1], ra)], B = [lo([b0, b1], rb), hi([b0, b1], rb)]
      expect(A[1] <= B[0] + 0.5 || B[1] <= A[0] + 0.5, `${a.trip.id} and ${b.trip.id} overlap in lane ${a.lane}`).toBe(true)
    }
  }
  const at = (i: number) => `${ms[i]}-05`

  it('the end-of-strip trips flip and never sit on an earlier label', () => {
    const n = ms.length
    const lanes = tripLanes([
      trip('us', at(n - 20), at(n - 20), 'US'), // "United States" (about 18 months here) runs right to the last months
      trip('eg', at(n - 2), at(n - 2), 'EG'), // flips, running back over "United States"
      trip('cr', at(n - 1), at(n - 1), 'CR'), // flips too, over both
    ], ms, room)
    expect(lanes.map((l) => [l.trip.id, l.flip])).toEqual([['us', false], ['eg', true], ['cr', true]])
    expect(new Set(lanes.map((l) => l.lane)).size).toBe(3)
    noOverlap(lanes)
    // Every label stays on the strip.
    for (const l of lanes) { const [x0, x1] = extent(l); expect(x0).toBeGreaterThanOrEqual(0); expect(x1).toBeLessThanOrEqual(TRACK + 0.01) }
  })

  it('no two labels in a lane overlap, for many trip sets', () => {
    let seed = 7
    const rnd = (k: number) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % k }
    const isos = Object.keys(names)
    for (let run = 0; run < 200; run++) {
      const trips = Array.from({ length: 2 + rnd(6) }, (_, i) => {
        const s = rnd(ms.length), e = Math.min(ms.length - 1, s + rnd(3))
        return trip(`t${i}`, at(s), at(e), isos[rnd(isos.length)])
      })
      noOverlap(tripLanes(trips, ms, room))
    }
  })
})

describe('slider keyboard', () => {
  it('arrows move a month, PageUp/PageDown a year, Home/End to the ends, clamped; other keys do nothing', () => {
    expect(sliderKey('ArrowRight', 5, 0, 20)).toBe(6)
    expect(sliderKey('ArrowUp', 5, 0, 20)).toBe(6)
    expect(sliderKey('ArrowLeft', 5, 0, 20)).toBe(4)
    expect(sliderKey('ArrowDown', 0, 0, 20)).toBe(0)
    expect(sliderKey('PageUp', 5, 0, 20)).toBe(17)
    expect(sliderKey('PageUp', 15, 0, 20)).toBe(20)
    expect(sliderKey('PageDown', 5, 0, 20)).toBe(0)
    expect(sliderKey('Home', 5, 3, 20)).toBe(3)
    expect(sliderKey('End', 5, 0, 9)).toBe(9)
    expect(sliderKey('a', 5, 0, 9)).toBeNull()
  })
})

describe('pickHandle', () => {
  it('the nearer handle; stacked handles under the pointer wait for the first move (null)', () => {
    expect(pickHandle(105, 100, 300)).toBe('lo')
    expect(pickHandle(290, 100, 300)).toBe('hi')
    expect(pickHandle(500, 500, 500)).toBeNull()
    expect(pickHandle(503, 498, 508)).toBeNull()
    expect(pickHandle(140, 100, 300)).toBe('lo')
  })
})

describe('range filter', () => {
  const months = ['2020-01', '2020-02', '2020-03', '2020-04']
  it('rangeIndices reads from/to (or a trip, or a year) onto the months, clamped; nothing is the whole span', () => {
    expect(rangeIndices({}, months)).toEqual([0, 3])
    expect(rangeIndices({ from: '2020-02' }, months)).toEqual([1, 3])
    expect(rangeIndices({ from: '2019-02', to: '2020-03' }, months)).toEqual([0, 2])
    expect(rangeIndices({ year: '2020' }, months)).toEqual([0, 3])
  })
  it('rangeFilter leaves an end open at the span edge and clears year and trip', () => {
    expect(rangeFilter({ order: 'X', year: '2020', trip: 't' }, 1, 2, months)).toEqual({ order: 'X', from: '2020-02', to: '2020-03' })
    expect(rangeFilter({ from: '2020-02' }, 0, 3, months)).toEqual({})
    expect(rangeFilter({}, 2, 1, months)).toEqual({ from: '2020-02', to: '2020-03' }) // swapped ends
  })
  it('tripFilter selects the trip with its months; the same trip again clears both', () => {
    const t = trip('EG-2020-02-27', '2020-02-27', '2020-03-02')
    const f = tripFilter({ order: 'X', year: '2020' }, t)
    expect(f).toEqual({ order: 'X', trip: t.id, from: '2020-02', to: '2020-03' })
    expect(tripFilter(f, t)).toEqual({ order: 'X' })
  })
  it('rangeLabel says the range in words', () => {
    expect(rangeLabel('2020-01', '2020-12')).toBe('2020')
    expect(rangeLabel('2020-09', '2020-09')).toBe('Sep 2020')
    expect(rangeLabel('2020-03', '2021-06')).toBe('Mar 2020 to Jun 2021')
    expect(rangeLabel('2020-03', undefined)).toBe('From Mar 2020')
    expect(rangeLabel(undefined, '2021-06')).toBe('Up to Jun 2021')
    expect(rangeLabel(undefined, undefined)).toBeUndefined()
  })
})

