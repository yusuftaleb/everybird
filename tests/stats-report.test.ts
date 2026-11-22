import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { ALLOWED as APP_ALLOWED } from '@/lib/analytics'
import { EVENTS, LANG_COLUMN_SQL, buildQueries, daysAgo, formatReport, parseArgs, parseHasLang, parseWrangler, table, wranglerArgs, type Results } from '../scripts/stats/report'

const NOW = new Date('2026-11-06T12:00:00Z')

// node:sqlite (Node 22.5+; @types/node 20 doesn't know it): the Worker's schema runs the report's SQL for real.
type Db = { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; all(): Record<string, string | number | null>[] } }
const sqlite = (() => {
  try {
    return createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => Db }
  } catch {
    return null
  }
})()

describe('parseArgs', () => {
  it('defaults to the last 30 days and the top 5 countries', () => {
    expect(parseArgs([], NOW)).toEqual({ since: '2026-10-07', top: 5, printSql: false })
    expect(daysAgo(0, NOW)).toBe('2026-11-06')
    // Pacific, not UTC: at 03:00Z on 17 Nov it is still 16 Nov in Vancouver (UTC would say 17 Nov).
    expect(daysAgo(0, new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-16')
    expect(daysAgo(1, new Date('2026-11-17T03:00:00Z'))).toBe('2026-11-15')
    expect(parseArgs(['--since', '2026-11-01', '--top', '10', '--print-sql'], NOW)).toEqual({ since: '2026-11-01', top: 10, printSql: true })
  })
  it('refuses anything that is not a plain date or count (they go into the SQL text)', () => {
    for (const bad of [["--since", "2026-11-01' OR 1=1 --"], ['--since', '11/01/2026'], ['--since', '2026-13-45'], ['--top', '0'], ['--top', '5; DROP TABLE events'], ['--x']]) {
      expect(() => parseArgs(bad, NOW), bad.join(' ')).toThrow()
    }
  })
})

describe('buildQueries', () => {
  it('filters every statement by day and counts people with distinct non-empty vids', () => {
    const qs = buildQueries('2026-11-01', 5)
    expect(qs.map((q) => q.name)).toEqual(['visitors', 'visitsByDay', 'byValue', 'people', 'byDevice', 'countries', 'byLanguage'])
    for (const q of qs) expect(q.sql).toContain("day >= '2026-11-01'")
    expect(qs.find((q) => q.name === 'visitors')!.sql).toContain("COUNT(DISTINCT NULLIF(vid, ''))")
    expect(qs.find((q) => q.name === 'countries')!.sql).toContain('rk <= 5')
    expect(wranglerArgs('SELECT 1')).toEqual(['wrangler', 'd1', 'execute', 'everybird-events', '--remote', '--json', '--command', 'SELECT 1'])
    expect(() => buildQueries("x' --", 5)).toThrow()
  })

  it.skipIf(!sqlite)("runs on the Worker's own schema (SQLite, as D1) and adds up", () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(readFileSync('workers/stats/schema.sql', 'utf8'))
    const ins = db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)')
    const rows: [string, string, string, string, string, string][] = [
      ['2026-10-31', 'visit', 'landing', 'US', 'mac', 'old'], // before --since
      ['2026-11-01', 'visit', 'landing', 'US', 'iphone', 'a1'],
      ['2026-11-01', 'visit', 'settings', 'US', 'iphone', 'a1'],
      ['2026-11-01', 'collage_made', 'ebird', 'US', 'iphone', 'a1'],
      ['2026-11-01', 'visit', 'shared', 'GB', 'mac', 'b1'],
      ['2026-11-01', 'visit', 'about', 'DE', 'windows', ''], // a row from before ids
      ['2026-11-02', 'visit', 'collage', 'US', 'iphone', 'a2'],
      ['2026-11-02', 'image_downloaded', 'story', 'US', 'iphone', 'a2'],
      ['2026-11-02', 'image_downloaded', 'square', 'US', 'iphone', 'a2'],
      ['2026-11-02', 'link_copied', 'compact', 'GB', 'ipad', 'c2'],
      ['2026-11-02', 'shared', 'post', 'GB', 'ipad', 'c2'],
    ]
    for (const r of rows) ins.run(...r)
    const qs = buildQueries('2026-11-01', 2)
    const r = Object.fromEntries(qs.map((q) => [q.name, db.prepare(q.sql).all()])) as Results
    expect(r.visitors).toEqual([{ day: '2026-11-01', visitors: 2, events: 5 }, { day: '2026-11-02', visitors: 2, events: 5 }])
    expect(r.people.find((p) => p.name === 'image_downloaded')).toEqual({ name: 'image_downloaded', people: 1, events: 2, repeat_people: 1, max_events: 2 })
    expect(r.people.find((p) => p.name === 'visit')).toMatchObject({ people: 3, events: 4, repeat_people: 1 }) // the '' row isn't a person
    expect(r.countries.filter((c) => c.name === 'visit')).toEqual([{ name: 'visit', country: 'US', n: 3, people: 2 }, { name: 'visit', country: 'DE', n: 1, people: 0 }])
    const text = formatReport(r, { since: '2026-11-01', top: 2 })
    expect(text).toContain('Collages made')
    expect(text).toMatch(/compact \(countries\)\s+1\s+1\s+1/)
    expect(text).toContain('people 1 · events per person 2.00 · with 2+ 1 · most by one 2')
    expect(text).not.toContain('2026-10-31')
    expect(r.byLanguage).toEqual([{ lang: '', people: 3, visits: 5 }]) // rows written without lang take the default
  })

  // The table as the live database has it before migrations/2026-11-15-lang.sql (schema.sql before the lang column).
  const OLD_CREATE = `CREATE TABLE IF NOT EXISTS events (day TEXT NOT NULL, name TEXT NOT NULL, value TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, vid TEXT NOT NULL DEFAULT '');`

  it.skipIf(!sqlite)('works before the lang migration: the column check says no, the language query is left out, the report says so', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(OLD_CREATE)
    expect(parseHasLang(JSON.stringify([{ results: db.prepare(LANG_COLUMN_SQL).all() }]))).toBe(false)
    db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)').run('2026-11-14', 'filter_used', 'place', 'US', 'mac', 'x1')
    const qs = buildQueries('2026-11-01', 5, false)
    expect(qs.map((q) => q.name)).not.toContain('byLanguage')
    const r = Object.fromEntries(qs.map((q) => [q.name, db.prepare(q.sql).all()])) as Results // every statement runs without lang
    const text = formatReport(r, { since: '2026-11-01', top: 5 })
    expect(text).toContain('Visitors by browser language\nnot recorded yet')
    expect(text).toMatch(/Filters used[^\n]*\nvalue\s+events\s+people/)
    expect(() => db.prepare(buildQueries('2026-11-01', 5).find((q) => q.name === 'byLanguage')!.sql).all()).toThrow(/lang/)
    // After the migration the check finds it.
    db.exec(readFileSync('workers/stats/migrations/2026-11-15-lang.sql', 'utf8'))
    expect(parseHasLang(JSON.stringify([{ results: db.prepare(LANG_COLUMN_SQL).all() }]))).toBe(true)
  })

  it('lists every event the Worker accepts', () => {
    expect([...EVENTS].sort()).toEqual(Object.keys(APP_ALLOWED).sort())
  })

  it.skipIf(!sqlite)('the lang migration runs on the old table, keeps its rows, and byLanguage counts visits by browser language', () => {
    const db = new sqlite!.DatabaseSync(':memory:')
    db.exec(OLD_CREATE)
    db.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)').run('2026-11-14', 'visit', 'landing', 'US', 'mac', 'old1')
    db.exec(readFileSync('workers/stats/migrations/2026-11-15-lang.sql', 'utf8'))
    const ins = db.prepare('INSERT INTO events (day, name, value, country, device, vid, lang) VALUES (?, ?, ?, ?, ?, ?, ?)')
    const rows: [string, string, string, string, string, string, string][] = [
      ['2026-11-13', 'visit', 'landing', 'MX', 'iphone', 'gone', 'es'], // before --since
      ['2026-11-15', 'visit', 'landing', 'MX', 'iphone', 'e1', 'es'],
      ['2026-11-15', 'visit', 'settings', 'MX', 'iphone', 'e1', 'es'],
      ['2026-11-15', 'visit', 'landing', 'ES', 'mac', 'e2', 'es'],
      ['2026-11-15', 'visit', 'landing', 'BR', 'android-phone', 'p1', 'pt'],
      ['2026-11-15', 'collage_made', 'ebird', 'BR', 'android-phone', 'p1', ''], // not a visit
    ]
    for (const r of rows) ins.run(...r)
    const q = buildQueries('2026-11-14', 5).find((x) => x.name === 'byLanguage')!
    const got = db.prepare(q.sql).all()
    expect(got[0]).toEqual({ lang: 'es', people: 2, visits: 3 }) // most people first; the tie below in any order
    const byLang = (a: Record<string, unknown>, b: Record<string, unknown>) => String(a.lang).localeCompare(String(b.lang))
    expect([...got].sort(byLang)).toEqual([{ lang: '', people: 1, visits: 1 }, { lang: 'es', people: 2, visits: 3 }, { lang: 'pt', people: 1, visits: 1 }])
    // schema.sql (a fresh database) has the same column.
    const fresh = new sqlite!.DatabaseSync(':memory:')
    fresh.exec(readFileSync('workers/stats/schema.sql', 'utf8'))
    fresh.prepare('INSERT INTO events (day, name, value, country, device, vid, lang) VALUES (?, ?, ?, ?, ?, ?, ?)').run('2026-11-15', 'visit', 'about', 'NL', 'mac', 'n1', 'nl')
    expect(fresh.prepare(q.sql).all()).toEqual([{ lang: 'nl', people: 1, visits: 1 }])
  })
})

