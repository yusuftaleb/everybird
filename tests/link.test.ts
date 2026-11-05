import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import linkIndex from '../data/link-index.json'
import { formatPlace } from '@/lib/import/places'
import { decodeShare, encodeShare, ShareTooLarge, TOKEN_BUDGET, type ShareBird, type SharePayload } from '@/lib/share/link'
import { payloadFromList } from '@/lib/share/convert'
import type { ListEntry } from '@/lib/list/model'

const codes = linkIndex as string[]

// Small deterministic generator so the big payloads are the same on every run.
function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}
/** Uniformly random birds: the worst case for the deltas. */
function sample(n: number, seed: number): string[] {
  const r = rng(seed)
  const picked = new Set<number>()
  while (picked.size < n) picked.add(Math.floor(r() * codes.length))
  return [...picked].map((i) => codes[i])
}
/** A realistic big list: birders see whole families, so the link indexes come in runs (blocks of 40, 80% of a block seen). */
function clustered(n: number, seed: number): string[] {
  const r = rng(seed)
  for (let blockP = 0.3; ; blockP += 0.05) {
    const out: string[] = []
    for (let b = 0; b < codes.length; b += 40) if (r() < blockP) for (let i = b; i < Math.min(b + 40, codes.length); i++) if (r() < 0.8) out.push(codes[i])
    if (out.length >= n) return out.slice(0, n)
  }
}
const PLACES = [
  'Okanagan-Similkameen, British Columbia, Canada',
  'Fraser Valley, British Columbia, Canada',
  'Alberta, Canada',
  'Egypt',
  'Kerala, India',
  'Texas, United States',
  'Cornwall, England, United Kingdom',
  'Queensland, Australia',
]
const ISO = ['CA', 'CA', 'CA', 'EG', 'IN', 'US', 'GB', 'AU']
function payload(n: number, seed: number, name?: string, pick: (n: number, seed: number) => string[] = sample): SharePayload {
  const r = rng(seed + 1)
  const birds: ShareBird[] = pick(n, seed).map((code) => {
    const b: ShareBird = { code, ym: (2005 - 1900) * 12 + Math.floor(r() * 12 * 20), p: Math.floor(r() * PLACES.length) }
    const m = (r() < 0.05 ? 1 : 0) | (r() < 0.01 ? 2 : 0) | (r() < 0.05 ? 4 : 0)
    if (m) b.m = m
    return b
  })
  return { v: 1, ...(name ? { name } : {}), places: PLACES, countries: ISO, birds }
}
const byIndex = (a: ShareBird[]) => [...a].sort((x, y) => codes.indexOf(x.code) - codes.indexOf(y.code))

