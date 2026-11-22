// Writes the Map view's shapes, pre-projected SVG paths (the app ships no projection code and makes no map requests):
//   public/data/map-countries.v1.json  { v, w, h, d: { <country id>: path } }  the world, Equal Earth
// Country ids are the Places filter's (`c:` keys without the prefix): ISO 3166-1 codes from Natural Earth's ISO_A2_EH,
// plus, painted over their country, the parts that are their own place: eBird's GF, GP, MQ, RE and YT (Natural Earth
// draws them inside France), the `<country>@<continent>` parts (US@OC, Hawaii) and OWN_SHAPE's places (Svalbard, Bonaire),
// from the admin-1 shapes.
// The admin-1 features are matched by the app's canonical sub1 ids (regions.v1.json): Natural Earth's iso_3166_2,
// rolled up by SUB1_PARENT (French departments to their region). Coordinates are quantised before simplification, so
// neighbours keep identical borders: tenths of a unit (WORLD_Q, so the coasts hold up when the map is zoomed).
// Source: Natural Earth 1:50m countries and 1:10m states and provinces (public domain), which fetch-sources.ts downloads.
// Run: DATA_RAW=<data/raw> npx tsx scripts/build-data/build-map.ts, then npx tsx scripts/build-data/data-files.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { geoEqualEarth, type GeoProjection } from 'd3-geo'
import { SUB1_PARENT } from '../../src/lib/import/sub1-parents'
import { parentKey } from '../../src/lib/list/place-keys'

const ROOT = resolve(__dirname, '../..')
const RAW = resolve(ROOT, process.env.DATA_RAW ?? 'data/raw')
const OUT_COUNTRIES = resolve(ROOT, 'public/data/map-countries.v1.json')

const WORLD_W = 2000 // the world layer's width in units (Equal Earth's height follows)
/** Steps per unit: the world keeps tenths of a unit (about 2 km at the equator, the 1:50m source's own precision, so its
 * coasts hold up when the map is zoomed). */
const WORLD_Q = 10
const EPS = 1 // Douglas-Peucker tolerance, in steps (the world: 0.1 unit, under a pixel at the Map's deepest zoom)
const MIN_AREA = 2 // loops under this (steps²: the world's 0.02 units², about 8 km²) are dropped
const GZIP_BUDGET = 250_000
/** Natural Earth features with no ISO code that are part of a country eBird lists. */
const NO_ISO: Record<string, string> = { Somaliland: 'SO', 'N. Cyprus': 'QY' }
/** Places the app lists as countries that Natural Earth has only as admin-1 features (by name): drawn as their own
 * shape and carved out of whichever country drew them. Coral Sea Islands, Clipperton and the rest are reefs and atolls,
 * so most end as the 2-unit dot. High Seas (XX) has no shape. */
const OWN_SHAPE: Record<string, string> = {
  Svalbard: 'SJ', 'Bouvet Island': 'BV', Bonaire: 'BQ', Saba: 'BQ', 'St. Eustatius': 'BQ', Gibraltar: 'GI', Tokelau: 'TK',
  'Cocos (Keeling) Islands': 'CC', 'Christmas Island': 'CX', 'Clipperton Island': 'CP', 'Ashmore and Cartier Islands': 'AC',
  'Coral Sea Islands': 'CS', Akrotiri: 'QZ', Dhekelia: 'QZ',
}

type Pt = [number, number]
type Poly = Pt[][] // rings, the first the outer
type Feature = { properties: Record<string, string>; geometry: { type: string; coordinates: Pt[][] | Pt[][][] } | null }

const polysOf = (f: Feature): Poly[] =>
  !f.geometry ? [] : f.geometry.type === 'Polygon' ? [f.geometry.coordinates as Pt[][]] : f.geometry.type === 'MultiPolygon' ? (f.geometry.coordinates as Pt[][][]) : []

function signedArea(r: Pt[]): number {
  let a = 0
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1]
  return a / 2
}

