export const REGION_PRESETS = [
  { id: 'latam', name: 'Latin America & Caribbean' },
  { id: 'me', name: 'Middle East' },
  { id: 'mena', name: 'Middle East & North Africa' },
  { id: 'northern-africa', name: 'Northern Africa' },
  { id: 'eastern-africa', name: 'Eastern Africa' },
  { id: 'middle-africa', name: 'Middle Africa' },
  { id: 'southern-africa', name: 'Southern Africa' },
  { id: 'western-africa', name: 'Western Africa' },
  { id: 'northern-america', name: 'Northern America' },
  { id: 'central-america', name: 'Central America' },
  { id: 'south-america', name: 'South America' },
  { id: 'caribbean', name: 'Caribbean' },
  { id: 'central-asia', name: 'Central Asia' },
  { id: 'eastern-asia', name: 'Eastern Asia' },
  { id: 'south-eastern-asia', name: 'South-eastern Asia' },
  { id: 'southern-asia', name: 'Southern Asia' },
  { id: 'western-asia', name: 'Western Asia' },
  { id: 'eastern-europe', name: 'Eastern Europe' },
  { id: 'northern-europe', name: 'Northern Europe' },
  { id: 'southern-europe', name: 'Southern Europe' },
  { id: 'western-europe', name: 'Western Europe' },
  { id: 'australia-nz', name: 'Australia & New Zealand' },
  { id: 'melanesia', name: 'Melanesia' },
  { id: 'micronesia', name: 'Micronesia' },
  { id: 'polynesia', name: 'Polynesia' },
] as const

export type RegionPresetId = (typeof REGION_PRESETS)[number]['id']

const IDS: readonly string[] = REGION_PRESETS.map((r) => r.id)
export const isRegionPresetId = (v: unknown): v is RegionPresetId => typeof v === 'string' && IDS.includes(v)

/** Short names a region row also answers to in the Places search, the same in every language. */
export const REGION_ALIASES: Partial<Record<RegionPresetId, readonly string[]>> = {
  latam: ['LATAM', 'LAC'],
  mena: ['MENA'],
  'south-eastern-asia': ['SEA'],
  'australia-nz': ['ANZ'],
}

export function regionPresetName(id: string): string {
  return REGION_PRESETS.find((r) => r.id === id)?.name ?? id
}

