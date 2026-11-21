// Writes public/data/album.v1.json: { v: 1, slugs: { code: slug } }, the Bird Album page slug of each species whose
// sticker is huashu's (`st`), only where it differs from albumSlug(eBird name); the app derives the rest from `com`.
// The slug comes from the huashu record's own English name (names.en). Reads data/raw/huashu, fetches nothing.
// Run after build-species, then data-files.ts:  npx tsx scripts/build-data/build-album.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadHuashu, matchHuashu, taxonomyFromPublic } from './build-species'
import { albumSlug } from '../../src/lib/bird-album'
import type { Overrides, SpeciesFile, TaxonomyFile } from '../../src/lib/species/types'

const read = (p: string) => JSON.parse(readFileSync(resolve(process.cwd(), p), 'utf8'))
const species = read('public/data/species.v1.json') as SpeciesFile
const taxonomy = taxonomyFromPublic(read('public/data/taxonomy.v1.json') as TaxonomyFile, species)
const { matches } = matchHuashu(loadHuashu(resolve(process.cwd(), 'data/raw/huashu')), taxonomy, read('data/overrides.json') as Overrides)
const slugs: Record<string, string> = {}
let missing = 0
for (const s of species.species) {
  if (!s.st) continue
  const en = matches.get(s.code)?.names?.en
  if (!en) { missing++; continue }
  const slug = albumSlug(en)
  if (slug !== albumSlug(s.com)) slugs[s.code] = slug
}
writeFileSync(resolve(process.cwd(), 'public/data/album.v1.json'), JSON.stringify({ v: 1, slugs }) + '\n')
console.log(`album: ${Object.keys(slugs).length} slugs differ from the eBird name; ${missing} st species without names.en`)
