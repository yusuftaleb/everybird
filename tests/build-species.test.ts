import { describe, expect, it } from 'vitest'
import huashu from './fixtures/build/huashu.json'
import taxonomy from './fixtures/build/taxonomy.json'
import overrides from './fixtures/build/overrides.json'
import { buildSpecies, matchHuashu, splitGroups } from '../scripts/build-data/build-species'
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

describe('stand-in stickers from split siblings', () => {
  // Synthetic split groups: Pa_rent (sticker) with daughters Da_one and Da_two (none); Ro_ot (none) with daughters
  // Sp_near (sticker, to 205) and Sp_far (sticker, to 290); Lo_ne (none) in no group.
  const h = (id: string, ebird: string, sticker: boolean, parent?: string): HuashuRecord => ({
    id, scientificName: id.replace('_', ' '), taxonConcept: parent ? 'split' : 'narrowed',
    taxonomy: { seq: 1, order: 'Ordo', family: 'Famone' }, ids: { ebird }, traits: { massG: 10 },
    ...(sticker ? { sticker: { file: `stickers/${id}.webp`, meetsQualityBar: true } } : {}),
    ...(parent ? { previous: [{ id: parent, scientificName: parent.replace('_', ' '), relation: 'split_from' }] } : {}),
  })
  const hs: HuashuRecord[] = [
    h('Pa_rent', 'parent1', true), h('Da_one', 'dau1', false, 'Pa_rent'), h('Da_two', 'dau2', false, 'Pa_rent'),
    h('Ro_ot', 'root1', false), h('Sp_far', 'far1', true, 'Ro_ot'), h('Sp_near', 'near1', true, 'Ro_ot'),
    h('Lo_ne', 'lone1', false),
  ]
  const t = (code: string, to: number): TaxonRow => ({ code, sci: code, com: code.toUpperCase(), cat: 'species', to, ord: 'Ordo', fam: 'Famone', famCom: 'F' })
  const tx = [t('parent1', 100), t('dau1', 110), t('dau2', 120), t('root1', 200), t('near1', 205), t('far1', 290), t('lone1', 300)]
  const rows = (huashu = hs) => new Map(buildSpecies(huashu, tx, {}).file.species.map((r) => [r.code, r]))

  it('groups a parent with every species split from it', () => {
    const g = splitGroups(hs)
    expect(g.get('Da_one')).toEqual(['Pa_rent', 'Da_one', 'Da_two'])
    expect(g.get('Pa_rent')).toBe(g.get('Da_two'))
    expect(g.has('Lo_ne')).toBe(false)
  })

  it("a daughter with no sticker borrows the parent's", () => {
    expect(rows().get('dau1')).toMatchObject({ st: true, q: true, standIn: 'parent1' })
    expect(rows().get('dau2')).toMatchObject({ st: true, standIn: 'parent1' })
  })

  it('a parent with no sticker borrows the daughter nearest in taxonomic order', () => {
    expect(rows().get('root1')).toMatchObject({ st: true, standIn: 'near1' })
  })

  it('species with their own sticker, or outside any split, get no stand-in', () => {
    const r = rows()
    expect(r.get('parent1')!.standIn).toBeUndefined()
    expect(r.get('far1')!.standIn).toBeUndefined()
    expect(r.get('lone1')).toMatchObject({ st: false })
    expect(r.get('lone1')!.standIn).toBeUndefined()
  })

  it('a group with no sticker at all keeps the silhouettes', () => {
    const r = rows(hs.map((x) => (x.id === 'Pa_rent' ? { ...x, sticker: undefined } : x)))
    expect(r.get('dau1')).toMatchObject({ st: false })
    expect(r.get('dau1')!.standIn).toBeUndefined()
  })

  it('the report lists the stand-ins', () => {
    const { report } = buildSpecies(hs, tx, {})
    expect(report).toMatch(/Stand-in stickers \(split sibling\) \(3\)/)
    expect(report).toMatch(/dau1 \(DAU1\) -> parent1/)
  })
})
