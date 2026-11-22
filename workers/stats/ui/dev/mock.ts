// The dev server's stand-in for GET /dashboard/data?workspace=1: a seeded, synthetic events table (no real data) in an
// in-memory node:sqlite database on the Worker's schema, queried with the Worker's own parseWorkspace, workspaceStatements
// and shapeWorkspace, so the console sees exactly the shapes and rules production returns.
// MOCK_STATE=error | expired | empty | slow (npm run dev with it set) previews the console's other states.
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { pacificDay } from '../../src/event'
import type { Row } from '../../src/dashboard'
import { parseWorkspace, shapeWorkspace, workspaceStatements } from '../../src/workspace'

const here = path.dirname(fileURLToPath(import.meta.url))

function rng(seed: number) {
  return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}
const shift = (d: string, n: number) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

function seed(db: DatabaseSync, today: string) {
  const r = rng(20261117)
  const pick = <T,>(xs: [T, number][]): T => { let x = r() * xs.reduce((a, [, w]) => a + w, 0); for (const [v, w] of xs) { if ((x -= w) <= 0) return v } return xs[0][0] }
  const countries: [string, number][] = [['US', 30], ['CA', 14], ['GB', 10], ['AU', 8], ['MX', 6], ['DE', 5], ['NL', 5], ['BR', 4], ['ES', 4], ['FR', 3], ['IN', 3], ['ZA', 2], ['NZ', 2], ['JP', 1], ['CR', 1], ['XX', 1]]
  const devices: [string, number][] = [['iphone', 30], ['mac', 22], ['windows', 18], ['android-phone', 14], ['ipad', 5], ['linux', 3], ['android-tablet', 2], ['chromeos', 2], ['other-phone', 1], ['other-tablet', 1], ['other', 2]]
  const langs: [string, number][] = [['en', 70], ['es', 10], ['pt', 6], ['nl', 6], ['de', 4], ['', 4]]
  const ins = db.prepare('INSERT INTO events (day, name, value, country, device, vid, lang, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
  const launch = shift(today, -52)
  db.exec('BEGIN')
  for (let i = 0, day = launch; day <= today; i++, day = shift(day, 1)) {
    const weekday = new Date(day + 'T00:00:00Z').getUTCDay()
    const spike = day === shift(launch, 20) ? 3 : 1
    const n = Math.round((25 + i * 1.6 + (weekday === 0 || weekday === 6 ? 12 : 0)) * spike * (0.8 + r() * 0.4) * (day === today ? 0.45 : 1))
    const timed = day >= '2026-11-17'
    for (let v = 0; v < n; v++) {
      const vid = r() < 0.01 ? '' : 'syn' + i + '-' + v, country = pick(countries), device = pick(devices), lang = pick(langs)
      const hour = Math.min(23, Math.max(0, Math.round(13 + (r() - 0.5) * 14 + (r() - 0.5) * 6)))
      const at = (extra = 0) => timed ? new Date(Date.parse(day + 'T00:00:00Z') + (hour + 7) * 3600000 + Math.floor(r() * 3600000) + extra).toISOString() : null
      const add = (name: string, value: string, l = '') => ins.run(day, name, value, country, device, vid, l, at())
      add('visit', r() < 0.75 ? 'landing' : pick([['shared', 3], ['about', 1]] as [string, number][]), lang)
      if (r() < 0.45) add('visit', 'settings', lang)
      if (r() < 0.35) {
        add('visit', 'collage', lang)
        add('collage_made', pick([['ebird', 40], ['ebird-list', 10], ['inat', 25], ['obsorg', 5], ['manual', 10], ['mixed', 6], ['restore', 4]] as [string, number][]))
        if (r() < 0.5) add('image_downloaded', pick([['story', 5], ['post', 3], ['square', 2], ['desktop', 1], ['wide', 1]] as [string, number][]))
        if (r() < 0.12) { add('poster_made', pick([['a2', 4], ['a3', 3], ['a4', 2], ['a1', 1], ['a3-l', 1]] as [string, number][])); if (r() < 0.7) add('poster_downloaded', r() < 0.6 ? 'png' : 'pdf') }
        if (r() < 0.15) add('shared', pick([['story', 3], ['post', 2], ['link', 2], ['square', 1]] as [string, number][]))
        if (r() < 0.12) add('link_copied', pick([['full', 4], ['compact', 2], ['minimal', 1], ['species', 1]] as [string, number][]))
        if (r() < 0.3) add('filter_used', pick([['place', 4], ['time', 3], ['continent', 2], ['status', 2], ['group', 1], ['taxonomy', 2]] as [string, number][]))
        if (r() < 0.15) add('search_applied', r() < 0.4 ? 'smart' : 'bird')
      } else if (r() < 0.25) add('collage_made', 'sample')
      if (r() < 0.02) add('ui_language', pick([['es', 3], ['pt', 2], ['nl', 2], ['en', 1]] as [string, number][]))
    }
  }
  db.exec('COMMIT')
}

let db: DatabaseSync | null = null
let seededFor = ''
function database(today: string) {
  if (!db || seededFor !== today) {
    db = new DatabaseSync(':memory:')
    db.exec(readFileSync(path.resolve(here, '../../schema.sql'), 'utf8'))
    if (process.env.MOCK_STATE !== 'empty') seed(db, today)
    seededFor = today
  }
  return db
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', status === 200 ? 'private, max-age=60' : 'no-store')
  res.end(JSON.stringify(body))
}

export function workspaceMock() {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    if (url.pathname !== '/dashboard/data') return next()
    const state = process.env.MOCK_STATE
    if (state === 'expired') { res.statusCode = 200; res.setHeader('content-type', 'text/html'); res.end('<!doctype html><title>Sign in</title>'); return }
    if (state === 'error') return json(res, 503, { error: 'Analytics could not be refreshed. Try again shortly.' })
    if (url.searchParams.get('workspace') !== '1') return json(res, 400, { error: 'The dev mock answers workspace queries only.' })
    const today = pacificDay(new Date()), p = parseWorkspace(url.searchParams, today)
    if (typeof p === 'string') return json(res, 400, { error: p })
    const d = database(today)
    const results = workspaceStatements(p).map((s) => d.prepare(s.sql).all(...s.binds) as Row[])
    const body = shapeWorkspace(p, results, today)
    setTimeout(() => json(res, 200, body), state === 'slow' ? 2500 : 150)
  }
}
