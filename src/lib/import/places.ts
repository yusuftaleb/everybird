import type { Place } from '../list/model'
import type { CountryDots, Regions } from '../species/types'

const REGIONS_URL = '/data/regions.v1.json'
let regionsP: Promise<Regions> | null = null

/** Test hook: forget the cached promise. */
export function resetRegionsCache(): void {
  regionsP = null
}

/** Fetch once and cache; a failed load is not cached so callers can retry. */
export function loadRegions(): Promise<Regions> {
  if (regionsP) return regionsP
  const p = (async () => {
    const res = await fetch(REGIONS_URL)
    if (!res.ok) throw new Error(`Failed to load ${REGIONS_URL}: ${res.status}`)
    return (await res.json()) as Regions
  })().catch((e) => {
    regionsP = null
    throw e
  })
  regionsP = p
  return p
}

/** Drop a trailing " [...]" ISO bracket, e.g. "Wales [Cymru GB-CYM]" -> "Wales". */
export function stripBracket(name: string): string {
  const out = name.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  return out || name.trim()
}

/** "CA-BC" -> { country: 'CA', sub1: 'CA-BC' }; "EG" -> { country: 'EG' }; junk -> {}. */
export function placeFromSubnational(code: string): Place {
  const c = code.trim().toUpperCase()
  if (!c) return {}
  const dash = c.indexOf('-')
  if (dash < 0) return { country: c }
  const country = c.slice(0, dash)
  return country ? { country, sub1: c } : {}
}

/**
 * "Sub2, Sub1, Country" > "Sub1, Country" > "Country" > "". Never towns or coordinates.
 * Sub2 is kept only alongside a known sub1; an unknown sub1 falls back to the country.
 * The country falls back to the sub1 prefix when missing or unknown; otherwise it is omitted.
 */
export function formatPlace(p: Place | undefined, r: Regions): string {
  if (!p) return ''
  const prefix = p.sub1?.split('-')[0]
  const countryName = (p.country && r.countries[p.country]) || (prefix ? r.countries[prefix] : undefined)
  const subName = p.sub1 ? r.sub1[p.sub1] : undefined
  const parts: string[] = []
  if (subName) {
    if (p.sub2?.trim()) parts.push(p.sub2.trim())
    parts.push(subName)
  }
  if (countryName) parts.push(countryName)
  return parts.map(stripBracket).join(', ')
}

const DOTS_URL = '/data/country-dots.v1.json'
let dotsP: Promise<CountryDots> | null = null

/** Fetch the dotted-map data once and cache it; a failed load is not cached. */
export function loadCountryDots(): Promise<CountryDots> {
  if (dotsP) return dotsP
  const p = (async () => {
    const res = await fetch(DOTS_URL)
    if (!res.ok) throw new Error(`Failed to load ${DOTS_URL}: ${res.status}`)
    return (await res.json()) as CountryDots
  })().catch((e) => {
    dotsP = null
    throw e
  })
  dotsP = p
  return p
}
