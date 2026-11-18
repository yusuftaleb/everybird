import type { Place } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'
import { foldName } from '@/lib/species/resolve'
import { makeSub1Index, SUB1_ALIASES } from './sub1-index'
import { IMPORT_REGION_ALIASES, namedImportRegion } from '@/lib/places/region-mapping'
import { SUB1_PARENT } from './sub1-parents'

export const OBSORG_NAME_LANGS = ['nl', 'en', 'fr', 'de', 'es'] as const

/** Generic country spellings not supplied by Intl.DisplayNames (folded name -> ISO2). */
export const OBSORG_COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  // Long Dutch territory names; Intl uses shorter names for SH and a different spelling for GS.
  'sint-helena, ascension en tristan da cunha': 'SH',
  'zuid-georgie en de zuidelijke sandwicheilanden': 'GS',
}

/** Local province names; scoped to their country, never used as fuzzy matches. */
export const OBSORG_SUB1_ALIASES: Record<string, string[]> = {
  'NL-NH': ['Noord-Holland'],
  'NL-ZH': ['Zuid-Holland'],
  'NL-NB': ['Noord-Brabant'],
  'NL-FR': ['Fryslân'],
  'BE-VAN': ['Antwerpen'],
  'BE-VBR': ['Vlaams-Brabant'],
  'BE-VOV': ['Oost-Vlaanderen'],
  'BE-VWV': ['West-Vlaanderen'],
  'BE-BRU': ['Brussel', 'Brussels Hoofdstedelijk Gewest', 'Bruxelles', 'Bruxelles / Brussel', 'Brussel / Bruxelles'],
  'BE-WBR': ['Waals-Brabant', 'Brabant wallon'],
  'BE-WHT': ['Henegouwen'],
  'BE-WLG': ['Luik'],
  'BE-WLX': ['Luxemburg'],
  'BE-WNA': ['Namen'],
  // Every region whose own-language name differs from regions.v1.json's English one, for the countries below (the
  // ISO 3166-2 names in each country's language), so the table is a public list, never fitted to one birder's file.
  'PE-CUS': ['Cusco', 'Cuzco'],
  'PE-CAL': ['Callao', 'El Callao', 'Provincia Constitucional del Callao'],
  'FR-75': ['Ville de Paris', 'Paris'],
  // Germany and Austria (Bavaria in Dutch too).
  'DE-BY': ['Bayern', 'Beieren'],
  'DE-HB': ['Bremen', 'Freie Hansestadt Bremen'],
  'DE-HE': ['Hessen'],
  'DE-MV': ['Mecklenburg-Vorpommern'],
  'DE-NI': ['Niedersachsen'],
  'DE-NW': ['Nordrhein-Westfalen'],
  'DE-RP': ['Rheinland-Pfalz'],
  'DE-SN': ['Sachsen'],
  'DE-ST': ['Sachsen-Anhalt'],
  'DE-TH': ['Thüringen'],
  'AT-2': ['Kärnten'],
  'AT-3': ['Niederösterreich'],
  'AT-4': ['Oberösterreich'],
  'AT-6': ['Steiermark'],
  'AT-7': ['Tirol'],
  'AT-9': ['Wien'],
  // Denmark and Finland.
  'DK-81': ['Nordjylland', 'Region Nordjylland'],
  'DK-82': ['Midtjylland', 'Region Midtjylland'],
  'DK-83': ['Syddanmark', 'Region Syddanmark'],
  'DK-84': ['Hovedstaden', 'Region Hovedstaden'],
  'DK-85': ['Sjælland', 'Region Sjælland'],
  'FI-01': ['Ahvenanmaa', 'Åland'],
  'FI-02': ['Etelä-Karjala'],
  'FI-03': ['Etelä-Pohjanmaa'],
  'FI-04': ['Etelä-Savo'],
  'FI-06': ['Kanta-Häme'],
  'FI-07': ['Keski-Pohjanmaa'],
  'FI-08': ['Keski-Suomi'],
  'FI-10': ['Lappi'],
  'FI-12': ['Pohjanmaa'],
  'FI-13': ['Pohjois-Karjala'],
  'FI-14': ['Pohjois-Pohjanmaa'],
  'FI-15': ['Pohjois-Savo'],
  'FI-16': ['Päijät-Häme'],
  'FI-19': ['Varsinais-Suomi'],
  // Croatia's 21 counties by their Croatian names (Istarska županija, ...).
  'HR-01': ['Zagrebačka'],
  'HR-02': ['Krapinsko-zagorska'],
  'HR-03': ['Sisačko-moslavačka'],
  'HR-04': ['Karlovačka'],
  'HR-05': ['Varaždinska'],
  'HR-06': ['Koprivničko-križevačka'],
  'HR-07': ['Bjelovarsko-bilogorska'],
  'HR-08': ['Primorsko-goranska'],
  'HR-09': ['Ličko-senjska'],
  'HR-10': ['Virovitičko-podravska'],
  'HR-11': ['Požeško-slavonska'],
  'HR-12': ['Brodsko-posavska'],
  'HR-13': ['Zadarska'],
  'HR-14': ['Osječko-baranjska'],
  'HR-15': ['Šibensko-kninska'],
  'HR-16': ['Vukovarsko-srijemska'],
  'HR-17': ['Splitsko-dalmatinska'],
  'HR-18': ['Istarska'],
  'HR-19': ['Dubrovačko-neretvanska'],
  'HR-20': ['Međimurska'],
  'HR-21': ['Grad Zagreb'],
  // Portugal's districts and autonomous regions.
  'PT-11': ['Lisboa'],
  'PT-20': ['Açores', 'Região Autónoma dos Açores'],
  'PT-30': ['Região Autónoma da Madeira'],
  // regions.v1.json names IT-GE "Liguria" and GB-WRL "Halton" (each sharing its name with another code that rolls up
  // to the same region): their own names.
  'IT-GE': ['Genova', 'Genoa'],
  'GB-WRL': ['Wirral'],
  // The French overseas departments each have two codes in regions.v1.json (FR-971 and FR-GP, ...): the numeric one,
  // as iNaturalist resolves Guadeloupe, Martinique and Mayotte (FR-973 French Guiana is in SUB1_ALIASES), and Réunion
  // under both spellings (iNaturalist's 'first' gives "Réunion" FR-RE but "La Réunion" FR-974).
  'FR-971': ['Guadeloupe'],
  'FR-972': ['Martinique'],
  'FR-974': ['La Réunion', 'Réunion'],
  'FR-976': ['Mayotte'],
}

