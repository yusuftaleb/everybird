import { describe, expect, it } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import { findTrips } from '@/lib/list/trips'

const e = (code: string, country: string, date?: string): ListEntry => ({
  code, date, place: { country }, heard: false, dead: false, media: false, sources: ['ebird'],
})
const name = (c: string) => ({ EG: 'Egypt', CA: 'Canada' })[c] ?? c
const home = Array.from({ length: 10 }, (_, i) => e(`h${i}`, 'CA', `2020-01-0${(i % 9) + 1}`))

describe('findTrips', () => {
  it("three Egypt lifers within 3 days form 'Egypt · Sep 2026'", () => {
    const t = findTrips([...home, e('a', 'EG', '2026-09-01'), e('b', 'EG', '2026-09-04'), e('c', 'EG', '2026-09-06')], name)
    expect(t).toEqual([{ id: 'EG-2026-09-01', country: 'EG', start: '2026-09-01', end: '2026-09-06', label: 'Egypt · Sep 2026', codes: ['a', 'b', 'c'] }])
  })
  it('home-country runs are not trips', () => {
    expect(findTrips(home, name)).toEqual([])
  })
  it('a 4-day gap splits a trip', () => {
    const g = (days: string[]) => [...home, ...days.map((d, i) => e(`k${i}`, 'EG', `2026-09-${d}`))]
    expect(findTrips(g(['01', '02', '03', '07', '08', '09']), name).map((t) => t.codes)).toEqual([['k0', 'k1', 'k2'], ['k3', 'k4', 'k5']])
    expect(findTrips(g(['01', '02', '03', '06', '07', '08']), name).map((t) => t.codes)).toEqual([['k0', 'k1', 'k2', 'k3', 'k4', 'k5']])
    expect(findTrips(g(['01', '02', '07', '08']), name)).toEqual([])
  })
  it('ignores partial dates and needs 3 lifers', () => {
    const l = [...home, e('a', 'EG', '2026-09'), e('b', 'EG', '2026-09-02'), e('c', 'EG', '2026-09-03'), e('d', 'EG')]
    expect(findTrips(l, name)).toEqual([])
  })
  it('falls back to the sub1 prefix for country', () => {
    const l = [...home, ...['a', 'b', 'c'].map((c, i) => ({ ...e(c, 'X', `2026-09-0${i + 1}`), place: { sub1: 'EG-C' } }))]
    expect(findTrips(l, name)[0].country).toBe('EG')
  })
})