/** Projected, scaled, rounded rings: outer rings one way round, holes the other (so shared edges run opposite). */
function rings(polys: Poly[], at: (p: Pt) => Pt): Pt[][] {
  const out: Pt[][] = []
  for (const poly of polys) {
    poly.forEach((ring, i) => {
      const r: Pt[] = []
      for (const p of ring) {
        const q = at(p)
        const last = r[r.length - 1]
        if (!last || last[0] !== q[0] || last[1] !== q[1]) r.push(q)
      }
      if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop()
      if (r.length < 3) return
      if ((signedArea(r) > 0) !== (i === 0)) r.reverse()
      out.push(r)
    })
  }
  return out
}

/** The union of rings that share edges: every edge met in both directions cancels, the rest is traced into loops. */
function dissolve(rs: Pt[][]): { loops: Pt[][]; cancelled: number } {
  const key = (a: Pt, b: Pt) => `${a[0]},${a[1]},${b[0]},${b[1]}`
  const count = new Map<string, number>()
  for (const r of rs) for (let i = 0; i < r.length; i++) {
    const k = key(r[i], r[(i + 1) % r.length])
    count.set(k, (count.get(k) ?? 0) + 1)
  }
  // Each directed edge kept as often as it outnumbers its reverse, so every vertex keeps as many edges in as out.
  const from = new Map<string, Pt[]>()
  let cancelled = 0
  for (const [k, n] of count) {
    const [ax, ay, bx, by] = k.split(',').map(Number)
    const net = n - (count.get(key([bx, by], [ax, ay])) ?? 0)
    cancelled += n - Math.max(net, 0)
    if (net <= 0) continue
    const list = from.get(`${ax},${ay}`) ?? []
    for (let i = 0; i < net; i++) list.push([bx, by])
    from.set(`${ax},${ay}`, list)
  }
  const loops: Pt[][] = []
  for (const [start, list] of from) {
    while (list.length) {
      const loop: Pt[] = [start.split(',').map(Number) as Pt]
      let next = list.pop()!
      for (;;) {
        const k = `${next[0]},${next[1]}`
        if (k === start) break
        loop.push(next)
        const out = from.get(k)
        if (!out?.length) throw new Error(`an open loop at ${k}`) // in and out counts differ: the cancelling is wrong
        next = out.pop()!
      }
      if (loop.length >= 3) loops.push(loop)
    }
  }
  return { loops, cancelled }
}

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}

function dp(pts: Pt[], eps: number): Pt[] {
  const keep = new Uint8Array(pts.length)
  keep[0] = keep[pts.length - 1] = 1
  const stack: [number, number][] = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()!
    let max = 0
    let idx = -1
    for (let i = s + 1; i < e; i++) {
      const d = segDist(pts[i], pts[s], pts[e])
      if (d > max) { max = d; idx = i }
    }
    if (idx >= 0 && max > eps) { keep[idx] = 1; stack.push([s, idx], [idx, e]) }
  }
  return pts.filter((_, i) => keep[i])
}

/** A closed loop simplified: split at its far point, each half by Douglas-Peucker. */
function simplify(loop: Pt[]): Pt[] {
  let far = 1
  for (let i = 1, best = -1; i < loop.length; i++) {
    const d = Math.hypot(loop[i][0] - loop[0][0], loop[i][1] - loop[0][1])
    if (d > best) { best = d; far = i }
  }
  const a = dp(loop.slice(0, far + 1), EPS)
  const b = dp([...loop.slice(far), loop[0]], EPS)
  return [...a.slice(0, -1), ...b.slice(0, -1)]
}

/** A coordinate in `q` steps per unit as written: units, at most one decimal place, no leading zero (".5", "-.5"). */
const num = (v: number, q: number) => String(v / q).replace(/^(-?)0\./, '$1.')

/**
 * The path, in units (`w`, `h`, `maxSeg` and the points in steps of 1/`q` unit): each loop an absolute moveto, then
 * relative linetos, closed.
 */