describe('the report', () => {
  const fake = JSON.stringify([
    { results: [{ day: '2026-11-01', visitors: 3, events: 7 }], success: true },
    { results: [{ day: '2026-11-01', value: 'landing', n: 3 }, { day: '2026-11-01', value: 'collage', n: 2 }], success: true },
    { results: [{ name: 'visit', value: 'landing', events: 3, people: 3 }, { name: 'visit', value: 'collage', events: 2, people: 1 }, { name: 'collage_made', value: 'inat', events: 2, people: 2 }], success: true },
    { results: [{ name: 'visit', people: 3, events: 5, repeat_people: 1, max_events: 3 }, { name: 'collage_made', people: 2, events: 2, repeat_people: 0, max_events: 1 }], success: true },
    {
      results: [
        { name: 'visit', value: 'landing', device: 'iphone', n: 2 }, { name: 'visit', value: 'landing', device: 'mac', n: 1 },
        { name: 'visit', value: 'collage', device: 'mac', n: 2 }, { name: 'collage_made', value: 'inat', device: 'android-phone', n: 2 },
      ],
      success: true,
    },
    { results: [{ name: 'visit', country: 'US', n: 4, people: 2 }, { name: 'visit', country: 'BR', n: 1, people: 1 }], success: true },
    { results: [{ lang: 'en', people: 2, visits: 3 }, { lang: '', people: 1, visits: 1 }, { lang: 'pt', people: 1, visits: 1 }], success: true },
  ])
  const names = buildQueries('2026-11-01', 5).map((q) => q.name)

  it("reads wrangler's --json output, one result per statement", () => {
    const r = parseWrangler(fake, names)
    expect(r.visitors).toHaveLength(1)
    expect(() => parseWrangler(JSON.stringify([{ results: [] }]), names)).toThrow(/1 results for 7/)
  })

  it('prints compact tables: visitors by day, then each event by value and device, people, repeats and countries', () => {
    const text = formatReport(parseWrangler(fake, names), { since: '2026-11-01', top: 5 })
    expect(text).toBe([
      'Everybird stats since 2026-11-01 (days are Pacific time from 17 Nov 2026; earlier days are UTC days).People are anonymous daily ids: over several days, person-days. Visits count once per person, page and day from the 2026-11-16 deploy on; rows stored before it count every view.',
      '',
      'Visitors by day',
      'day         visitors  landing  collage  settings  about  shared  compare  compare-shared  all events',
      '----------  --------  -------  -------  --------  -----  ------  -------  --------------  ----------',
      '2026-11-01         3        3        2         0      0       0        0               0           7',
      'total                       3        2         0      0       0        0               0           7',
      '',
      'Visitors by browser language',
      'language  people  visits',
      '--------  ------  ------',
      'en             2       3',
      'unknown        1       1',
      'pt             1       1',
      '',
      'Page views (visit: once per person, page and day)',
      'value    events  people  mac  iphone',
      '-------  ------  ------  ---  ------',
      'landing       3       3    1       2',
      'collage       2       1    2       0',
      'people 3 · events per person 1.67 · with 2+ 1 · most by one 3',
      'top countries: US 4, BR 1',
      '',
      'Collages made (collage_made, by source)',
      'value  events  people  android-phone',
      '-----  ------  ------  -------------',
      'inat        2       2              2',
      'people 2 · events per person 1.00 · with 2+ 0 · most by one 1',
      '',
      'Images downloaded (image_downloaded, by format)',
      '(none)',
      '',
      'Shared through the share sheet (shared)',
      '(none)',
      '',
      'Links copied (link_copied, by level)',
      '(none)',
      '',
      'UI language switched to (ui_language)',
      '(none)',
      '',
      'Posters made (poster_made, by size)',
      '(none)',
      '',
      'Posters downloaded (poster_downloaded, by format)',
      '(none)',
      '',
      'Searches applied (search_applied: smart filters or a bird)',
      '(none)',
      '',
      'Filters used (filter_used, once per kind per page load)',
      '(none)',
      '',
      'Comparisons made (compare_made, by number of lists)',
      '(none)',
      '',
      'What the images showed (image_view, one per image downloaded or shared)',
      '(none)',
      '',
      'Views opened (view_opened: once per person, view and day)',
      '(none)',
      '',
      'Batches exported (batch_exported, by split)',
      '(none)',
    ].join('\n'))
  })

  it('aligns tables: the first column left, numbers right', () => {
    expect(table(['a', 'n'], [['xyz', 1], ['b', 100]])).toBe('a      n\n---  ---\nxyz    1\nb    100')
  })
})
