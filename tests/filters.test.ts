import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { applyFilter, drillTo, filterKey, filterToShow, options } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { findTrips } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'
import { ORDERS, orderLabel } from '@/lib/species/orders'

const row = (code: string, ord: string, fam: string, to: number) => ({ code, com: code, sci: code, ord, fam, famCom: `${fam} common`, to }) as never
const rows = [
  row('duck', 'Anseriformes', 'Anatidae', 1),
  row('owl', 'Strigiformes', 'Strigidae', 5),
  row('crow', 'Passeriformes', 'Corvidae', 10),
  row('wren', 'Passeriformes', 'Troglodytidae', 12),
  row('finch', 'Passeriformes', 'Fringillidae', 14),
]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const e = (code: string, country: string, date?: string): ListEntry => ({ code, date, place: { country }, heard: false, dead: false, media: false, sources: [] })
const list = [
  e('duck', 'CA', '2020-01-01'), e('owl', 'CA', '2021-01-01'), e('crow', 'CA', '2020-02-02'),
  e('wren', 'EG', '2026-09-01'), e('finch', 'EG', '2026-09-02'), e('crow', 'EG', '2026-09-03'), e('owl', 'EG'),
]
list[5] = e('crow2', 'EG', '2026-09-03')
const sp2: SpeciesIndex = { ...species, byCode: new Map([...species.byCode, ['crow2', { ...(species.byCode.get('crow') as object), code: 'crow2', to: 11 } as never]]) }
const pad = Array.from({ length: 5 }, (_, i) => e(`p${i}`, 'CA', '2019-01-01')) // makes CA home
const trips = findTrips([...list, ...pad], (c) => c)

describe('filters', () => {
  it('filters combine with AND', () => {
    const f = { order: 'Passeriformes', countries: ['EG'], year: '2026' }
    expect(applyFilter(list, f, sp2, trips).map((x) => x.code)).toEqual(['wren', 'finch', 'crow2'])
    expect(applyFilter(list, { ...f, family: 'Corvidae' }, sp2, trips).map((x) => x.code)).toEqual(['crow2'])
    expect(applyFilter(list, { order: 'Anseriformes', countries: ['EG'] }, sp2, trips)).toEqual([])
  })
  it('family outside the order and trip outside the year match nothing; undated never match a year', () => {
    expect(applyFilter(list, { order: 'Strigiformes', family: 'Corvidae' }, sp2, trips)).toEqual([])
    expect(trips).toHaveLength(1)
    expect(applyFilter(list, { year: '2025', trip: trips[0].id }, sp2, trips)).toEqual([])
    expect(applyFilter(list, { year: '2026', trip: trips[0].id }, sp2, trips)).toHaveLength(3)
    expect(applyFilter(list, { year: '2026' }, sp2, trips).map((x) => x.code)).not.toContain('owl')
  })
  it('options count under the other active filters', () => {
    expect(options(list, {}, 'order', sp2, trips).map((o) => [o.value, o.count])).toEqual([
      ['Anseriformes', 1], ['Strigiformes', 2], ['Passeriformes', 4]])
    expect(options(list, { countries: ['EG'] }, 'order', sp2, trips).map((o) => [o.label, o.count])).toEqual([
      ['Owls', 1], ['Perching birds', 3]])
    expect(options(list, { order: 'Passeriformes', countries: ['CA'] }, 'family', sp2, trips)).toEqual([
      { value: 'Corvidae', label: 'Corvidae common', count: 1 }])
    expect(options(list, { order: 'Passeriformes' }, 'country', sp2, trips, (c) => (c === 'EG' ? 'Egypt' : c))).toEqual([
      { value: 'EG', label: 'Egypt', count: 3 }, { value: 'CA', label: 'CA', count: 1 }])
    expect(options(list, { countries: ['EG'] }, 'year', sp2, trips).map((o) => o.value)).toEqual(['2026'])
    expect(options(list, {}, 'year', sp2, trips).map((o) => o.value)).toEqual(['2026', '2021', '2020'])
    expect(options(list, {}, 'trip', sp2, trips)).toEqual([])
    expect(options(list, { year: '2026' }, 'trip', sp2, trips)).toEqual([{ value: 'EG-2026-09-01', label: 'EG · Sep 2026', count: 3 }])
    expect(options(list, { year: '2026', order: 'Anseriformes' }, 'trip', sp2, trips)).toEqual([])
  })
  it('a range keeps the months from..to (a year-only date overlaps by its year; undated never match)', () => {
    const l2 = [...list, e('duck', 'CA', '2026')]
    l2[7] = e('yearly', 'CA', '2026')
    const sp3: SpeciesIndex = { ...sp2, byCode: new Map([...sp2.byCode, ['yearly', { ...(species.byCode.get('duck') as object), code: 'yearly' } as never]]) }
    expect(applyFilter(l2, { from: '2020-02', to: '2021-01' }, sp3, trips).map((x) => x.code)).toEqual(['owl', 'crow'])
    expect(applyFilter(l2, { from: '2026-09' }, sp3, trips).map((x) => x.code)).toEqual(['wren', 'finch', 'crow2', 'yearly'])
    expect(applyFilter(l2, { to: '2020-01' }, sp3, trips).map((x) => x.code)).toEqual(['duck'])
    // a trip outside the range matches nothing; inside, the trip's birds
    expect(applyFilter(list, { to: '2025-12', trip: trips[0].id }, sp2, trips)).toEqual([])
    expect(applyFilter(list, { from: '2026-09', to: '2026-09', trip: trips[0].id }, sp2, trips)).toHaveLength(3)
  })
  it('filterKey adds the range only when there is one', () => {
    expect(filterKey({ order: 'Passeriformes', from: '2020-03', to: '2021-06', trip: 't' })).toBe('o:Passeriformes|r:2020-03~2021-06|t:t')
    expect(filterKey({ from: '2020-03' })).toBe('r:2020-03~')
    expect(filterKey({ to: '2020-03' })).toBe('r:~2020-03')
  })
  it('filterToShow drops a range (and its trip) that leaves the bird out', () => {
    expect(filterToShow({ countries: ['CA'], from: '2026-01', trip: 'x' }, list[0], species, trips)).toEqual({ countries: ['CA'] })
    expect(filterToShow({ from: '2019-01', to: '2020-12' }, list[0], species, trips)).toEqual({ from: '2019-01', to: '2020-12' })
  })
  it('filterKey is stable regardless of property order', () => {
    expect(filterKey({ year: '2026', order: 'Passeriformes', countries: ['EG'] })).toBe('o:Passeriformes|c:EG|y:2026')
    expect(filterKey({ countries: ['EG'], order: 'Passeriformes', year: '2026', family: undefined, trip: '' })).toBe('o:Passeriformes|c:EG|y:2026')
    expect(filterKey({})).toBe('')
  })
})

