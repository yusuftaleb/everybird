import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ALLOWED as APP_ALLOWED } from '@/lib/analytics'
import { ALLOWED, CUTOVER, DAILY_CAP, SEEN_SQL, eventRow, keepRow, pacificDay, seenBinds, statsDay, type EventRow } from '../workers/stats/src/event'
import worker from '../workers/stats/src/index'

const ctx = { day: '2026-11-15', country: 'MX', device: 'iphone', vid: 'abc123' }
const at = (s: string) => new Date(s)

describe("the stats Worker's row", () => {
  it("keeps a visit's browser language", () => {
    expect(eventRow({ n: 'visit', p: 'landing', l: 'es' }, ctx)).toEqual({ ...ctx, name: 'visit', value: 'landing', lang: 'es' })
    expect(eventRow({ n: 'visit', p: 'landing', l: 'es' }, ctx)!.lang).toBe('es')
    expect(eventRow({ n: 'visit', p: 'about', l: 'zh' }, ctx)?.lang).toBe('zh')
    // Chinese by script, as the app's langCode sends it.
    expect(eventRow({ n: 'visit', p: 'about', l: 'zh-Hans' }, ctx)?.lang).toBe('zh-Hans')
    expect(eventRow({ n: 'visit', p: 'about', l: 'zh-Hant' }, ctx)?.lang).toBe('zh-Hant')
    expect(eventRow({ n: 'visit', p: 'about' }, ctx)?.lang).toBe('')
  })
  it('stores only a primary subtag: anything else is ""', () => {
    for (const l of ['ES-es', 'ES', 'es-MX', '<script>', 'x', 'abcd', '', 12, null, ['es']]) {
      expect(eventRow({ n: 'visit', p: 'landing', l }, ctx)?.lang, String(l)).toBe('')
    }
  })
  it('never keeps a language on other events', () => {
    expect(eventRow({ n: 'shared', p: 'post', l: 'es' }, ctx)).toEqual({ ...ctx, name: 'shared', value: 'post', lang: '' })
    expect(eventRow({ n: 'collage_made', p: 'inat', l: 'pt' }, ctx)?.lang).toBe('')
  })
  it('drops anything off the allow-list', () => {
    for (const body of [null, 'visit', 7, {}, { n: 'visit', p: '/s/v1.token' }, { n: 'nope', p: 'landing' }, { n: 'toString', p: 'x' }, { n: 'visit' }, { p: 'landing' }]) {
      expect(eventRow(body, ctx), JSON.stringify(body)).toBeNull()
    }
  })
  it("matches the app's allow-list (AGENTS.md: they change together)", () => {
    expect(Object.fromEntries(Object.entries(ALLOWED).map(([k, v]) => [k, [...v]]))).toEqual(APP_ALLOWED)
  })
})

describe('the horizontal share formats', () => {
  it('the Worker allows desktop and wide for downloads and shares, matching the app', () => {
    for (const event of ['image_downloaded', 'shared'] as const) {
      expect([...ALLOWED[event]]).toEqual(APP_ALLOWED[event])
      expect([...ALLOWED[event]]).toEqual(expect.arrayContaining(['desktop', 'wide']))
    }
  })
})

describe('landscape posters', () => {
  it('counts a landscape poster by its size with an -l suffix, and keeps the portrait sizes', () => {
    for (const size of ['a4-l', 'a3-l', 'a2-l', 'a1-l', 'a4', 'a1', 'us12x18', 'us18x24', 'us24x36', 'us12x18-l', 'us18x24-l', 'us24x36-l']) {
      expect(eventRow({ n: 'poster_made', p: size }, ctx)).toEqual({ ...ctx, name: 'poster_made', value: size, lang: '' })
    }
    expect(eventRow({ n: 'poster_made', p: 'a5-l' }, ctx)).toBeNull()
    expect(eventRow({ n: 'poster_made', p: 'A2-l' }, ctx)).toBeNull()
    expect(eventRow({ n: 'poster_made', p: 'us11x17' }, ctx)).toBeNull()
  })
})

// node:sqlite (as in tests/stats-report.test.ts): the Worker's schema and SEEN_SQL run for real, as D1 runs them.
type Db = {
  exec(sql: string): void
  prepare(sql: string): {
    run(...a: unknown[]): unknown
    get(...a: unknown[]): { c: number | null; dup: number | null } | undefined
    all(...a: unknown[]): Record<string, unknown>[]
  }
}
const sqlite = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Db }
  } catch {
    return null
  }
})()

