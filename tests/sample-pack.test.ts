import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeSamplePack, packNames, sampleCodes } from '../scripts/build-data/build-sample-pack'
import { createLayoutHandler } from '@/lib/layout/layout.worker'
import type { SampleFile } from '@/lib/list/sample'
import { fromPackFile, seedLayouts, type SamplePackFile } from '@/lib/list/sample-pack'
import type { Regions, SpeciesFile, SpeciesRow } from '@/lib/species/types'

const sp = (code: string, to: number, g: number, ord = 'Passeriformes'): SpeciesRow =>
  ({ code, com: code, sci: `Avis ${code}`, ord, fam: `${ord}idae`, famCom: ord, to, g, gSrc: 'avonet', st: true, ar: 1, q: true }) as SpeciesRow
const species = [sp('crow1', 3, 400), sp('wren1', 1, 10), sp('heron1', 2, 2000, 'Pelecaniformes'), sp('other1', 4, 50)]
const regions: Regions = { v: 1, countries: { CA: 'Canada', EG: 'Egypt', FR: 'France' }, sub1: { 'CA-BC': 'British Columbia', 'FR-IDF': 'Île-de-France' } }
const sample: SampleFile = {
  v: 1,
  note: 'synthetic',
  birds: [
    { code: 'crow1', date: '2021-05', place: { country: 'CA', sub1: 'CA-BC' } },
    { code: 'wren1', date: '2020-01', place: { country: 'EG' } },
    { code: 'heron1' },
    { code: 'nosuch1', date: '2020-02' },
  ],
}
const noMasks = async () => ({})

describe('the landing sample pack', () => {
  it('keeps the sample, only the rows and region names it uses, in taxonomic order', async () => {
    const f = await makeSamplePack(sample, species, regions, noMasks)
    expect(f.birds).toEqual(sample.birds)
    expect(f.species.map((r) => r.code)).toEqual(['wren1', 'heron1', 'crow1'])
    expect(f.regions).toEqual({ v: 1, countries: { CA: 'Canada', EG: 'Egypt' }, sub1: { 'CA-BC': 'British Columbia' } })
  })

  it("packs each layout class's full even collage as the layout worker does", async () => {
    const f = await makeSamplePack(sample, species, regions, noMasks)
    expect(f.layouts.map((l) => l.layout)).toEqual(['wide', 'medium', 'narrow'])
    const handle = createLayoutHandler(noMasks)
    const codes = sampleCodes(sample, new Map(species.map((r) => [r.code, r])))
    await handle({ type: 'setList', id: 1, entries: codes.map((c) => { const r = species.find((s) => s.code === c)!; return { code: c, mass: r.g, ord: r.ord } }) })
    const r = await handle({ type: 'layout', id: 2, key: 'narrow|even|', codes, layout: 'narrow', mode: 'even', fit: false })
    if (r.type !== 'result') throw new Error('no result')
    const narrow = f.layouts[2]
    expect(narrow.codes).toEqual(r.codes)
    narrow.boxes.forEach((b, i) => expect(b).toBeCloseTo(r.boxes[i], 1))
    const seed = seedLayouts(f)
    expect(seed[2]).toMatchObject({ key: 'narrow|even|', layout: 'narrow', mode: 'even', scale: 1, base: r.base })
    expect(seed[2].boxes.get('crow1')).toEqual(narrow.boxes.slice(8, 12))
  })

  it('reads back as a store-ready list, a species index and the seed layouts', async () => {
    const p = fromPackFile(await makeSamplePack(sample, species, regions, noMasks))
    expect(p.saved.records.ebird.map((r) => r.code)).toEqual(['crow1', 'wren1', 'heron1', 'nosuch1'])
    expect(p.species.byCode.get('heron1')?.g).toBe(2000)
    expect(p.seed).toHaveLength(3)
  })

  it('the committed pack matches the committed sample and species data (rerun build-sample-pack.ts if not)', () => {
    const read = <T,>(f: string) => JSON.parse(readFileSync(join(process.cwd(), 'public/data', f), 'utf8')) as T
    const pack = read<SamplePackFile>('sample-pack.v1.json')
    const committed = read<SampleFile>('sample.v1.json')
    expect(pack.birds).toEqual(committed.birds)
    const byCode = new Map(read<SpeciesFile>('species.v1.json').species.map((r) => [r.code, r]))
    expect(pack.species).toEqual(sampleCodes(committed, byCode).map((c) => byCode.get(c)))
    for (const l of pack.layouts) expect(l.codes).toEqual(pack.species.map((r) => r.code))
  })

  it('carries the base names (es, pt_BR, nl, pl; never a regional set) for its codes, as the committed names files have them', () => {
    const read = <T,>(f: string) => JSON.parse(readFileSync(join(process.cwd(), 'public/data', f), 'utf8')) as T
    const pack = read<SamplePackFile>('sample-pack.v1.json')
    expect(Object.keys(pack.loc).sort()).toEqual(['es', 'nl', 'pl', 'pt_BR'])
    for (const base of ['es', 'pt_BR', 'nl', 'pl'] as const) {
      const file = read<{ names: Record<string, string>; fam: Record<string, string> }>(`names.${base}.v1.json`)
      for (const r of pack.species) {
        expect(pack.loc[base].names[r.code], `${base} ${r.code}`).toBe(file.names[r.code])
        expect(pack.loc[base].fam[r.fam], `${base} ${r.fam}`).toBe(file.fam[r.fam])
      }
      expect(Object.keys(pack.loc[base].names).every((c) => pack.species.some((r) => r.code === c))).toBe(true)
    }
    expect(Object.keys(pack.loc.es.names).length).toBeGreaterThan(100)
  })

  it('makeSamplePack (the huashu sync calls it) keeps loc with no extra input', async () => {
    const real = [{ ...sp('amerob', 1, 80), com: 'American Robin' }, { ...sp('houspa', 2, 28), com: 'House Sparrow' }]
    const f = await makeSamplePack({ v: 1, note: 'synthetic', birds: [{ code: 'amerob' }, { code: 'houspa' }] }, real, regions, noMasks)
    expect(f.loc).toEqual(packNames(real))
    expect(f.loc.es.names.amerob).toBe('Zorzal americano')
    expect(f.loc.pt_BR.names.houspa).toBe('Pardal') // pt_BR's, not pt_PT's "Pardal-do-telhado"
    expect(f.loc.nl.names.houspa).toBe('Huismus')
    expect(fromPackFile(f).loc).toBe(f.loc)
  })

  it('the landing sample has no threatened species, so its stats line carries no threatened count (e2e/import.spec.ts)', () => {
    const pack = JSON.parse(readFileSync(join(process.cwd(), 'public/data/sample-pack.v1.json'), 'utf8')) as SamplePackFile
    expect(pack.species.filter((r) => r.iu === 'VU' || r.iu === 'EN' || r.iu === 'CR').map((r) => r.code)).toEqual([])
  })
})
