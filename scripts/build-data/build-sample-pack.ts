// Builds public/data/sample-pack.v1.json, the landing sample packed ahead of time (src/lib/list/sample-pack.ts):
// public/data/sample.v1.json, the species rows and region names it uses, and its full even collage per layout class,
// packed with the layout worker's own handler and the masks in public/data/masks. Rerun after `npm run data` or
// build-sample.ts (a unit test fails when the pack and the sample disagree).
//
//   npx tsx scripts/build-data/build-sample-pack.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { LAYOUTS } from '../../src/lib/layout/constants'
import { createLayoutHandler, type MaskLoader, type MaskTable } from '../../src/lib/layout/layout.worker'
import { buildList } from '../../src/lib/list/build-list'
import { sampleToSaved, type SampleFile } from '../../src/lib/list/sample'
import type { PackedLayout, SamplePackFile } from '../../src/lib/list/sample-pack'
import type { Regions, SpeciesFile, SpeciesRow } from '../../src/lib/species/types'

const r2 = (x: number) => Math.round(x * 100) / 100

/** The sample's codes in the order the app packs them: its list (buildList), taxonomic order, known species only. */
export function sampleCodes(sample: SampleFile, byCode: Map<string, SpeciesRow>): string[] {
  const s = sampleToSaved(sample)
  const list = buildList(s.records.ebird, s.edits, s.rules, (c) => byCode.get(c)?.to ?? Number.MAX_SAFE_INTEGER)
  return list.filter((e) => byCode.has(e.code)).map((e) => e.code)
}

/**
 * Build the pack: the rows and region names the sample uses, and each layout class's full even collage, packed by
 * the layout worker's own handler (so the worker later lands on the same boxes).
 */
export async function makeSamplePack(sample: SampleFile, species: SpeciesRow[], regions: Regions, loadMasks: MaskLoader): Promise<SamplePackFile> {
  const byCode = new Map(species.map((r) => [r.code, r]))
  const codes = sampleCodes(sample, byCode)
  const rows = codes.map((c) => byCode.get(c)!)
  const used = { countries: {} as Record<string, string>, sub1: {} as Record<string, string> }
  for (const b of sample.birds) {
    const p = b.place
    if (p?.country && regions.countries[p.country]) used.countries[p.country] = regions.countries[p.country]
    if (p?.sub1 && regions.sub1[p.sub1]) used.sub1[p.sub1] = regions.sub1[p.sub1]
  }
  const handle = createLayoutHandler(loadMasks)
  const ready = await handle({ type: 'setList', id: 1, entries: rows.map((r) => ({ code: r.code, mass: r.g, ord: r.ord })) })
  if (ready.type !== 'ready') throw new Error(ready.type === 'error' ? ready.message : 'setList failed')
  const layouts: PackedLayout[] = []
  for (const l of LAYOUTS) {
    const r = await handle({ type: 'layout', id: 2, key: `${l.name}|even|`, codes, layout: l.name, mode: 'even', fit: false })
    if (r.type !== 'result') throw new Error(r.type === 'error' ? r.message : 'layout failed')
    layouts.push({ layout: l.name, W: r2(r.W), H: r2(r.H), base: r.base, codes: r.codes, boxes: Array.from(r.boxes, r2) })
  }
  return { ...sample, species: rows, regions: { v: 1, ...used }, layouts }
}

const DATA = join(process.cwd(), 'public/data')
const read = <T>(f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as T

async function main() {
  const sample = read<SampleFile>('sample.v1.json')
  const species = read<SpeciesFile>('species.v1.json').species
  const regions = read<Regions>('regions.v1.json')
  const pack = await makeSamplePack(sample, species, regions, async (ord) => {
    try { return read<MaskTable>(`masks/${ord}.v1.json`) } catch { return {} }
  })
  writeFileSync(join(DATA, 'sample-pack.v1.json'), JSON.stringify(pack))
  console.log(`sample-pack.v1.json: ${pack.species.length} species, ${pack.layouts.length} layouts`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