describe('share links', () => {
  it('round-trips a 197-bird payload at level regions under 2000 chars', () => {
    const p = payload(197, 7, 'Yusuf')
    const { token, level } = encodeShare(p)
    expect(level).toBe('regions')
    expect(`https://everybird.vercel.app/s/${token}`.length).toBeLessThanOrEqual(2000)
    expect(token[0]).toBe('1')
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/)
    const d = decodeShare(token)
    expect(d.v).toBe(1)
    expect(d.name).toBe('Yusuf')
    expect(d.places).toEqual(PLACES)
    expect(d.countries).toEqual(ISO)
    expect(d.birds).toEqual(byIndex(p.birds))
  })

  it('a 3000-bird payload falls back and stays under 2000 chars', () => {
    const { token, level } = encodeShare(payload(3000, 11, undefined, clustered))
    expect(['dates', 'species']).toContain(level)
    expect(token.length).toBeLessThanOrEqual(TOKEN_BUDGET)
    expect(`https://everybird.vercel.app/s/${token}`.length).toBeLessThanOrEqual(2000)
    const d = decodeShare(token)
    expect(d.birds).toHaveLength(3000)
    expect(d.places).toBeUndefined()
    if (level === 'species') expect(d.birds.every((b) => b.ym === undefined)).toBe(true)
  })

  it('measures a random 3000-bird list (the worst case) without crashing', () => {
    // Uniformly random birds do not fit 2,000 characters at 3000; real lists come in runs and do (see above).
    expect(() => encodeShare(payload(3000, 11))).toThrow(ShareTooLarge)
  })

  it('falls back one level at a time', () => {
    const p = payload(400, 3)
    const regions = encodeShare(p, 4000)
    expect(regions.level).toBe('regions')
    const c = encodeShare(p, regions.token.length - 1)
    expect(c.level).not.toBe('regions')
    const dc = decodeShare(c.token)
    if (c.level === 'countries') {
      expect(dc.places!.every((s) => ['Canada', 'Egypt', 'India', 'United States', 'United Kingdom', 'Australia'].includes(s))).toBe(true)
      expect(new Set(dc.countries).size).toBe(dc.countries!.length)
    }
  })

  it('throws ShareTooLarge when even species does not fit', () => {
    const p: SharePayload = { v: 1, birds: sample(5000, 2).map((code) => ({ code })) }
    expect(() => encodeShare(p)).toThrow(ShareTooLarge)
  })

  it('decodes the frozen v1 fixture', () => {
    // NEVER regenerate tests/fixtures/share/v1-frozen.txt. It is a link someone may already have shared; if this
    // test fails, the decoder broke old links. Fix the decoder, not the fixture.
    const token = readFileSync('tests/fixtures/share/v1-frozen.txt', 'utf8').trim()
    expect(decodeShare(token)).toEqual({
      v: 1,
      name: 'Ada Birder',
      places: ['Okanagan-Similkameen, British Columbia, Canada', 'Egypt'],
      countries: ['CA', 'EG'],
      birds: [
        { code: 'ostric2', ym: 1440 + 0, p: 0 },
        { code: 'ostric3', ym: 1452, yearOnly: true, p: 1, m: 1 },
        { code: 'soucas1', m: 2 },
        { code: 'dwacas1', ym: 1440 + 30, m: 4 },
        { code: 'emu1', ym: 1440 + 31, p: 1, m: 5 },
      ],
    })
  })

  it('rejects version 2 and corrupt tokens with a clear error', () => {
    const good = encodeShare(payload(20, 5)).token
    expect(() => decodeShare('2' + good.slice(1))).toThrow(/newer Everybird|version/i)
    expect(() => decodeShare('')).toThrow()
    expect(() => decodeShare('1')).toThrow()
    expect(() => decodeShare('1!!!not-base64')).toThrow()
    expect(() => decodeShare('garbage')).toThrow()
    expect(() => decodeShare(good.slice(0, good.length >> 1))).toThrow()
  })

  it('never throws anything but an Error on random corruption', () => {
    const good = encodeShare(payload(30, 9)).token
    const r = rng(1)
    for (let i = 0; i < 200; i++) {
      const k = Math.floor(r() * good.length)
      const bad = good.slice(0, k) + 'A' + good.slice(k + 1)
      try { decodeShare(bad) } catch (e) { expect(e).toBeInstanceOf(Error) }
    }
  })

  it('tokens contain no town names', () => {
    const regions = { v: 1 as const, countries: { CA: 'Canada', GB: 'United Kingdom [x]' }, sub1: { 'CA-BC': 'British Columbia', 'GB-ENG': 'England' } }
    const list: ListEntry[] = [
      { code: 'ostric2', date: '2020-03-04', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan-Similkameen', ...({ town: 'Penticton', lat: 49.5, lng: -119.6 } as object) }, heard: false, dead: false, media: false, sources: ['ebird'] },
      { code: 'soucas1', date: '2021', place: { country: 'GB', sub1: 'GB-ENG' }, heard: true, dead: false, media: false, sources: ['ebird'] },
    ]
    const p = payloadFromList(list, regions, 'Ada')
    expect(p.places).toEqual([formatPlace(list[0].place, regions), formatPlace(list[1].place, regions)])
    const { token } = encodeShare(p)
    const d = decodeShare(token)
    expect(d.places).toEqual(['Okanagan-Similkameen, British Columbia, Canada', 'England, United Kingdom'])
    expect(JSON.stringify(d)).not.toMatch(/Penticton|49\.5|119\.6|lat|lng/)
    expect(d.birds.find((b) => b.code === 'soucas1')).toMatchObject({ yearOnly: true, m: 1 })
  })

  it('truncates names to 40 characters and keeps UTF-8', () => {
    const name = 'Zoë 🐦 ' + 'x'.repeat(60)
    const d = decodeShare(encodeShare({ v: 1, name, birds: [{ code: codes[0] }] }).token)
    expect(Array.from(d.name!)).toHaveLength(40)
    expect(d.name!.startsWith('Zoë 🐦 ')).toBe(true)
  })

  it('refuses a code that is not in the link index', () => {
    expect(() => encodeShare({ v: 1, birds: [{ code: 'notabird' }] })).toThrow(/notabird/)
  })
})
