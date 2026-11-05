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
