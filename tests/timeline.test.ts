import { describe, expect, it } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import {
  addMonths, barHeight, boundaryAt, monthAxis, monthBins, pickHandle, monthName, monthOf, rangeFilter, rangeIndices, rangeLabel, sliderKey,
  todayMonth, tripFilter, tripLanes,
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

