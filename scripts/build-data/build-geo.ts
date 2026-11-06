// Builds public/data/regions.v1.json (country and province/state names) from Natural Earth and iso-codes (data/raw).
// Run: npx tsx scripts/build-data/build-geo.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Regions } from '../../src/lib/species/types'

type Feature = { properties: Record<string, string | number>; geometry: unknown }
const iso2 = (p: Feature['properties']): string => {
  for (const k of ['ISO_A2_EH', 'ISO_A2']) { const v = String(p[k] ?? ''); if (/^[A-Z]{2}$/.test(v)) return v }
  return ''
}

// eBird writes mainland-China provinces with GB/T 2260 numbers (CN-11), ISO 3166-2 uses letters (CN-BJ).
export const CN_NUMERIC: Record<string, string> = {
  '11': 'BJ', '12': 'TJ', '13': 'HE', '14': 'SX', '15': 'NM', '21': 'LN', '22': 'JL', '23': 'HL', '31': 'SH', '32': 'JS',
  '33': 'ZJ', '34': 'AH', '35': 'FJ', '36': 'JX', '37': 'SD', '41': 'HA', '42': 'HB', '43': 'HN', '44': 'GD', '45': 'GX',
  '46': 'HI', '50': 'CQ', '51': 'SC', '52': 'GZ', '53': 'YN', '54': 'XZ', '61': 'SN', '62': 'GS', '63': 'QH', '64': 'NX',
  '65': 'XJ', '71': 'TW', '91': 'HK', '92': 'MO',
}
export type IsoSub = { code: string; name: string; parent?: string }

/** Top-level ISO 3166-2 codes (eBird's subnational1) that Natural Earth lacks. NE names win where it has the code. */
export function supplementSub1(sub1: Record<string, string>, iso: IsoSub[]): number {
  let added = 0
  for (const e of iso) {
    if (e.parent || sub1[e.code] || !/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(e.code)) continue
    sub1[e.code] = e.name; added++
  }
  for (const [num, letters] of Object.entries(CN_NUMERIC)) {
    const name = sub1[`CN-${letters}`]
    if (name && !sub1[`CN-${num}`]) { sub1[`CN-${num}`] = name; added++ }
  }
  return added
}

/**
 * English common names for region names that ISO 3166-2 (iso-codes) writes inverted ("Madrid, Comunidad de"), with a
 * bracketed alternative ("Catalunya [Cataluña]") or a parenthetical, found by scanning regions.v1.json for "," "[" "(".
 * A comma would also read as a level separator in "Sub1, Country". The Philippine "(Region I)" forms are their official
 * names and stay. Flanders keeps Belgium's three regions in one language. Applied after the Natural Earth + ISO merge.
 */
export const REGION_RENAMES: Record<string, string> = {
  'BE-VLG': 'Flanders',
  'BE-WAL': 'Wallonia',
  'CZ-10': 'Prague',
  'ES-AS': 'Asturias',
  'ES-CT': 'Catalonia',
  'ES-GA': 'Galicia',
  'ES-IB': 'Balearic Islands',
  'ES-MC': 'Region of Murcia',
  'ES-MD': 'Community of Madrid',
  'ES-NC': 'Navarre',
  'ES-VC': 'Valencian Community',
  'FR-973': 'French Guiana',
  'GB-WLS': 'Wales',
  'NO-22': 'Jan Mayen',
  'US-VI': 'U.S. Virgin Islands',
}

/** Applies REGION_RENAMES (sub1 codes only, and only those present). Mutates and returns `r`. */
export function renameRegions(r: Regions): Regions {
  for (const [code, name] of Object.entries(REGION_RENAMES)) if (r.sub1[code]) r.sub1[code] = name
  return r
}

export function buildRegions(admin0: { features: Feature[] }, admin1: { features: Feature[] }, iso: IsoSub[] = []): Regions {
  const countries: Record<string, string> = {}
  for (const f of admin0.features) { const i = iso2(f.properties); if (i && i !== 'AQ') countries[i] ??= String(f.properties.NAME) }
  const sub1: Record<string, string> = {}
  for (const f of admin1.features) {
    const code = String(f.properties.iso_3166_2 ?? '')
    if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(code)) continue   // skips "-99-X16~", "XK-X02~" placeholders
    const name = String(f.properties.name_en || f.properties.name || '').trim()
    if (name) sub1[code] ??= name
  }
  supplementSub1(sub1, iso)
  const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
  return renameRegions({ v: 1, countries: sorted(countries), sub1: sorted(sub1) })
}

export function main(root = resolve(__dirname, '../..')): void {
  const read = (f: string) => JSON.parse(readFileSync(resolve(root, 'data/raw', f), 'utf8'))
  const a0 = read('ne_50m_admin_0_countries.geojson'), a1 = read('ne_10m_admin_1_states_provinces.geojson')
  const out = resolve(root, 'public/data')
  mkdirSync(out, { recursive: true })
  const iso = (read('iso_3166-2.json') as { '3166-2': IsoSub[] })['3166-2']
  const ne = buildRegions(a0, a1).sub1
  const regions = buildRegions(a0, a1, iso)
  console.log(`iso-codes supplement added ${Object.keys(regions.sub1).length - Object.keys(ne).length} sub1 codes`)
  writeFileSync(resolve(out, 'regions.v1.json'), JSON.stringify(regions))
  console.log(`regions: ${Object.keys(regions.countries).length} countries, ${Object.keys(regions.sub1).length} sub1`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
