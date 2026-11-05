// Builds public/data/sample.v1.json, the landing page's live demo list, from Yusuf's PUBLIC life list on his
// website (framer-site/content/lifelist/lifelist.json). Keeps only each bird's eBird code, its first month
// (YYYY-MM) and a { country, sub1 } place matched from the region name. Towns, sources, names, coordinates and
// anything in private/ are never read into the output.
//
//   npx tsx scripts/build-data/build-sample.ts [path/to/lifelist.json]
//
// Yusuf approves this file before it is published (plan Task 25).
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Place } from '../../src/lib/list/model'
import { foldName } from '../../src/lib/species/resolve'
import type { Regions, SpeciesFile } from '../../src/lib/species/types'

export type SampleBird = { code: string; date?: string; place?: Place }
export type SampleFile = { v: 1; note: string; birds: SampleBird[] }
type PublicList = { _note?: string; species: { code: string; date?: string; region?: string; [k: string]: unknown }[] }

const DEFAULT_SRC = '/Users/yusuf/orca/projects/personal_website/framer-site/content/lifelist/lifelist.json'
const NOTE =
  "Sample list for the landing demo: Yusuf's public life list (yusuftaleb.com/lifelist). Code, first month and region only."
/** Country names on the website that differ from regions.v1.json (folded -> ISO2). */
const COUNTRY_ALIASES: Record<string, string> = { turkiye: 'TR' }

const key = (s: string) => foldName(s.replace(/\s*\[[^\]]*\]\s*$/, ''))

/** "British Columbia, Canada" -> { country: 'CA', sub1: 'CA-BC' }; "Türkiye" -> { country: 'TR' }; unknown -> undefined. */
export function placeFromRegion(region: string, regions: Regions): Place | undefined {
  const parts = region.split(',').map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return undefined
  const countryName = key(parts[parts.length - 1])
  const country =
    COUNTRY_ALIASES[countryName] ?? Object.keys(regions.countries).sort().find((iso) => key(regions.countries[iso]) === countryName)
  if (!country) return undefined
  if (parts.length < 2) return { country }
  const subName = key(parts[parts.length - 2])
  const sub1 = Object.keys(regions.sub1).sort().find((c) => c.startsWith(`${country}-`) && key(regions.sub1[c]) === subName)
  return sub1 ? { country, sub1 } : { country }
}

/** Only code, YYYY-MM and place; species unknown to `known` (when given) are dropped. */
export function buildSample(src: PublicList, regions: Regions, known?: Set<string>): SampleFile {
  const birds: SampleBird[] = []
  for (const s of src.species) {
    if (typeof s.code !== 'string' || (known && !known.has(s.code))) continue
    const b: SampleBird = { code: s.code }
    const m = typeof s.date === 'string' ? /^(\d{4})(-\d{2})?/.exec(s.date) : null
    if (m) b.date = m[1] + (m[2] ?? '')
    const place = typeof s.region === 'string' ? placeFromRegion(s.region, regions) : undefined
    if (place) b.place = place
    birds.push(b)
  }
  return { v: 1, note: NOTE, birds }
}

function main() {
  const srcPath = process.argv[2] ?? DEFAULT_SRC
  if (/(^|\/)private\//.test(resolve(srcPath))) throw new Error('Never build the sample from private/')
  const src = JSON.parse(readFileSync(srcPath, 'utf8')) as PublicList
  const regions = JSON.parse(readFileSync(resolve('public/data/regions.v1.json'), 'utf8')) as Regions
  const species = JSON.parse(readFileSync(resolve('public/data/species.v1.json'), 'utf8')) as SpeciesFile
  const known = new Set(species.species.map((r) => r.code))
  const out = buildSample(src, regions, known)
  const dropped = src.species.length - out.birds.length
  const unplaced = out.birds.filter((b) => !b.place).length
  writeFileSync(resolve('public/data/sample.v1.json'), JSON.stringify(out))
  console.log(`sample.v1.json: ${out.birds.length} birds (${dropped} unknown codes dropped, ${unplaced} without a place)`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
