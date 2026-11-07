// POST /e  body: {"n":"collage_made","p":"inat"}  (n = event name, p = one property value)
// Only these events and values are accepted; anything else is dropped. Country comes from Cloudflare's
// request metadata (coarse, no IP is stored). Device class is derived from the User-Agent and only the
// class is kept ("mobile" | "desktop").
const ALLOWED: Record<string, Set<string>> = {
  visit: new Set(['landing', 'collage', 'settings', 'about', 'shared']),
  collage_made: new Set(['ebird', 'ebird-list', 'inat', 'manual', 'sample', 'restore', 'mixed']),
  image_downloaded: new Set(['story', 'post', 'square']),
  shared: new Set(['story', 'post', 'square', 'link']),
  link_copied: new Set(['full', 'compact', 'minimal', 'species']),
}
const ORIGINS = new Set(['https://everybird.yusuftaleb.com', 'http://localhost:3000', 'http://localhost:3001'])

interface Env { DB: D1Database; SALT_SECRET: string }

const DAILY_CAP = 200 // events per anonymous visitor per day; beyond this they're dropped (spam guard)

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('')
/** An anonymous visitor id that changes every UTC day: HMAC(secret, day) keys a hash of IP + User-Agent.
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

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('origin')
    const h = cors(origin)
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h })
    const url = new URL(req.url)
    if (req.method !== 'POST' || url.pathname !== '/e') return new Response('not found', { status: 404, headers: h })
    if (origin && !ORIGINS.has(origin)) return new Response(null, { status: 204, headers: h })
    let body: { n?: unknown; p?: unknown; d?: unknown }
    try { body = JSON.parse((await req.text()).slice(0, 512)) } catch { return new Response(null, { status: 204, headers: h }) }
    const n = typeof body.n === 'string' ? body.n : ''
    const p = typeof body.p === 'string' ? body.p : ''
    if (!ALLOWED[n] || !ALLOWED[n].has(p)) return new Response(null, { status: 204, headers: h })
    const country = (req as Request & { cf?: { country?: string } }).cf?.country ?? 'XX'
    let device = deviceClass(req.headers.get('user-agent') ?? '')
    if (device === 'mac' && body.d === 'touch') device = 'ipad' // iPadOS 13+ sends a Mac UA
    const day = new Date().toISOString().slice(0, 10)
    const vid = await dailyVisitorId(env.SALT_SECRET ?? '', day, req.headers.get('cf-connecting-ip') ?? '', req.headers.get('user-agent') ?? '')
    const seen = await env.DB.prepare('SELECT COUNT(*) AS c FROM events WHERE day = ? AND vid = ?').bind(day, vid).first<{ c: number }>()
    if ((seen?.c ?? 0) >= DAILY_CAP) return new Response(null, { status: 204, headers: h })
    await env.DB.prepare('INSERT INTO events (day, name, value, country, device, vid) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(day, n, p, country, device, vid).run()
    return new Response(null, { status: 204, headers: h })
  },
}
