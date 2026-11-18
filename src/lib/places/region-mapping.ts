import { foldName } from '@/lib/species/resolve'
import type { Place, Source, SourceRecord, Unmatched } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'
import extraRegionNames from '../../../data/ebird-region-names.json'

// Current eBird Vietnam codes agree with the post-2025 national codes. Everybird uses a distinct
// ID because the same literal code can refer to three different places in eBird and ISO.
// Rows list the current code/name, historical eBird codes, former names, and verified iNaturalist place IDs.
const VIETNAM = [
  ['01', 'Hà Nội', '64 15', 'Hanoi|Ha Tay', [97339]],
  ['04', 'Cao Bằng', '04', '', [97336]],
  ['08', 'Tuyên Quang', '07 03', 'Hà Giang', [97340, 97375]],
  ['11', 'Điện Biên', '71', '', [97324]],
  ['12', 'Lai Châu', '01', '', [97357]],
  ['14', 'Sơn La', '05', '', [97368]],
  ['15', 'Lào Cai', '02 06', 'Yên Bái', [97354, 97377]],
  ['19', 'Thái Nguyên', '69 53', 'Bắc Kạn|Bac Kan', [97333, 97371]],
  ['20', 'Lạng Sơn', '09', '', [97356]],
  ['22', 'Quảng Ninh', '13', '', [97366]],
  ['24', 'Bắc Ninh', '56 54', 'Bắc Giang', [97332, 97334]],
  ['25', 'Phú Thọ', '68 14 70', 'Hòa Bình|Vĩnh Phúc', [97316, 97344, 97363]],
  ['31', 'Hải Phòng', '62 61', 'Haiphong|Hải Dương', [97346, 97347]],
  ['33', 'Hưng Yên', '66 20', 'Thái Bình', [97345, 97369]],
  ['37', 'Ninh Bình', '18 63 67', 'Hà Nam|Nam Định', [97341, 97359, 97361]],
  ['38', 'Thanh Hóa', '21', '', [97373]],
  ['40', 'Nghệ An', '22', '', [97360]],
  ['42', 'Hà Tĩnh', '23', '', [97342]],
  ['44', 'Quảng Trị', '25 24', 'Quảng Bình', [97353, 97367]],
  ['46', 'Huế', '26', 'Thừa Thiên Huế|Thua Thien-Hue', [97372]],
  ['48', 'Đà Nẵng', '60 27', 'Danang|Quảng Nam', [97318, 97364]],
  ['51', 'Quảng Ngãi', '29 28', 'Kon Tum', [97351, 97365]],
  ['52', 'Gia Lai', '30 31', 'Bình Định', [97328, 97338]],
  ['56', 'Khánh Hòa', '34 36', 'Ninh Thuận', [97349, 97362]],
  ['66', 'Đắk Lắk', '33 32', 'Đắc Lắc|Phú Yên', [97323, 97352]],
  ['68', 'Lâm Đồng', '35 40 72', 'Bình Thuận|Đắk Nông', [97321, 97331, 97355]],
  ['75', 'Đồng Nai', '39 58', 'Bình Phước', [97319, 97330]],
  ['79', 'Hồ Chí Minh', '65 43 57', 'Ho Chi Minh City|TP. Hồ Chí Minh|Sài Gòn|Saigon|Bà Rịa-Vũng Tàu|Bình Dương', [97327, 97329, 97343]],
  ['80', 'Tây Ninh', '37 41', 'Long An', [97358, 97370]],
  ['82', 'Đồng Tháp', '45 46', 'Tiền Giang', [97320]],
  ['86', 'Vĩnh Long', '49 50 51', 'Bến Tre|Trà Vinh', [97317, 97374, 97376]],
  ['91', 'An Giang', '44 47', 'Kiên Giang', [97326, 97350]],
  ['92', 'Cần Thơ', '48 73 52', 'Hậu Giang|Sóc Trăng', [97322, 97337, 97348]],
  ['96', 'Cà Mau', '59 55', 'Bạc Liêu', [97325, 97335]],
] as const

