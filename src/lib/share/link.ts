// Share links: a self-contained, versioned token (no database). The URL is `${origin}/s/${token}`.
//
// token  = "1" + base64url( deflateRaw( level 9, BODY ) )          ("1" is the permanent version; never reuse it)
// BODY   = varint nameLen, name (UTF-8, at most 40 characters)
//          varint nPlaces, then per place: ISO2 (2 ASCII bytes, "--" when unknown), varint len, display (UTF-8)
//          varint nBirds, then per bird, in ascending link-index order:
//            varint  link-index delta (first delta is from 0)
//            uint8   flags (below)
//            uint16  ym, big-endian, only if FLAG_YM        (months since 1900-01; a year-only date is that January)
//            uint8   p, only if FLAG_P                       (index into the places dictionary)
// FLAGS  = bit 1 heard, 2 dead, 4 media, 8 has ym, 16 yearOnly, 32 has p. Bits 64 and 128 are reserved and must be 0.
// varint = unsigned LEB128.
//
// The places dictionary carries each place's ISO2 country next to its display string so the shared page can filter by
// country and draw the map without region data for sub-regions: payload.places[i] is the display string, payload.countries[i]
// its ISO2. Display strings are what formatPlace gives (Subnational2?, Subnational1, Country: never towns).
//
// Fallback when the token would be over the budget: regions > countries (display strings reduced to country names, one
// entry per country) > dates (no places) > species (no places, no dates). Past that, ShareTooLarge.
//
// tests/fixtures/share/v1-frozen.txt locks this layout forever; old links must keep decoding.
import { deflateSync, inflateSync } from 'fflate'
import linkIndex from '../../../data/link-index.json'

export type ShareBird = { code: string; ym?: number /* months since 1900-01; year-only → that year's January with yearOnly */; yearOnly?: boolean; p?: number; m?: number /* 1 heard, 2 dead, 4 media */ }
export type SharePayload = { v: 1; name?: string; places?: string[] /* formatted region strings */; countries?: string[] /* ISO2 of each place, same order */; birds: ShareBird[] }
export type ShareLevel = 'regions' | 'countries' | 'dates' | 'species'

export const SHARE_ORIGIN = 'https://everybird.vercel.app'
/** A whole share URL stays at or under 2,000 characters; the token gets what the origin and "/s/" leave. */
export const URL_BUDGET = 2000
export const TOKEN_BUDGET = URL_BUDGET - `${SHARE_ORIGIN}/s/`.length
export const NAME_MAX = 40
const MAX_TOKEN = 12_000 // decode refuses anything longer
const MAX_BODY = 400_000 // and anything that inflates beyond this

const FLAG_HEARD = 1, FLAG_DEAD = 2, FLAG_MEDIA = 4, FLAG_YM = 8, FLAG_YEAR_ONLY = 16, FLAG_P = 32
const MARKS = FLAG_HEARD | FLAG_DEAD | FLAG_MEDIA

export class ShareTooLarge extends Error {
  constructor() {
    super('This list is too big for a share link, even with species only.')
    this.name = 'ShareTooLarge'
  }
}
export class ShareDecodeError extends Error {
  constructor(message = 'This link is broken or from a newer Everybird') {
    super(message)
    this.name = 'ShareDecodeError'
  }
}

const CODES = linkIndex as string[]
let indexOf: Map<string, number> | null = null
const lookup = (code: string): number => {
  if (!indexOf) indexOf = new Map(CODES.map((c, i) => [c, i]))
  const i = indexOf.get(code)
  if (i === undefined) throw new Error(`Unknown bird code for a share link: ${code}`)
  return i
}

const enc = new TextEncoder()
const dec = new TextDecoder('utf-8', { fatal: true })

class Writer {
  b: number[] = []
  u8(n: number) { this.b.push(n & 255) }
  varint(n: number) {
    while (n >= 128) { this.b.push((n & 127) | 128); n = Math.floor(n / 128) }
    this.b.push(n)
  }
  bytes(a: Uint8Array) { for (const x of a) this.b.push(x) }
}
class Reader {
  i = 0
  constructor(readonly b: Uint8Array) {}
  u8(): number {
    if (this.i >= this.b.length) throw new ShareDecodeError()
    return this.b[this.i++]
  }
  varint(): number {
    let n = 0, mul = 1
    for (let k = 0; k < 5; k++) {
      const x = this.u8()
      n += (x & 127) * mul
      if (x < 128) return n
      mul *= 128
    }
    throw new ShareDecodeError()
  }
  bytes(len: number): Uint8Array {
    if (len < 0 || this.i + len > this.b.length) throw new ShareDecodeError()
    const out = this.b.subarray(this.i, this.i + len)
    this.i += len
    return out
  }
}

function toBase64Url(a: Uint8Array): string {
  let s = ''
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function fromBase64Url(t: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]*$/.test(t) || t.length % 4 === 1) throw new ShareDecodeError()
  const s = atob(t.replace(/-/g, '+').replace(/_/g, '/'))
  const a = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i)
  return a
}

type Dict = { display: string[]; iso: string[] }
const countryOf = (display: string) => display.slice(display.lastIndexOf(',') + 1).trim()

