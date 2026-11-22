// POST /e  body: {"n":"collage_made","p":"inat"}  (n = event name, p = one property value; a visit may add
// l = the browser language's primary subtag, e.g. "es"). Only the events and values in ALLOWED (event.ts) are
// accepted; anything else is dropped. Country comes from Cloudflare's request metadata (coarse, no IP is stored).
// Device class is derived from the User-Agent and only the class is kept. A visit is stored once per visitor, page
// and day (see keepRow in event.ts); the daily cap and that check share one indexed read (SEEN_SQL).
import { SEEN_SQL, eventRow, keepRow, pacificDay, seenBinds, statsDay } from './event'
import { fetchTeamJwks, verifyAccess, type AccessEnv, type JwksFetch } from './access'
import { parseParams, shape, statements, type Row } from './dashboard'
import { PAGE } from './page'
import { parseWorkspace, shapeWorkspace, workspaceStatements } from './workspace'

const ORIGINS = new Set(['https://everybird.yusuftaleb.com', 'http://localhost:3000', 'http://localhost:3001'])

// The slice of D1 this Worker uses, typed here so the app's unit tests can import this file without the Workers types.
interface D1Stmt { bind(...v: unknown[]): D1Stmt; first<T>(): Promise<T | null>; run(): Promise<unknown> }
interface D1Like { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<{ results?: unknown[] }[]> }
interface Env extends AccessEnv { DB: D1Like; SALT_SECRET: string }

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
/** An anonymous visitor id that changes every stats day (statsDay): HMAC(secret, day) keys a hash of IP + User-Agent.
 *  Neither the IP nor the User-Agent is stored, and ids from different days can't be linked. */
async function dailyVisitorId(secret: string, day: string, ip: string, ua: string): Promise<string> {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const daySalt = await crypto.subtle.sign('HMAC', k, enc.encode(day))
  const id = await crypto.subtle.digest('SHA-256', enc.encode(hex(daySalt) + '|' + ip + '|' + ua))
  return hex(id).slice(0, 16)
}

/** A coarse device class from the User-Agent: iphone, ipad, android-phone, android-tablet, other-tablet, other-phone,
 *  mac, windows, linux, chromeos, other. Only the class is stored, never the User-Agent itself. iPadOS 13+ reports a
 *  desktop Mac UA, so a Mac UA with touch hints (sent by the app as p2) is not distinguishable here; see the app. */
function deviceClass(ua: string): string {
  if (/iPhone|iPod/.test(ua)) return 'iphone'
  if (/iPad/.test(ua)) return 'ipad'
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'android-phone' : 'android-tablet'
  if (/Tablet|Silk|Kindle|PlayBook/i.test(ua)) return 'other-tablet'
  if (/Mobi|Opera Mini|IEMobile|BlackBerry/i.test(ua)) return 'other-phone'
  if (/CrOS/.test(ua)) return 'chromeos'
  if (/Macintosh|Mac OS X/.test(ua)) return 'mac'
  if (/Windows/.test(ua)) return 'windows'
  if (/Linux/.test(ua)) return 'linux'
  return 'other'
}

function cors(origin: string | null): Record<string, string> {
  const o = origin && ORIGINS.has(origin) ? origin : 'https://everybird.yusuftaleb.com'
  return { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'origin' }
}

const SECURE = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-robots-tag': 'noindex' }

/** GET /dashboard and /dashboard/data, only for a valid Cloudflare Access identity on the allow-list; anything else is the same 404 as any unknown path. */
async function dashboard(req: Request, env: Env, url: URL, notFound: () => Response, jwks: JwksFetch): Promise<Response> {
  const email = await verifyAccess(req.headers.get('cf-access-jwt-assertion'), env, jwks)
  if (!email) return notFound()
  if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') {
    return new Response(PAGE, { headers: { ...SECURE, 'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } })
  }
  if (url.searchParams.get('workspace') === '1') {
    const today = pacificDay(new Date()), p = parseWorkspace(url.searchParams, today)
    if (typeof p === 'string') return Response.json({ error: p }, { status: 400, headers: { ...SECURE, 'cache-control': 'no-store' } })
    try {
      const out = await env.DB.batch(workspaceStatements(p).map((s) => env.DB.prepare(s.sql).bind(...s.binds)))
      return Response.json(shapeWorkspace(p, out.map((r) => (r.results ?? []) as Row[]), today), { headers: { ...SECURE, 'cache-control': 'private, max-age=60' } })
    } catch {
      return Response.json({ error: 'Analytics could not be refreshed. Try again shortly.' }, { status: 503, headers: { ...SECURE, 'cache-control': 'no-store' } })
    }
  }
  const p = parseParams(url.searchParams, pacificDay(new Date())) // "today" is the Pacific date, always (the default range ends there)
  if (typeof p === 'string') return Response.json({ error: p }, { status: 400, headers: { ...SECURE, 'cache-control': 'no-store' } })
  const stmts = statements(p)
  const out = await env.DB.batch(stmts.map((s) => env.DB.prepare(s.sql).bind(...s.binds)))
  return Response.json(shape(p, out.map((r) => (r.results ?? []) as Row[])), { headers: { ...SECURE, 'cache-control': 'private, max-age=60' } })
}

export default {
  async fetch(req: Request, env: Env, _ctx?: unknown, jwks: JwksFetch = fetchTeamJwks): Promise<Response> {
    const origin = req.headers.get('origin')
    const h = cors(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
    const url = new URL(req.url)
    const notFound = () => new Response('not found', { status: 404, headers: h })
    if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname === '/dashboard/' || url.pathname === '/dashboard/data')) return dashboard(req, env, url, notFound, jwks)
    if (req.method !== 'POST' || url.pathname !== '/e') return new Response('not found', { status: 404, headers: h })
    if (origin && !ORIGINS.has(origin)) return new Response(null, { status: 204, headers: h })
    const received = new Date() // server clock, before reading/hashing; never trust a timestamp in the beacon
    let body: { n?: unknown; p?: unknown; d?: unknown; l?: unknown }
    try { body = JSON.parse((await req.text()).slice(0, 512)) } catch { return new Response(null, { status: 204, headers: h }) }
    // Check the allow-list before hashing anything; the real row is built below with the context.
    if (!eventRow(body, { day: '', country: '', device: '', vid: '' })) return new Response(null, { status: 204, headers: h })
    const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? 'XX'
    let device = deviceClass(req.headers.get('user-agent') ?? '')
    if (device === 'mac' && body.d === 'touch') device = 'ipad' // iPadOS 13+ sends a Mac UA
    const day = statsDay(received) // use the same instant for the stats day and timestamp
    const vid = await dailyVisitorId(env.SALT_SECRET ?? '', day, req.headers.get('cf-connecting-ip') ?? '', req.headers.get('user-agent') ?? '')
    const row = eventRow(body, { day, country, device, vid })!
    const seen = await env.DB.prepare(SEEN_SQL).bind(...seenBinds(row)).first<{ c: number | null; dup: number | null }>()
    if (!keepRow(row, seen ?? { c: 0, dup: 0 })) return new Response(null, { status: 204, headers: h })
    await env.DB.prepare('INSERT INTO events (day, name, value, country, device, vid, lang, received_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(row.day, row.name, row.value, row.country, row.device, row.vid, row.lang, received.toISOString()).run()
    return new Response(null, { status: 204, headers: h })
  },
}