describe('orders', () => {
  it('labels every order in species.v1.json', () => {
    const d = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')).species as { ord: string }[]
    for (const o of new Set(d.map((r) => r.ord))) expect(ORDERS[o], o).toBeTruthy()
    expect(orderLabel('Nope')).toBe('Nope')
  })
})

describe('filterToShow and drillTo (the search reaching outside the current filter)', () => {
  const egTrip = trips.find((t) => t.country === 'EG')!
  it('keeps every dimension that already includes the bird', () => {
    expect(filterToShow({ order: 'Passeriformes', countries: ['EG'] }, list[3], species, trips)).toEqual({ order: 'Passeriformes', countries: ['EG'] })
  })
  it('drops only the dimensions that exclude it: another order (and its family), country, year, trip', () => {
    // The duck (Anseriformes, CA, 2020) under Perching birds / Crows, Egypt, 2026, the Egypt trip: everything goes.
    const f = { order: 'Passeriformes', family: 'Corvidae', countries: ['EG'], year: '2026', trip: egTrip.id }
    expect(filterToShow(f, list[0], species, trips)).toEqual({})
    // The wren (Passeriformes, Troglodytidae, EG, 2026) under Perching birds / Crows in Egypt: back to the order.
    expect(filterToShow({ order: 'Passeriformes', family: 'Corvidae', countries: ['EG'] }, list[3], species, trips)).toEqual({ order: 'Passeriformes', countries: ['EG'] })
    // A Canadian crow under Egypt and 2020: the country goes, the year stays.
    expect(filterToShow({ countries: ['EG'], year: '2020' }, list[2], species, trips)).toEqual({ year: '2020' })
    // An undated owl in Egypt under 2026: the year (and its trip) go.
    expect(filterToShow({ countries: ['EG'], year: '2026', trip: egTrip.id }, list[6], species, trips)).toEqual({ countries: ['EG'] })
  })
  it('drillTo opens a group in the current filter, or alone when the other filters would leave it empty', () => {
    expect(drillTo({ countries: ['EG'] }, { order: 'Passeriformes' }, list, species, trips)).toEqual({ countries: ['EG'], order: 'Passeriformes' })
    expect(drillTo({ countries: ['EG'], order: 'Strigiformes' }, { order: 'Passeriformes', family: 'Corvidae' }, list, sp2, trips)).toEqual({ countries: ['EG'], order: 'Passeriformes', family: 'Corvidae' })
    expect(drillTo({ countries: ['EG'] }, { order: 'Anseriformes' }, list, species, trips)).toEqual({ order: 'Anseriformes' })
  })
})
