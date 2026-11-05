// Builds public/data/country-dots.v1.json and regions.v1.json from Natural Earth (data/raw).
// Geometry matches PlacesMap: x = lon + 180, y = 84 - lat, 1.5deg cells, 95x240, odd rows shifted half a cell.
// Run: npx tsx scripts/build-data/build-geo.ts
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { geoBounds, geoContains } from 'd3-geo'
import type { CountryDots, Regions } from '../../src/lib/species/types'

const STEP = 1.5, ROWS = 95, COLS = 240, TOP = 84

/** Longitude/latitude of the dot for a cell (same placement PlacesMap draws). */
export function cellCentre(r: number, c: number): [number, number] {
  return [(c + 0.25 + (r % 2) * 0.5) * STEP - 180, TOP - (r + 0.5) * STEP]
}
/** Cell (row, col) whose dot is nearest to a lon/lat. */
export function cellOf(lat: number, lon: number): [number, number] {
  const r = Math.min(ROWS - 1, Math.max(0, Math.floor((TOP - lat) / STEP)))
  const c = Math.min(COLS - 1, Math.max(0, Math.floor((lon + 180) / STEP - 0.25 - (r % 2) * 0.5 + 0.5)))
  return [r, c]
}
export function decodeCells(d: CountryDots): Uint16Array {
  const b = Buffer.from(d.cells, 'base64')
  return new Uint16Array(b.buffer, b.byteOffset, b.length / 2)
}
export function cellCountry(d: CountryDots, cells: Uint16Array, r: number, c: number): string {
  return d.countries[cells[r * COLS + c]]
}

type Feature = { properties: Record<string, string | number>; geometry: unknown }
const iso2 = (p: Feature['properties']): string => {
  for (const k of ['ISO_A2_EH', 'ISO_A2']) { const v = String(p[k] ?? ''); if (/^[A-Z]{2}$/.test(v)) return v }
  return ''
}

export function buildCountryDots(admin0: { features: Feature[] }): CountryDots {
  const feats = admin0.features
    .map((f) => ({ iso: iso2(f.properties), p: f.properties, g: f.geometry as never }))
    .filter((f) => f.iso && f.iso !== 'AQ')
  const countries = ['', ...[...new Set(feats.map((f) => f.iso))].sort()]
  const index = new Map(countries.map((c, i) => [c, i]))
  // bbox prefilter (longitude-aware for antimeridian-crossing shapes)
  const boxed = feats.map((f) => { const [[w, s], [e, n]] = geoBounds(f.g); return { ...f, w, s, e, n } })
  const inBox = (f: typeof boxed[number], lon: number, lat: number) =>
    lat >= f.s && lat <= f.n && (f.w <= f.e ? lon >= f.w && lon <= f.e : lon >= f.w || lon <= f.e)
  const at = (lon: number, lat: number): number => {
    for (const f of boxed) if (inBox(f, lon, lat) && geoContains(f.g, [lon, lat])) return index.get(f.iso)!
    return 0
  }
  const cells = new Uint16Array(ROWS * COLS)
  const h = STEP / 2
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const [lon, lat] = cellCentre(r, c)
    let k = at(lon, lat)
    if (!k) for (const [dx, dy] of [[h, 0], [-h, 0], [0, h], [0, -h]]) { k = at(lon + dx, lat + dy); if (k) break }
    cells[r * COLS + c] = k
  }
  const used = new Set(cells)
  const extra: CountryDots['extra'] = []
  const done = new Set<string>()
  for (const f of feats) {
    if (used.has(index.get(f.iso)!) || done.has(f.iso)) continue
    done.add(f.iso)
    const x = +(Number(f.p.LABEL_X) + 180).toFixed(2), y = +(TOP - Number(f.p.LABEL_Y)).toFixed(2)
    extra.push([f.iso, x, y])
  }
  extra.sort((a, b) => a[0].localeCompare(b[0]))
  return { v: 1, step: 1.5, rows: 95, cols: 240, countries, cells: Buffer.from(cells.buffer).toString('base64'), extra }
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
  return { v: 1, countries: sorted(countries), sub1: sorted(sub1) }
}

export function main(root = resolve(__dirname, '../..')): void {
  const read = (f: string) => JSON.parse(readFileSync(resolve(root, 'data/raw', f), 'utf8'))
  const a0 = read('ne_50m_admin_0_countries.geojson'), a1 = read('ne_10m_admin_1_states_provinces.geojson')
  const out = resolve(root, 'public/data')
  mkdirSync(out, { recursive: true })
  const iso = (read('iso_3166-2.json') as { '3166-2': IsoSub[] })['3166-2']
  const ne = buildRegions(a0, a1).sub1
  const dots = buildCountryDots(a0), regions = buildRegions(a0, a1, iso)
  console.log(`iso-codes supplement added ${Object.keys(regions.sub1).length - Object.keys(ne).length} sub1 codes`)
  writeFileSync(resolve(out, 'country-dots.v1.json'), JSON.stringify(dots))
  writeFileSync(resolve(out, 'regions.v1.json'), JSON.stringify(regions))
  console.log(`country-dots: ${dots.countries.length - 1} countries, ${dots.extra.length} extra dots; regions: ${Object.keys(regions.countries).length} countries, ${Object.keys(regions.sub1).length} sub1`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
