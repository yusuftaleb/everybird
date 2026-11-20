import { describe, expect, it } from 'vitest'
import linkIndex from '../data/link-index.json'
import { compareGroups, compareTable, groupPayload, linksIn } from '@/lib/share/compare'
import { makeCompareLink } from '@/lib/share/make-link'
import { payloadToRecords } from '@/lib/share/convert'
import { buildList } from '@/lib/list/build-list'
import { DEFAULT_RULES } from '@/lib/list/model'
import { emptySaved } from '@/lib/list/storage'
import { COMPARE_MAX, COMPARE_TOKEN_BUDGET, decodeCompare, decodeShare, encodeCompare, encodeShare, SHARE_ORIGIN, ShareDecodeError, ShareTooLarge, type SharePayload } from '@/lib/share/link'

const codes = linkIndex as string[]
const C = (i: number) => codes[i]

function rng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
}
/** n random species with a month and one of a few places each: a synthetic list, the worst case for the deltas. */
function list(n: number, seed: number, name?: string): SharePayload {
  const r = rng(seed)
  const picked = new Set<number>()
  while (picked.size < n) picked.add(Math.floor(r() * codes.length))
  const birds = [...picked].map((i) => ({ code: codes[i], ym: 1400 + Math.floor(r() * 300), p: Math.floor(r() * 3) }))
  return { v: 1, ...(name ? { name, titled: true as const } : {}), places: ['Ontario, Canada', 'Kenya', 'Victoria, Australia'], countries: ['CA', 'KE', 'AU'], birds }
}
const sorted = (a: string[]) => [...a].sort()

describe('comparison token', () => {
  it('round-trips two to six lists, names and order kept', () => {
    const lists = [list(30, 1, "Ada's birds"), list(40, 2), list(5, 3, 'Sam'), list(0, 4)]
    const { token, level } = encodeCompare(lists)
    expect(token[0]).toBe('c')
    expect(level).toBe('regions')
    const back = decodeCompare(token)
    expect(back).toHaveLength(4)
    back.forEach((p, i) => expect(sorted(p.birds.map((b) => b.code))).toEqual(sorted(lists[i].birds.map((b) => b.code))))
    expect(back.map((p) => p.name)).toEqual(["Ada's birds", undefined, 'Sam', undefined])
    // Each list decodes exactly as its own share link would.
    lists.forEach((p, i) => expect(back[i]).toEqual(decodeShare(encodeShare(p, 1e9).token)))
  })
  it('drops to a poorer level for every list before it gives up', () => {
    const lists = [list(300, 5), list(300, 6)]
    const full = encodeCompare(lists, 1e9)
    const small = encodeCompare(lists, full.token.length - 1)
    expect(small.level).not.toBe('regions')
    expect(small.token.length).toBeLessThan(full.token.length)
    expect(() => encodeCompare(lists, 10)).toThrow(ShareTooLarge)
  })
  it('holds 2 to COMPARE_MAX lists, and refuses the rest', () => {
    expect(() => encodeCompare([list(3, 1)])).toThrow()
    expect(() => encodeCompare(Array.from({ length: COMPARE_MAX + 1 }, (_, i) => list(3, i)))).toThrow()
    expect(decodeCompare(encodeCompare(Array.from({ length: COMPARE_MAX }, (_, i) => list(3, i))).token)).toHaveLength(COMPARE_MAX)
  })
  it('never reads a single-list token, nor a single-list decoder a comparison', () => {
    const single = encodeShare(list(10, 1)).token
    const both = encodeCompare([list(10, 1), list(10, 2)]).token
    expect(() => decodeCompare(single)).toThrow(ShareDecodeError)
    expect(() => decodeShare(both)).toThrow(ShareDecodeError)
    expect(() => decodeCompare('c' + both.slice(1, -4))).toThrow(ShareDecodeError)
    expect(() => decodeCompare('cAAAA')).toThrow(ShareDecodeError)
  })
  it('sizes: six lists of 1,000 species fit as species only; six of 5,000 do not', () => {
    const size = (n: number, k: number) => {
      try {
        return encodeCompare(Array.from({ length: k }, (_, i) => list(n, 100 + i)))
      } catch (e) {
        if (e instanceof ShareTooLarge) return null
        throw e
      }
    }
    const raw = (n: number, k: number, level: 'species' | 'regions') => {
      const lists = Array.from({ length: k }, (_, i) => list(n, 100 + i))
      return encodeCompare(level === 'species' ? lists.map((p) => ({ v: 1 as const, birds: p.birds.map((b) => ({ code: b.code })) })) : lists, 1e9).token.length
    }
    // Measured, uniformly random species (real lists cluster by family and come out smaller).
    expect(raw(1000, 2, 'species')).toBeLessThan(2200)
    expect(raw(1000, 6, 'species')).toBeLessThan(COMPARE_TOKEN_BUDGET)
    expect(raw(5000, 2, 'species')).toBeLessThan(COMPARE_TOKEN_BUDGET)
    expect(raw(5000, 6, 'species')).toBeGreaterThan(COMPARE_TOKEN_BUDGET)
    expect(size(1000, 6)?.level).toBe('species')
    expect(size(5000, 2)?.level).toBe('species')
    expect(size(5000, 6)).toBeNull()
    expect(`${SHARE_ORIGIN}/c/`.length + COMPARE_TOKEN_BUDGET).toBe(8000)
  })
})