const SCHEMA = () => readFileSync('workers/stats/schema.sql', 'utf8')
const indexes = (db: Db) => db.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'events' ORDER BY name").all().map((r) => r.name)
const count = (db: Db) => (db.prepare('SELECT COUNT(*) AS n FROM events').all()[0] as { n: number }).n

/** What the Worker's fetch does after the allow-list: SEEN_SQL on the visitor's day, then store the row if keepRow says so. */
function store(db: Db, body: unknown, c: typeof ctx = ctx): boolean {
  const row: EventRow | null = eventRow(body, c)
  if (!row) return false
  const seen = db.prepare(SEEN_SQL).get(...seenBinds(row))!
  if (!keepRow(row, seen)) return false
  db.prepare('INSERT INTO events (day, name, value, country, device, vid, lang) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(row.day, row.name, row.value, row.country, row.device, row.vid, row.lang)
  return true
}

describe('the daily keep decision', () => {
  const row = (name: string, value: string): EventRow => ({ ...ctx, name, value, lang: '' })
  it('stores a visit unless the same page is already there today', () => {
    expect(keepRow(row('visit', 'landing'), { c: 0, dup: 0 })).toBe(true)
    expect(keepRow(row('visit', 'landing'), { c: 1, dup: 1 })).toBe(false)
    expect(keepRow(row('visit', 'landing'), { c: 3, dup: 0 })).toBe(true) // another page today
    expect(keepRow(row('visit', 'landing'), { c: 0, dup: null })).toBe(true) // no rows: SUM is NULL
  })
  it('stores a view_opened once per person, view and day', () => {
    expect(keepRow(row('view_opened', 'map'), { c: 0, dup: 0 })).toBe(true)
    expect(keepRow(row('view_opened', 'map'), { c: 2, dup: 1 })).toBe(false)
    expect(keepRow(row('view_opened', 'tree'), { c: 2, dup: 0 })).toBe(true) // another view today
  })
  it('always stores the other events, repeats included', () => {
    expect(keepRow(row('shared', 'post'), { c: 1, dup: 1 })).toBe(true)
    expect(keepRow(row('collage_made', 'inat'), { c: 2, dup: 2 })).toBe(true)
  })
  it('stops every event at the daily cap', () => {
    expect(keepRow(row('collage_made', 'inat'), { c: DAILY_CAP - 1, dup: 0 })).toBe(true)
    expect(keepRow(row('collage_made', 'inat'), { c: DAILY_CAP, dup: 0 })).toBe(false)
    expect(keepRow(row('visit', 'about'), { c: DAILY_CAP, dup: 0 })).toBe(false)
  })
})

describe('visits are counted once per person, page and day', () => {
  it.skipIf(!sqlite)('a second identical visit is not stored', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(store(db, { n: 'visit', p: 'landing' })).toBe(true)
    expect(store(db, { n: 'visit', p: 'landing' })).toBe(false)
    expect(store(db, { n: 'visit', p: 'landing', l: 'es' })).toBe(false) // the language doesn't make it a new view
    expect(count(db)).toBe(1)
  })
  it.skipIf(!sqlite)('a different page is stored, and then only once', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(store(db, { n: 'visit', p: 'landing' })).toBe(true)
    expect(store(db, { n: 'visit', p: 'collage' })).toBe(true)
    expect(store(db, { n: 'visit', p: 'collage' })).toBe(false)
    expect(count(db)).toBe(2)
  })
  it.skipIf(!sqlite)('another visitor on the same page is stored, and the same visitor the next day', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(store(db, { n: 'visit', p: 'landing' })).toBe(true)
    expect(store(db, { n: 'visit', p: 'landing' }, { ...ctx, vid: 'other' })).toBe(true)
    expect(store(db, { n: 'visit', p: 'landing' }, { ...ctx, day: '2026-11-16' })).toBe(true)
    expect(count(db)).toBe(3)
  })
  it.skipIf(!sqlite)('a view_opened is stored once per person, view and day, through the same read', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(store(db, { n: 'view_opened', p: 'map' })).toBe(true)
    expect(store(db, { n: 'view_opened', p: 'map' })).toBe(false)
    expect(store(db, { n: 'view_opened', p: 'tree' })).toBe(true)
    expect(store(db, { n: 'view_opened', p: 'map' }, { ...ctx, vid: 'other' })).toBe(true)
    expect(store(db, { n: 'view_opened', p: 'map' }, { ...ctx, day: '2026-11-16' })).toBe(true)
    expect(store(db, { n: 'view_opened', p: 'collage' })).toBe(false) // not on the allow-list
    expect(count(db)).toBe(4)
  })
  it.skipIf(!sqlite)('non-visit events are always stored, repeats included', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(store(db, { n: 'shared', p: 'post' })).toBe(true)
    expect(store(db, { n: 'shared', p: 'post' })).toBe(true)
    expect(store(db, { n: 'collage_made', p: 'inat' })).toBe(true)
    expect(store(db, { n: 'collage_made', p: 'inat' })).toBe(true)
    expect(count(db)).toBe(4)
  })
  it.skipIf(!sqlite)('the daily cap still stops a visitor, and the dedupe reads the (day, vid) index', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    const ins = db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < DAILY_CAP; i++) ins.run(ctx.day, 'collage_made', 'inat', 'MX', 'iphone', 'busy')
    expect(store(db, { n: 'visit', p: 'about' }, { ...ctx, vid: 'busy' })).toBe(false)
    expect(store(db, { n: 'visit', p: 'about' })).toBe(true)
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${SEEN_SQL}`).all(...seenBinds({ ...ctx, name: 'visit', value: 'about', lang: '' }))
    expect(plan.map((r) => String(r.detail)).join(' ')).toContain('events_day_vid')
  })
})

describe('the stats day', () => {
  it('is the UTC date before the cutover, where Pacific is still the day before', () => {
    expect(statsDay(at('2026-11-16T03:00:00Z'))).toBe('2026-11-16') // UTC 16 Nov; Pacific would say 15 Nov
  })
  it('is the Pacific date from the cutover (00:00Z on 17 Nov): 16 Nov until 07:00Z, then 17 Nov', () => {
    expect(statsDay(at('2026-11-17T00:00:00Z'))).toBe('2026-11-16') // UTC says 17 Nov
    expect(statsDay(at('2026-11-17T02:00:00Z'))).toBe('2026-11-16')
    expect(statsDay(at('2026-11-17T06:59:59Z'))).toBe('2026-11-16') // Pacific 23:59:59 on 16 Nov
    expect(statsDay(at('2026-11-17T07:00:00Z'))).toBe('2026-11-17') // Pacific midnight
    expect(statsDay(at('2026-11-18T06:59:59Z'))).toBe('2026-11-17') // Pacific 23:59:59 on 17 Nov
    expect(statsDay(at('2026-11-18T07:00:00Z'))).toBe('2026-11-18')
  })
  it('keeps the cutover at 00:00Z, and Pacific at UTC-7 (1 Nov 2026 onward)', () => {
    expect(CUTOVER).toBe(Date.parse('2026-11-17T00:00:00Z'))
    expect(pacificDay(new Date(CUTOVER))).toBe('2026-11-16')
    expect(pacificDay(at('2026-11-16T07:30:00Z'))).toBe('2026-11-16') // 00:30 on 16 Nov; under UTC-8 it would be 15 Nov
    expect(pacificDay(at('2026-10-31T06:59:59Z'))).toBe('2026-10-30') // 23:59:59 PDT on 30 Oct
    expect(pacificDay(at('2026-10-31T07:00:00Z'))).toBe('2026-10-31') // 00:00 PDT on 31 Oct
  })
})

describe('the cutover in the table', () => {
  const db = () => {
    const d = new sqlite!.DatabaseSync(':memory:')
    d.exec(SCHEMA())
    return d
  }
  const days = (d: Db) => d.prepare('SELECT day FROM events ORDER BY rowid').all().map((r) => r.day)
  it.skipIf(!sqlite)('a visit either side of the cutover on the same Pacific day (16 Nov) is one person-day', () => {
    const d = db()
    const before = { ...ctx, vid: 'p', day: statsDay(at('2026-11-16T23:30:00Z')) } // UTC 16 Nov, before the cutover
    const after = { ...ctx, vid: 'p', day: statsDay(at('2026-11-17T00:30:00Z')) } // Pacific 16 Nov, 16:30, after it
    expect([before.day, after.day]).toEqual(['2026-11-16', '2026-11-16'])
    expect(store(d, { n: 'visit', p: 'landing' }, before)).toBe(true)
    expect(store(d, { n: 'visit', p: 'landing' }, after)).toBe(false) // same person, page and day: not stored again
    expect(count(d)).toBe(1)
  })
  it.skipIf(!sqlite)('from 07:00Z the same person is on the next Pacific day, so a visit is stored again', () => {
    const d = db()
    expect(store(d, { n: 'visit', p: 'landing' }, { ...ctx, vid: 'p', day: statsDay(at('2026-11-17T06:30:00Z')) })).toBe(true) // Pacific 16 Nov
    expect(store(d, { n: 'visit', p: 'landing' }, { ...ctx, vid: 'p', day: statsDay(at('2026-11-17T07:30:00Z')) })).toBe(true) // Pacific 17 Nov
    expect(days(d)).toEqual(['2026-11-16', '2026-11-17'])
  })
  it.skipIf(!sqlite)('the daily cap spans the cutover: a visitor who used it up before it is capped after it, the same Pacific day', () => {
    const d = db()
    const ins = d.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)')
    for (let i = 0; i < DAILY_CAP; i++) ins.run('2026-11-16', 'collage_made', 'inat', 'MX', 'iphone', 'busy') // all before the cutover
    expect(store(d, { n: 'collage_made', p: 'inat' }, { ...ctx, vid: 'busy', day: statsDay(at('2026-11-17T00:30:00Z')) })).toBe(false)
    expect(store(d, { n: 'collage_made', p: 'inat' }, { ...ctx, vid: 'fresh', day: statsDay(at('2026-11-17T00:30:00Z')) })).toBe(true)
  })
  it.skipIf(!sqlite)('the relabel moves the 17 Nov rows the old Worker wrote, and a second run changes nothing', () => {
    const d = db()
    const add = (day: string, vid: string) => d.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)').run(day, 'visit', 'landing', 'MX', 'iphone', vid)
    add('2026-11-16', 'a') // UTC 16 Nov
    add('2026-11-17', 'b') // old Worker, 01:00Z on 17 Nov (UTC date): Pacific 16 Nov evening
    add('2026-11-17', 'c') // old Worker, 05:00Z
    add('2026-11-16', 'd') // new Worker, 06:00Z: already Pacific 16 Nov
    const migration = readFileSync('workers/stats/migrations/2026-11-17-pacific-relabel.sql', 'utf8')
    d.exec(migration)
    expect(days(d)).toEqual(['2026-11-16', '2026-11-16', '2026-11-16', '2026-11-16'])
    d.exec(migration)
    expect(days(d)).toEqual(['2026-11-16', '2026-11-16', '2026-11-16', '2026-11-16'])
  })
})

// POST /e on the Worker, over node:sqlite: the day each beacon is stored under, and one visit per person-day across the cutover.
const adapter = (d: Db) => ({
  prepare(sql: string) {
    let args: unknown[] = []
    const s = {
      bind(...v: unknown[]) { args = v; return s },
      first: async () => d.prepare(sql).get(...args) ?? null,
      run: async () => d.prepare(sql).run(...args),
    }
    return s
  },
  batch: async () => [],
})
describe.skipIf(!sqlite)('POST /e stores the stats day', () => {
  afterEach(() => vi.useRealTimers())
  it('stores the Pacific day across the cutover, and dedupes one person-day from before it into the same day', async () => {
    const d = new sqlite!.DatabaseSync(':memory:')
    d.exec(SCHEMA())
    const env = { DB: adapter(d), SALT_SECRET: 'test-salt' }
    const send = async (when: string, body: unknown) => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(when))
      const req = new Request('https://stats.yusuftaleb.com/e', { method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://everybird.yusuftaleb.com', 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)', 'cf-connecting-ip': '192.0.2.7' } })
      return (await worker.fetch(req, env as never)).status
    }
    expect(await send('2026-11-16T23:30:00Z', { n: 'visit', p: 'landing', received_at: '1900-01-01T00:00:00Z' })).toBe(204) // UTC 16 Nov: stored; client time ignored
    expect(await send('2026-11-17T00:30:00Z', { n: 'visit', p: 'landing' })).toBe(204) // Pacific 16 Nov, after the cutover: the same person-day, not stored again
    expect(await send('2026-11-17T06:30:00Z', { n: 'visit', p: 'landing' })).toBe(204) // still Pacific 16 Nov: not stored again
    expect(await send('2026-11-17T07:30:00Z', { n: 'visit', p: 'landing' })).toBe(204) // Pacific 17 Nov: stored
    expect(await send('2026-11-17T07:31:02.123Z', { n: 'collage_made', p: 'inat' })).toBe(204)
    expect(d.prepare('SELECT day, name, value, received_at FROM events ORDER BY rowid').all()).toEqual([
      { day: '2026-11-16', name: 'visit', value: 'landing', received_at: '2026-11-16T23:30:00.000Z' },
      { day: '2026-11-17', name: 'visit', value: 'landing', received_at: '2026-11-17T07:30:00.000Z' },
      { day: '2026-11-17', name: 'collage_made', value: 'inat', received_at: '2026-11-17T07:31:02.123Z' },
    ])
  })

  it('adds nullable timestamps without inventing old times, and both old and new Workers can write', async () => {
    const d = new sqlite!.DatabaseSync(':memory:')
    d.exec(SCHEMA().replace(/, -- visit only[^\n]*\n  received_at TEXT[^\n]*/, ' -- visit only: browser language'))
    const oldInsert = () => d.prepare('INSERT INTO events (day, name, value, country, device, vid, lang) VALUES (?, ?, ?, ?, ?, ?, ?)').run('2026-11-16', 'visit', 'landing', 'MX', 'iphone', 'legacy', '')
    oldInsert()
    d.exec(readFileSync('workers/stats/migrations/2026-11-17-event-timestamps.sql', 'utf8'))
    oldInsert() // rolling deploy: the previous Worker still works after migration
    expect(d.prepare('SELECT received_at FROM events').all()).toEqual([{ received_at: null }, { received_at: null }])
    expect(indexes(d)).toEqual(['events_day_vid'])
    const req = new Request('https://stats.yusuftaleb.com/e', { method: 'POST', body: JSON.stringify({ n: 'visit', p: 'about' }) })
    expect((await worker.fetch(req, { DB: adapter(d), SALT_SECRET: 'test' } as never)).status).toBe(204)
    const rows = d.prepare('SELECT received_at FROM events WHERE received_at IS NOT NULL').all()
    expect(rows).toHaveLength(1)
    expect(new Date(rows[0].received_at as string).toISOString()).toBe(rows[0].received_at)
  })
})

describe('the events indexes', () => {
  it('the drop migration is the one file, and it only drops events_day_name', () => {
    const drops = readdirSync('workers/stats/migrations').filter((f) => /^\d{4}-\d{2}-\d{2}-drop-.*\.sql$/.test(f))
    expect(drops).toEqual(['2026-11-16-drop-day-name-index.sql'])
    const statements = readFileSync(`workers/stats/migrations/${drops[0]}`, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('--'))
    expect(statements).toEqual(['DROP INDEX IF EXISTS events_day_name;'])
  })
  it.skipIf(!sqlite)('a fresh schema.sql has only events_day_vid', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    expect(indexes(db)).toEqual(['events_day_vid'])
  })
  it.skipIf(!sqlite)('on the live table (with events_day_name) the migration drops it, keeps the rows and events_day_vid, and can run again', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(SCHEMA())
    db.exec('CREATE INDEX events_day_name ON events (day, name)') // the live table before the migration
    db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)').run(ctx.day, 'visit', 'landing', 'MX', 'iphone', 'abc123')
    db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)').run(ctx.day, 'shared', 'post', 'MX', 'iphone', 'abc123')
    expect(indexes(db)).toEqual(['events_day_name', 'events_day_vid'])
    const migration = readFileSync('workers/stats/migrations/2026-11-16-drop-day-name-index.sql', 'utf8')
    db.exec(migration)
    expect(indexes(db)).toEqual(['events_day_vid'])
    expect(count(db)).toBe(2)
    db.exec(migration) // IF EXISTS: a second run is harmless
    expect(indexes(db)).toEqual(['events_day_vid'])
  })
})
