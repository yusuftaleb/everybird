import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  clauses, dirsBefore, generateSample, rangeParts, seenIn, TRIPS, ZONES, type Candidate, type RangeRecord,
} from '../scripts/build-data/build-sample'
import type { Regions } from '@/lib/species/types'

// Synthetic range records in huashu's shape (made-up birds, real place names).
const rec = (text: string, breeding = '', extra: Partial<RangeRecord> = {}): RangeRecord => ({
  range: { text, ioc: { breedingRegion: extra.range?.ioc?.breedingRegion ?? 'AU', breeding, nonbreeding: extra.range?.ioc?.nonbreeding } },
  traits: { migration: 'sedentary', habitat: 'Woodland', habitatDensity: 2, ...extra.traits },
  conservation: { iucn: 'LC' },
})

describe('reading range descriptions', () => {
  it('reads the direction words in front of a place', () => {
    const s = 'n, e Australia'
    expect(dirsBefore(s, s.indexOf('Australia')).dirs).toEqual(['e', 'n'])
    expect(dirsBefore('southeastern Australia', 13).dirs).toEqual(['se'])
    expect(dirsBefore('inland Australia', 7)).toEqual({ dirs: [], narrow: true })
    expect(dirsBefore('Galahs of Australia', 10).dirs).toEqual([])
  })

  it('drops introduced and vagrant clauses and sets "except" asides apart', () => {
    const { parts, except } = rangeParts('Australia (except Tasmania), New Guinea; introduced to New Zealand')
    expect(parts).toEqual(['Australia', 'New Guinea'])
    expect(except).toEqual([' Tasmania'])
    expect(rangeParts('vagrant to Japan').parts).toEqual([])
  })

  it('never splits inside brackets', () => {
    expect(clauses('Auckland Is. (s of South I.; New Zealand); winters at sea')).toEqual(['Auckland Is. (s of South I.; New Zealand)', ' winters at sea'])
  })
})

describe('where a bird can be seen', () => {
  it('places an eastern Australian bird in New South Wales, not a northern or Tasmanian one', () => {
    expect(seenIn(rec('eastern Australia', 'e Australia'), 'nsw', 3)?.sub1).toBe('AU-NSW')
    expect(seenIn(rec('northern Australia', 'n Australia'), 'nsw', 3)).toBeUndefined()
    expect(seenIn(rec('northern Australia', 'n Australia'), 'qld', 7)?.sub1).toBe('AU-QLD')
    // A gloss in brackets is not the mainland.
    expect(seenIn(rec('Tasmania (southeastern Australia)', 'Tasmania (se Australia)'), 'nsw', 3)).toBeUndefined()
    expect(seenIn(rec('Tasmania (southeastern Australia)', 'Tasmania (se Australia)'), 'tas', 1)?.sub1).toBe('AU-TAS')
    // "except" leaving out the east, in any of the descriptions, rules New South Wales out.
    expect(seenIn(rec('Australia (except eastern and Tasmania)', 'Australia'), 'nsw', 3)).toBeUndefined()
    // Only birds of the Australasian realm.
    expect(seenIn(rec('Australia', 'Australia', { range: { ioc: { breedingRegion: 'NA' } } }), 'nsw', 3)).toBeUndefined()
  })

  it('needs the country named, outside introduced phrases and off the open sea', () => {
    expect(seenIn(rec('savanna of southern Kenya and Tanzania', '', { range: { ioc: { breedingRegion: 'AF' } } }), 'ke', 2)).toBeDefined()
    expect(seenIn(rec('Ethiopia; introduced to Kenya', '', { range: { ioc: { breedingRegion: 'AF' } } }), 'ke', 2)).toBeUndefined()
    expect(seenIn(rec('waters off Japan', '', { range: { ioc: { breedingRegion: 'PAL' } } }), 'jp', 5)).toBeUndefined()
    expect(seenIn(rec('islands of New Britain', '', { range: { ioc: { breedingRegion: 'AU' } } }), 'gb', 6)).toBeUndefined()
    expect(seenIn(rec('Pacific slope of Costa Rica', '', { range: { ioc: { breedingRegion: 'MA' } } }), 'cr', 3)?.sub1).toBe('CR-P')
  })

  it('counts a migrant only in the months it is there', () => {
    const godwit = rec('breeds Arctic Siberia; winters to New Zealand', '', { range: { ioc: { breedingRegion: 'PAL' } }, traits: { migration: 'migratory' } })
    expect(seenIn(godwit, 'nz', 12)?.sub1).toBe('NZ-AUK')
    expect(seenIn(godwit, 'nz', 7)).toBeUndefined()
    const cuckoo = rec('breeds eastern Australia; winters to New Guinea', 'e Australia', { traits: { migration: 'migratory' } })
    expect(seenIn(cuckoo, 'nsw', 11)).toBeDefined()
    expect(seenIn(cuckoo, 'nsw', 6)).toBeUndefined()
  })
})