function pathOf(loops: Pt[][], w: number, h: number, maxSeg: number, what: string, q = 1): string {
  let d = ''
  const kept = loops.map(simplify).filter((loop) => loop.length >= 3 && Math.abs(signedArea(loop)) >= MIN_AREA)
  // A place too small for the threshold (Singapore, Malta) keeps its largest loop, or a 2-unit square, so it can be seen and pressed.
  if (!kept.length && loops.length) {
    const big = loops.reduce((a, b) => (Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a))
    const [x, y] = big[0]
    const s = 2 * q
    kept.push(big.length >= 3 && Math.abs(signedArea(big)) >= q * q ? big : [[x, y], [Math.min(x + s, w), y], [Math.min(x + s, w), Math.min(y + s, h)], [x, Math.min(y + s, h)]])
  }
  for (const loop of kept) {
    for (let i = 0; i < loop.length; i++) {
      const [x, y] = loop[i]
      const [nx, ny] = loop[(i + 1) % loop.length]
      if (!(x >= 0 && x <= w && y >= 0 && y <= h)) throw new Error(`${what}: point ${x},${y} outside ${w}×${h}`)
      // Antarctica's ring runs along the south pole, which Equal Earth draws as the bottom edge: the one long segment allowed.
      if (Math.hypot(nx - x, ny - y) > maxSeg && !(y >= h - q && ny >= h - q)) throw new Error(`${what}: segment of ${Math.round(Math.hypot(nx - x, ny - y) / q)} units (a wrap)`)
    }
    d += `M${num(loop[0][0], q)} ${num(loop[0][1], q)}l` + loop.slice(1).map((p, i) => `${num(p[0] - loop[i][0], q)} ${num(p[1] - loop[i][1], q)}`).join(' ').replace(/ -/g, '-') + 'z'
  }
  return d
}

/** A 2-unit square at `p` (in steps of 1/`q` unit): a place whose rings round away entirely (an atoll) can still be seen and pressed. */
const dot = ([x, y]: Pt, w: number, h: number, q = 1) => `M${num(Math.min(x, w - 2 * q), q)} ${num(Math.min(y, h - 2 * q), q)}h2v2h-2z`

/** A projection's placer for these rings, in whole steps of 1/`q` unit: the bounds fitted to `side` units along the longer axis. */
function fitter(proj: GeoProjection, polys: Poly[], side: number, byWidth = false, q = 1): { at: (p: Pt) => Pt; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const poly of polys) for (const ring of poly) for (const p of ring) {
    const q = proj(p)
    if (!q || !Number.isFinite(q[0]) || !Number.isFinite(q[1])) throw new Error(`unprojectable point ${p}`)
    x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1])
  }
  const k = (side * q) / (byWidth ? x1 - x0 : Math.max(x1 - x0, y1 - y0))
  const at = (p: Pt): Pt => {
    const q = proj(p)!
    return [Math.round((q[0] - x0) * k), Math.round((q[1] - y0) * k)]
  }
  return { at, w: Math.round((x1 - x0) * k), h: Math.round((y1 - y0) * k) } // rounded as the points are, so none falls outside
}