const vietnamId = (code: string) => 'VN-V' + code
const currentVietnam = new Map<string, string>()
const historicalVietnam = new Map<string, string>()
const inatVietnam = new Map<number, string>()
const IMPORT_REGION_NAMES: Record<string, string> = {
  ...extraRegionNames,
  'CO-CUN': 'Cundinamarca',
  'ID-IJ': 'Papua (eBird region)',
  'PH-DAC': 'Davao Occidental',
  'PH-DIN': 'Dinagat Islands',
  'PH-LAN': 'Lanao del Norte',
  'PH-SCO': 'South Cotabato',
  'PH-SUN': 'Surigao del Norte',
  'PH-ZMB': 'Zambales',
}
export const IMPORT_REGION_ALIASES: Record<string, string[]> = {
  'CO-CUN': ['Cundinamarca'],
  'CO-DC': ['Bogotá', 'Bogotá D.C.'],
  'FR-20R': ['Corse', 'Corsica'],
  'IN-UT': ['Uttarākhand', 'Uttaranchal'],
  'IN-DH': ['Dadra and Nagar Haveli', 'Daman and Diu'],
  'NP-P1': ['Koshi', 'Province 1', 'Province No. 1'],
  'NP-P2': ['Madhesh', 'Province 2', 'Province No. 2'],
  'NP-P3': ['Bagmati', 'Province 3', 'Province No. 3'],
  'NP-P4': ['Gandaki', 'Province 4', 'Province No. 4'],
  'NP-P5': ['Lumbini', 'Province 5', 'Province No. 5'],
  'NP-P6': ['Karnali', 'Province 6', 'Province No. 6'],
  'NP-P7': ['Sudurpashchim', 'Sudurpaschim', 'Province 7', 'Province No. 7'],
  'NZ-CIT': ['Chatham Islands'],
  'PH-DAC': ['Davao Occidental'],
  'PH-DIN': ['Dinagat Islands'],
  'PH-LAN': ['Lanao del Norte'],
  'PH-SCO': ['South Cotabato'],
  'PH-SUN': ['Surigao del Norte'],
  'PH-ZMB': ['Zambales'],
}

for (const [code, name, historicalCodes, formerNames, inatIds] of VIETNAM) {
  const id = vietnamId(code)
  currentVietnam.set('VN-' + code, id)
  for (const historical of historicalCodes.split(' ')) historicalVietnam.set('VN-' + historical, id)
  for (const placeId of inatIds) inatVietnam.set(placeId, id)
  IMPORT_REGION_NAMES[id] = name
  const names = [name, ...formerNames.split('|').filter(Boolean)]
  IMPORT_REGION_ALIASES[id] = names.flatMap((n) => [n, n + ' Province', n + ' City'])
}

export function withImportRegionNames(regions: Regions): Regions {
  const currentNames = Object.fromEntries(Object.entries(regions.sub1).filter(([id]) => !id.startsWith('VN-')))
  return { ...regions, sub1: { ...currentNames, ...IMPORT_REGION_NAMES } }
}

const EBIRD_ALIASES = new Map(Object.entries({
  'AF-LOW': 'AF-LOG', 'AF-ORU': 'AF-URU',
  'KZ-ALM': 'KZ-19',
  'LA-XN': 'LA-XS',
  'MU-PU': 'MU-PL',
  'PG-NSA': 'PG-NSB',
  'RU-CHI': 'RU-ZAB',
  'SH-SH': 'SH-HL',
  'TV-NIU': 'TV-NUI',
  'FR-COR': 'FR-20R',
  'IN-UL': 'IN-UT', 'IN-UK': 'IN-UT', 'IN-DD': 'IN-DH', 'IN-DN': 'IN-DH',
  'NP-1': 'NP-P1', 'NP-2': 'NP-P2', 'NP-3': 'NP-P3', 'NP-4': 'NP-P4',
  'NP-5': 'NP-P5', 'NP-6': 'NP-P6', 'NP-7': 'NP-P7',
  'NZ-CI': 'NZ-CIT',
}))

export type VietnamEdition = 'current' | 'historical' | 'unknown'

/** A sighting date cannot identify the code edition: the source can recode older observations. */
export function vietnamEdition(codes: Iterable<string>): VietnamEdition {
  let current = false
  let historical = false
  for (const code of codes) {
    current ||= currentVietnam.has(code) && !historicalVietnam.has(code)
    historical ||= historicalVietnam.has(code) && !currentVietnam.has(code)
  }
  if (current === historical) return 'unknown'
  return current ? 'current' : 'historical'
}

