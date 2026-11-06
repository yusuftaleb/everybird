import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { foldName, resolveName, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { SeenAgg } from '@/lib/list/seen'
import { stripBracket } from './places'

export type InatProgress = { fetched: number; total: number }
export type InatError = 'unknown-user' | 'no-birds' | 'network' | 'rate-limited'

const API = 'https://api.inaturalist.org/v1'
const PLACE_BATCH = 100
const RETRIES_ON_429 = 3

/** iNaturalist country place names that differ from Natural Earth names in regions.v1.json (folded -> ISO2). */
export const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'US',
  'czech republic': 'CZ',
  'democratic republic of the congo': 'CD',
  'republic of the congo': 'CG',
  'cape verde': 'CV',
  swaziland: 'SZ',
  'east timor': 'TL',
  macedonia: 'MK',
  'bosnia and herzegovina': 'BA',
  'antigua and barbuda': 'AG',
  'saint kitts and nevis': 'KN',
  'saint vincent and the grenadines': 'VC',
  'falkland islands': 'FK',
  'south georgia and the south sandwich islands': 'GS',
  'british virgin islands': 'VG',
  'united states virgin islands': 'VI',
  'marshall islands': 'MH',
  'solomon islands': 'SB',
  'cook islands': 'CK',
  'pitcairn islands': 'PN',
  'palestinian territories': 'PS',
  'state of palestine': 'PS',
  'vatican city': 'VA',
  'holy see': 'VA',
  'sao tome and principe': 'ST',
  'saint martin': 'MF',
  'saint barthelemy': 'BL',
  'saint pierre and miquelon': 'PM',
  'wallis and futuna': 'WF',
  'french polynesia': 'PF',
  'aland islands': 'AX',
  'russian federation': 'RU',
  turkiye: 'TR',
  burma: 'MM',
  'the gambia': 'GM',
  'the bahamas': 'BS',
  'republic of korea': 'KR',
  'federated states of micronesia': 'FM',
  'french southern and antarctic lands': 'TF',
  'british indian ocean territory': 'IO',
}

/** Western Marsh Wren (marwre1) range, by subnational region; iNaturalist lumps both marsh wrens as Cistothorus palustris. */
export const WESTERN_MARSH_WREN_SUB1 = new Set([
  'CA-BC', 'CA-AB', 'CA-YT', 'CA-NT',
  'US-WA', 'US-OR', 'US-CA', 'US-NV', 'US-ID', 'US-MT', 'US-WY', 'US-UT', 'US-CO', 'US-AZ', 'US-NM',
])
export const WESTERN_MARSH_WREN_COUNTRIES = new Set(['MX'])
export const MARSH_WREN_INAT_NAME = 'Cistothorus palustris'
const WESTERN = 'marwre1'
const EASTERN = 'eamwre1'

/**
 * Western North America -> marwre1; any other known place -> eamwre1; unknown place -> `fallback`
 * (the synonyms file's value). A US/CA place with no resolved sub1 cannot be told apart, so it also falls back.
 */
export function marshWrenCode(place: Place | undefined, fallback: string): string {
  if (!place) return fallback
  if (place.country && WESTERN_MARSH_WREN_COUNTRIES.has(place.country)) return WESTERN
  if (place.sub1) return WESTERN_MARSH_WREN_SUB1.has(place.sub1) ? WESTERN : EASTERN
  if (!place.country) return fallback
  if (place.country === 'US' || place.country === 'CA') return fallback
  return EASTERN
}

// ---------------------------------------------------------------------------------------------
// HTTP: one request at a time, >= minIntervalMs apart, 429 backoff, abortable.

class NetworkError extends Error {
  constructor(message: string, readonly status?: number) { super(message) }
}
class RateLimitedError extends Error {}

function abortError(): Error {
  const e = new Error('Aborted')
  e.name = 'AbortError'
  return e
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())
    const onAbort = () => {
      clearTimeout(timer)
      reject(abortError())
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function makeClient(f: typeof fetch, minIntervalMs: number, signal?: AbortSignal) {
  let last = -Infinity
  async function once(url: string): Promise<Response> {
    const wait = last + minIntervalMs - Date.now()
    if (wait > 0) await sleep(wait, signal)
    if (signal?.aborted) throw abortError()
    last = Date.now()
    try {
      return await f(url, { signal })
    } catch (e) {
      if (signal?.aborted) throw abortError()
      throw new NetworkError(e instanceof Error ? e.message : String(e))
    }
  }
  /** GET json. 429 -> wait 2x, 4x, 8x minIntervalMs and retry; still 429 after 3 retries -> RateLimitedError. */
  return async function getJson<T>(url: string): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const res = await once(url)
      if (res.status === 429) {
        if (attempt >= RETRIES_ON_429) throw new RateLimitedError()
        await sleep(minIntervalMs * 2 ** (attempt + 1), signal)
        continue
      }
      if (!res.ok) throw new NetworkError(`HTTP ${res.status}`, res.status)
      let body: unknown
      try {
        body = await res.json()
      } catch {
        if (signal?.aborted) throw abortError()
        throw new NetworkError('Invalid JSON')
      }
      // A null or non-object body would break callers' property access; treat it as a failed response.
      if (body === null || typeof body !== 'object') throw new NetworkError('Unexpected response body')
      return body as T
    }
  }
}

