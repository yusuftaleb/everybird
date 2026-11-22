import type { ImportResult, Place, SourceRecord, Unmatched } from '@/lib/list/model'
import { foldName, resolveName, type TaxonomyIndex } from '@/lib/species/resolve'
import type { Regions } from '@/lib/species/types'
import { SeenAgg } from '@/lib/list/seen'
import { stripBracket } from './places'
import { projectPlace, resolveImportedPlace } from '@/lib/places/registry'
import { makeSub1Index, SUB1_ALIASES } from './sub1-index'
import { hasInatVietnamRegion, IMPORT_REGION_ALIASES, namedImportRegion } from '@/lib/places/region-mapping'
import { coordinates, loadVietnamCoordinateRegion, type CoordinateRegion } from '@/lib/places/coordinate-region'
import { applyRegionRule, REGION_RULES, type Assigned } from './inat-rules'

export type InatProgress = { fetched: number; total: number }
export type InatError = 'unknown-user' | 'no-birds' | 'network' | 'rate-limited'

const API = 'https://api.inaturalist.org/v1'
/** Observations come from v2, which returns only the `fields` asked for (about 130 KB a page, not v1's ~16 MB). */
const OBS_API = 'https://api.inaturalist.org/v2/observations'
/** Exactly the observation fields `importInat` reads (ApiObs); v2 adds `uuid` and `taxon.id`, which are ignored. */
export const OBS_FIELDS = [
  'id', 'observed_on', 'quality_grade', 'taxon.name', 'taxon.rank', 'photos.id', 'sounds.id',
  'annotations.controlled_attribute_id', 'annotations.controlled_value_id', 'place_ids',
  'obscured', 'geoprivacy', 'taxon_geoprivacy', 'positional_accuracy', 'geojson',
].join(',')
const PLACE_BATCH = 100
const VIETNAM_PLACE_ID = 6847
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

