import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importInat, marshWrenCode, COUNTRY_ALIASES } from '@/lib/import/inat'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'

const fx = <T>(n: string) => JSON.parse(readFileSync(`tests/fixtures/inat/${n}.json`, 'utf8')) as T
type Obs = { id: number; [k: string]: unknown }
const OBS = fx<{ results: Obs[] }>('observations').results
const PLACES = fx<{ results: { id: number }[] }>('places').results
const USERS = fx<unknown>('users')
const t = buildTaxonomyIndex(fx('taxonomy'))
const realRegions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions
const regions: Regions = {
  v: 1,
  countries: { US: 'United States of America', CA: 'Canada', MX: 'Mexico' },
  sub1: { 'US-CA': 'California', 'US-NY': 'New York', 'CA-BC': 'British Columbia', 'CA-AB': 'Alberta' },
}
const synonyms = { 'Cistothorus palustris': 'marwre1' }
const PAGE = 3
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

type Calls = { url: string; at: number }[]
function fakeFetch(opts: { obs?: Obs[]; users?: unknown; on?: (url: string, n: number) => Response | undefined } = {}) {
  const calls: Calls = []
  const obs = opts.obs ?? OBS
  const fn = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push({ url, at: Date.now() })
    const forced = opts.on?.(url, calls.length)
    if (forced) return forced
    const u = new URL(url)
    if (u.pathname === '/v1/users/autocomplete') return json('users' in opts ? opts.users : USERS)
    if (u.pathname === '/v1/observations') {
      const above = Number(u.searchParams.get('id_above') ?? 0)
      const rest = obs.filter((o) => o.id > above)
      return json({ total_results: obs.length, page: 1, per_page: 200, results: rest.slice(0, PAGE) })
    }
    if (u.pathname.startsWith('/v1/places/')) {
      const ids = u.pathname.split('/').pop()!.split(',').map(Number)
      return json({ total_results: 0, results: PLACES.filter((p) => ids.includes(p.id)) })
    }
    return json({}, 404)
  })
  return { fn: fn as unknown as typeof fetch, calls, mock: fn }
}

