// Share links: a self-contained, versioned token (no database). The URL is `${origin}/s/${token}`.
//
// token  = "1" + base64url( deflateRaw( level 9, BODY ) )          ("1" is the permanent version; never reuse it)
// BODY   = u8 FORMAT                                               (section flags, below)
//          varint nameLen, name (UTF-8, at most 40 characters)
//          [places]  if F_PLACES: varint nPlaces (<= 255), per place: ISO2 (2 ASCII bytes, "--" unknown), varint len, UTF-8 display
//          varint nBirds
//          [species] F_BITSET clear: nBirds varints, ascending link-index deltas (first from 0, every later delta >= 1)
//                    F_BITSET set:   varint byteLen, then a bitset over the link index (bit i, LSB first within a byte, set =
//                                    code i present; byteLen = ceil((highest index + 1) / 8)). Birds are the set bits in ascending order.
//                    The encoder writes whichever is smaller before deflate.
//          [marks]   if F_MARKS: per bird (ascending order) heard 1, dead 2, media 4.
//                    F_MARKS_PACKED set: ceil(nBirds / 2) bytes, one nibble per bird (low nibble = even ordinal).
//                    clear: varint nMarked, then per marked bird: varint ordinal delta (first from 0, then >= 1), u8 mark bits.
//                    The encoder writes whichever is smaller.
//          [dates]   if F_DATES: per bird uint16 big-endian: 0xFFFF = no date; else bit 15 = yearOnly, bits 0-14 = ym
//                    (months since 1900-01, at most MAX_YM; a year-only date is that year's January).
//          [places]  if F_PLACES: per bird uint8 index into the dictionary, 0xFF = no place (so at most 255 places).
// FORMAT = bit 1 F_BITSET, 2 F_MARKS, 4 F_MARKS_PACKED, 8 F_DATES, 16 F_PLACES, 32 F_TITLE. Bits 64 and 128 are reserved
//          and must be 0. F_TITLE (added 2026-11-06, with a non-empty name only): the name is the collage's title, shown
//          verbatim ("Birds of 2026"). Clear, the name is a person's bare name, as every link made before titles carries,
//          shown as "<name>'s life list" (og.ts shareTitle). The bit changes no byte of the body, so a token without it
//          decodes exactly as before; v1-frozen.txt holds tokens made before it.
// varint = unsigned LEB128. A section is absent unless its flag is set: nothing is spent on data a link does not carry.
//
// The places dictionary carries each place's ISO2 country next to its display string so the shared page can filter by
// country and draw the map without region data for sub-regions: payload.places[i] is the display string, payload.countries[i]
// its ISO2. Display strings are what formatPlace gives (Subnational2?, Subnational1, Country: never towns).
//
// Fallback when the token would be over the budget: regions > countries (display strings reduced to country names, one
// entry per country) > dates (no places) > species (no places, no dates; marks and the name stay). Past that, ShareTooLarge.
//
// tests/fixtures/share/v1-frozen.txt locks this layout forever; old links must keep decoding.
import { deflateSync, Inflate } from 'fflate'
import { SHARE_ORIGIN } from './origin'
import linkIndex from '../../../data/link-index.json'

export type ShareBird = { code: string; ym?: number /* months since 1900-01; year-only → that year's January with yearOnly */; yearOnly?: boolean; p?: number; m?: number /* 1 heard, 2 dead, 4 media */ }
export type SharePayload = { v: 1; name?: string; /** `name` is a verbatim collage title (F_TITLE), not a bare name. */ titled?: true; places?: string[] /* formatted region strings */; countries?: string[] /* ISO2 of each place, same order */; birds: ShareBird[] }
export type ShareLevel = 'regions' | 'countries' | 'dates' | 'species'

export { SHARE_ORIGIN }
/** A whole share URL stays at or under 2,000 characters; the token gets what the origin and "/s/" leave. */
export const URL_BUDGET = 2000
export const TOKEN_BUDGET = URL_BUDGET - `${SHARE_ORIGIN}/s/`.length
export const NAME_MAX = 40
const MAX_TOKEN = 12_000 // decode refuses anything longer
const MAX_BODY = 400_000 // and anything that inflates beyond this