/** The public boundary download is shared with other imports; cancellation only ends this caller's wait. */
async function waitForBoundaries(promise: Promise<CoordinateRegion | undefined>, signal?: AbortSignal) {
  if (!signal) return promise
  if (signal.aborted) throw abortError()
  let stop: (() => void) | undefined
  const cancelled = new Promise<never>((_, reject) => {
    stop = () => reject(abortError())
    signal.addEventListener('abort', stop, { once: true })
  })
  try {
    return await Promise.race([promise, cancelled])
  } finally {
    if (stop) signal.removeEventListener('abort', stop)
  }
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
// API shapes (only the fields we read; observations are v2's, the same values as v1's)

type ApiObs = {
  id: number
  observed_on?: string | null
  quality_grade?: string
  taxon?: { rank?: string; name?: string } | null
  photos?: unknown[]
  sounds?: unknown[]
  annotations?: { controlled_attribute_id?: number; controlled_value_id?: number }[]
  place_ids?: number[]
  obscured?: boolean
  geoprivacy?: string | null
  taxon_geoprivacy?: string | null
  positional_accuracy?: number | null
  geojson?: { type: string; coordinates?: number[] } | null
}
type ApiPlace = { id: number; name: string; admin_level: number | null; ancestor_place_ids?: number[] }

function publicCoordinates(o: ApiObs) {
  const isOpen = (value: string | null | undefined) => !value || value === 'open'
  if (o.obscured !== false ||
      !isOpen(o.geoprivacy) || !isOpen(o.taxon_geoprivacy) || o.geojson?.type !== 'Point' ||
      typeof o.positional_accuracy !== 'number' || !Number.isFinite(o.positional_accuracy) || o.positional_accuracy < 0) return
  return coordinates(o.geojson.coordinates?.[0], o.geojson.coordinates?.[1])
}

const SPECIES_OR_BELOW = new Set(['species', 'subspecies', 'variety', 'form'])

/**
 * One entry per iNat species name: the earliest observation's date/row/places plus combined marks, and `seen`: every
 * observation's place ids (joined, as a key) with the earliest date there, resolved to places once fetched.
 */
type Agg = {
  row: number
  date?: string
  placeKey: string
  seen: Map<string, string>
  seenMonths: Map<string, Set<string>>
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
  for (const [key, months] of from.seenMonths) {
    let set = into.seenMonths.get(key)
    if (!set) into.seenMonths.set(key, (set = new Set()))
    for (const month of months) set.add(month)
  }
  into.media ||= from.media
  into.heardAll &&= from.heardAll
  into.deadAll &&= from.deadAll
  into.research ||= from.research
  if (earlier(from.date, into.date)) {
    into.row = from.row
    into.date = from.date
    into.placeKey = from.placeKey
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

/** Exported for tests. */
export function makePlaceResolver(regions: Regions, byId: Map<number, ApiPlace>) {
  const countries = invertCountries(regions)
  const sub1Of = makeSub1Index(regions, [IMPORT_REGION_ALIASES, SUB1_ALIASES], undefined, { onClash: 'first' })
  return (placeIds: number[], coordinatePlace?: string): Place | undefined => {
    const places = placeIds.map((id) => byId.get(id))
    const countryPlace = places.find((p) => p?.admin_level === 0)
    if (!countryPlace) return undefined
    const sourceCountry = regions.registry?.catalogues.inat?.entries[String(countryPlace.id)]?.[0]
    const country = sourceCountry ?? countries.get(foldName(stripBracket(countryPlace.name)))
    if (!country) return undefined
    const inCountry = (p: ApiPlace | undefined, level: number) =>
      p?.admin_level === level && (!p.ancestor_place_ids || p.ancestor_place_ids.includes(countryPlace.id))
    const province = places.find((p) => inCountry(p, 10))
    const county = places.find((p) => inCountry(p, 20) &&
      (!province || !p?.ancestor_place_ids || p.ancestor_place_ids.includes(province.id)))
    if (regions.registry) {
      return resolveImportedPlace({
        namespace: 'inat', id: String(province?.id ?? countryPlace.id), country,
        county: country === 'VN' ? undefined : county?.name,
        label: province?.name, fallback: coordinatePlace,
      }, regions)
    }
    if (country === 'VN') {
      const sub1 = namedImportRegion(country, province?.name ?? '', province?.id) ?? coordinatePlace
      return sub1 ? { country, sub1 } : { country }
    }
    const place: Place = { country }
    const sub1 = province ? sub1Of(country, province.name) : undefined
    if (sub1) place.sub1 = sub1
    if (county) place.sub2 = county.name
    return place
  }
}

// ---------------------------------------------------------------------------------------------

type InatOptions = {
  taxonomy: TaxonomyIndex
  synonyms: Record<string, string>
  regions: Regions
  fetch?: typeof fetch
  signal?: AbortSignal
  onProgress?: (p: InatProgress) => void
  /** Minimum gap between ANY two requests (autocomplete, observations, places). Default 1000. */
  minIntervalMs?: number
  loadCoordinates?: () => Promise<CoordinateRegion | undefined>
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
 *   the earliest date there; so every distinct set of place ids is resolved. A name's places all go to its code
 *   (for a region-ruled name, each place goes to the code it resolves to). Only unobscured points in Vietnam can supply a fallback province; exact coordinates, place_guess, observation
 *   ids and photo URLs are never read into records.
 * - Region rules (inat-rules.ts): a name iNaturalist lumps but eBird splits (willet, horned owl and others) is resolved per
 *   subspecies, place and month, so one iNat name can give two eBird species. A record whose every observation was
 *   placed by region (or by default, the place unknown) carries `assigned`.
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
    const ruleOf = new Map<string, { name: string; ssp?: string }>() // byName key -> rule name (for ruled keys)
    let skipped = 0
    let fetched = 0
    let total = 0
    let lastId = 0
    let seq = 0
    let coordinateLookup: Promise<CoordinateRegion | undefined> | undefined
    for (let page = 0; ; page++) {
      const q = new URLSearchParams({
        user_login: login, iconic_taxa: 'Aves', captive: 'false', per_page: '200', order_by: 'id', order: 'asc',
        id_above: String(lastId), fields: OBS_FIELDS,
      })
      const body = await get<{ total_results?: number; results?: ApiObs[] }>(`${OBS_API}?${q}`)
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
        const parts = name.split(/\s+/)
        const binomial = parts.slice(0, 2).join(' ')
        // A name with a region rule keeps each subspecies, place and month apart: each may be a different eBird species.
        const ruled = !!REGION_RULES[binomial]
        const ssp = ruled && rank === 'subspecies' ? parts[2] : undefined
        const photos = o.photos?.length ?? 0
        const sounds = o.sounds?.length ?? 0
        const date = o.observed_on && /^\d{4}-\d{2}-\d{2}$/.test(o.observed_on) ? o.observed_on : undefined
        const placeIds = Array.isArray(o.place_ids) ? o.place_ids.filter((id) => Number.isInteger(id)) : []
        const point = placeIds.includes(VIETNAM_PLACE_ID) && !placeIds.some(hasInatVietnamRegion) ? publicCoordinates(o) : undefined
        let region: string | undefined
        if (point) {
          coordinateLookup ??= waitForBoundaries((opts.loadCoordinates ?? loadVietnamCoordinateRegion)(), opts.signal)
          const lookup = await coordinateLookup
          if (opts.signal?.aborted) throw abortError()
          region = lookup?.(...point, o.positional_accuracy)
        }
        const placeKey = placeIds.length ? placeIds.join(',') + (region ? ';' + region : '') : ''
        const key = ruled ? [binomial, ssp ?? '', placeKey, date?.slice(0, 7) ?? ''].join('|') : binomial
        if (ruled && !ruleOf.has(key)) ruleOf.set(key, { name: binomial, ssp })
        const obs: Agg = {
          row: seq,
          date,
          placeKey,
          seen: new Map(placeKey ? [[placeKey, date ?? '']] : []),
          seenMonths: new Map(placeKey && date ? [[placeKey, new Set([date.slice(0, 7)])]] : []),
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
      for (const k of a.seen.keys()) for (const id of k.split(';', 1)[0].split(',')) wanted.add(Number(id))
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
    const resolvePlaceKey = (key: string) => {
      if (!key) return undefined
      if (!placeByKey.has(key)) {
        const [ids, region] = key.split(';')
        placeByKey.set(key, placeOf(ids.split(',').map(Number), region))
      }
      return placeByKey.get(key)
    }
    const seenOf = (a: Agg, into: string) => {
      for (const [k, d] of a.seen) {
        const place = resolvePlaceKey(k)
        seenPlaces.add(into, place, d || undefined)
        const region = place?.sub1 || place?.country
        if (region) seenPlaces.addMonths(into, place?.sub2 ? `${region}|${place.sub2}` : region, a.seenMonths.get(k) ?? [])
      }
    }

    // Resolve names (after places: a region rule depends on where it was seen), then merge per eBird code.
    // `assigned`: set while every contribution to the code was a region rule's guess; null once one was not.
    const byCode = new Map<string, Agg & { code: string; place?: Place; assigned: Assigned | null }>()
    const unmatched: Unmatched[] = []
    for (const [name, a] of byName) {
      const place = resolvePlaceKey(a.placeKey)
      let code: string | null
      let assigned: Assigned | null = null
      const ruled = ruleOf.get(name)
      if (ruled) {
        const r = applyRegionRule(ruled.name, ruled.ssp, projectPlace(place, opts.regions), a.date)!
        code = r.code
        assigned = r.assigned ?? null
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
            u.seenMonths = seenPlaces.getMonths(`name:${name}`) ?? []
            unmatched.push(u)
            continue
          }
          code = res.code
        }
      }
      seenOf(a, code)
      const prev = byCode.get(code)
      if (!prev) byCode.set(code, { ...a, code, place, assigned })
      else {
        const wasEarlier = earlier(a.date, prev.date)
        foldInto(prev, a)
        if (wasEarlier) prev.place = place
        prev.assigned = prev.assigned && assigned ? (prev.assigned === 'region' || assigned === 'region' ? 'region' : 'default') : null
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
      rec.research = a.research
      if (a.assigned) rec.assigned = a.assigned
      rec.seen = seenPlaces.get(a.code) ?? []
      rec.seenMonths = seenPlaces.getMonths(a.code) ?? []
      records.push(rec)
    }
    return { records, unmatched, skipped }
  } catch (e) {
    if (e instanceof RateLimitedError) return { error: 'rate-limited' }
    if (e instanceof NetworkError) return { error: 'network' }
    throw e
  }
}
