import { describe, expect, it } from 'vitest'
import huashu from './fixtures/build/huashu.json'
import taxonomy from './fixtures/build/taxonomy.json'
import overrides from './fixtures/build/overrides.json'
import { buildSpecies, matchHuashu } from '../scripts/build-data/build-species'
import type { HuashuRecord, Overrides, TaxonRow } from '../src/lib/species/types'

const run = (o: Overrides = overrides as Overrides) =>
  buildSpecies(huashu as HuashuRecord[], taxonomy as TaxonRow[], o)
const row = (code: string, o?: Overrides) => run(o).file.species.find((s) => s.code === code)!

describe('buildSpecies', () => {
  it('unique ebird code match uses that sticker and AVONET mass', () => {
    const r = row('one1')
    expect(r).toMatchObject({ st: true, q: true, ar: 1, g: 100, gSrc: 'avonet', ord: 'Ordo', fam: 'Famone', famCom: 'Family One', to: 10 })
  })

  it('multiple huashu rows prefer the exact scientific name', () => {
    const r = row('multi1')
    expect(r.g).toBe(30) // Aus_bus (exact sci), not Aus_cus (same concept, lower seq)
    expect(r.q).toBe(false)
  })

  it('no huashu row gives st false and family-median mass', () => {
    const r = row('nost1')
    expect(r.st).toBe(false)
    expect(r.ar).toBe(1)
    expect(r.gSrc).toBe('family')
    // Famone direct masses: one1 100, multi1 30 -> median 65
    expect(r.g).toBe(65)
  })

  it('falls back to the order median when the family has no masses', () => {
    const r = row('orphfam1')
    expect(r.gSrc).toBe('order')
    expect(r.g).toBeGreaterThan(0)
  })

  it('override mass wins', () => {
    const r = row('amegos')
    expect(r.g).toBe(950)
    expect(r.gSrc).toBe('override')
  })

  it('matches by scientific name, including previous names, when no code matches', () => {
    expect(row('scinew')).toMatchObject({ st: true, g: 40, gSrc: 'avonet' })
    expect(row('sciold')).toMatchObject({ st: true, g: 20, gSrc: 'avonet' })
  })

  it('only category species rows appear, sorted by taxonOrder', () => {
    const codes = run().file.species.map((s) => s.code)
    expect(codes).toEqual(['one1', 'multi1', 'amegos', 'nost1', 'sciold', 'scinew', 'orphfam1'])
  })

  it('report lists every fallback with counts', () => {
    const { report } = run()
    expect(report).toMatch(/Multi-candidate choices \(1\)/)
    expect(report).toMatch(/multi1/)
    expect(report).toMatch(/Scientific-name fallbacks \(2\)/)
    expect(report).toMatch(/No sticker \(2\)/)
    expect(report).toMatch(/Mass fallbacks \(2\)/)
    expect(report).toMatch(/Huashu records matching no eBird species \(1\)/)
    expect(report).toMatch(/ghost1/)
  })

  it('override huashu id redirects the sticker match', () => {
    const o: Overrides = { nost1: { huashu: 'Aus_cus', source: 'synthetic' } }
    expect(row('nost1', o)).toMatchObject({ st: true, g: 50, gSrc: 'avonet' })
    const m = matchHuashu(huashu as HuashuRecord[], taxonomy as TaxonRow[], o)
    expect(m.matches.get('nost1')?.id).toBe('Aus_cus')
    expect(m.matches.get('one1')?.id).toBe('Aus_one')
  })

  it('override naming a missing huashu id throws', () => {
    const o: Overrides = { nost1: { huashu: 'No_such_id', source: 'synthetic' } }
    expect(() => run(o)).toThrow(/No_such_id/)
  })
})

describe('no stickers through lumps', () => {
  // Synthetic: huashu's Gus major absorbed Gus minor (eBird keeps both), Hus nova is Hus vetus renamed, and Jus pars
  // was split from Jus totus.
  const sticker = (id: string) => ({ file: `stickers/Ordo/Famone/${id}.webp`, meetsQualityBar: true })
  const recs: HuashuRecord[] = [
    {
      id: 'Gus_major', scientificName: 'Gus major', taxonConcept: 'broadened', taxonomy: { seq: 1, order: 'Ordo', family: 'Famone' },
      ids: {}, traits: { massG: 80 }, sticker: sticker('Gus_major'),
      previous: [
        { id: 'Gus_major', scientificName: 'Gus major', relation: 'same' },
        { id: 'Gus_minor', scientificName: 'Gus minor', relation: 'lumped_into_this' },
      ],
    },
    {
      id: 'Hus_nova', scientificName: 'Hus nova', taxonConcept: 'same', taxonomy: { seq: 2, order: 'Ordo', family: 'Famone' },
      ids: {}, traits: { massG: 20 }, sticker: sticker('Hus_nova'),
      previous: [{ id: 'Hus_vetus', scientificName: 'Hus vetus', relation: 'renamed' }],
    },
    {
      id: 'Jus_pars', scientificName: 'Jus pars', taxonConcept: 'split', taxonomy: { seq: 3, order: 'Ordo', family: 'Famone' },
      ids: { ebird: 'jupars1' }, traits: { massG: 30 }, sticker: sticker('Jus_pars'),
      previous: [{ id: 'Jus_totus', scientificName: 'Jus totus', relation: 'split_from' }],
    },
  ]
  const tx = (code: string, sci: string, to: number): TaxonRow =>
    ({ code, sci, com: code, cat: 'species', to, ord: 'Ordo', fam: 'Famone', famCom: 'Family One' })
  const taxa = [tx('gumaj1', 'Gus major', 1), tx('gumin1', 'Gus minor', 2), tx('huvet1', 'Hus vetus', 3),
    tx('jupars1', 'Jus pars', 4), tx('jutot1', 'Jus totus', 5)]
  const built = (o: Overrides = {}) => buildSpecies(recs, taxa, o)
  const get = (code: string, o?: Overrides) => built(o).file.species.find((s) => s.code === code)!

  it('a species the record absorbed (lumped_into_this) gets no sticker; the record’s own species keeps it', () => {
    expect(get('gumaj1')).toMatchObject({ st: true, q: true, g: 80, gSrc: 'avonet' })
    expect(get('gumin1')).toMatchObject({ st: false, q: false, ar: 1, gSrc: 'family' })
    const m = matchHuashu(recs, taxa, {})
    expect(m.matches.has('gumin1')).toBe(false)
    expect(m.lumped).toContain('gumin1 (gumin1, Gus minor): only a former name in huashu Gus_major (lumped_into_this)')
  })

  it('a pure rename keeps the sticker', () => {
    expect(get('huvet1')).toMatchObject({ st: true, g: 20, gSrc: 'avonet' })
    expect(matchHuashu(recs, taxa, {}).matches.get('huvet1')?.id).toBe('Hus_nova')
  })

  it('any other relation lends no sticker either (split_from), while the record’s own code still matches', () => {
    expect(get('jupars1').st).toBe(true)
    expect(get('jutot1').st).toBe(false)
  })

  it('the report lists the lumped species', () => {
    const { report } = built()
    expect(report).toMatch(/No sticker because huashu has them only inside another species \(lumped\): 2/)
    expect(report).toMatch(/Lumped by huashu: no sticker .*\(2\)/)
    expect(report).toMatch(/gumin1 .*Gus_major \(lumped_into_this\)/)
  })

  it('an override still names a record by hand', () => {
    expect(get('gumin1', { gumin1: { huashu: 'Gus_major', source: 'synthetic' } }).st).toBe(true)
  })
})
