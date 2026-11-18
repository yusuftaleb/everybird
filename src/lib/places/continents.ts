// The Places filter's continents: the top level of the Places drill-down, each a place key `n:<ID>` (place-keys.ts;
// Filter.continents holds the ids). A static table from each terrestrial country or territory code to its continent, following
// the UN geoscheme (M49) with the calls listed below, plus EXTRA_CODES (codes an import can carry that regions.v1.json
// lacks) and SUB1_CONTINENT (overseas regions that lie on another continent than their country). Pure;
// tests/continents.test.ts checks it against the regions file.
//
// Judgment calls (the UN geoscheme would put these somewhere else, or they are unclear):
// - Russia is Europe; Turkey, Cyprus, Georgia, Armenia and Azerbaijan are Asia (Western Asia), as the Caucasus is.
// - Kazakhstan, Timor-Leste (South-eastern Asia) and all of Central Asia are Asia.
// - Egypt and Western Sahara (EH) are Africa.
// - Central America and the Caribbean are North America, with Greenland, Bermuda (M49 Northern America), Saint Pierre and
//   Miquelon, and the Caribbean's territories (Anguilla, Aruba, the Cayman and Turks and Caicos Islands, Montserrat,
//   Puerto Rico, the Virgin Islands, Sint Maarten and Saint Martin).
// - Falkland Islands (FK) are South America (M49). French Guiana (GF) is not in regions.v1.json: an EXTRA_CODES entry.
// - Saint Helena (SH) is Africa (M49 Western Africa, with Ascension and Tristan da Cunha). The British Indian Ocean
//   Territory (IO) is Africa (M49 Eastern Africa), not Asia; it is an Indian Ocean island, not a Pacific one.
// - Kosovo (XK) is Europe (it is not in UN M49; the usual non-UN assignment).
// - Pacific islands, Australia and New Zealand are Oceania, including American Samoa, Guam and the Northern Mariana Islands
//   (M49 Micronesia and Polynesia), Norfolk Island, Pitcairn and Cook Islands.
// - eBird's Ashmore and Cartier Islands (AC) and Coral Sea Islands (CS) are Australian territories in Oceania.
// - The two source-specific Cyprus entries (QY, QZ) use the same continent as CY. The High Seas (XX) have no continent.
// - Antarctica takes the sub-Antarctic territories: Heard and McDonald Islands (HM), the French Southern Territories (TF)
//   and South Georgia and the South Sandwich Islands (GS), and Antarctica itself (AQ) and Bouvet Island (BV).
// - American Samoa (AS) is Oceania: its code is also the id of Asia, but the two never meet (a country key is `c:AS`,
//   a continent key `n:AS`).

/** A continent's id (its two-letter code) and English name, in the Places section's display order. */
export const CONTINENTS = [
  { id: 'AF', name: 'Africa' },
  { id: 'AS', name: 'Asia' },
  { id: 'EU', name: 'Europe' },
  { id: 'NA', name: 'North America' },
  { id: 'SA', name: 'South America' },
  { id: 'OC', name: 'Oceania' },
  { id: 'AN', name: 'Antarctica' },
] as const

export type ContinentId = (typeof CONTINENTS)[number]['id']

const IDS: readonly string[] = CONTINENTS.map((c) => c.id)
export const isContinentId = (v: unknown): v is ContinentId => typeof v === 'string' && IDS.includes(v)

/** A continent's English name, or its id when unknown. */
export function continentName(id: string): string {
  return CONTINENTS.find((c) => c.id === id)?.name ?? id
}