function main() {
  const regions = JSON.parse(readFileSync(resolve(ROOT, 'public/data/regions.v1.json'), 'utf8')) as { countries: Record<string, string>; sub1: Record<string, string> }
  const countries = (JSON.parse(readFileSync(resolve(RAW, 'ne_50m_admin_0_countries.geojson'), 'utf8')) as { features: Feature[] }).features
  const provinces = (JSON.parse(readFileSync(resolve(RAW, 'ne_10m_admin_1_states_provinces.geojson'), 'utf8')) as { features: Feature[] }).features

  // The world: each country's polygons, then the overseas parts painted over them.
  const world = new Map<string, Poly[]>()
  for (const f of countries) {
    const p = f.properties
    const id = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : NO_ISO[p.NAME]
    if (!id || !Object.hasOwn(regions.countries, id)) continue
    world.set(id, [...(world.get(id) ?? []), ...polysOf(f)])
  }
  const drawn = new Set(world.keys())
  const overlay = new Map<string, Poly[]>()
  // Where an overlay lies, its country's own polygons there are dropped, so only the overlay is drawn and pressed.
  // `country` unset: carved out of any country (Svalbard from Norway, Cocos from Australia's Indian Ocean territories).
  const carved: { country?: string; box: [number, number, number, number] }[] = []
  // A carved part's own polygons, each by its box: a country's polygon whose ring centroid falls in one is dropped.
  const carve = (polys: Poly[], country?: string) => {
    for (const poly of polys) {
      const lons = poly[0].map((q) => q[0])
      const lats = poly[0].map((q) => q[1])
      carved.push({ country, box: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)] })
    }
  }
  for (const f of provinces) {
    const own = Object.hasOwn(OWN_SHAPE, f.properties.name) ? OWN_SHAPE[f.properties.name] : f.properties.admin === 'United States Minor Outlying Islands' ? 'UM' : undefined
    if (own && Object.hasOwn(regions.countries, own) && !drawn.has(own)) {
      overlay.set(own, [...(overlay.get(own) ?? []), ...polysOf(f)])
      carve(polysOf(f))
    }
    const iso = f.properties.iso_3166_2
    const code = Object.hasOwn(SUB1_PARENT, iso) ? SUB1_PARENT[iso] : iso
    if (!code || !Object.hasOwn(regions.sub1, code)) continue
    // The country key `parentKey` gives the province: US-HI is in US@OC.
    const group = parentKey(`s:${code}`)?.slice(2)
    if (!group) throw new Error(`no country key for ${code}`)
    if (group.includes('@') && !own) {
      const part = iso.split('-')[1]
      const id = Object.hasOwn(regions.countries, part) ? part : group
      if (!(id === part && drawn.has(part))) {
        overlay.set(id, [...(overlay.get(id) ?? []), ...polysOf(f)])
        carve(polysOf(f), f.properties.iso_a2)
      }
    }
  }

  // By the ring's centroid, not its first point: Natural Earth's 1:50m and 1:10m outlines differ, so a first point can
  // sit just outside the finer box (France's French Guiana loop did, and was drawn under GF).
  const centroid = (ring: Pt[]): Pt => [ring.reduce((s, q) => s + q[0], 0) / ring.length, ring.reduce((s, q) => s + q[1], 0) / ring.length]
  for (const { country, box } of carved) {
    const inBox = ([x, y]: Pt) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3]
    for (const id of country ? [country] : [...drawn]) {
      const polys = world.get(id)
      if (polys) world.set(id, polys.filter((poly) => !inBox(centroid(poly[0]))))
    }
  }
  const all = [...world.values(), ...overlay.values()].flat()
  const wf = fitter(geoEqualEarth(), all, WORLD_W, true, WORLD_Q)
  const worldD: Record<string, string> = {}
  for (const [id, polys] of [...world, ...overlay]) worldD[id] = pathOf(dissolve(rings(polys, wf.at)).loops, wf.w, wf.h, wf.w / 4, id, WORLD_Q) || dot(wf.at(polys[0][0][0]), wf.w, wf.h, WORLD_Q)
  // Glance checks: the projection is the right way up and round.
  const y = (lonlat: Pt) => wf.at(lonlat)[1]
  const x = (lonlat: Pt) => wf.at(lonlat)[0]
  if (!(y([10, 62]) < y([25, -30]))) throw new Error('Norway is not above South Africa')
  if (!(x([-100, 40]) < x([138, 36]))) throw new Error('the US is not left of Japan')

  const countriesJson = JSON.stringify({ v: 1, w: wf.w / WORLD_Q, h: wf.h / WORLD_Q, d: Object.fromEntries(Object.entries(worldD).filter(([, p]) => p).sort(([a], [b]) => (a < b ? -1 : 1))) })
  const gz = gzipSync(countriesJson).length
  if (gz > GZIP_BUDGET) throw new Error(`countries: ${gz} bytes gzipped, over ${GZIP_BUDGET}`)
  writeFileSync(OUT_COUNTRIES, countriesJson + '\n')
  console.log(`countries: ${Object.keys(worldD).length} (overlays ${[...overlay.keys()].join(' ')}), ${countriesJson.length} bytes, ${gz} gzipped`)
}

main()
