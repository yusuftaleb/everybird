import type { Place } from '@/lib/list/model'

/**
 * Region rules: iNaturalist lumps some species that eBird splits, so one iNat name stands for two eBird species.
 * Each rule picks the eBird code for an observation: the iNat subspecies when it names one, else where (and when) it
 * was seen, else a default. The audit behind this table is in the Task W1 report (every huashu split, split_from and
 * AviList "split" rows alike, checked against the live iNaturalist taxa API, 2026-11-06; summary in
 * data/inat-synonyms.notes.md). A rule exists only where iNaturalist still lumps: where iNat has both species (as for
 * the marsh wrens, Cistothorus palustris / C. paludicola) its names match eBird's directly and a rule would only
 * reassign iNat's own identifications.
 */
export type Assigned = 'region' | 'default'
export type RegionRule = {
  /** iNat subspecies epithet -> eBird code. */
  subspecies: Record<string, string>
  /** eBird code from place and month (1-12); undefined when the place cannot tell. */
  region: (place: Place | undefined, month: number | undefined) => string | undefined
  /** Code when the region cannot tell (unknown place, or not enough detail). */
  fallback: string
}
export type RuleResult = { code: string; assigned?: Assigned }

// ---------------------------------------------------------------------------------------------
// Willet: Saltmarsh Willet (willet2, T. semipalmata) breeds on the Atlantic and Gulf coasts and in the Caribbean and
// winters mostly in South America; Prairie Willet (willet3, T. inornata) breeds in the interior and winters on every
// North American coast, the Gulf and Atlantic included.

/** Atlantic and Gulf coast states and provinces, where a breeding-season willet is Saltmarsh. */
export const SALTMARSH_WILLET_SUB1 = new Set([
  'US-ME', 'US-NH', 'US-MA', 'US-RI', 'US-CT', 'US-NY', 'US-NJ', 'US-DE', 'US-MD', 'US-VA', 'US-NC', 'US-SC',
  'US-GA', 'US-FL', 'US-AL', 'US-MS', 'US-LA', 'US-TX', 'US-PR', 'US-VI',
  'CA-NS', 'CA-NB', 'CA-PE',
  'MX-TAM', 'MX-VER', 'MX-TAB', 'MX-CAM', 'MX-YUC', 'MX-ROO',
])
/** Caribbean countries and territories (ISO2). */
export const CARIBBEAN = new Set([
  'BS', 'CU', 'HT', 'DO', 'JM', 'PR', 'VI', 'VG', 'KY', 'TC', 'AI', 'AG', 'KN', 'MS', 'GP', 'DM', 'MQ', 'LC', 'VC',
  'GD', 'BB', 'TT', 'AW', 'CW', 'BQ', 'BL', 'MF', 'SX',
])
const BREEDING = (m: number) => m >= 4 && m <= 8

/** Exported for tests. Atlantic/Gulf/Caribbean in Apr-Aug -> willet2; every other known place -> willet3. */
export function willetCode(place: Place | undefined, month: number | undefined): string | undefined {
  if (!place?.country) return undefined
  const coastal = CARIBBEAN.has(place.country) || (!!place.sub1 && SALTMARSH_WILLET_SUB1.has(place.sub1))
  if (coastal) return month === undefined ? undefined : BREEDING(month) ? 'willet2' : 'willet3'
  if (!place.sub1 && (place.country === 'US' || place.country === 'CA' || place.country === 'MX')) return undefined
  return 'willet3'
}

// ---------------------------------------------------------------------------------------------
// Horned owl: eBird's Great Horned Owl (grhowl) stops in Central America; Tropical Horned Owl (grhowl19) is the
// South American bird (Lesser Horned Owl is a species on both sides, Bubo magellanicus).

export const SOUTH_AMERICA = new Set(['CO', 'VE', 'GY', 'SR', 'GF', 'EC', 'PE', 'BR', 'BO', 'PY', 'AR', 'UY', 'CL', 'TT'])

function hornedOwl(place: Place | undefined): string | undefined {
  if (!place?.country) return undefined
  return SOUTH_AMERICA.has(place.country) || place.sub1 === 'FR-973' ? 'grhowl19' : 'grhowl'
}

