import { describe, expect, it } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
import {
  addMonths, monthBins, monthName, monthOf, playInterval, rangeFilter, rangeIndices, rangeLabel, revealUntil, sliderKey,
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

describe('play', () => {
  it('steps take 90 ms (3 to 12 s in all); reduced motion steps by month at 600 ms', () => {
    expect(playInterval(120, false)).toBe(90)
    expect(playInterval(10, false)).toBe(300)
    expect(playInterval(400, false)).toBe(30)
    expect(playInterval(120, true)).toBe(600)
  })
  it('revealUntil shows birds up to the month; undated birds arrive with the last month', () => {
    const months = new Map([['a', '2020-01'], ['b', '2020-03']] as [string, string | undefined][])
    months.set('c', undefined)
    const codes = ['a', 'b', 'c']
    expect([...revealUntil(codes, months, '2020-02', false)]).toEqual(['a'])
    expect([...revealUntil(codes, months, '2020-03', true)]).toEqual(['a', 'b', 'c'])
  })
})