/** Country or territory code -> continent (see the notes above for source-specific entries). */
export const CONTINENT_OF: Record<string, ContinentId> = {
  // Africa
  AO: 'AF', BF: 'AF', BI: 'AF', BJ: 'AF', BW: 'AF', CD: 'AF', CF: 'AF', CG: 'AF', CI: 'AF', CM: 'AF', CV: 'AF', DJ: 'AF',
  DZ: 'AF', EG: 'AF', EH: 'AF', ER: 'AF', ET: 'AF', GA: 'AF', GH: 'AF', GM: 'AF', GN: 'AF', GQ: 'AF', GW: 'AF', IO: 'AF',
  KE: 'AF', KM: 'AF', LR: 'AF', LS: 'AF', LY: 'AF', MA: 'AF', MG: 'AF', ML: 'AF', MR: 'AF', MU: 'AF', MW: 'AF', MZ: 'AF',
  NA: 'AF', NE: 'AF', NG: 'AF', RW: 'AF', SC: 'AF', SD: 'AF', SH: 'AF', SL: 'AF', SN: 'AF', SO: 'AF', SS: 'AF', ST: 'AF',
  SZ: 'AF', TD: 'AF', TG: 'AF', TN: 'AF', TZ: 'AF', UG: 'AF', ZA: 'AF', ZM: 'AF', ZW: 'AF',
  // Asia
  AE: 'AS', AF: 'AS', AM: 'AS', AZ: 'AS', BD: 'AS', BH: 'AS', BN: 'AS', BT: 'AS', CN: 'AS', CY: 'AS', GE: 'AS', HK: 'AS',
  ID: 'AS', IL: 'AS', IN: 'AS', IQ: 'AS', IR: 'AS', JO: 'AS', JP: 'AS', KG: 'AS', KH: 'AS', KP: 'AS', KR: 'AS', KW: 'AS',
  KZ: 'AS', LA: 'AS', LB: 'AS', LK: 'AS', MM: 'AS', MN: 'AS', MO: 'AS', MV: 'AS', MY: 'AS', NP: 'AS', OM: 'AS', PH: 'AS',
  PK: 'AS', PS: 'AS', QA: 'AS', SA: 'AS', SG: 'AS', SY: 'AS', TH: 'AS', TJ: 'AS', TL: 'AS', TM: 'AS', TR: 'AS', TW: 'AS',
  UZ: 'AS', VN: 'AS', YE: 'AS', QY: 'AS', QZ: 'AS',
  // Europe
  AD: 'EU', AL: 'EU', AT: 'EU', AX: 'EU', BA: 'EU', BE: 'EU', BG: 'EU', BY: 'EU', CH: 'EU', CZ: 'EU', DE: 'EU', DK: 'EU',
  EE: 'EU', ES: 'EU', FI: 'EU', FO: 'EU', FR: 'EU', GB: 'EU', GG: 'EU', GR: 'EU', HR: 'EU', HU: 'EU', IE: 'EU', IM: 'EU',
  IS: 'EU', IT: 'EU', JE: 'EU', LI: 'EU', LT: 'EU', LU: 'EU', LV: 'EU', MC: 'EU', MD: 'EU', ME: 'EU', MK: 'EU', MT: 'EU',
  NL: 'EU', NO: 'EU', PL: 'EU', PT: 'EU', RO: 'EU', RS: 'EU', RU: 'EU', SE: 'EU', SI: 'EU', SK: 'EU', SM: 'EU', UA: 'EU',
  VA: 'EU', XK: 'EU',
  // North America (with the Caribbean and Central America)
  AG: 'NA', AI: 'NA', AW: 'NA', BB: 'NA', BL: 'NA', BM: 'NA', BS: 'NA', BZ: 'NA', CA: 'NA', CR: 'NA', CU: 'NA', CW: 'NA',
  DM: 'NA', DO: 'NA', GD: 'NA', GL: 'NA', GT: 'NA', HN: 'NA', HT: 'NA', JM: 'NA', KN: 'NA', KY: 'NA', LC: 'NA', MF: 'NA',
  MS: 'NA', MX: 'NA', NI: 'NA', PA: 'NA', PM: 'NA', PR: 'NA', SV: 'NA', SX: 'NA', TC: 'NA', TT: 'NA', US: 'NA', VC: 'NA',
  VG: 'NA', VI: 'NA',
  // South America
  AR: 'SA', BO: 'SA', BR: 'SA', CL: 'SA', CO: 'SA', EC: 'SA', FK: 'SA', GY: 'SA', PE: 'SA', PY: 'SA', SR: 'SA', UY: 'SA',
  VE: 'SA',
  // Oceania (the Pacific islands, Australia and New Zealand)
  AC: 'OC', AS: 'OC', AU: 'OC', CK: 'OC', CS: 'OC', FJ: 'OC', FM: 'OC', GU: 'OC', KI: 'OC', MH: 'OC', MP: 'OC', NC: 'OC', NF: 'OC', NR: 'OC',
  NU: 'OC', NZ: 'OC', PF: 'OC', PG: 'OC', PN: 'OC', PW: 'OC', SB: 'OC', TO: 'OC', TV: 'OC', VU: 'OC', WF: 'OC', WS: 'OC',
  // Antarctica (Antarctica itself, Bouvet Island and the sub-Antarctic territories)
  AQ: 'AN', BV: 'AN', GS: 'AN', HM: 'AN', TF: 'AN',
  // Codes regions.v1.json lacks (EXTRA_CODES below)
  GF: 'SA', GP: 'NA', MQ: 'NA', BQ: 'NA', RE: 'AF', YT: 'AF', GI: 'EU', SJ: 'EU',
  CX: 'OC', CC: 'OC', TK: 'OC', UM: 'OC', CP: 'NA',
}