// ---------------------------------------------------------------------------------------------
// Whistling-thrush: Chinese Whistling-Thrush (bluwht1) is central and eastern China; Yellow-billed (bluwht2) is
// everything else, from Central Asia and the Himalayas (incl. Yunnan, Tibet, Xinjiang) to Java.

/** Western China, where the bird is Yellow-billed (both ISO 3166-2:CN code styles appear in regions.v1.json). */
const WESTERN_CHINA = new Set(['CN-YN', 'CN-53', 'CN-XZ', 'CN-54', 'CN-XJ', 'CN-65'])

function whistlingThrush(place: Place | undefined): string | undefined {
  if (!place?.country) return undefined
  if (place.country === 'HK') return 'bluwht1'
  if (place.country === 'CN') return place.sub1 && WESTERN_CHINA.has(place.sub1) ? 'bluwht2' : 'bluwht1'
  return 'bluwht2'
}

// ---------------------------------------------------------------------------------------------
// Spotted flycatcher: Mediterranean Flycatcher (spofly3) breeds on the Balearics, Corsica and Sardinia (and the
// Tuscan islands, which no region tells apart); Spotted Flycatchers (spofly2) migrate through, so only Jun-Jul there.

const MEDITERRANEAN_FLYCATCHER_SUB1 = new Set(['ES-IB', 'FR-20R', 'FR-2A', 'FR-2B', 'IT-88'])

function spottedFlycatcher(place: Place | undefined, month: number | undefined): string | undefined {
  if (!place?.country) return undefined
  if (place.sub1 && MEDITERRANEAN_FLYCATCHER_SUB1.has(place.sub1)) {
    return month === undefined ? undefined : month === 6 || month === 7 ? 'spofly3' : 'spofly2'
  }
  return 'spofly2'
}

// ---------------------------------------------------------------------------------------------

/** iNat binomial -> rule. */
export const REGION_RULES: Record<string, RegionRule> = {
  'Tringa semipalmata': {
    subspecies: { semipalmata: 'willet2', inornata: 'willet3' },
    region: willetCode,
    fallback: 'willet3',
  },
  'Bubo virginianus': {
    subspecies: {
      nacurutu: 'grhowl19', deserti: 'grhowl19',
      virginianus: 'grhowl', algistus: 'grhowl', lagophonus: 'grhowl', pacificus: 'grhowl', pallescens: 'grhowl',
      saturatus: 'grhowl', subarcticus: 'grhowl', heterocnemis: 'grhowl', elachistus: 'grhowl', mesembrinus: 'grhowl',
      mayensis: 'grhowl', pinorum: 'grhowl',
    },
    region: (place) => hornedOwl(place),
    fallback: 'grhowl',
  },
  'Myophonus caeruleus': {
    subspecies: {
      caeruleus: 'bluwht1',
      flavirostris: 'bluwht2', dichrorhynchus: 'bluwht2', temminckii: 'bluwht2', eugenei: 'bluwht2', crassirostris: 'bluwht2',
    },
    region: (place) => whistlingThrush(place),
    fallback: 'bluwht2',
  },
  'Muscicapa striata': {
    subspecies: { tyrrhenica: 'spofly3', balearica: 'spofly3', striata: 'spofly2', neumanni: 'spofly2' },
    region: spottedFlycatcher,
    fallback: 'spofly2',
  },
}

const monthOf = (date: string | undefined): number | undefined => {
  const m = date && /^\d{4}-(\d{2})/.exec(date)
  const n = m ? Number(m[1]) : NaN
  return n >= 1 && n <= 12 ? n : undefined
}

/**
 * The eBird code for an iNat observation of `name` (binomial) with optional subspecies epithet, or undefined when the
 * name has no rule. `assigned` is set when the code is a guess: 'region' (from place/season) or 'default' (the place
 * could not tell).
 */
export function applyRegionRule(name: string, ssp: string | undefined, place: Place | undefined, date: string | undefined): RuleResult | undefined {
  const rule = REGION_RULES[name]
  if (!rule) return undefined
  const bySsp = ssp ? rule.subspecies[ssp] : undefined
  if (bySsp) return { code: bySsp }
  const byRegion = rule.region(place, monthOf(date))
  if (byRegion) return { code: byRegion, assigned: 'region' }
  return { code: rule.fallback, assigned: 'default' }
}
