// Build the place registry from the dated public metadata used for the worldwide audit.
// Usage: npx tsx scripts/build-data/build-place-registry.ts <audit directory> <pinned iso_3166-2.json>
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ebirdRegion, namedImportRegion } from '../../src/lib/places/region-mapping'
import { divisionId } from '../../src/lib/places/registry'
import { foldName } from '../../src/lib/species/resolve'
import type { CataloguePlace, PlaceCatalogue, PlaceRegistry } from '../../src/lib/places/registry'
import type { Regions } from '../../src/lib/species/types'
import obsorgCountries from '../../data/obsorg-countries.json'
import slovenianRegions from '../../data/slovenia-statistical-regions.json'

type EbirdSnapshot = {
  verified_at: string
  world: { regions: Record<string, string> }
  countries: Record<string, { regions: Record<string, string>; error?: string }>
}
type InatPlace = { id: number; name: string; code: string; admin_level: number; ancestor_place_ids: number[] }
type IsoEntry = { code: string; name: string; parent?: string }
type InatSnapshot = { last_modified: string; rows: InatPlace[] }

const label = (name: string) => name.replaceAll(', ', ' / ')
const sameName = (a: string, b: string) => foldName(a) === foldName(b)
const ordered = <T>(data: Record<string, T>) => Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b)))

// These source IDs have independent evidence of the same geographic unit.
const ebirdMatches: Record<string, string> = {
  'CO-CUN': 'CO-CUN',
  'FR-COR': 'FR-20R',
  'KR-36': 'KR-50', // Sejong
  'KR-50': 'KR-49', // Jeju
  'MX-DIF': 'MX-CMX', 'MX-MEX': 'MX-MEX',
  'NZ-CI': 'NZ-CIT',
  'NP-1': 'NP-P1', 'NP-2': 'NP-P2', 'NP-3': 'NP-P3', 'NP-4': 'NP-P4',
  'NP-5': 'NP-P5', 'NP-6': 'NP-P6', 'NP-7': 'NP-P7',
  'US-DC': 'US-DC',
}
const inatCountriesWithoutCodes: Record<string, string> = {
  'Clipperton Island': 'CP', Kosovo: 'XK', 'Northern Cyprus': 'QY', 'Akrotiri and Dhekelia': 'QZ',
}
const inatMatches: Record<string, string> = {
  '5': 'US-DC', // District of Columbia
  '7289': 'CA-NL', // Newfoundland and Labrador
  '10574': 'FR-20R', // Corsica
  '11003': 'KR-49', // Jeju
  '11168': 'MX-MEX', // State of Mexico
  '12999': 'ES-IB', // Balearic Islands
  '13071': 'IT-88', // Sardinia
  '13359': 'CN-XJ', // Xinjiang
  '13360': 'CN-XZ', // Tibet
  '59014': 'MX-CMX', // Federal District, now Mexico City
  '96973': 'KR-50', // Sejong
}
const sourceOnlyRoots = new Set(['AC', 'CP', 'CS', 'QY', 'QZ', 'XK', 'XX'])

// These provinces were retained without a merger. Code changes alone do not change their boundaries.
const unchangedVietnam = new Set(['04', '11', '12', '14', '20', '22', '38', '40', '42', '46'])