const SUBREGION_OF: Record<string, RegionPresetId> = {
  // Northern Africa
  DZ: 'northern-africa', EG: 'northern-africa', EH: 'northern-africa', LY: 'northern-africa',
  MA: 'northern-africa', SD: 'northern-africa', TN: 'northern-africa',
  // Eastern Africa
  BI: 'eastern-africa', DJ: 'eastern-africa', ER: 'eastern-africa', ET: 'eastern-africa',
  IO: 'eastern-africa', KE: 'eastern-africa', KM: 'eastern-africa', MG: 'eastern-africa',
  MU: 'eastern-africa', MW: 'eastern-africa', MZ: 'eastern-africa', RE: 'eastern-africa',
  RW: 'eastern-africa', SC: 'eastern-africa', SO: 'eastern-africa', SS: 'eastern-africa',
  TZ: 'eastern-africa', UG: 'eastern-africa', YT: 'eastern-africa', ZM: 'eastern-africa',
  ZW: 'eastern-africa',
  // Middle Africa
  AO: 'middle-africa', CD: 'middle-africa', CF: 'middle-africa', CG: 'middle-africa',
  CM: 'middle-africa', GA: 'middle-africa', GQ: 'middle-africa', ST: 'middle-africa',
  TD: 'middle-africa',
  // Southern Africa
  BW: 'southern-africa', LS: 'southern-africa', NA: 'southern-africa', SZ: 'southern-africa',
  ZA: 'southern-africa',
  // Western Africa
  BF: 'western-africa', BJ: 'western-africa', CI: 'western-africa', CV: 'western-africa',
  GH: 'western-africa', GM: 'western-africa', GN: 'western-africa', GW: 'western-africa',
  LR: 'western-africa', ML: 'western-africa', MR: 'western-africa', NE: 'western-africa',
  NG: 'western-africa', SH: 'western-africa', SL: 'western-africa', SN: 'western-africa',
  TG: 'western-africa',
  // Northern America
  BM: 'northern-america', CA: 'northern-america', GL: 'northern-america', PM: 'northern-america',
  US: 'northern-america',
  // Central America
  BZ: 'central-america', CP: 'central-america', CR: 'central-america', GT: 'central-america',
  HN: 'central-america', MX: 'central-america', NI: 'central-america', PA: 'central-america',
  SV: 'central-america',
  // Caribbean
  AG: 'caribbean', AI: 'caribbean', AW: 'caribbean', BB: 'caribbean', BL: 'caribbean',
  BQ: 'caribbean', BS: 'caribbean', CU: 'caribbean', CW: 'caribbean', DM: 'caribbean',
  DO: 'caribbean', GD: 'caribbean', GP: 'caribbean', HT: 'caribbean', JM: 'caribbean',
  KN: 'caribbean', KY: 'caribbean', LC: 'caribbean', MF: 'caribbean', MQ: 'caribbean',
  MS: 'caribbean', PR: 'caribbean', SX: 'caribbean', TC: 'caribbean', TT: 'caribbean',
  VC: 'caribbean', VG: 'caribbean', VI: 'caribbean',
  // South America
  AR: 'south-america', BO: 'south-america', BR: 'south-america', CL: 'south-america',
  CO: 'south-america', EC: 'south-america', FK: 'south-america', GF: 'south-america',
  GY: 'south-america', PE: 'south-america', PY: 'south-america', SR: 'south-america',
  UY: 'south-america', VE: 'south-america',
  // Central Asia
  KG: 'central-asia', KZ: 'central-asia', TJ: 'central-asia', TM: 'central-asia',
  UZ: 'central-asia',
  // Eastern Asia
  CN: 'eastern-asia', HK: 'eastern-asia', JP: 'eastern-asia', KP: 'eastern-asia',
  KR: 'eastern-asia', MN: 'eastern-asia', MO: 'eastern-asia', TW: 'eastern-asia',
  // South-eastern Asia
  BN: 'south-eastern-asia', ID: 'south-eastern-asia', KH: 'south-eastern-asia', LA: 'south-eastern-asia',
  MM: 'south-eastern-asia', MY: 'south-eastern-asia', PH: 'south-eastern-asia', SG: 'south-eastern-asia',
  TH: 'south-eastern-asia', TL: 'south-eastern-asia', VN: 'south-eastern-asia',
  // Southern Asia
  AF: 'southern-asia', BD: 'southern-asia', BT: 'southern-asia', IN: 'southern-asia',
  IR: 'southern-asia', LK: 'southern-asia', MV: 'southern-asia', NP: 'southern-asia',
  PK: 'southern-asia',
  // Western Asia
  AE: 'western-asia', AM: 'western-asia', AZ: 'western-asia', BH: 'western-asia',
  CY: 'western-asia', GE: 'western-asia', IL: 'western-asia', IQ: 'western-asia',
  JO: 'western-asia', KW: 'western-asia', LB: 'western-asia', OM: 'western-asia',
  PS: 'western-asia', QA: 'western-asia', QY: 'western-asia', QZ: 'western-asia',
  SA: 'western-asia', SY: 'western-asia', TR: 'western-asia', YE: 'western-asia',
  // Eastern Europe
  BG: 'eastern-europe', BY: 'eastern-europe', CZ: 'eastern-europe', HU: 'eastern-europe',
  MD: 'eastern-europe', PL: 'eastern-europe', RO: 'eastern-europe', RU: 'eastern-europe',
  SK: 'eastern-europe', UA: 'eastern-europe',
  // Northern Europe
  AX: 'northern-europe', DK: 'northern-europe', EE: 'northern-europe', FI: 'northern-europe',
  FO: 'northern-europe', GB: 'northern-europe', GG: 'northern-europe', IE: 'northern-europe',
  IM: 'northern-europe', IS: 'northern-europe', JE: 'northern-europe', LT: 'northern-europe',
  LV: 'northern-europe', NO: 'northern-europe', SE: 'northern-europe', SJ: 'northern-europe',
  // Southern Europe
  AD: 'southern-europe', AL: 'southern-europe', BA: 'southern-europe', ES: 'southern-europe',
  GI: 'southern-europe', GR: 'southern-europe', HR: 'southern-europe', IT: 'southern-europe',
  ME: 'southern-europe', MK: 'southern-europe', MT: 'southern-europe', PT: 'southern-europe',
  RS: 'southern-europe', SI: 'southern-europe', SM: 'southern-europe', VA: 'southern-europe',
  XK: 'southern-europe',
  // Western Europe
  AT: 'western-europe', BE: 'western-europe', CH: 'western-europe', DE: 'western-europe',
  FR: 'western-europe', LI: 'western-europe', LU: 'western-europe', MC: 'western-europe',
  NL: 'western-europe',
  // Australia & New Zealand
  AC: 'australia-nz', AU: 'australia-nz', CC: 'australia-nz', CS: 'australia-nz',
  CX: 'australia-nz', NF: 'australia-nz', NZ: 'australia-nz',
  // Melanesia
  FJ: 'melanesia', NC: 'melanesia', PG: 'melanesia', SB: 'melanesia', VU: 'melanesia',
  // Micronesia
  FM: 'micronesia', GU: 'micronesia', KI: 'micronesia', MH: 'micronesia',
  MP: 'micronesia', NR: 'micronesia', PW: 'micronesia', UM: 'micronesia',
  // Polynesia
  AS: 'polynesia', CK: 'polynesia', NU: 'polynesia', PF: 'polynesia',
  PN: 'polynesia', TK: 'polynesia', TO: 'polynesia', TV: 'polynesia',
  WF: 'polynesia', WS: 'polynesia',
}