/** A code with different meanings and no reliable edition or coordinate stays at country level. */
export function ebirdRegion(code: string, edition: VietnamEdition = 'unknown', coordinateRegion?: string): string {
  if (!/^VN-(?!V\d\d$)/.test(code)) return EBIRD_ALIASES.get(code) ?? code
  const current = currentVietnam.get(code)
  const historical = historicalVietnam.get(code)
  if (coordinateRegion && (edition === 'unknown' || (!current && !historical))) return coordinateRegion
  if (edition === 'current') return current ?? 'VN'
  if (edition === 'historical') return historical ?? 'VN'
  return current && historical && current !== historical ? 'VN' : (current ?? historical ?? 'VN')
}

const foldVietnamName = (name: string) => foldName(name).replace(/đ/g, 'd').replace(/\s*-\s*/g, ' ')
const vietnamNames = new Map(
  Object.entries(IMPORT_REGION_ALIASES)
    .filter(([id]) => id.startsWith('VN-V'))
    .flatMap(([id, names]) => names.map((name) => [foldVietnamName(name), id] as const)),
)

export const hasInatVietnamRegion = (id: number) => inatVietnam.has(id)

/** Use an administrative name only within its country; legacy Vietnamese units roll into their successor. */
export function namedImportRegion(country: string, name: string, inatId?: number): string | undefined {
  if (country !== 'VN') return undefined
  if (inatId !== undefined) {
    const mapped = inatVietnam.get(inatId)
    if (mapped) return mapped
  }
  const key = foldVietnamName(name).replace(/^(?:tinh|thanh pho|tp\.?)\s+/, '')
  return vietnamNames.get(key)
}

const legacyVietnamMunicipalities = new Map([
  ['VN-CT', 'VN-V92'], ['VN-DN', 'VN-V48'], ['VN-HN', 'VN-V01'], ['VN-HP', 'VN-V31'], ['VN-SG', 'VN-V79'],
])

function savedRegion(code: string, source: Source): string {
  if (source === 'ebird') return ebirdRegion(code)
  if (code.startsWith('VN-') && !code.startsWith('VN-V')) {
    // Numeric legacy saved codes for these imports came from the old ISO/Natural Earth name index.
    // The old table used other labels for VN-39, VN-53 and VN-66. Their original place is ambiguous.
    if (['VN-39', 'VN-53', 'VN-66'].includes(code)) return 'VN'
    return legacyVietnamMunicipalities.get(code) ?? historicalVietnam.get(code) ?? 'VN'
  }
  // Legacy name-based sources arrived at these IDs through the old mislabeled names.
  if ((source === 'inat' || source === 'obsorg') && code === 'CO-CUN') return 'CO-DC'
  if ((source === 'inat' || source === 'obsorg') && code === 'PH-SUN') return 'PH-DIN'
  return EBIRD_ALIASES.get(code) ?? code
}

function savedPlace(place: Place | undefined, source: Source): Place | undefined {
  if (!place?.sub1) return place
  const code = savedRegion(place.sub1, source)
  if (code === place.sub1) return place
  const country = code.slice(0, 2)
  // A county remains valid through an equivalent code change, but not through a province merger.
  if (code === country) return { country }
  if (place.sub1.startsWith('VN-') || code === 'IN-DH') return { country, sub1: code }
  return { ...place, country, sub1: code }
}

function savedSightings(sightings: string[] | undefined, source: Source): string[] | undefined {
  return sightings?.map((value) => {
    const first = value.indexOf('|')
    if (first < 0) return value
    const second = value.indexOf('|', first + 1)
    const code = value.slice(first + 1, second < 0 ? undefined : second)
    const normalized = savedRegion(code, source)
    if (code === normalized) return value
    const retainsCounty = normalized.length > 2 && !code.startsWith('VN-') && normalized !== 'IN-DH'
    return value.slice(0, first + 1) + normalized + (retainsCounty && second >= 0 ? value.slice(second) : '')
  })
}

/** Normalize old backups and saved records for display/filtering without changing the stored data. */
export function withCanonicalPlaces<T extends SourceRecord | Unmatched>(entry: T): T {
  if (!entry.place?.sub1 && !entry.seen?.length && !entry.seenMonths?.length) return entry
  return {
    ...entry,
    place: savedPlace(entry.place, entry.source),
    seen: savedSightings(entry.seen, entry.source),
    seenMonths: savedSightings(entry.seenMonths, entry.source),
  }
}