/** Rebase older snapshots against the new rows, keeping editions referenced by existing backups. */
export function retainPlaceHistory(previous: PlaceCatalogue, next: PlaceCatalogue): PlaceCatalogue {
  const history = { ...next.history }
  const versions = [previous.edition, ...Object.keys(previous.history ?? {})]
  for (const version of versions) {
    if (version === next.edition || Object.hasOwn(history, version)) continue
    const changes = previous.history?.[version]
    const prior: Record<string, CataloguePlace | null> = { ...previous.entries, ...changes }
    const keys = new Set([...Object.keys(prior), ...Object.keys(next.entries)])
    const delta: Record<string, CataloguePlace | null> = {}
    for (const key of keys) {
      const old = prior[key] ?? null
      if (JSON.stringify(old) !== JSON.stringify(next.entries[key] ?? null)) delta[key] = old
    }
    history[version] = ordered(delta)
  }
  const reused = new Set([...(previous.reused ?? []), ...(next.reused ?? [])])
  if (previous.edition !== next.edition) {
    for (const [id, old] of Object.entries(previous.entries)) {
      const active = next.entries[id]
      if (active && (old[0] !== active[0] || !sameName(old[1], active[1]))) reused.add(id)
    }
  }
  return { ...next, ...(Object.keys(history).length ? { history: ordered(history) } : {}), ...(reused.size ? { reused: [...reused].sort() } : {}) }
}

function buildPlaceRegistry(
  regions: Regions, current: EbirdSnapshot, historical: Record<string, string>, inat: InatSnapshot, iso: IsoEntry[],
) {
  const countries = { ...regions.countries }
  const isoEntries: Record<string, CataloguePlace> = {}
  for (const [country, name] of Object.entries(regions.countries)) {
    if (!sourceOnlyRoots.has(country)) isoEntries[country] = [country, name, country]
  }
  for (const r of iso) {
    const country = r.code.slice(0, 2)
    if (r.parent || !countries[country] || !regions.sub1[r.code]) continue
    // Preserve the ISO provenance, and reject reused numeric identifiers in Vietnam's recent transition.
    isoEntries[r.code] = [country, label(r.name), r.code]
  }
  const ebird: Record<string, CataloguePlace> = {}
  const older: Record<string, CataloguePlace | null> = {}
  const reused: string[] = []
  const ebirdEntry = (code: string, name: string, edition: 'current' | 'historical'): CataloguePlace => {
    const equivalent = code.startsWith('VN-') ? ebirdRegion(code, edition) :
      ebirdMatches[code] ?? (isoEntries[code] && regions.sub1[code] && sameName(name, regions.sub1[code]) ? code : undefined)
    const country = code.slice(0, 2)
    if (!equivalent || !Object.hasOwn(regions.sub1, equivalent)) return [country, label(name)]
    if (country === 'VN' && edition === 'historical' && !unchangedVietnam.has(equivalent.slice(4))) {
      return [country, label(name), null, equivalent]
    }
    return [country, label(name), equivalent]
  }

  for (const [code, name] of Object.entries(current.world.regions)) {
    countries[code] ??= label(name)
    ebird[code] = [code, label(name), code]
    const page = current.countries[code]
    if (!page || page.error) throw new Error(`Incomplete eBird snapshot for ${code}`)
    for (const [sub, name] of Object.entries(page.regions)) ebird[sub] = ebirdEntry(sub, name, 'current')
  }
  for (const [code, name] of Object.entries(historical)) {
    const old = ebirdEntry(code, name, 'historical')
    const present = ebird[code]
    if (!present || JSON.stringify(present) !== JSON.stringify(old)) older[code] = old
    // Verified Vietnamese reassignment. Other name differences are retained by edition and require review.
    if (code.startsWith('VN-') && present && (old[2] ?? old[3]) !== present[2]) reused.push(code)
  }
  for (const code of Object.keys(ebird)) if (code.includes('-') && !Object.hasOwn(historical, code)) older[code] = null

  const inatEntries: Record<string, CataloguePlace> = {}
  const roots = new Map<number, string>()
  // Mexico's iNaturalist codes use a different alphabet and can collide. The 30 named states
  // other than México instead match their unique eBird and ISO subdivision names.
  const mexicanStates = new Map(Object.entries(ebird)
    .filter(([, [country, , equivalent]]) => country === 'MX' && equivalent && equivalent !== country)
    .map(([, [, name, equivalent]]) => [foldName(name), equivalent!]))
  for (const p of inat.rows.filter((p) => p.admin_level === 0)) {
    const country = /^[A-Z]{2}$/.test(p.code) ? p.code : inatCountriesWithoutCodes[p.name]
    if (!country) throw new Error(`Missing country identity for iNaturalist place ${p.id}`)
    countries[country] ??= label(p.name)
    roots.set(p.id, country)
    inatEntries[p.id] = [country, label(p.name), country]
  }
  for (const p of inat.rows.filter((p) => p.admin_level === 10)) {
    const country = [...p.ancestor_place_ids].reverse().map((id) => roots.get(id)).find((code) => code)
    if (!country) throw new Error(`Missing parent for iNaturalist place ${p.id}`)
    const match = inatMatches[p.id] ?? (country === 'MX' ? mexicanStates.get(foldName(p.name)) : undefined) ??
      namedImportRegion(country, p.name, p.id) ??
      (p.code.startsWith(country + '-') && isoEntries[p.code] && regions.sub1[p.code] && sameName(p.name, regions.sub1[p.code]) ? p.code : undefined)
    inatEntries[p.id] = match && country === 'VN' && !unchangedVietnam.has(match.slice(4))
      ? [country, label(p.name), null, match]
      : match ? [country, label(p.name), match] : [country, label(p.name)]
  }
  const snapshotDate = (date: string) => new Date(date).toISOString().slice(0, 10)
  const obsorgEntries: Record<string, CataloguePlace> = {}
  for (const [code, name] of Object.entries(slovenianRegions)) obsorgEntries[divisionId('SI', name)] = ['SI', name, code]
  const registry: PlaceRegistry = {
    v: 1,
    catalogues: {
      ebird: {
        edition: snapshotDate(current.verified_at),
        entries: ordered(ebird),
        history: { '2023-04-18': ordered(older) },
        reused: reused.sort(),
      },
      inat: { edition: snapshotDate(inat.last_modified), entries: ordered(inatEntries) },
      iso: { edition: '2026-11-05', entries: ordered(isoEntries) },
      obsorg: { ...obsorgCountries, entries: ordered(obsorgEntries) },
    },
  }
  return { countries: ordered(countries), sub1: slovenianRegions, registry }
}