const F_BITSET = 1, F_MARKS = 2, F_MARKS_PACKED = 4, F_DATES = 8, F_PLACES = 16, F_TITLE = 32
const F_KNOWN = F_BITSET | F_MARKS | F_MARKS_PACKED | F_DATES | F_PLACES | F_TITLE
const MARKS = 7
const NO_DATE = 0xffff, YEAR_ONLY = 0x8000
/** 1900 + 300 years: past any real sighting; a larger ym is a corrupt token. */
export const MAX_YM = 300 * 12
const NO_PLACE = 0xff

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
const indexMap = (): Map<string, number> => (indexOf ??= new Map(CODES.map((c, i) => [c, i])))
/** Whether a share link can carry this code (it's in the frozen link index). */
export const isLinkCode = (code: string): boolean => indexMap().has(code)
const lookup = (code: string): number => {
  const i = indexMap().get(code)
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

function varintBytes(n: number): number {
  let k = 1
  while (n >= 128) { n = Math.floor(n / 128); k++ }
  return k
}

function body(p: SharePayload, level: ShareLevel, sorted: { b: ShareBird; idx: number }[]): Uint8Array {
  const { dict, map } = dictFor(p, level)
  const n = sorted.length
  const withDates = level !== 'species'
  const withPlaces = level === 'regions' || level === 'countries'
  const ym = sorted.map(({ b }) => (withDates && b.ym !== undefined ? b.ym | (b.yearOnly ? YEAR_ONLY : 0) : NO_DATE))
  const place = sorted.map(({ b }) => (withPlaces && b.p !== undefined ? map(b.p) ?? NO_PLACE : NO_PLACE))
  const marks = sorted.map(({ b }) => (b.m ?? 0) & MARKS)
  const hasDates = ym.some((x) => x !== NO_DATE)
  const hasPlaces = dict.display.length > 0 && place.some((x) => x !== NO_PLACE)
  const nMarked = marks.filter(Boolean).length

  // Species: deltas or bitset, whichever is smaller.
  let deltaBytes = 0, prev = 0
  for (const { idx } of sorted) { deltaBytes += varintBytes(idx - prev); prev = idx }
  const bitsetLen = n ? Math.ceil((sorted[n - 1].idx + 1) / 8) : 0
  const useBitset = n > 0 && varintBytes(bitsetLen) + bitsetLen < deltaBytes

  // Marks: sparse list or packed nibbles, whichever is smaller.
  let sparseBytes = varintBytes(nMarked), mp = -1
  marks.forEach((m, i) => { if (m) { sparseBytes += varintBytes(i - (mp < 0 ? 0 : mp)) + 1; mp = i } })
  const packedMarks = nMarked > 0 && Math.ceil(n / 2) < sparseBytes

  const w = new Writer()
  const name = Array.from((p.name ?? '').trim()).slice(0, NAME_MAX).join('')
  const titled = !!p.titled && !!name
  w.u8((useBitset ? F_BITSET : 0) | (nMarked ? F_MARKS : 0) | (packedMarks ? F_MARKS_PACKED : 0) | (hasDates ? F_DATES : 0) | (hasPlaces ? F_PLACES : 0) | (titled ? F_TITLE : 0))
  const nb = enc.encode(name)
  w.varint(nb.length); w.bytes(nb)
  if (hasPlaces) {
    w.varint(dict.display.length)
    dict.display.forEach((d, i) => {
      w.u8(dict.iso[i].charCodeAt(0)); w.u8(dict.iso[i].charCodeAt(1))
      const db = enc.encode(d)
      w.varint(db.length); w.bytes(db)
    })
  }
  w.varint(n)
  if (useBitset) {
    const bits = new Uint8Array(bitsetLen)
    for (const { idx } of sorted) bits[idx >> 3] |= 1 << (idx & 7)
    w.varint(bitsetLen); w.bytes(bits)
  } else {
    prev = 0
    for (const { idx } of sorted) { w.varint(idx - prev); prev = idx }
  }
  if (nMarked) {
    if (packedMarks) {
      for (let i = 0; i < n; i += 2) w.u8(marks[i] | ((marks[i + 1] ?? 0) << 4))
    } else {
      w.varint(nMarked)
      let last = 0
      marks.forEach((m, i) => { if (m) { w.varint(i - last); w.u8(m); last = i } })
    }
  }
  if (hasDates) for (const x of ym) { w.u8(x >> 8); w.u8(x & 255) }
  if (hasPlaces) for (const x of place) w.u8(x)
  return Uint8Array.from(w.b)
}

/** The token for the richest level that fits `maxChars` (default: what a 2,000-character URL leaves). Throws ShareTooLarge. */
export function encodeShare(p: SharePayload, maxChars: number = TOKEN_BUDGET): { token: string; level: ShareLevel } {
  const sorted = p.birds.map((b) => ({ b, idx: lookup(b.code) })).sort((x, y) => x.idx - y.idx)
  for (let i = 1; i < sorted.length; i++) if (sorted[i].idx === sorted[i - 1].idx) throw new Error(`Duplicate bird in a share link: ${sorted[i].b.code}`)
  for (const { b } of sorted) {
    if (b.ym !== undefined && !(Number.isInteger(b.ym) && b.ym >= 0 && b.ym <= MAX_YM)) throw new Error('Month out of range for a share link')
    if (b.p !== undefined && !(Number.isInteger(b.p) && b.p >= 0)) throw new Error('Bad place index for a share link')
  }
  // A level the payload has nothing for would encode the same as the one below it, so it is not reported.
  const hasPlaces = !!p.places?.length && sorted.some(({ b }) => b.p !== undefined)
  const hasDates = sorted.some(({ b }) => b.ym !== undefined)
  for (const level of ['regions', 'countries', 'dates', 'species'] as const) {
    if ((level === 'regions' || level === 'countries') && !hasPlaces) continue
    if (level === 'dates' && !hasDates) continue
    const token = '1' + toBase64Url(deflateSync(body(p, level, sorted), { level: 9 }))
    if (token.length <= maxChars) return { token, level }
  }
  throw new ShareTooLarge()
}

/** Inflate with a hard cap on the output, fed in small slices so a bomb is stopped before it is allocated. */
function inflateCapped(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let total = 0
  const inf = new Inflate((chunk) => {
    total += chunk.length
    if (total > MAX_BODY) throw new ShareDecodeError()
    chunks.push(chunk)
  })
  const SLICE = 128
  for (let i = 0; i < data.length; i += SLICE) inf.push(data.subarray(i, i + SLICE), i + SLICE >= data.length)
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.length }
  return out
}

