import type { Place } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'
import { foldName } from '@/lib/species/resolve'
import {
  countryNameMap,
  makeSub1Index,
  OBSORG_COUNTRY_ALIASES,
  OBSORG_SUB1_ALIASES,
  SUB1_ALIASES,
} from '@/lib/places/names'
import { IMPORT_REGION_ALIASES, namedImportRegion } from '@/lib/places/region-mapping'
import { divisionId } from '@/lib/places/registry'
import { SUB1_PARENT } from './sub1-parents'

export { countryNameMap, OBSORG_COUNTRY_ALIASES, OBSORG_SUB1_ALIASES }

export const OBSORG_NAME_LANGS = ['nl', 'en', 'fr', 'de', 'es'] as const

// The UK's divisions read "<Nation> - <County>": eBird's subnational1 there is the nation (England, Scotland, Wales,
// Northern Ireland); the county would be subnational2, which this export never sets.
const ukNation = (country: string, division: string) =>
  country === 'GB' ? /^(.+?)\s+-\s+.+$/.exec(division)?.[1] : undefined

// "Pas-de-Calais (62)", "Limburg (B)": one trailing parenthesis is dropped, on both sides of the match.
const divisionKey = (folded: string) => folded.replace(/\s*\([^()]*\)\s*$/, '').trim()

/**
 * Resolve and cache raw pairs for one parse. Only country and verified Everybird region codes leave the resolver. A lower-tier
 * code (a Belgian province, a French department, a Spanish or Italian province, an English county) rolls up to its
 * top-level region, eBird's subnational1 (SUB1_PARENT, for BE, FR, ES, IT and GB only).
 */
export function makeObsOrgPlaces(regions: Regions): (country: string, division: string) => Place | undefined {
  const countries = countryNameMap(regions, OBSORG_NAME_LANGS)
  const topOf = (code: string) => (Object.hasOwn(SUB1_PARENT, code) ? SUB1_PARENT[code] : code)
  // A name two codes share is the country only, unless every code rolls up to the same region (Halton, Liguria).
  const index = makeSub1Index(regions, [IMPORT_REGION_ALIASES, SUB1_ALIASES, OBSORG_SUB1_ALIASES], divisionKey, { onClash: 'none', rollUp: topOf })
  const sub1Of = (country: string, name: string) => {
    const code = index(country, name)
    const top = code ? topOf(code) : undefined
    return top && regions.sub1[top] ? top : code
  }
  const cache = new Map<string, Place | undefined>()
  return (countryName, division) => {
    const key = `${countryName}\u0000${division}`
    if (cache.has(key)) return cache.get(key)
    const country = foldName(countryName) === 'world' ? undefined : countries.get(foldName(countryName))
    let place: Place | undefined
    if (country) {
      const nation = ukNation(country, division)
      const entry = regions.registry?.catalogues.obsorg?.entries[divisionId(country, division)]
      const shared = entry?.[2] ?? entry?.[3]
      const verified = shared?.startsWith(country + '-') && Object.hasOwn(regions.sub1, shared) ? shared : undefined
      const code = verified ?? (country === 'VN' ? namedImportRegion(country, division) :
        sub1Of(country, division) ?? (nation ? sub1Of(country, nation) : undefined))
      place = code ? { country, sub1: code } : { country }
    }
    cache.set(key, place)
    return place
  }
}