// ---------------------------------------------------------------------------------------------
// API shapes (only the fields we read)

type ApiObs = {
  id: number
  observed_on?: string | null
  quality_grade?: string
  taxon?: { rank?: string; name?: string } | null
  photos?: unknown[]
  sounds?: unknown[]
  annotations?: { controlled_attribute_id?: number; controlled_value_id?: number }[]
  place_ids?: number[]
}
export type ApiPlace = { id: number; name: string; admin_level: number | null }

const SPECIES_OR_BELOW = new Set(['species', 'subspecies', 'variety', 'form'])

/**
 * One entry per iNat species name: the earliest observation's date/row/places plus combined marks, and `seen`: every
 * observation's place ids (joined, as a key) with the earliest date there, resolved to places once fetched.
 */
type Agg = {
  row: number
  date?: string
  placeIds: number[]
  seen: Map<string, string>
  media: boolean
  heardAll: boolean
  deadAll: boolean
  research: boolean
}

const earlier = (date: string | undefined, prev: string | undefined) => !!date && (!prev || date < prev)

function foldInto(into: Agg, from: Agg): void {
  for (const [k, d] of from.seen) {
    const prev = into.seen.get(k)
    if (prev === undefined || (d && (!prev || d < prev))) into.seen.set(k, d)
  }
  into.media ||= from.media
  into.heardAll &&= from.heardAll
  into.deadAll &&= from.deadAll
  into.research ||= from.research
  if (earlier(from.date, into.date)) {
    into.row = from.row
    into.date = from.date
    into.placeIds = from.placeIds
  }
}

// ---------------------------------------------------------------------------------------------
// Places

function invertCountries(r: Regions): Map<string, string> {
  const m = new Map<string, string>()
  for (const [iso, name] of Object.entries(r.countries)) m.set(foldName(stripBracket(name)), iso)
  for (const [name, iso] of Object.entries(COUNTRY_ALIASES)) if (r.countries[iso] && !m.has(name)) m.set(name, iso)
  return m
}

/**
 * Local-language names iNaturalist may use for the regions build-geo renames to English (REGION_RENAMES), so they keep
 * matching. Folded on use. A name is only tried within its own country.
 */
export const SUB1_ALIASES: Record<string, string[]> = {
  'BE-VLG': ['Vlaanderen', 'Vlaams Gewest', 'Flemish Region'],
  'BE-WAL': ['Wallonie', 'Région wallonne', 'Walloon Region'],
  'CZ-10': ['Praha', 'Hlavní město Praha'],
  'ES-AS': ['Principado de Asturias'],
  'ES-CT': ['Catalunya', 'Cataluña'],
  'ES-IB': ['Illes Balears', 'Islas Baleares'],
  'ES-MC': ['Murcia', 'Región de Murcia'],
  'ES-MD': ['Madrid', 'Comunidad de Madrid'],
  'ES-NC': ['Navarra', 'Comunidad Foral de Navarra'],
  'ES-VC': ['Comunitat Valenciana', 'Comunidad Valenciana', 'Valencia'],
  'FR-973': ['Guyane'],
  'US-VI': ['Virgin Islands', 'United States Virgin Islands'],
}

/** Names a sub1 entry answers to: "Wales [Cymru GB-CYM]" -> "wales"; "Catalunya [Cataluña]" -> "catalunya", "cataluna". */
function sub1Names(name: string): string[] {
  const out = [foldName(stripBracket(name))]
  const inner = /\[([^\]]*)\]\s*$/.exec(name)?.[1]?.replace(/\s+[A-Z]{2}-[A-Z0-9]+$/, '').trim()
  if (inner) out.push(foldName(inner))
  return out
}