/** Places for a level: the original dictionary, countries only (merged by ISO), or none. */
function dictFor(p: SharePayload, level: ShareLevel): { dict: Dict; map: (i: number) => number | undefined } {
  const display = p.places ?? []
  const iso = display.map((_, i) => (p.countries?.[i] ?? '--').toUpperCase().slice(0, 2).padEnd(2, '-'))
  if (level === 'dates' || level === 'species' || !display.length) return { dict: { display: [], iso: [] }, map: () => undefined }
  if (level === 'regions' && display.length <= 255) return { dict: { display, iso }, map: (i) => (i >= 0 && i < display.length ? i : undefined) }
  // countries (also the way out of a regions dictionary over 255 entries)
  const out: Dict = { display: [], iso: [] }
  const slot = new Map<string, number>()
  const remap: (number | undefined)[] = display.map((d, i) => {
    if (iso[i] === '--') return undefined // no known country: the bird keeps no place
    let s = slot.get(iso[i])
    if (s === undefined) {
      s = out.display.length
      slot.set(iso[i], s)
      out.display.push(countryOf(d))
      out.iso.push(iso[i])
    }
    return s
  })
  return { dict: out, map: (i) => remap[i] }
}

function body(p: SharePayload, level: ShareLevel, sorted: { b: ShareBird; idx: number }[]): Uint8Array {
  const w = new Writer()
  const name = Array.from((p.name ?? '').trim()).slice(0, NAME_MAX).join('')
  const nb = enc.encode(name)
  w.varint(nb.length); w.bytes(nb)
  const { dict, map } = dictFor(p, level)
  w.varint(dict.display.length)
  dict.display.forEach((d, i) => {
    w.u8(dict.iso[i].charCodeAt(0)); w.u8(dict.iso[i].charCodeAt(1))
    const db = enc.encode(d)
    w.varint(db.length); w.bytes(db)
  })
  w.varint(sorted.length)
  let prev = 0
  for (const { b, idx } of sorted) {
    w.varint(idx - prev)
    prev = idx
    const ym = level === 'regions' || level === 'countries' || level === 'dates' ? b.ym : undefined
    const place = level === 'regions' || level === 'countries' ? (b.p === undefined ? undefined : map(b.p)) : undefined
    let f = (b.m ?? 0) & MARKS
    if (ym !== undefined) { f |= FLAG_YM; if (b.yearOnly) f |= FLAG_YEAR_ONLY }
    if (place !== undefined) f |= FLAG_P
    w.u8(f)
    if (ym !== undefined) { w.u8(ym >> 8); w.u8(ym & 255) }
    if (place !== undefined) w.u8(place)
  }
  return Uint8Array.from(w.b)
}

/** The token for the richest level that fits `maxChars` (default: what a 2,000-character URL leaves). Throws ShareTooLarge. */
export function encodeShare(p: SharePayload, maxChars: number = TOKEN_BUDGET): { token: string; level: ShareLevel } {
  const sorted = p.birds.map((b) => ({ b, idx: lookup(b.code) })).sort((x, y) => x.idx - y.idx)
  for (let i = 1; i < sorted.length; i++) if (sorted[i].idx === sorted[i - 1].idx) throw new Error(`Duplicate bird in a share link: ${sorted[i].b.code}`)
  for (const { b } of sorted) {
    if (b.ym !== undefined && !(Number.isInteger(b.ym) && b.ym >= 0 && b.ym <= 0xffff)) throw new Error('Month out of range for a share link')
    if (b.p !== undefined && !(Number.isInteger(b.p) && b.p >= 0)) throw new Error('Bad place index for a share link')
  }
  for (const level of ['regions', 'countries', 'dates', 'species'] as const) {
    if (level === 'countries' && !p.places?.length) continue
    const token = '1' + toBase64Url(deflateSync(body(p, level, sorted), { level: 9 }))
    if (token.length <= maxChars) return { token, level }
  }
  throw new ShareTooLarge()
}

/** Throws ShareDecodeError ("This link is broken or from a newer Everybird") on an unknown version or a corrupt token. */
export function decodeShare(token: string): SharePayload {
  if (typeof token !== 'string' || token.length < 2 || token.length > MAX_TOKEN || token[0] !== '1') throw new ShareDecodeError()
  let raw: Uint8Array
  try {
    raw = inflateSync(fromBase64Url(token.slice(1)))
  } catch {
    throw new ShareDecodeError()
  }
  if (raw.length > MAX_BODY) throw new ShareDecodeError()
  try {
    const r = new Reader(raw)
    const name = dec.decode(r.bytes(r.varint()))
    if (Array.from(name).length > NAME_MAX) throw new ShareDecodeError()
    const nPlaces = r.varint()
    if (nPlaces > 255) throw new ShareDecodeError()
    const places: string[] = [], countries: string[] = []
    for (let i = 0; i < nPlaces; i++) {
      const iso = String.fromCharCode(r.u8(), r.u8())
      countries.push(iso)
      places.push(dec.decode(r.bytes(r.varint())))
    }
    const n = r.varint()
    if (n > CODES.length) throw new ShareDecodeError()
    const birds: ShareBird[] = []
    let idx = 0
    for (let k = 0; k < n; k++) {
      idx += r.varint()
      if (idx >= CODES.length) throw new ShareDecodeError()
      const f = r.u8()
      if (f & ~(MARKS | FLAG_YM | FLAG_YEAR_ONLY | FLAG_P) || (f & FLAG_YEAR_ONLY && !(f & FLAG_YM))) throw new ShareDecodeError()
      const b: ShareBird = { code: CODES[idx] }
      if (f & FLAG_YM) { b.ym = (r.u8() << 8) | r.u8(); if (f & FLAG_YEAR_ONLY) b.yearOnly = true }
      if (f & FLAG_P) {
        b.p = r.u8()
        if (b.p >= nPlaces) throw new ShareDecodeError()
      }
      if (f & MARKS) b.m = f & MARKS
      birds.push(b)
    }
    if (r.i !== raw.length) throw new ShareDecodeError()
    const out: SharePayload = { v: 1, birds }
    if (name) out.name = name
    if (nPlaces) { out.places = places; out.countries = countries }
    return out
  } catch (e) {
    throw e instanceof ShareDecodeError ? e : new ShareDecodeError()
  }
}