/** Throws ShareDecodeError ("This link is broken or from a newer Everybird") on an unknown version or a corrupt token. */
export function decodeShare(token: string): SharePayload {
  if (typeof token !== 'string' || token.length < 2 || token.length > MAX_TOKEN || token[0] !== '1') throw new ShareDecodeError()
  let raw: Uint8Array
  try {
    raw = inflateCapped(fromBase64Url(token.slice(1)))
  } catch {
    throw new ShareDecodeError()
  }
  try {
    const r = new Reader(raw)
    const f = r.u8()
    if (f & ~F_KNOWN) throw new ShareDecodeError()
    const name = dec.decode(r.bytes(r.varint()))
    if (Array.from(name).length > NAME_MAX) throw new ShareDecodeError()
    if (f & F_TITLE && !name) throw new ShareDecodeError() // a title flag with no title: never written
    const places: string[] = [], countries: string[] = []
    let nPlaces = 0
    if (f & F_PLACES) {
      nPlaces = r.varint()
      if (nPlaces < 1 || nPlaces > 255) throw new ShareDecodeError()
      for (let i = 0; i < nPlaces; i++) {
        countries.push(String.fromCharCode(r.u8(), r.u8()))
        places.push(dec.decode(r.bytes(r.varint())))
      }
    }
    const n = r.varint()
    if (n > CODES.length) throw new ShareDecodeError()
    const idxs: number[] = []
    if (f & F_BITSET) {
      const len = r.varint()
      if (len > Math.ceil(CODES.length / 8)) throw new ShareDecodeError()
      const bits = r.bytes(len)
      for (let i = 0; i < len; i++) for (let k = 0; k < 8; k++) if (bits[i] & (1 << k)) idxs.push(i * 8 + k)
      if (idxs.length !== n || (n > 0 && idxs[n - 1] >= CODES.length) || (len > 0 && bits[len - 1] === 0)) throw new ShareDecodeError()
    } else {
      let idx = 0
      for (let k = 0; k < n; k++) {
        const d = r.varint()
        if (k > 0 && d < 1) throw new ShareDecodeError()
        idx += d
        if (idx >= CODES.length) throw new ShareDecodeError()
        idxs.push(idx)
      }
    }
    const birds: ShareBird[] = idxs.map((i) => ({ code: CODES[i] }))
    if (f & F_MARKS) {
      let any = false
      if (f & F_MARKS_PACKED) {
        const packed = r.bytes(Math.ceil(n / 2))
        for (let i = 0; i < n; i++) {
          const m = (packed[i >> 1] >> ((i & 1) * 4)) & 15
          if (m & 8) throw new ShareDecodeError()
          if (m) { birds[i].m = m; any = true }
        }
        if (n % 2 === 1 && packed[packed.length - 1] >> 4) throw new ShareDecodeError()
      } else {
        const cnt = r.varint()
        if (cnt > n) throw new ShareDecodeError()
        let at = 0
        for (let k = 0; k < cnt; k++) {
          const d = r.varint()
          if (k > 0 && d < 1) throw new ShareDecodeError()
          at += d
          const m = r.u8()
          if (at >= n || !m || m > MARKS) throw new ShareDecodeError()
          birds[at].m = m
          any = true
        }
      }
      if (!any) throw new ShareDecodeError()
    }
    if (f & F_DATES) {
      for (let i = 0; i < n; i++) {
        const x = (r.u8() << 8) | r.u8()
        if (x === NO_DATE) continue
        const ym = x & 0x7fff
        if (ym > MAX_YM) throw new ShareDecodeError()
        birds[i].ym = ym
        if (x & YEAR_ONLY) birds[i].yearOnly = true
      }
    }
    if (f & F_PLACES) {
      for (let i = 0; i < n; i++) {
        const x = r.u8()
        if (x === NO_PLACE) continue
        if (x >= nPlaces) throw new ShareDecodeError()
        birds[i].p = x
      }
    }
    if (r.i !== raw.length) throw new ShareDecodeError()
    // Key order matches what encodeShare took in, so toEqual and JSON agree: code, ym, yearOnly, p, m.
    const out: SharePayload = { v: 1, birds: birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { ym: b.ym } : {}), ...(b.yearOnly ? { yearOnly: true } : {}), ...(b.p !== undefined ? { p: b.p } : {}), ...(b.m ? { m: b.m } : {}) })) }
    if (name) out.name = name
    if (f & F_TITLE) out.titled = true
    if (nPlaces) { out.places = places; out.countries = countries }
    return out
  } catch (e) {
    throw e instanceof ShareDecodeError ? e : new ShareDecodeError()
  }
}
