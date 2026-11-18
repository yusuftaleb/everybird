// Place keys: the Places filter's names for a continent, a country, a province or state, or a county, one level under the other.
//   n:<ID>                   "n:AF" (a continent, places/continents.ts)
//   c:<ISO2>                 "c:CA"
//   c:<ISO2>@<ID>            "c:FR@SA": the part of a country that lies on another continent than the country's own
//                            (French Guiana's sub1 FR-973 is France on South America); "c:FR" is France on Europe
//   s:<sub1 code>            "s:CA-BC" (the shared view's synthetic "CA-share0" too)
//   k:<sub1 code>|<county>   "k:CA-BC|Capital" (always under its province, so same-named counties in two states differ)
// A country's parent is its continent (none when the code is in no continent: it then sits at the top level beside the
// continents). A county seen without a province counts at its country only. All pure.
import { placeRegistryLabel } from '@/lib/places/registry'
import { stripBracket } from '@/lib/import/places'
import { CONTINENT_OF, continentName, continentOfPlace, isContinentId } from '@/lib/places/continents'
import type { Regions } from '@/lib/species/types'

export type PlaceLevel = 'continent' | 'country' | 'province' | 'county'
/** `country` is the ISO code ('' for a continent); `continent` the id of a continent key or of a country key's `@` part. */
export type ParsedPlace = { level: PlaceLevel; country: string; continent?: string; sub1?: string; county?: string }

type PlaceLike = { country: string; sub1?: string; sub2?: string }

const COUNTRY = /^([A-Z]{2})(?:@([A-Z]{2}))?$/
const SUB1 = /^[A-Z]{2}-[A-Za-z0-9]+$/

/** What a key names, or undefined for anything that isn't a well-formed key. */
export function parsePlaceKey(key: string): ParsedPlace | undefined {
  const body = key.slice(2)
  if (key.startsWith('n:')) return isContinentId(body) ? { level: 'continent', country: '', continent: body } : undefined
  if (key.startsWith('c:')) {
    const m = COUNTRY.exec(body)
    if (!m) return undefined
    if (m[2] === undefined) return { level: 'country', country: m[1] }
    return isContinentId(m[2]) ? { level: 'country', country: m[1], continent: m[2] } : undefined
  }
  if (key.startsWith('s:')) return SUB1.test(body) ? { level: 'province', country: body.slice(0, 2), sub1: body } : undefined
  if (key.startsWith('k:')) {
    const bar = body.indexOf('|')
    if (bar < 0) return undefined
    const sub1 = body.slice(0, bar)
    const county = body.slice(bar + 1)
    if (!SUB1.test(sub1) || !county) return undefined
    return { level: 'county', country: sub1.slice(0, 2), sub1, county }
  }
  return undefined
}

/** The country key of a place: "c:FR", or "c:FR@SA" when its sub1 puts it on another continent than its country's. */
export function countryKeyOf(p: { country: string; sub1?: string }): string {
  const cont = continentOfPlace(p)
  return cont && cont !== CONTINENT_OF[p.country] ? `c:${p.country}@${cont}` : `c:${p.country}`
}

/** A place's keys at every level it has: ['n:NA', 'c:CA', 's:CA-BC', 'k:CA-BC|Capital']. No continent when unknown, no county key without a province. */
export function keysOfPlace(p: PlaceLike): string[] {
  const out: string[] = []
  const cont = continentOfPlace(p)
  if (cont) out.push(`n:${cont}`)
  out.push(countryKeyOf(p))
  if (p.sub1) {
    out.push(`s:${p.sub1}`)
    if (p.sub2) out.push(`k:${p.sub1}|${p.sub2}`)
  }
  return out
}

/** The key one level up (a county's province, a province's country, a country's continent); undefined for a continent, a country in none, or a malformed key. */
export function parentKey(key: string): string | undefined {
  const p = parsePlaceKey(key)
  if (!p || p.level === 'continent') return undefined
  if (p.level === 'county') return `s:${p.sub1}`
  if (p.level === 'province') return countryKeyOf({ country: p.country, sub1: p.sub1 })
  const cont = p.continent ?? (Object.hasOwn(CONTINENT_OF, p.country) ? CONTINENT_OF[p.country] : undefined)
  return cont ? `n:${cont}` : undefined
}

/** True when `key` lies inside `ancestor` (strictly: a place is not within itself). */
export function isWithin(key: string, ancestor: string): boolean {
  for (let k = parentKey(key); k; k = parentKey(k)) if (k === ancestor) return true
  return false
}

/**
 * The place's key one level under `parent`: its continent's (its country's when it has none) with no parent, its
 * country's under its own continent, its province's under its own country, its county's under its own province;
 * undefined when the place isn't in `parent` or has nothing at the next level.
 */
export function childKey(p: PlaceLike, parent: string | undefined): string | undefined {
  return childKeyOf(parent)(p)
}

/** `childKey` with `parent` parsed once, for a loop over many places under the same parent. */
export function childKeyOf(parent: string | undefined): (p: PlaceLike) => string | undefined {
  if (parent === undefined) return (p) => { const c = continentOfPlace(p); return c ? `n:${c}` : countryKeyOf(p) }
  const at = parsePlaceKey(parent)
  if (at?.level === 'continent') return (p) => (continentOfPlace(p) === at.continent ? countryKeyOf(p) : undefined)
  if (at?.level === 'country') return (p) => (p.sub1 && countryKeyOf(p) === parent ? `s:${p.sub1}` : undefined)
  if (at?.level === 'province') return (p) => (p.sub1 === at.sub1 && p.sub2 ? `k:${p.sub1}|${p.sub2}` : undefined)
  return () => undefined
}

type Names = Pick<Regions, 'countries' | 'sub1' | 'registry'>
/** The UI language's continent names by id (`ui.places.continents`); English names when not given. */
type ContinentNames = Partial<Record<string, string>>

const countryName = (iso: string, r: Names) => (r.countries[iso] ? stripBracket(r.countries[iso]) : iso)
const sub1Name = (code: string, r: Names) => stripBracket(placeRegistryLabel(code, r) ?? code)
const contName = (id: string, names?: ContinentNames) => names?.[id] ?? continentName(id)

/**
 * A key's own name: "Canada", "British Columbia", "Capital", "France (South America)" for an overseas part; the code
 * when the regions don't know it. `continents`: the UI language's continent names (for "Africa" and the qualifier).
 */
export function placeName(key: string, regions: Names, continents?: ContinentNames): string {
  const p = parsePlaceKey(key)
  if (!p) return key
  if (p.level === 'continent') return contName(p.continent!, continents)
  if (p.level === 'country') return p.continent ? `${countryName(p.country, regions)} (${contName(p.continent, continents)})` : countryName(p.country, regions)
  if (p.level === 'province') return sub1Name(p.sub1!, regions)
  return placeRegistryLabel(p.county!, regions) ?? p.county!
}

/** A key's name with its parent's: "Canada", "British Columbia, Canada", "Capital, British Columbia" (never the continent). */
export function placeNameLong(key: string, regions: Names, continents?: ContinentNames): string {
  const up = parentKey(key)
  const own = placeName(key, regions, continents)
  return up && !up.startsWith('n:') ? `${own}, ${placeName(up, regions, continents)}` : own
}
