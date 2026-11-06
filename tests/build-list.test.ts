import { describe, expect, it } from 'vitest'
import { buildList, latestLifer } from '@/lib/list/build-list'
import { DEFAULT_RULES, EMPTY_EDITS, type SourceRecord } from '@/lib/list/model'

const rec = (code: string, source: SourceRecord['source'], extra: Partial<SourceRecord> = {}): SourceRecord => ({ code, source, ...extra })
const build = (records: SourceRecord[], edits = {}, rules = {}) =>
  buildList(records, { ...EMPTY_EDITS, ...edits }, { ...DEFAULT_RULES, ...rules })

describe('buildList', () => {
  it('earliest date wins with its place', () => {
    const [e] = build([
      rec('a', 'ebird', { date: '2020-05-01', place: { country: 'CA' } }),
      rec('a', 'inat', { date: '2019-03-02', place: { country: 'US' } }),
    ])
    expect(e.date).toBe('2019-03-02')
    expect(e.place).toEqual({ country: 'US' })
    expect(e.sources).toEqual(['ebird', 'inat'])
  })

  it('YYYY-MM loses to an earlier full date and beats a later one', () => {
    expect(build([rec('a', 'ebird', { date: '2020-05' }), rec('a', 'inat', { date: '2020-04-30' })])[0].date).toBe('2020-04-30')
    expect(build([rec('a', 'ebird', { date: '2020-05' }), rec('a', 'inat', { date: '2020-05-02' })])[0].date).toBe('2020-05')
    expect(build([rec('a', 'ebird', { date: '2020' }), rec('a', 'inat', { date: '2020-01-01' })])[0].date).toBe('2020')
  })

  it('undated records lose to dated ones', () => {
    expect(build([rec('a', 'ebird'), rec('a', 'inat', { date: '2021' })])[0].date).toBe('2021')
    expect(build([rec('a', 'ebird')])[0].date).toBeUndefined()
  })

  it('equal dates: ebird beats inat beats manual', () => {
    const [e] = build([
      rec('a', 'manual', { date: '2020', place: { country: 'M' } }),
      rec('a', 'inat', { date: '2020', place: { country: 'I' } }),
      rec('a', 'ebird', { date: '2020', place: { country: 'E' } }),
    ])
    expect(e.place?.country).toBe('E')
  })

  it('heard only when all records heard; one eBird record clears it', () => {
    expect(build([rec('a', 'inat', { heard: true }), rec('a', 'inat', { heard: true })])[0].heard).toBe(true)
    expect(build([rec('a', 'inat', { heard: true }), rec('a', 'ebird')])[0].heard).toBe(false)
    expect(build([rec('a', 'inat', { dead: true })])[0].dead).toBe(true)
    expect(build([rec('a', 'inat', { dead: true }), rec('a', 'ebird')])[0].dead).toBe(false)
  })

  it('media when any record has media', () => {
    expect(build([rec('a', 'ebird'), rec('a', 'inat', { media: true })])[0].media).toBe(true)
    expect(build([rec('a', 'ebird')])[0].media).toBe(false)
  })

  it('removed species disappears; manual addition appears', () => {
    const list = build([rec('a', 'ebird'), rec('b', 'ebird')], {
      removed: ['a'],
      added: [rec('c', 'ebird', { date: '2022' })],
    })
    expect(list.map((e) => e.code)).toEqual(['b', 'c'])
    expect(list[1].sources).toEqual(['manual'])
  })

  it('removed wins over an addition of the same code', () => {
    expect(build([], { removed: ['c'], added: [rec('c', 'manual')] })).toEqual([])
  })

  it('mark override beats computed mark', () => {
    const [e] = build([rec('a', 'ebird', { media: true })], { marks: { a: { heard: true, media: false } } })
    expect(e.heard).toBe(true)
    expect(e.media).toBe(false)
    expect(e.dead).toBe(false)
  })

  it('casual-only iNat species is hidden with researchOnly, shown without; eBird + casual iNat stays', () => {
    const records = [rec('x', 'inat', { research: false }), rec('y', 'inat', { research: false }), rec('y', 'ebird')]
    expect(build(records, {}, { researchOnly: true }).map((e) => e.code)).toEqual(['y'])
    expect(build(records).map((e) => e.code)).toEqual(['x', 'y'])
  })

  it('researchOnly drops non-research iNat records', () => {
    const records = [rec('a', 'inat', { research: false }), rec('b', 'inat', { research: true }), rec('c', 'ebird'), rec('d', 'inat')]
    expect(build(records, {}, { researchOnly: true }).map((e) => e.code)).toEqual(['b', 'c', 'd'])
    expect(build(records).map((e) => e.code)).toEqual(['a', 'b', 'c', 'd'])
    const [e] = build([rec('a', 'inat', { research: false, date: '2018' }), rec('a', 'ebird', { date: '2020' })], {}, { researchOnly: true })
    expect(e.sources).toEqual(['ebird'])
    expect(e.date).toBe('2020')
  })

  it('hideHeard and hideDead', () => {
    const records = [rec('a', 'inat', { heard: true }), rec('b', 'inat', { dead: true }), rec('c', 'ebird')]
    expect(build(records, {}, { hideHeard: true }).map((e) => e.code)).toEqual(['b', 'c'])
    expect(build(records, {}, { hideDead: true }).map((e) => e.code)).toEqual(['a', 'c'])
    expect(build(records, { marks: { a: { heard: false } } }, { hideHeard: true }).map((e) => e.code)).toEqual(['a', 'b', 'c'])
  })

  it('sorts by the given taxonOrder, else by code', () => {
    const records = [rec('a', 'ebird'), rec('b', 'ebird'), rec('c', 'ebird')]
    const order: Record<string, number> = { a: 3, b: 1, c: 2 }
    expect(buildList(records, EMPTY_EDITS, DEFAULT_RULES, (c) => order[c]).map((e) => e.code)).toEqual(['b', 'c', 'a'])
    expect(buildList([...records].reverse(), EMPTY_EDITS, DEFAULT_RULES).map((e) => e.code)).toEqual(['a', 'b', 'c'])
  })
})

describe('latestLifer', () => {
  it('picks the latest date', () => {
    const list = build([rec('a', 'ebird', { date: '2020-01-01' }), rec('b', 'ebird', { date: '2021-02' }), rec('c', 'ebird')])
    expect(latestLifer(list)?.code).toBe('b')
    expect(latestLifer([])).toBeUndefined()
  })

  it('ties go to the highest taxonOrder', () => {
    const list = build([rec('a', 'ebird', { date: '2020' }), rec('b', 'ebird', { date: '2020' })])
    expect(latestLifer(list, (c) => (c === 'a' ? 9 : 1))?.code).toBe('a')
    expect(latestLifer(list)?.code).toBe('b')
  })
})