describe('compareGroups', () => {
  const p = (...idx: number[]): SharePayload => ({ v: 1, birds: idx.map((i) => ({ code: C(i) })) })
  it('two lists: both, only the first, only the second', () => {
    const g = compareGroups([p(1, 2, 3, 4), p(3, 4, 5)])
    expect(g.map((x) => x.who)).toEqual(['all', 0, 1])
    expect(sorted(g[0].codes)).toEqual(sorted([C(3), C(4)]))
    expect(sorted(g[1].codes)).toEqual(sorted([C(1), C(2)]))
    expect(g[2].codes).toEqual([C(5)])
  })
  it('three lists: seen by everyone and each one alone (a bird on two of three is in neither)', () => {
    const g = compareGroups([p(1, 2, 3), p(2, 3, 4), p(3, 5)])
    expect(g[0].codes).toEqual([C(3)])
    expect(g[1].codes).toEqual([C(1)])
    expect(g[2].codes).toEqual([C(4)])
    expect(g[3].codes).toEqual([C(5)])
  })
  it('compares species when a link has no dates or places, and each group keeps its own list’s details', () => {
    const rich = list(50, 9, 'Ada')
    const bare: SharePayload = { v: 1, birds: rich.birds.slice(0, 20).map((b) => ({ code: b.code })).concat([{ code: 'zzz-none' }]) }
    const g = compareGroups([bare, rich])
    expect(g[0].codes).toHaveLength(20)
    expect(g[1].codes).toEqual(['zzz-none'])
    expect(g[2].codes).toHaveLength(30)
    const onlyAda = groupPayload([bare, rich], g[2])
    expect(onlyAda.name).toBe('Ada')
    expect(onlyAda.birds.every((b) => b.ym !== undefined)).toBe(true)
    expect(groupPayload([bare, rich], g[0]).birds.every((b) => b.ym === undefined)).toBe(true)
  })
  it("a group's collage holds exactly its count, heard-only and found-dead birds included", () => {
    const a = list(40, 21), b = list(40, 22)
    a.birds.forEach((x, i) => { if (i % 3 === 0) x.m = 1; else if (i % 3 === 1) x.m = 2 })
    const regions = { v: 1 as const, countries: { CA: 'Canada', KE: 'Kenya', AU: 'Australia' }, sub1: {} }
    for (const g of compareGroups([a, b])) {
      const { records } = payloadToRecords(groupPayload([a, b], g), regions)
      expect(buildList(records, emptySaved().edits, DEFAULT_RULES)).toHaveLength(g.codes.length)
    }
  })
  it('a comparison link reopens to the same groups', () => {
    const lists = [list(80, 11, 'You'), list(90, 12, 'Sam'), list(70, 13)]
    const back = decodeCompare(encodeCompare(lists).token)
    const a = compareGroups(lists), b = compareGroups(back)
    expect(b.map((x) => sorted(x.codes))).toEqual(a.map((x) => sorted(x.codes)))
  })
})