const base = { taxonomy: t, synonyms, regions, minIntervalMs: 1000 }
async function run(f: ReturnType<typeof fakeFetch>, extra: Record<string, unknown> = {}) {
  const p = importInat('testbirder', { ...base, fetch: f.fn, ...extra })
  await vi.runAllTimersAsync()
  return p
}
const okResult = (r: Awaited<ReturnType<typeof importInat>>) => {
  if ('error' in r) throw new Error('unexpected error ' + r.error)
  return r
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('importInat', () => {
  it('pages with id_above until empty', async () => {
    const f = fakeFetch()
    okResult(await run(f))
    const obsCalls = f.calls.filter((c) => c.url.includes('/v1/observations')).map((c) => new URL(c.url))
    expect(obsCalls.map((u) => u.searchParams.get('id_above'))).toEqual(['0', '103', '203'])
    const u = obsCalls[0]!
    expect(u.searchParams.get('user_login')).toBe('testbirder')
    expect(u.searchParams.get('iconic_taxa')).toBe('Aves')
    expect(u.searchParams.get('captive')).toBe('false')
    expect(u.searchParams.get('per_page')).toBe('200')
    expect(u.searchParams.get('order_by')).toBe('id')
    expect(u.searchParams.get('order')).toBe('asc')
    expect(f.calls[0]!.url).toContain('/v1/users/autocomplete?q=testbirder')
  })

  it('reports progress using total_results from the first page', async () => {
    const f = fakeFetch()
    const seen: { fetched: number; total: number }[] = []
    okResult(await run(f, { onProgress: (p: { fetched: number; total: number }) => seen.push(p) }))
    expect(seen).toEqual([{ fetched: 3, total: 6 }, { fetched: 6, total: 6 }])
  })

  it('waits minIntervalMs between requests', async () => {
    const f = fakeFetch()
    okResult(await run(f, { minIntervalMs: 700 }))
    expect(f.calls.length).toBeGreaterThanOrEqual(5)
    for (let i = 1; i < f.calls.length; i++) expect(f.calls[i]!.at - f.calls[i - 1]!.at).toBeGreaterThanOrEqual(700)
  })

  it('maps species and rolls subspecies to species', async () => {
    const r = okResult(await run(fakeFetch()))
    const norfli = r.records.find((x) => x.code === 'norfli')!
    expect(norfli.source).toBe('inat')
    // earliest observation (subspecies luteus, 2026-01-10) supplies the date
    expect(norfli.date).toBe('2026-01-10')
    expect(r.records.map((x) => x.code).sort()).toEqual(['gilfli', 'marwre1', 'norfli'])
    expect(r.skipped).toBe(1) // the genus-level observation
  })

  it('research is true if any observation is research grade, false if none is', async () => {
    const r = okResult(await run(fakeFetch()))
    expect(r.records.find((x) => x.code === 'norfli')!.research).toBe(true)
    expect(r.records.find((x) => x.code === 'gilfli')!.research).toBe(false)
  })

  it('sound-only is heard; annotation 17/19 is dead; photo is media', async () => {
    const r = okResult(await run(fakeFetch()))
    const g = r.records.find((x) => x.code === 'gilfli')!
    expect(g).toMatchObject({ heard: true, dead: true, media: true })
    // norfli: one sound-only obs and one photo obs -> not heard (every-record), media (any), not dead
    const n = r.records.find((x) => x.code === 'norfli')!
    expect(n.heard).toBeUndefined()
    expect(n.dead).toBeUndefined()
    expect(n.media).toBe(true)
  })

  it('places resolve to country/sub1/sub2 and no coordinates are kept', async () => {
    const f = fakeFetch()
    const r = okResult(await run(f))
    expect(r.records.find((x) => x.code === 'gilfli')!.place).toEqual({ country: 'US', sub1: 'US-CA' })
    expect(r.records.find((x) => x.code === 'norfli')!.place).toEqual({ country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen' })
    const placeCall = f.calls.find((c) => c.url.includes('/v1/places/'))!
    expect(placeCall.url).toContain('admin_level=0,10,20')
    const text = JSON.stringify(r)
    for (const bad of ['location', 'geojson', 'place_guess', 'Faketown', '12.34', '56.78', 'example.invalid', 'square.jpg', 'uuid', 'coordinates', 'photo', '"id"']) expect(text).not.toContain(bad)
  })

  it('resolves places in batches of at most 100, each id exactly once', async () => {
    const many: Obs[] = Array.from({ length: 230 }, (_, i) => ({
      id: i + 1, observed_on: '2026-01-01', quality_grade: 'research', taxon: { rank: 'species', name: `Fakeus sp${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}` },
      photos: [{}], sounds: [], annotations: [], place_ids: [5000 + i],
    }))
    const f = fakeFetch({ obs: many })
    okResult(await run(f))
    const reqs = f.calls.filter((c) => c.url.includes('/v1/places/')).map((c) => new URL(c.url).pathname.split('/').pop()!.split(',').map(Number))
    expect(reqs.length).toBe(3)
    for (const ids of reqs) expect(ids.length).toBeLessThanOrEqual(100)
    expect(reqs.flat().sort((x, y) => x - y)).toEqual(Array.from({ length: 230 }, (_, i) => 5000 + i))
  })

  it('earliest observation per name wins; unmatched has one entry with date and place', async () => {
    const r = okResult(await run(fakeFetch()))
    expect(r.unmatched).toEqual([
      { source: 'inat', row: 6, sci: 'Fakeus birdus', reason: 'no-match', date: '2026-04-01', place: { country: 'US', sub1: 'US-CA' }, seen: ['2026-04-01|US-CA'] },
    ])
  })

  it('seen here: the place of every observation, each with the earliest date there; subspecies roll up', async () => {
    const r = okResult(await run(fakeFetch()))
    const norfli = r.records.find((x) => x.code === 'norfli')!
    expect([...norfli.seen!].sort()).toEqual(['2026-01-10|CA-BC|Okanagan-Similkameen', '2026-03-02|US-CA|Alameda'])
    expect(r.records.find((x) => x.code === 'gilfli')!.seen).toEqual(['2026-02-01|US-CA'])
  })

  it('seen here: a later observation elsewhere adds a place; one at the same place keeps the earlier date', async () => {
    const o = (id: number, date: string, place_ids: number[]): Obs => ({
      id, observed_on: date, quality_grade: 'research', taxon: { rank: 'species', name: 'Colaptes chrysoides' }, photos: [{}], sounds: [], annotations: [], place_ids,
    } as Obs)
    const r = okResult(await run(fakeFetch({ obs: [o(1, '2026-05-01', [1000, 1001]), o(2, '2026-01-01', [1000, 1001]), o(3, '2026-07-01', [1000, 1003]), o(4, '2026-08-01', [])] })))
    expect([...r.records[0].seen!].sort()).toEqual(['2026-01-01|US-CA', '2026-07-01|US-NY'])
  })

  it('unknown user', async () => {
    // Not in autocomplete, and GET /v1/users/{login} is a 404 (the fake's default).
    const f = fakeFetch({ users: { total_results: 1, results: [{ login: 'testbirder2' }] } })
    expect(await run(f)).toEqual({ error: 'unknown-user' })
    expect(f.calls.map((c) => new URL(c.url).pathname)).toEqual(['/v1/users/autocomplete', '/v1/users/testbirder'])
  })

  it('a login autocomplete misses is confirmed with GET /v1/users/{login}', async () => {
    const f = fakeFetch({
      users: { total_results: 0, results: [] },
      on: (url) => (new URL(url).pathname === '/v1/users/testbirder' ? json({ total_results: 1, results: [{ id: 7, login: 'TestBirder' }] }) : undefined),
    })
    const r = okResult(await run(f))
    expect(r.records.length).toBeGreaterThan(0)
    expect(f.calls[1]!.url).toContain('/v1/users/testbirder')
  })

  it('a failing user lookup is a network error, not an unknown user', async () => {
    const f = fakeFetch({
      users: { total_results: 0, results: [] },
      on: (url) => (new URL(url).pathname === '/v1/users/testbirder' ? json({}, 500) : undefined),
    })
    expect(await run(f)).toEqual({ error: 'network' })
  })

  it('zero birds', async () => {
    expect(await run(fakeFetch({ obs: [] }))).toEqual({ error: 'no-birds' })
  })

  it('network failure resolves {error:"network"} with no partial records', async () => {
    const rej = fakeFetch({ on: (url) => { if (url.includes('id_above=103')) throw new TypeError('Failed to fetch'); return undefined } })
    expect(await run(rej)).toEqual({ error: 'network' })
    const f500 = fakeFetch({ on: (url) => (url.includes('id_above=103') ? json({}, 500) : undefined) })
    expect(await run(f500)).toEqual({ error: 'network' })
    const places500 = fakeFetch({ on: (url) => (url.includes('/v1/places/') ? json({}, 503) : undefined) })
    expect(await run(places500)).toEqual({ error: 'network' })
  })

  it('HTTP 429 gives rate-limited after 3 backoff retries', async () => {
    const f = fakeFetch({ on: (url) => (url.includes('/v1/observations') ? json({}, 429) : undefined) })
    expect(await run(f, { minIntervalMs: 1000 })).toEqual({ error: 'rate-limited' })
    const obs = f.calls.filter((c) => c.url.includes('/v1/observations'))
    expect(obs.length).toBe(4) // 1 try + 3 retries
    expect(obs[1]!.at - obs[0]!.at).toBeGreaterThanOrEqual(2000)
    expect(obs[2]!.at - obs[1]!.at).toBeGreaterThanOrEqual(4000)
    expect(obs[3]!.at - obs[2]!.at).toBeGreaterThanOrEqual(8000)
  })

  it('odd bodies and stuck paging never throw', async () => {
    const nullUsers = fakeFetch({ users: null })
    expect(await run(nullUsers)).toEqual({ error: 'network' })
    const nullBody = fakeFetch({ on: (url) => (url.includes('/v1/observations') ? new Response('null') : undefined) })
    expect(await run(nullBody)).toEqual({ error: 'network' })
    const stuck = fakeFetch({ on: (url) => (url.includes('/v1/observations') ? json({ total_results: 1, results: [OBS[0]] }) : undefined) })
    expect(await run(stuck)).toEqual({ error: 'network' })
    expect(stuck.calls.filter((c) => c.url.includes('/v1/observations')).length).toBe(2)
  })

  it('requests 30 user matches', async () => {
    const f = fakeFetch()
    okResult(await run(f))
    expect(f.calls[0]!.url).toContain('per_page=30')
  })

  it('an abort during res.json() is an AbortError, not network', async () => {
    const ac = new AbortController()
    const f = fakeFetch({ on: () => ({ status: 200, ok: true, json: async () => { ac.abort(); throw new SyntaxError('x') } }) as unknown as Response })
    const p = importInat('testbirder', { ...base, fetch: f.fn, signal: ac.signal })
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await vi.runAllTimersAsync()
    await assertion
  })

  it('a 429 that clears is retried transparently', async () => {
    let seen = 0
    const f = fakeFetch({ on: (url) => (url.includes('/v1/observations') && seen++ === 0 ? json({}, 429) : undefined) })
    okResult(await run(f))
  })

  it('abort rejects promptly with AbortError (no hang)', async () => {
    const ac = new AbortController()
    const f = fakeFetch()
    const p = importInat('testbirder', { ...base, fetch: f.fn, signal: ac.signal })
    const assertion = expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(10)
    ac.abort()
    await vi.runAllTimersAsync()
    await assertion
  })
})

describe('marsh wren split', () => {
  it('marshWrenCode picks by place', () => {
    const fb = 'marwre1'
    expect(marshWrenCode({ country: 'CA', sub1: 'CA-BC' }, fb)).toBe('marwre1')
    expect(marshWrenCode({ country: 'US', sub1: 'US-CA' }, fb)).toBe('marwre1')
    expect(marshWrenCode({ country: 'US', sub1: 'US-CO' }, fb)).toBe('marwre1')
    expect(marshWrenCode({ country: 'MX' }, fb)).toBe('marwre1')
    expect(marshWrenCode({ country: 'MX', sub1: 'MX-BCN' }, fb)).toBe('marwre1')
    expect(marshWrenCode({ country: 'US', sub1: 'US-NY' }, fb)).toBe('eamwre1')
    expect(marshWrenCode({ country: 'CA', sub1: 'CA-ON' }, fb)).toBe('eamwre1')
    expect(marshWrenCode({ country: 'US', sub1: 'US-TX' }, fb)).toBe('eamwre1')
    expect(marshWrenCode(undefined, fb)).toBe('marwre1')
    expect(marshWrenCode({}, 'x')).toBe('x')
    expect(marshWrenCode({ country: 'US' }, fb)).toBe('marwre1') // US/CA with no sub1: cannot tell
  })

  it('importInat applies it by earliest observation place', async () => {
    const mk = (place_ids: number[]): Obs[] => [{
      id: 1, observed_on: '2026-05-05', quality_grade: 'research', taxon: { rank: 'species', name: 'Cistothorus palustris' },
      photos: [{}], sounds: [], annotations: [], place_ids,
    }]
    const east = okResult(await run(fakeFetch({ obs: mk([1000, 1003]) })))
    expect(east.records.map((r) => r.code)).toEqual(['eamwre1'])
    const west = okResult(await run(fakeFetch({ obs: mk([1000, 1001]) })))
    expect(west.records.map((r) => r.code)).toEqual(['marwre1'])
    const unknown = okResult(await run(fakeFetch({ obs: mk([77]) })))
    expect(unknown.records.map((r) => r.code)).toEqual(['marwre1'])
  })
})

describe('country aliases', () => {
  it('every alias targets a country in the real regions file', () => {
    for (const [name, iso] of Object.entries(COUNTRY_ALIASES)) expect(realRegions.countries[iso], name).toBeDefined()
  })

  it('iNat "United States" resolves to US against real regions', async () => {
    const f = fakeFetch()
    const r = okResult(await run(f, { regions: realRegions }))
    expect(r.records.find((x) => x.code === 'gilfli')!.place).toEqual({ country: 'US', sub1: 'US-CA' })
  })
})

describe('iNaturalist region names', () => {
  it('local names still find regions build-geo renamed to English', async () => {
    const { makePlaceResolver } = await import('@/lib/import/inat')
    const regions = { v: 1 as const, countries: { ES: 'Spain', BE: 'Belgium' }, sub1: { 'ES-CT': 'Catalonia', 'ES-MD': 'Community of Madrid', 'BE-WAL': 'Wallonia' } }
    const byId = new Map([
      [1, { id: 1, name: 'Spain', admin_level: 0 }], [2, { id: 2, name: 'Cataluña', admin_level: 10 }], [3, { id: 3, name: 'Comunidad de Madrid', admin_level: 10 }],
      [4, { id: 4, name: 'Belgium', admin_level: 0 }], [5, { id: 5, name: 'Wallonie', admin_level: 10 }], [6, { id: 6, name: 'Catalonia', admin_level: 10 }],
    ])
    const resolvePlace = makePlaceResolver(regions, byId)
    expect(resolvePlace([1, 2])).toEqual({ country: 'ES', sub1: 'ES-CT' })
    expect(resolvePlace([1, 6])).toEqual({ country: 'ES', sub1: 'ES-CT' })
    expect(resolvePlace([1, 3])).toEqual({ country: 'ES', sub1: 'ES-MD' })
    expect(resolvePlace([4, 5])).toEqual({ country: 'BE', sub1: 'BE-WAL' })
    expect(resolvePlace([4, 2])).toEqual({ country: 'BE' }) // never across countries
  })
})
