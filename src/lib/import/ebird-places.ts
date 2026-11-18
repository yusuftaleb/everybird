import type { Regions } from '@/lib/species/types'
import { ebirdRegion, type VietnamEdition } from '@/lib/places/region-mapping'
import { resolveImportedPlace } from '@/lib/places/registry'
import { placeFromSubnational } from './places'

export function importEbirdPlace(
  code: string, edition: VietnamEdition, county: string | undefined, regions?: Regions, coordinateRegion?: string,
) {
  if (!code || code[0] === '-') return undefined
  // Vietnam's former districts are not subdivisions of the current provinces.
  const detail = code.slice(0, 2) !== 'VN' && code !== 'IN-DD' && code !== 'IN-DN' ? county : undefined
  if (regions?.registry) {
    const version = edition === 'historical' ? '2023-04-18' :
      edition === 'current' ? regions.registry.catalogues.ebird?.edition : undefined
    return resolveImportedPlace({
      namespace: 'ebird', id: code, edition: code.startsWith('VN-') ? version : undefined,
      country: code.slice(0, 2), county: detail, fallback: coordinateRegion,
    }, regions)
  }
  const region = ebirdRegion(code, edition, coordinateRegion)
  const place = placeFromSubnational(region === 'VN' && coordinateRegion ? coordinateRegion : region)
  return detail ? { ...place, sub2: detail } : place
}