describe('linksIn', () => {
  const t1 = encodeShare(list(5, 1)).token, t2 = encodeShare(list(6, 2)).token
  it('finds links in any origin and language, bare tokens too, once each, and counts the broken ones', () => {
    const text = `Here's mine: ${SHARE_ORIGIN}/s/${t1}.\n  and Sam's https://example.com/es/s/${t2}?x=1 (again ${t1}) ${SHARE_ORIGIN}/s/1broken`
    const { lists, bad } = linksIn(text, decodeShare)
    expect(lists).toHaveLength(2)
    expect(lists[1].birds).toHaveLength(6)
    expect(bad).toBe(1)
    expect(linksIn('  \n ', decodeShare)).toEqual({ lists: [], bad: 0, compared: false })
    expect(linksIn('call 16045551234 tonight', decodeShare).bad).toBe(0)
  })
  it('a comparison link opens its lists in its place; without its decoder, or as a bare word, it is no link', () => {
    const c = encodeCompare([list(3, 7, 'Ada'), list(4, 8, 'Sam')]).token
    const text = `look ${SHARE_ORIGIN}/fr/c/${c} and ${SHARE_ORIGIN}/s/${t1} ${c} comparison`
    const r = linksIn(text, decodeShare, decodeCompare)
    expect(r.compared).toBe(true)
    expect(r.bad).toBe(0)
    expect(r.lists.map((p) => p.name)).toEqual(['Ada', 'Sam', undefined])
    expect(r.lists[2].birds).toHaveLength(5)
    expect(linksIn(text, decodeShare)).toMatchObject({ compared: false, bad: 0 })
    expect(linksIn(`${SHARE_ORIGIN}/c/cbroken`, decodeShare, decodeCompare)).toEqual({ lists: [], bad: 1, compared: false })
  })
})

describe('compareGroups and compareTable', () => {
  const p = (...idx: number[]): SharePayload => ({ v: 1, birds: idx.map((i) => ({ code: C(i) })) })
  it('your list and one other: the birds you still need first, then both of you, then only you', () => {
    const g = compareGroups([p(1, 2, 3), p(2, 3, 4, 5)], true)
    expect(g.map((x) => x.who)).toEqual([1, 'all', 0])
    expect(g.map((x) => sorted(x.codes))).toEqual([sorted([C(4), C(5)]), sorted([C(2), C(3)]), [C(1)]])
    // Not the viewer's list, or three lists: everyone first, then each list's own, in list order.
    expect(compareGroups([p(1), p(2)]).map((x) => x.who)).toEqual(['all', 0, 1])
    expect(compareGroups([p(1), p(2), p(3)], true).map((x) => x.who)).toEqual(['all', 0, 1, 2])
  })
  it('the table holds every bird once, a bird on two of three lists included, with the lists it is on', () => {
    const lists = [p(1, 2), p(2, 3), p(3, 4, 2)]
    const rows = compareTable(lists)
    expect(rows).toHaveLength(4)
    expect(rows.find((r) => r.code === C(3))!.on).toEqual([false, true, true]) // in no group
    expect(rows.find((r) => r.code === C(2))!.on).toEqual([true, true, true])
    expect(rows.find((r) => r.code === C(4))!.on).toEqual([false, false, true])
    const grouped = new Set(compareGroups(lists).flatMap((g) => g.codes))
    expect(grouped.has(C(3))).toBe(false)
  })
})

describe('makeCompareLink', () => {
  it('makes a /c/ link that reopens, leaving out codes the link index lacks', () => {
    const a = list(20, 1, 'Ada'), b = list(20, 2)
    const r = makeCompareLink([{ ...a, birds: [...a.birds, { code: 'zzz-new' }] }, b], SHARE_ORIGIN)
    if (!('url' in r)) throw new Error('blocked')
    expect(r.url.startsWith(`${SHARE_ORIGIN}/c/c`)).toBe(true)
    const back = decodeCompare(r.url.split('/c/')[1])
    expect(back[0].birds).toHaveLength(20)
    expect(back[0].name).toBe('Ada')
  })
  it('over the cap, sharing is blocked with the reason', () => {
    expect(makeCompareLink(Array.from({ length: COMPARE_MAX + 1 }, (_, i) => list(3, i)), SHARE_ORIGIN)).toEqual({ blocked: 'tooMany' })
    expect(makeCompareLink(Array.from({ length: COMPARE_MAX }, (_, i) => list(5000, 100 + i)), SHARE_ORIGIN)).toEqual({ blocked: 'tooBig' })
  })
})