const SUB1_SUBREGION: Record<string, RegionPresetId | null> = {
  'FR-971': 'caribbean', 'FR-GP': 'caribbean',
  'FR-972': 'caribbean', 'FR-MQ': 'caribbean',
  'FR-973': 'south-america', 'FR-GF': 'south-america',
  'FR-974': 'eastern-africa', 'FR-RE': 'eastern-africa',
  'FR-976': 'eastern-africa', 'FR-YT': 'eastern-africa',
  'FR-BL': 'caribbean', 'FR-MF': 'caribbean',
  'FR-PM': 'northern-america',
  'FR-NC': 'melanesia',
  'FR-PF': 'polynesia', 'FR-WF': 'polynesia',
  'FR-CP': 'central-america',
  'FR-TF': null,
  'NL-AW': 'caribbean', 'NL-CW': 'caribbean', 'NL-SX': 'caribbean',
  'NL-BQ1': 'caribbean', 'NL-BQ2': 'caribbean', 'NL-BQ3': 'caribbean',
  'US-AS': 'polynesia', 'US-HI': 'polynesia',
  'US-GU': 'micronesia', 'US-MP': 'micronesia', 'US-UM': 'micronesia',
  // Entered as US states (a spreadsheet's "United States, Puerto Rico", observation.org's divisions).
  'US-PR': 'caribbean', 'US-VI': 'caribbean',
}

const LATAM_SUBREGIONS = new Set<RegionPresetId>(['central-america', 'caribbean', 'south-america'])

const MIDDLE_EAST_CODES = new Set([
  'EG', 'TR', 'IR', 'IQ', 'IL', 'PS', 'JO', 'LB', 'SY', 'CY', 'QY', 'QZ',
  'SA', 'AE', 'QA', 'BH', 'KW', 'OM', 'YE',
])

export function regionsOfPlace(p: { country: string; sub1?: string }): RegionPresetId[] {
  const hasSub1Override = !!(p.sub1 && Object.hasOwn(SUB1_SUBREGION, p.sub1))
  const sub = hasSub1Override
    ? SUB1_SUBREGION[p.sub1!]
    : Object.hasOwn(SUBREGION_OF, p.country)
      ? SUBREGION_OF[p.country]
      : undefined
  const out: RegionPresetId[] = []
  if (sub && LATAM_SUBREGIONS.has(sub)) out.push('latam')
  const me = !hasSub1Override && MIDDLE_EAST_CODES.has(p.country)
  if (me) out.push('me')
  // Middle East & North Africa: every country of the two.
  if (me || sub === 'northern-africa') out.push('mena')
  if (sub) out.push(sub)
  return out
}
