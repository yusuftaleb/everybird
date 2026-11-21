import { foldName } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { stripBracket } from '../import/places'

/**
 * Explicit sub1 names, folded on use and tried within their own country only. They come first: an alias is a choice
 * (the eBird subnational1 code where regions.v1.json names two codes alike, or a local spelling of a region
 * build-geo renamed to English), so it wins over any real name. Shared by the iNaturalist and observation.org imports.
 */
export const SUB1_ALIASES: Record<string, string[]> = {
  // ISO 3166-2:AR names the province "Buenos Aires" and the city "Ciudad Autónoma de Buenos Aires"; regions.v1.json
  // calls both "Buenos Aires".
  'AR-B': ['Buenos Aires'],
  'AR-C': ['Ciudad Autónoma de Buenos Aires', 'Ciudad de Buenos Aires'],
  'BE-VLG': ['Vlaanderen', 'Vlaams Gewest', 'Flemish Region'],
  'BE-WAL': ['Wallonie', 'Région wallonne', 'Walloon Region'],
  'CZ-10': ['Prague', 'Praha', 'Hlavní město Praha'],
  // Spain's eBird subnational1 are the autonomous communities; their names also belong to provinces (ES-O, ES-S, ...).
  'ES-AS': ['Asturias', 'Principado de Asturias'],
  'ES-CB': ['Cantabria'],
  'ES-CT': ['Catalunya', 'Cataluña'],
  'ES-IB': ['Balearic Islands', 'Illes Balears', 'Islas Baleares'],
  'ES-MC': ['Murcia', 'Región de Murcia'],
  'ES-MD': ['Community of Madrid', 'Madrid', 'Comunidad de Madrid'],
  'ES-NC': ['Navarre', 'Navarra', 'Comunidad Foral de Navarra'],
  'ES-RI': ['La Rioja'],
  'ES-VC': ['Comunitat Valenciana', 'Comunidad Valenciana', 'Valencia'],
  'FR-973': ['French Guiana', 'Guyane'],
  'US-DC': ['District of Columbia'],
  'US-VI': ['Virgin Islands', 'United States Virgin Islands'],
  'US-WA': ['Washington'],
  // eBird writes mainland China's provinces with GB/T 2260 numbers (build-geo.ts CN_NUMERIC), not ISO letters.
  'CN-11': ['Beijing'], 'CN-12': ['Tianjin'], 'CN-13': ['Hebei'], 'CN-14': ['Shanxi'], 'CN-15': ['Inner Mongolia'],
  'CN-21': ['Liaoning'], 'CN-22': ['Jilin'], 'CN-23': ['Heilongjiang'], 'CN-31': ['Shanghai'], 'CN-32': ['Jiangsu'],
  'CN-33': ['Zhejiang'], 'CN-34': ['Anhui'], 'CN-35': ['Fujian'], 'CN-36': ['Jiangxi'], 'CN-37': ['Shandong'],
  'CN-41': ['Henan'], 'CN-42': ['Hubei'], 'CN-43': ['Hunan'], 'CN-44': ['Guangdong'], 'CN-45': ['Guangxi'],
  'CN-46': ['Hainan'], 'CN-50': ['Chongqing'], 'CN-51': ['Sichuan'], 'CN-52': ['Guizhou'], 'CN-53': ['Yunnan'],
  'CN-54': ['Tibet'], 'CN-61': ['Shaanxi'], 'CN-62': ['Gansu'], 'CN-63': ['Qinghai'], 'CN-64': ['Ningxia'],
  'CN-65': ['Xinjiang'],
}

/** Names a sub1 entry answers to: "Wales [Cymru GB-CYM]" -> "wales"; "Catalunya [Cataluña]" -> "catalunya", "cataluna". */
export function sub1Names(name: string): string[] {
  const out = [foldName(stripBracket(name))]
  const inner = /\[([^\]]*)\]\s*$/.exec(name)?.[1]?.replace(/\s+[A-Z]{2}-[A-Z0-9]+$/, '').trim()
  if (inner) out.push(foldName(inner))
  return out
}

/** A country's sub1 code for a raw name, or undefined (the caller keeps the country only). */
export type Sub1Index = (country: string, name: string) => string | undefined

/**
 * What a real regions.v1.json name that two or more codes in one country share (and no alias settles) resolves to:
 * 'none', nothing, so the place stays the country, never a wrong province (observation.org; with `rollUp`, the codes'
 * common top-level region when every one of them rolls up to the same one); 'first', the first such code in
 * regions.sub1 order, as iNaturalist's import always did (kept so its places don't change).
 */
