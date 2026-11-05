import { describe, expect, it } from 'vitest'
import { toCsv, toJson, fromJson } from '@/lib/list/export'
import { emptySaved } from '@/lib/list/storage'
import type { ListEntry } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'
import type { SpeciesIndex } from '@/lib/species/load'

const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: { 'CA-BC': 'British Columbia' } }
const row = (code: string, com: string, sci: string) => ({ code, com, sci }) as never
const species = { byCode: new Map([['a', row('a', 'Anna, "Hummingbird"', 'Calypte anna')], ['b', row('b', 'Bird', 'Avis b')]]) } as unknown as SpeciesIndex
const HEADER = 'eBird code,Common name,Scientific name,First date,Place,Country,Heard only,Found dead,Photo or recording,Sources'

describe('toCsv', () => {
  it('CSV header and one row exact', () => {
    const list: ListEntry[] = [{ code: 'a', date: '2020-05', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan' }, heard: true, dead: false, media: true, sources: ['ebird', 'inat'] }]
    expect(toCsv(list, species, regions)).toBe(
      `${HEADER}\r\na,"Anna, ""Hummingbird""",Calypte anna,2020-05,"Okanagan, British Columbia, Canada",Canada,yes,,yes,ebird; inat\r\n`,
    )
  })
  it('empty fields and unknown codes', () => {
    const list: ListEntry[] = [{ code: 'zz', heard: false, dead: true, media: false, sources: ['manual'] }]
    expect(toCsv(list, species, regions)).toBe(`${HEADER}\r\nzz,,,,,,,yes,,manual\r\n`)
  })
  it('guards against formula injection and quotes newlines', () => {
    const list: ListEntry[] = [{ code: 'b', place: { sub1: 'CA-BC', sub2: '=HYPERLINK("x")' }, heard: false, dead: false, media: false, sources: ['inat'] }]
    const out = toCsv(list, species, regions)
    expect(out).toContain(`"'=HYPERLINK(""x""), British Columbia, Canada"`)
    expect(toCsv([{ ...list[0], place: { sub1: 'CA-BC', sub2: 'a\nb' } }], species, regions)).toContain('"a\nb, British Columbia, Canada"')
  })
})

describe('json backup', () => {
  const good = () => ({ ...emptySaved(), name: 'Me', records: { ebird: [{ code: 'a', source: 'ebird' }], inat: [], manual: [] } })
  it('round-trips', () => {
    const s = good()
    expect(fromJson(toJson(s as never))).toEqual(s)
  })
  it('fromJson rejects wrong version', () => {
    expect(() => fromJson(JSON.stringify({ ...good(), v: 2 }))).toThrow(/version/i)
  })
  it('rejects bad input', () => {
    expect(() => fromJson('not json')).toThrow(/JSON/)
    expect(() => fromJson('null')).toThrow()
    expect(() => fromJson(JSON.stringify({ ...good(), records: { ebird: 'x' } }))).toThrow(/records/)
    expect(() => fromJson(JSON.stringify({ ...good(), records: { bogus: [] } }))).toThrow(/records/)
    expect(() => fromJson(JSON.stringify({ ...good(), rules: { hideHeard: 'yes' } }))).toThrow(/rules/)
    expect(() => fromJson(JSON.stringify({ ...good(), edits: undefined }))).toThrow(/edits/)
  })
  it('tolerates missing name and missing source keys', () => {
    const rest: Record<string, unknown> = { ...good() }
    delete rest.name
    const out = fromJson(JSON.stringify({ ...rest, records: { ebird: [] } }))
    expect(out.name).toBeUndefined()
    expect(out.records).toEqual({ ebird: [], inat: [], manual: [] })
  })
})
