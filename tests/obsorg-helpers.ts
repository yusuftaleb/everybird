import { readFileSync } from 'node:fs'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
export const taxonomy = buildTaxonomyIndex([
  ...JSON.parse(readFileSync('tests/fixtures/species/taxonomy.json', 'utf8')).taxa,
  { code: 'blakit1', sci: 'Milvus migrans', com: 'Black Kite', cat: 'species', to: 800 },
  { code: 'blkkit3', sci: 'Milvus migrans aegyptius/parasitus', com: 'Black Kite group', cat: 'issf', reportAs: 'blakit1', to: 801 },
  { code: 'hoocro1', sci: 'Corvus cornix', com: 'Hooded Crow', cat: 'species', to: 802 },
])
export const fixture = (name: string) => readFileSync(`tests/fixtures/obsorg/${name}.csv`, 'utf8')
const data: Regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8'))
// These fixtures exercise the legacy name resolver with invented source identifiers.
export const regions: Regions = { v: data.v, countries: data.countries, sub1: data.sub1 }