export type Sub1Clash = 'first' | 'none'

/**
 * Province and state names to sub1 codes, within one country. Precedence: the alias tables first (earlier tables win),
 * then a real regions.v1.json name, a shared one by `onClash`. `key` further normalises folded names on both sides
 * (observation.org drops a trailing " (62)"). `rollUp` (onClash 'none' only) maps a code to its top-level region
 * (SUB1_PARENT): a name whose codes all have the same top, itself in regions.sub1, resolves to that top.
 */
export function makeSub1Index(
  regions: Regions,
  aliasTables: readonly Record<string, string[]>[] = [SUB1_ALIASES],
  key: (folded: string) => string = (s) => s,
  { onClash = 'none', rollUp }: { onClash?: Sub1Clash; rollUp?: (code: string) => string } = {},
): Sub1Index {
  const byKey = new Map<string, string>()
  const real = new Map<string, string[]>()
  for (const [code, name] of Object.entries(regions.sub1)) {
    const country = code.split('-')[0]
    for (const n of new Set(sub1Names(name).map(key))) {
      if (!n) continue
      const k = `${country}|${n}`
      const codes = real.get(k)
      if (!codes) real.set(k, [code])
      else if (!codes.includes(code)) codes.push(code)
    }
  }
  for (const [k, codes] of real) {
    if (codes.length === 1 || onClash === 'first') {
      byKey.set(k, codes[0])
      continue
    }
    const tops = rollUp ? new Set(codes.map(rollUp)) : undefined
    const top = tops?.size === 1 ? [...tops][0] : undefined
    if (top && regions.sub1[top]) byKey.set(k, top)
  }
  const aliased = new Set<string>()
  for (const table of aliasTables) {
    for (const [code, names] of Object.entries(table)) {
      if (!regions.sub1[code]) continue
      const country = code.split('-')[0]
      for (const name of names) {
        const k = `${country}|${key(foldName(name))}`
        if (aliased.has(k)) continue
        aliased.add(k)
        byKey.set(k, code)
      }
    }
  }
  return (country, name) => {
    if (!country || !name.trim()) return undefined
    return byKey.get(`${country}|${key(foldName(stripBracket(name)))}`)
  }
}

const COUNTRY_NAME_LANGS = ['nl', 'en', 'fr', 'de', 'es', 'pt'] as const

/** Generic country spellings not supplied by Intl.DisplayNames (folded name -> ISO2). */
export const OBSORG_COUNTRY_ALIASES: Readonly<Record<string, string>> = {
  usa: 'US', us: 'US', uk: 'GB', uae: 'AE',
  'united states': 'US', 'united kingdom': 'GB', 'united arab emirates': 'AE',
  'czech republic': 'CZ', 'south korea': 'KR', 'north korea': 'KP',
  // Long Dutch territory names; Intl uses shorter names for SH and a different spelling for GS.
  'sint-helena, ascension en tristan da cunha': 'SH',
  'zuid-georgie en de zuidelijke sandwicheilanden': 'GS',
  // ISO 3166-1's inverted short names, as spreadsheets copied from ISO lists carry them.
  'bolivia, plurinational state of': 'BO',
  'congo, democratic republic of the': 'CD', 'congo, the democratic republic of the': 'CD',
  'iran, islamic republic of': 'IR',
  "korea, democratic people's republic of": 'KP', 'korea, republic of': 'KR',
  'micronesia, federated states of': 'FM',
  'moldova, republic of': 'MD',
  'palestine, state of': 'PS',
  'saint helena, ascension and tristan da cunha': 'SH',
  'taiwan, province of china': 'TW',
  'tanzania, united republic of': 'TZ',
  'venezuela, bolivarian republic of': 'VE',
  'virgin islands, british': 'VG', 'virgin islands, u.s.': 'VI',
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

/** Reverse the regions' English names and Intl country names; ambiguous folded names never resolve. */
export function countryNameMap(
  regions: Regions,
  langs: readonly string[] = COUNTRY_NAME_LANGS,
  { includeRegistry = true }: { includeRegistry?: boolean } = {},
): Map<string, string> {
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
  if (includeRegistry) {
    for (const [code, aliases] of Object.entries(regions.registry?.catalogues.obsorg?.countryNames ?? {})) {
      if (Object.hasOwn(regions.countries, code)) for (const alias of aliases) add(alias, code)
    }
  }
  return names
}

