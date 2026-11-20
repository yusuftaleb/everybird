import { describe, expect, it } from 'vitest'
import linkIndex from '../data/link-index.json'
import { addWithin, compareGroups, evenly, gridCols, groupPayload, linksIn, memberships, ranking, regionCounts, type GroupId } from '@/lib/share/compare'
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
  const byId = (lists: SharePayload[], you = false) => new Map<GroupId, string[]>(compareGroups(lists, you).map((g) => [g.id, sorted(g.codes)]))
  it('two lists: yet to see (with yours), both, only each, every bird, in the chips’ order', () => {
    const g = compareGroups([p(1, 2, 3, 4), p(3, 4, 5)], true)
    expect(g.map((x) => x.id)).toEqual(['need', 'all', 0, 1, 'every'])
    const m = byId([p(1, 2, 3, 4), p(3, 4, 5)], true)
    expect(m.get('need')).toEqual([C(5)])
    expect(m.get('all')).toEqual(sorted([C(3), C(4)]))
    expect(m.get(0)).toEqual(sorted([C(1), C(2)]))
    expect(m.get(1)).toEqual([C(5)])
    expect(m.get('every')).toHaveLength(5)
    // Without your own list first, no "Yet to see".
    expect(compareGroups([p(1), p(2)]).map((x) => x.id)).toEqual(['all', 0, 1, 'every'])
  })
  it('three lists: on every list and each one alone (a bird on two of three is in neither); yet to see is any other list’s', () => {
    const m = byId([p(1, 2, 3), p(2, 3, 4), p(3, 5)], true)
    expect(m.get('all')).toEqual([C(3)])
    expect(m.get(0)).toEqual([C(1)])
    expect(m.get(1)).toEqual([C(4)])
    expect(m.get(2)).toEqual([C(5)])
    expect(m.get('need')).toEqual(sorted([C(4), C(5)]))
  })
  it('the chips, the diagram and the bars count from one source and agree', () => {
    for (const lists of [[p(1, 2, 3, 4), p(3, 4, 5)], [p(1, 2, 3), p(2, 3, 4), p(3, 5)], [p(1, 2), p(2, 3), p(3, 4, 2), p(2, 6), p(7), p(2, 8)]]) {
      const n = lists.length, full = (1 << n) - 1
      const counts = regionCounts(lists)
      const m = byId(lists, true)
      expect(counts[full]).toBe(m.get('all')!.length)
      lists.forEach((_, i) => expect(counts[1 << i]).toBe(m.get(i)!.length))
      expect(counts.reduce((a, b) => a + b, 0)).toBe(m.get('every')!.length)
      expect(counts.reduce((a, v, k) => (k & 1 ? a : a + v), 0)).toBe(m.get('need')!.length)
      // Each list's bar: the regions holding it add up to its species.
      lists.forEach((l, i) => expect(counts.reduce((a, v, k) => (k & (1 << i) ? a + v : a), 0)).toBe(new Set(l.birds.map((b) => b.code)).size))
      expect([...memberships(lists).values()].every((k) => k > 0 && k <= full)).toBe(true)
    }
  })
  it('compares species when a link has no dates or places, and a group’s birds keep their own list’s dates', () => {
    const rich = list(50, 9, 'Ada')
    const bare: SharePayload = { v: 1, birds: rich.birds.slice(0, 20).map((b) => ({ code: b.code })).concat([{ code: 'zzz-none' }]) }
    const m = byId([bare, rich])
    expect(m.get('all')).toHaveLength(20)
    expect(m.get(0)).toEqual(['zzz-none'])
    expect(m.get(1)).toHaveLength(30)
    const onlyAda = groupPayload([bare, rich], m.get(1)!)
    expect(onlyAda.birds.every((b) => b.ym !== undefined && b.p === undefined)).toBe(true)
    expect(groupPayload([bare, rich], m.get('all')!).birds.every((b) => b.ym === undefined)).toBe(true)
  })
  it("a group's collage holds exactly its count, heard-only and found-dead birds included", () => {
    const a = list(40, 21), b = list(40, 22)
    a.birds.forEach((x, i) => { if (i % 3 === 0) x.m = 1; else if (i % 3 === 1) x.m = 2 })
    const regions = { v: 1 as const, countries: { CA: 'Canada', KE: 'Kenya', AU: 'Australia' }, sub1: {} }
    for (const g of compareGroups([a, b], true)) {
      const { records } = payloadToRecords(groupPayload([a, b], g.codes), regions)
      expect(buildList(records, emptySaved().edits, DEFAULT_RULES)).toHaveLength(g.codes.length)
    }
  })
  it('a comparison link reopens to the same groups', () => {
    const lists = [list(80, 11, 'You'), list(90, 12, 'Sam'), list(70, 13)]
    const back = decodeCompare(encodeCompare(lists).token)
    expect(compareGroups(back).map((x) => sorted(x.codes))).toEqual(compareGroups(lists).map((x) => sorted(x.codes)))
  })
  it('ranks the lists by species, most first, equal lists in their order', () => {
    expect(ranking([1, 3, 2, 3, 0])).toEqual([1, 3, 2, 0, 4])
  })
  it('takes the card’s stickers in even steps through a group', () => {
    const g = Array.from({ length: 100 }, (_, i) => `b${i}`)
    expect(evenly(g.slice(0, 3), 18)).toEqual(['b0', 'b1', 'b2'])
    const out = evenly(g, 4)
    expect(out).toEqual(['b0', 'b25', 'b50', 'b75'])
  })
  it('the sticker grid: three across on phones, up to six on a wide column', () => {
    expect(gridCols(280)).toBe(3)
    expect(gridCols(358)).toBe(3)
    expect(gridCols(460)).toBe(4)
    expect(gridCols(580)).toBe(5)
    expect(gridCols(700)).toBe(6)
    expect(gridCols(1200)).toBe(6)
  })
})

describe('addWithin', () => {
  const L = (name: string): SharePayload => ({ v: 1, name, birds: [{ code: C(1) }] })
  const names = (ls: SharePayload[]) => ls.map((l) => l.name)
  it('keeps the held lists and as many new ones as the room takes, counting the rest', () => {
    const r = addWithin([L('a'), L('b')], [L('c'), L('d'), L('e'), L('f')], COMPARE_MAX - 1)
    expect(names(r.lists)).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(r.over).toBe(1)
  })
  it('adds nothing to a full page, and everything while there is room', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(L)
    expect(addWithin(six, [L('g')], COMPARE_MAX)).toEqual({ lists: six, over: 1 })
    expect(addWithin([], [L('a'), L('b')], COMPARE_MAX)).toEqual({ lists: [L('a'), L('b')], over: 0 })
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
  it('splits links a one-line field ran together', () => {
    expect(linksIn(`${SHARE_ORIGIN}/s/${t1}${SHARE_ORIGIN}/s/${t2}`, decodeShare).lists.map((p) => p.birds.length)).toEqual([5, 6])
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