/** Exported for tests. */
export function makePlaceResolver(regions: Regions, byId: Map<number, ApiPlace>) {
  const countries = invertCountries(regions)
  const sub1ByCountry = new Map<string, Map<string, string>>()
  for (const [code, name] of Object.entries(regions.sub1)) {
    const iso = code.split('-')[0]!
    let m = sub1ByCountry.get(iso)
    if (!m) sub1ByCountry.set(iso, (m = new Map()))
    for (const n of sub1Names(name)) if (!m.has(n)) m.set(n, code)
  }
  for (const [code, names] of Object.entries(SUB1_ALIASES)) { // after the real names, which win
    const m = regions.sub1[code] ? sub1ByCountry.get(code.split('-')[0]!) : undefined
    if (m) for (const n of names) if (!m.has(foldName(n))) m.set(foldName(n), code)
  }
  return (placeIds: number[]): Place | undefined => {
    let countryName: string | undefined
    let sub1Name: string | undefined
    let sub2: string | undefined
    for (const id of placeIds) {
      const p = byId.get(id)
      if (!p) continue
      if (p.admin_level === 0 && countryName === undefined) countryName = p.name
      else if (p.admin_level === 10 && sub1Name === undefined) sub1Name = p.name
      else if (p.admin_level === 20 && sub2 === undefined) sub2 = p.name
    }
    const country = countryName ? countries.get(foldName(stripBracket(countryName))) : undefined
    if (!country) return undefined
    const place: Place = { country }
    const sub1 = sub1Name ? sub1ByCountry.get(country)?.get(foldName(stripBracket(sub1Name))) : undefined
    if (sub1) place.sub1 = sub1
    if (sub2) place.sub2 = sub2
    return place
  }
}

// ---------------------------------------------------------------------------------------------

export type InatOptions = {
  taxonomy: TaxonomyIndex
  synonyms: Record<string, string>
  regions: Regions
  fetch?: typeof fetch
  signal?: AbortSignal
  onProgress?: (p: InatProgress) => void
  /** Minimum gap between ANY two requests (autocomplete, observations, places). Default 1000. */
  minIntervalMs?: number
}

/**
 * Import a public iNaturalist user's wild bird observations.
 *
 * - Resolves `{error}` (never throws) for unknown-user, no-birds, network (fetch rejection, any non-OK
 *   non-429 response, bad JSON; no partial records are returned) and rate-limited (429 after 3 backoff retries
 *   of 2x, 4x, 8x minIntervalMs). An aborted `signal` REJECTS with an AbortError, promptly, even mid-wait.
 * - `row` on Unmatched is the 1-based position of the observation in fetch order.
 * - `skipped` counts OBSERVATIONS above species rank, without a taxon, or resolving to not-species.
 * - One SourceRecord per eBird code. Date and place come from the earliest dated observation. The marks follow
 *   buildList semantics across all of that species' observations: `media` and `research` if ANY observation has
 *   them; `heard` and `dead` only if EVERY observation is sound-only / annotated dead. (So with researchOnly on,
 *   a species whose research-grade observation is not the earliest still shows the earliest one's date.)
 * - Seen here (seen.ts): every observation's place (country, state, county) goes into the record's `seen`, with
 *   the earliest date there; so every distinct set of place ids is resolved. A name's places all go to its code (the
 *   marsh wren follows its earliest observation, as its lifer does). Coordinates, location, place_guess, observation
 *   ids and photo URLs are never read into records.
 */