describe('the generated birder', () => {
  const kenyan = (i: number): Candidate => ({ code: `ke${i}`, com: `Kenyan ${i}`, ord: 'Passeriformes', to: 1000 + i, rec: rec('central Kenya and Tanzania', '', { range: { ioc: { breedingRegion: 'AF' } } }) })
  const local = (i: number): Candidate => ({ code: `au${i}`, com: `Local ${i}`, ord: i % 2 ? 'Psittaciformes' : 'Passeriformes', to: i, rec: rec('eastern Australia', 'e Australia') })
  const cands = [...Array.from({ length: 300 }, (_, i) => local(i)), ...Array.from({ length: 80 }, (_, i) => kenyan(i))]

  it('is the same on every run and keeps only code, month and a sub1 place', () => {
    const a = generateSample(cands), b = generateSample(cands)
    expect(a).toEqual(b)
    expect(generateSample(cands, 7)).not.toEqual(a)
    for (const bird of a.birds) {
      expect(Object.keys(bird).sort()).toEqual(['code', 'date', 'place'])
      expect(bird.date).toMatch(/^\d{4}-\d{2}$/)
      expect(Object.keys(bird.place!).sort()).toEqual(['country', 'sub1'])
    }
    expect(new Set(a.birds.map((x) => x.code)).size).toBe(a.birds.length)
  })

  it('puts each bird only where its range says, on the trip dates', () => {
    const out = generateSample(cands)
    const ke = TRIPS.find((t) => t.zone === 'ke')!.months.map(([m]) => m)
    for (const bird of out.birds) {
      if (bird.code.startsWith('ke')) {
        expect(bird.place!.country).toBe('KE')
        expect(ke).toContain(bird.date)
      } else expect(bird.place).toEqual({ country: 'AU', sub1: 'AU-NSW' })
    }
    expect(out.birds.filter((x) => x.code.startsWith('ke')).length).toBe(TRIPS.find((t) => t.zone === 'ke')!.lifers)
  })
})

describe('the committed sample (public/data/sample.v1.json)', () => {
  const read = <T,>(f: string) => JSON.parse(readFileSync(join(process.cwd(), 'public/data', f), 'utf8')) as T
  const sample = read<{ v: 1; note: string; birds: { code: string; date: string; place: { country: string; sub1: string } }[] }>('sample.v1.json')
  const regions = read<Regions>('regions.v1.json')

  it('is a made-up birder: 400–600 species, 10–14 countries, months and sub1 regions only', () => {
    expect(sample.note).toMatch(/made-up birder/)
    expect(sample.birds.length).toBeGreaterThanOrEqual(400)
    expect(sample.birds.length).toBeLessThanOrEqual(600)
    const countries = new Set(sample.birds.map((b) => b.place.country))
    expect(countries.size).toBeGreaterThanOrEqual(10)
    expect(countries.size).toBeLessThanOrEqual(14)
    for (const b of sample.birds) {
      expect(Object.keys(b).sort()).toEqual(['code', 'date', 'place'])
      expect(b.date).toMatch(/^\d{4}-\d{2}$/)
      expect(Object.keys(b.place).sort()).toEqual(['country', 'sub1'])
      expect(regions.sub1[b.place.sub1], b.place.sub1).toBeDefined()
      expect(b.place.sub1.startsWith(`${b.place.country}-`)).toBe(true)
      expect(Object.values(ZONES).some((z) => z.country === b.place.country)).toBe(true)
    }
  })
})