// The UK's divisions read "<Nation> - <County>": eBird's subnational1 there is the nation (England, Scotland, Wales,
// Northern Ireland); the county would be subnational2, which this export never sets.
const ukNation = (country: string, division: string) =>
  country === 'GB' ? /^(.+?)\s+-\s+.+$/.exec(division)?.[1] : undefined

/** Reverse the regions' English names and Intl country names; ambiguous folded names never resolve. */
export function countryNameMap(regions: Regions, langs: readonly string[] = OBSORG_NAME_LANGS): Map<string, string> {
  const names = new Map<string, string>()
  const collisions = new Set<string>()
  const add = (name: string, code: string) => {
    const key = foldName(name)
    if (!key || collisions.has(key)) return
    const previous = names.get(key)
    if (previous && previous !== code) {
      names.delete(key)
      collisions.add(key)
    } else names.set(key, code)
  }
  for (const [code, name] of Object.entries(regions.countries)) add(name, code)
  for (const lang of langs) {
    // An engine without this language's data (or without Intl.DisplayNames) keeps the English names and the aliases.
    let displayNames: Intl.DisplayNames
    try {
      displayNames = new Intl.DisplayNames([lang], { type: 'region' })
    } catch {
      continue
    }
    for (const code of Object.keys(regions.countries)) {
      const name = displayNames.of(code)
      if (name) add(name, code)
    }
  }
  for (const [name, code] of Object.entries(OBSORG_COUNTRY_ALIASES)) if (regions.countries[code]) add(name, code)
  return names
}

// "Pas-de-Calais (62)", "Limburg (B)": one trailing parenthesis is dropped, on both sides of the match.
const divisionKey = (folded: string) => folded.replace(/\s*\([^()]*\)\s*$/, '').trim()

/**
 * Resolve and cache raw pairs for one parse. Only ISO country/sub1 codes leave the resolver; no counties. A lower-tier
 * code (a Belgian province, a French department, a Spanish or Italian province, an English county) rolls up to its
 * top-level region, eBird's subnational1 (SUB1_PARENT, for BE, FR, ES, IT and GB only).
 */
export function makeObsOrgPlaces(regions: Regions): (country: string, division: string) => Place | undefined {
  const countries = countryNameMap(regions)
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
      const code = country === 'VN' ? namedImportRegion(country, division) :
        sub1Of(country, division) ?? (nation ? sub1Of(country, nation) : undefined)
      place = code ? { country, sub1: code } : { country }
    }
    cache.set(key, place)
    return place
  }
}
