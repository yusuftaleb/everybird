import { describe, expect, it } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { DEFAULT_RULES, EMPTY_EDITS, type Edits, type Rules, type SourceRecord } from '@/lib/list/model'
import { SeenAgg, buildSeen, decodeSeen, encodeSeen, placeKeys, seenOf } from '@/lib/list/seen'

const rec = (code: string, source: SourceRecord['source'], extra: Partial<SourceRecord> = {}): SourceRecord => ({ code, source, ...extra })
const build = (records: SourceRecord[], edits: Partial<Edits> = {}, rules: Partial<Rules> = {}) => {
  const e = { ...EMPTY_EDITS, ...edits }
  const r = { ...DEFAULT_RULES, ...rules }
  const list = buildList(records, e, r)
  return { list, seen: buildSeen(records, e, r, list) }
}

describe('seen-here encoding', () => {
  it('round-trips date, region and county; country-only and undated places too', () => {
    expect(encodeSeen({ country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' }, '2020-05-01')).toBe('2020-05-01|CA-BC|Okanagan-Similkameen')
    expect(encodeSeen({ country: 'KE' }, undefined)).toBe('|KE')
    expect(encodeSeen({}, '2020')).toBeUndefined()
    expect(decodeSeen('2020-05-01|CA-BC|Okanagan-Similkameen')).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen', date: '2020-05-01' })
    expect(decodeSeen('|KE')).toEqual({ country: 'KE' })
    expect(decodeSeen('2021-01|US-AZ')).toEqual({ country: 'US', sub1: 'US-AZ', date: '2021-01' })
    expect(decodeSeen('garbage')).toBeUndefined()
  })
  it('a county without a province is kept under the country', () => {
    expect(decodeSeen(encodeSeen({ country: 'HK', sub2: 'Kowloon' }, '2020-01-01')!)).toEqual({ country: 'HK', sub2: 'Kowloon', date: '2020-01-01' })
  })
})

describe('SeenAgg', () => {
  it('keeps one entry per species and place, with the earliest date there', () => {
    const a = new SeenAgg()
    a.add('x', { country: 'CA', sub1: 'CA-BC', sub2: 'A' }, '2020-05-01')
    a.add('x', { country: 'CA', sub1: 'CA-BC', sub2: 'A' }, '2019-01-01')
    a.add('x', { country: 'CA', sub1: 'CA-BC' }, '2021-01-01')
    a.add('x', { country: 'CA', sub1: 'CA-BC', sub2: 'A' }, undefined)
    a.add('y', { country: 'US' }, undefined)
    a.add('y', undefined, '2020-01-01')
    expect(a.get('x')!.sort()).toEqual(['2019-01-01|CA-BC|A', '2021-01-01|CA-BC'])
    expect(a.get('y')).toEqual(['|US'])
    expect(a.get('z')).toBeUndefined()
  })
  it('an undated place takes a later dated sighting there', () => {
    const a = new SeenAgg()
    a.add('x', { country: 'US' }, undefined)
    a.add('x', { country: 'US' }, '2020-02-02')
    expect(a.get('x')).toEqual(['2020-02-02|US'])
  })
  it('merges one aggregate into another under a new code (a fixed or renamed species)', () => {
    const a = new SeenAgg()
    a.add('n1', { country: 'US' }, '2020-02-02')
    a.add('n2', { country: 'US' }, '2019-02-02')
    a.add('n2', { country: 'MX' }, '2018-02-02')
    const b = new SeenAgg()
    b.merge('code', a, 'n1')
    b.merge('code', a, 'n2')
    expect(b.get('code')!.sort()).toEqual(['2018-02-02|MX', '2019-02-02|US'])
  })
})

describe('buildSeen', () => {
  it('unions the sources per species, earliest date per place; the lifer is untouched', () => {
    const { list, seen } = build([
      rec('a', 'ebird', { date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' }, seen: ['2020-01-01|CA-BC', '2022-03-03|US-WA|King', '2021-01-01|CA-BC|X'] }),
      rec('a', 'inat', { date: '2019-01-01', place: { country: 'MX' }, seen: ['2019-01-01|MX', '2021-06-06|US-WA|King'] }),
    ])
    expect(list[0]).toMatchObject({ date: '2019-01-01', place: { country: 'MX' } })
    const places = seenOf(seen, list[0])
    expect(places.map((p) => [p.sub2 ?? p.sub1 ?? p.country, p.date]).sort()).toEqual([
      ['CA-BC', '2020-01-01'], ['King', '2021-06-06'], ['MX', '2019-01-01'], ['X', '2021-01-01']])
    expect(seen.full).toBe(true)
  })
  it('records without seen-here (life list download, manual ticks, fixed rows, old saves) give their lifer place', () => {
    const { list, seen } = build(
      [rec('a', 'ebird', { date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC' } }), rec('b', 'ebird')],
      { added: [rec('m', 'manual', { date: '2021', place: { country: 'EG' } })] },
    )
    expect(seenOf(seen, list.find((e) => e.code === 'a')!)).toEqual([{ country: 'CA', sub1: 'CA-BC', date: '2020-01-01' }])
    expect(seenOf(seen, list.find((e) => e.code === 'b')!)).toEqual([])
    expect(seenOf(seen, list.find((e) => e.code === 'm')!)).toEqual([{ country: 'EG', date: '2021' }])
    expect(seen.full).toBe(false)
  })
  it('removed species and species hidden by a rule drop out; researchOnly drops the casual records', () => {
    const records = [
      rec('a', 'ebird', { seen: ['2020-01-01|CA'] }),
      rec('h', 'ebird', { heard: true, seen: ['2020-01-01|US'] }),
      rec('c', 'inat', { research: false, seen: ['2020-01-01|MX'] }),
      rec('r', 'inat', { research: false, seen: ['2020-01-01|BR'] }),
      rec('r', 'inat', { research: true, seen: ['2020-01-01|AR'] }),
    ]
    const { seen } = build(records, { removed: ['a'] }, { hideHeard: true, researchOnly: true })
    expect([...seen.byCode.keys()].sort()).toEqual(['r'])
    expect(seen.byCode.get('r')!.places.map((p) => p.country)).toEqual(['AR'])
  })
  it('a species whose only record is outside the list has nothing (seenOf falls back to the lifer place)', () => {
    const { seen } = build([])
    expect(seenOf(seen, { code: 'q', place: { country: 'FR' }, heard: false, dead: false, media: false, sources: [] })).toEqual([{ country: 'FR' }])
    expect(seenOf(undefined, { code: 'q', place: { sub1: 'FR-IDF' }, heard: false, dead: false, media: false, sources: [] })).toEqual([{ country: 'FR', sub1: 'FR-IDF' }])
  })
  it('the signature changes with the places and not otherwise', () => {
    const one = build([rec('a', 'ebird', { seen: ['2020-01-01|CA'] })]).seen.sig
    expect(build([rec('a', 'ebird', { seen: ['2020-01-01|CA'] })]).seen.sig).toBe(one)
    expect(build([rec('a', 'ebird', { seen: ['2020-01-01|CA', '2020-01-02|US'] })]).seen.sig).not.toBe(one)
  })
})

describe('placeKeys', () => {
  it('names the countries of the places (the filter goes no deeper)', () => {
    expect([...placeKeys([{ country: 'CA', sub1: 'CA-BC', sub2: 'A' }, { country: 'US' }])].sort()).toEqual(['c:CA', 'c:US'])
  })
})