function main() {
  const [folder, isoPath] = process.argv.slice(2)
  if (!folder || !isoPath) throw new Error('Provide the public place snapshot directory and pinned iso_3166-2.json.')
  const read = (name: string) => JSON.parse(readFileSync(join(folder, name), 'utf8'))
  const path = 'public/data/regions.v1.json'
  const regions: Regions = JSON.parse(readFileSync(path, 'utf8'))
  const built = buildPlaceRegistry(regions, read('ebird-identifier-snapshot.json'), read('ebird-2023-identifier-snapshot.json'), read('inat-adm0-adm1-snapshot.json'), JSON.parse(readFileSync(isoPath, 'utf8'))['3166-2'])
  // Keep previous editions and additional source catalogues when refreshing the public data.
  const registryPath = 'data/place-registry.v1.json'
  if (existsSync(registryPath)) {
    const previous = JSON.parse(readFileSync(registryPath, 'utf8')) as Pick<Regions, 'countries'> & { registry: PlaceRegistry }
    for (const [ns, catalogue] of Object.entries(previous.registry.catalogues)) {
      const current = built.registry.catalogues[ns]
      if (ns === 'obsorg') {
        current.entries = ordered({ ...catalogue.entries, ...current.entries })
      }
      built.registry.catalogues[ns] = current ? retainPlaceHistory(catalogue, current) : catalogue
    }
  }
  if (built.registry.catalogues.ebird.reused?.length) console.log('Review edition-sensitive eBird IDs:', built.registry.catalogues.ebird.reused.join(' '))
  writeFileSync(registryPath, JSON.stringify(built))
  writeFileSync(path, JSON.stringify({ ...regions, ...built, sub1: { ...regions.sub1, ...built.sub1 } }))
}

if (process.argv[1]?.endsWith('build-place-registry.ts')) main()