/**
 * The entries of CONTINENT_OF whose code is not in regions.v1.json (an eBird import can still carry them: an Antarctic
 * cruise is AQ). When regions.v1.json gains one (nf-8 added AQ and BV) it stops being an extra;
 * the test demands that every table entry be in the regions file or in this list.
 */
export const EXTRA_CODES: readonly string[] = ['GF', 'GP', 'MQ', 'BQ', 'RE', 'YT', 'GI', 'SJ', 'CX', 'CC', 'TK', 'UM', 'CP']

/**
 * Overseas regions (regions.v1.json sub1 codes) on another continent than their country: iNaturalist gives French Guiana
 * as {country: 'FR', sub1: 'FR-973'}. Checked before the country (continentOfPlace).
 */
export const SUB1_CONTINENT: Record<string, ContinentId> = {
  // France
  'FR-971': 'NA', 'FR-GP': 'NA', 'FR-972': 'NA', 'FR-MQ': 'NA', 'FR-973': 'SA', 'FR-GF': 'SA', 'FR-974': 'AF', 'FR-RE': 'AF',
  'FR-976': 'AF', 'FR-YT': 'AF', 'FR-BL': 'NA', 'FR-MF': 'NA', 'FR-PM': 'NA', 'FR-NC': 'OC', 'FR-PF': 'OC', 'FR-WF': 'OC',
  'FR-TF': 'AN', 'FR-CP': 'NA',
  // Netherlands (the Caribbean)
  'NL-AW': 'NA', 'NL-CW': 'NA', 'NL-SX': 'NA', 'NL-BQ1': 'NA', 'NL-BQ2': 'NA', 'NL-BQ3': 'NA',
  // United States (the Pacific)
  'US-AS': 'OC', 'US-GU': 'OC', 'US-MP': 'OC', 'US-UM': 'OC', 'US-HI': 'OC',
}

/** A place's continent: its sub1's override, else its country's; undefined when neither is known. */
export function continentOfPlace(p: { country: string; sub1?: string }): ContinentId | undefined {
  return (p.sub1 && Object.hasOwn(SUB1_CONTINENT, p.sub1) ? SUB1_CONTINENT[p.sub1] : undefined) ?? (Object.hasOwn(CONTINENT_OF, p.country) ? CONTINENT_OF[p.country] : undefined)
}