export async function importInat(username: string, opts: InatOptions): Promise<ImportResult | { error: InatError }> {
  const get = makeClient(opts.fetch ?? fetch, opts.minIntervalMs ?? 1000, opts.signal)
  try {
    const login = username.trim()
    const users = await get<{ results?: { login?: string }[] }>(`${API}/users/autocomplete?q=${encodeURIComponent(login)}&per_page=30`)
    const isLogin = (u: { login?: string }) => u.login?.toLowerCase() === login.toLowerCase()
    if (!(Array.isArray(users.results) ? users.results : []).some(isLogin)) {
      // Autocomplete ranks by name and can miss an exact login: ask for the user directly (404 -> unknown).
      try {
        const one = await get<{ results?: { login?: string }[] }>(`${API}/users/${encodeURIComponent(login)}`)
        if (!(Array.isArray(one.results) ? one.results : []).some(isLogin)) return { error: 'unknown-user' }
      } catch (e) {
        if (e instanceof NetworkError && e.status === 404) return { error: 'unknown-user' }
        throw e
      }
    }

    const byName = new Map<string, Agg>()
    let skipped = 0
    let fetched = 0
    let total = 0
    let lastId = 0
    let seq = 0
    for (let page = 0; ; page++) {
      const q = new URLSearchParams({
        user_login: login, iconic_taxa: 'Aves', captive: 'false', per_page: '200', order_by: 'id', order: 'asc',
        id_above: String(lastId),
      })
      const body = await get<{ total_results?: number; results?: ApiObs[] }>(`${API}/observations?${q}`)
      const results = Array.isArray(body.results) ? body.results : []
      if (page === 0) total = body.total_results ?? results.length
      if (results.length === 0) break
      const maxId = Math.max(...results.map((o) => o.id))
      // Defensive: a page that does not advance id_above would loop forever.
      if (!(maxId > lastId)) throw new NetworkError('Paging did not advance')
      for (const o of results) {
        seq++
        lastId = Math.max(lastId, o.id)
        const rank = o.taxon?.rank
        const name = o.taxon?.name
        if (!name || !rank || !SPECIES_OR_BELOW.has(rank)) {
          skipped++
          continue
        }
        const key = name.split(/\s+/).slice(0, 2).join(' ')
        const photos = o.photos?.length ?? 0
        const sounds = o.sounds?.length ?? 0
        const date = o.observed_on && /^\d{4}-\d{2}-\d{2}$/.test(o.observed_on) ? o.observed_on : undefined
        const placeIds = Array.isArray(o.place_ids) ? o.place_ids.filter((id) => Number.isInteger(id)) : []
        const obs: Agg = {
          row: seq,
          date,
          placeIds,
          seen: new Map(placeIds.length ? [[placeIds.join(','), date ?? '']] : []),
          media: photos + sounds > 0,
          heardAll: sounds > 0 && photos === 0,
          deadAll: !!o.annotations?.some((a) => a.controlled_attribute_id === 17 && a.controlled_value_id === 19),
          research: o.quality_grade === 'research',
        }
        const prev = byName.get(key)
        if (prev) foldInto(prev, obs)
        else byName.set(key, obs)
      }
      fetched += results.length
      opts.onProgress?.({ fetched, total: Math.max(total, fetched) })
    }
    if (seq === 0) return { error: 'no-birds' }

    // Places: every observation's (seen here), which includes each name's earliest.
    const wanted = new Set<number>()
    for (const a of byName.values()) {
      for (const id of a.placeIds) wanted.add(id)
      for (const k of a.seen.keys()) for (const id of k.split(',')) wanted.add(Number(id))
    }
    const placeById = new Map<number, ApiPlace>()
    const ids = [...wanted]
    for (let i = 0; i < ids.length; i += PLACE_BATCH) {
      const batch = ids.slice(i, i + PLACE_BATCH)
      const res = await get<{ results?: ApiPlace[] }>(`${API}/places/${batch.join(',')}?admin_level=0,10,20`)
      for (const p of Array.isArray(res.results) ? res.results : []) placeById.set(p.id, p)
    }
    const placeOf = makePlaceResolver(opts.regions, placeById)
    const seenPlaces = new SeenAgg()
    const placeByKey = new Map<string, Place | undefined>()
    const seenOf = (a: Agg, into: string) => {
      for (const [k, d] of a.seen) {
        if (!placeByKey.has(k)) placeByKey.set(k, placeOf(k.split(',').map(Number)))
        seenPlaces.add(into, placeByKey.get(k), d || undefined)
      }
    }

    // Resolve names (after places: the marsh wren depends on where it was seen), then merge per eBird code.
    const byCode = new Map<string, Agg & { code: string; place?: Place }>()
    const unmatched: Unmatched[] = []
    for (const [name, a] of byName) {
      const place = placeOf(a.placeIds)
      let code: string | null
      if (name === MARSH_WREN_INAT_NAME && opts.synonyms[name]) {
        code = marshWrenCode(place, opts.synonyms[name])
      } else {
        code = opts.synonyms[name] ?? null
        if (!code) {
          const res = resolveName(opts.taxonomy, { sci: name })
          if (res.code === null) {
            if (res.reason === 'not-species') {
              skipped++
              continue
            }
            const u: Unmatched = { source: 'inat', row: a.row, sci: name, reason: res.reason }
            if (res.suggestion) u.suggestion = res.suggestion
            if (a.date) u.date = a.date
            if (place) u.place = place
            seenOf(a, `name:${name}`)
            u.seen = seenPlaces.get(`name:${name}`) ?? []
            unmatched.push(u)
            continue
          }
          code = res.code
        }
      }
      seenOf(a, code)
      const prev = byCode.get(code)
      if (!prev) byCode.set(code, { ...a, code, place })
      else {
        const wasEarlier = earlier(a.date, prev.date)
        foldInto(prev, a)
        if (wasEarlier) prev.place = place
      }
    }
    unmatched.sort((x, y) => x.row - y.row)

    const records: SourceRecord[] = []
    for (const a of byCode.values()) {
      const rec: SourceRecord = { code: a.code, source: 'inat' }
      if (a.date) rec.date = a.date
      if (a.place) rec.place = a.place
      if (a.heardAll) rec.heard = true
      if (a.deadAll) rec.dead = true
      if (a.media) rec.media = true
      if (a.research) rec.research = true
      rec.seen = seenPlaces.get(a.code) ?? []
      records.push(rec)
    }
    return { records, unmatched, skipped }
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: 'rate-limited' }
    if (e instanceof NetworkError) return { error: 'network' }
    throw e
  }
}
