// Builds public/data/sample-pack.v1.json, the landing sample packed ahead of time (src/lib/list/sample-pack.ts):
// public/data/sample.v1.json, the species rows, region names and masks it uses, and its full even collage per layout
// class in Free, the default arrangement (arrangement.ts's DEFAULT_ARRANGEMENT), packed with the layout worker's own
// handler and the masks in public/data/masks; and its names in each base
// language, one small file per language (public/data/sample-names.<base>.v1.json), so an English visitor fetches none.
// Rerun after `npm run data` or build-sample.ts (a unit test fails when the pack and the sample disagree), then
// data-files.ts.
//
//   npx tsx scripts/build-data/build-sample-pack.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { NAME_BASES } from '../../src/lib/species/name-locales'
import type { NameSet } from '../../src/lib/species/names'
import { LAYOUTS } from '../../src/lib/layout/constants'
import { createLayoutHandler, type MaskLoader, type MaskTable } from '../../src/lib/layout/layout.worker'
import { buildList } from '../../src/lib/list/build-list'
import { sampleToSaved, type SampleFile } from '../../src/lib/list/sample'
import type { PackedLayout, PackNames, SamplePackFile } from '../../src/lib/list/sample-pack'
import type { Regions, SpeciesFile, SpeciesRow } from '../../src/lib/species/types'

const r2 = (x: number) => Math.round(x * 100) / 100

/** The sample's codes in the order the app packs them: its list (buildList), taxonomic order, known species only. */
export function sampleCodes(sample: SampleFile, byCode: Map<string, SpeciesRow>): string[] {
  const s = sampleToSaved(sample)
  const list = buildList(s.records.ebird, s.edits, s.rules, (c) => byCode.get(c)?.to ?? Number.MAX_SAFE_INTEGER)
  return list.filter((e) => byCode.has(e.code)).map((e) => e.code)
}

/**
 * The base languages' names for these rows and their families, from the committed names files (public/data/names.<base>.v1.json,
 * read from `dir`: the repo's, so the weekly huashu sync rewrites the sample's names with no extra input). Only names that
 * differ from English.
 */
export function packNames(rows: SpeciesRow[], dir = join(process.cwd(), 'public/data')): PackNames {
  const out = {} as PackNames
  for (const base of NAME_BASES) {
    const set = JSON.parse(readFileSync(join(dir, `names.${base}.v1.json`), 'utf8')) as NameSet
    const names: Record<string, string> = {}, fam: Record<string, string> = {}
    for (const r of rows) {
      if (set.names[r.code]) names[r.code] = set.names[r.code]
      if (set.fam[r.fam]) fam[r.fam] = set.fam[r.fam]
    }
    out[base] = { names, fam }
  }
  return out
}

/**
 * Build the pack: the rows and region names the sample uses, and each layout class's full even collage, packed by
 * the layout worker's own handler (so the worker later lands on the same boxes); and their masks.
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
    const r = await handle({ type: 'layout', id: 2, key: `${l.name}|even|`, codes, layout: l.name, mode: 'even', fit: false, free: true })
    if (r.type !== 'result') throw new Error(r.type === 'error' ? r.message : 'layout failed')
    layouts.push({ layout: l.name, W: r2(r.W), H: r2(r.H), base: r.base, codes: r.codes, boxes: Array.from(r.boxes, r2) })
  }
  // The sample's own masks, so the landing's layout worker and hit-testing never need the whole masks file.
  const masks: Record<string, MaskTable> = {}
  for (const r of rows) {
    const m = (await loadMasks(r.ord))[r.code]
    if (m) (masks[r.ord] ??= {})[r.code] = m
  }
  return { ...sample, species: rows, regions: { v: 1, ...used }, layouts, masks }
}

/** The sample's names files (repo-relative path -> text), one per base language, from the committed names files in `dataDir`. */
export function sampleNameFiles(rows: SpeciesRow[], dataDir?: string): [string, string][] {
  return Object.entries(packNames(rows, dataDir)).map(([base, set]) => [`public/data/sample-names.${base}.v1.json`, JSON.stringify(set)])
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
  const names = sampleNameFiles(pack.species)
  for (const [rel, text] of names) writeFileSync(join(process.cwd(), rel), text)
  console.log(`sample-pack.v1.json: ${pack.species.length} species, ${pack.layouts.length} layouts; ${names.length} sample-names files`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main()
