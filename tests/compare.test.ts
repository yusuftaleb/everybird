import { describe, expect, it } from 'vitest'
import linkIndex from '../data/link-index.json'
import {
  barInChoice, choiceAt, choiceCodes, choiceWords, firstChoice, gridCols, groupPayload, joinNames, linksIn, listColor, listColorHex, memberships, partInChoice,
  pasteRow, ranking, regionCounts, rowName, toggleList, type Choice, type CompareRow,
} from '@/lib/share/compare'
import { SHARE_COLORS } from '@/lib/share/image'
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

describe('what Compare shows (choiceCodes)', () => {
  const p = (...idx: number[]): SharePayload => ({ v: 1, birds: idx.map((i) => ({ code: C(i) })) })
  const of = (lists: SharePayload[], c: Choice) => sorted(choiceCodes(lists, c))
  it('two lists: yet to see, each alone, both, every bird', () => {
    const l = [p(1, 2, 3, 4), p(3, 4, 5)]
    expect(of(l, 'need')).toEqual([C(5)])
    expect(of(l, 0b01)).toEqual(sorted([C(1), C(2)]))
    expect(of(l, 0b10)).toEqual([C(5)])
    expect(of(l, 0b11)).toEqual(sorted([C(3), C(4)]))
    expect(of(l, 'every')).toHaveLength(5)
  })
  it('people chosen: the birds on exactly those lists and on no other, a region of the circles', () => {
    // Kalvin, Kalin, Isis (synthetic): 1 only Kalvin's, 2 Kalvin's and Kalin's, 3 on every list, 4 Kalin's and Isis's, 5 only Isis's.
    const l = [p(1, 2, 3), p(2, 3, 4), p(3, 4, 5)]
    expect(of(l, 0b001)).toEqual([C(1)])
    expect(of(l, 0b011)).toEqual([C(2)])
    expect(of(l, 0b111)).toEqual([C(3)])
    expect(of(l, 0b110)).toEqual([C(4)])
    expect(of(l, 0b101)).toEqual([])
    expect(of(l, 'need')).toEqual(sorted([C(4), C(5)]))
  })
  it('every combination of people, the diagram and the bars count from one source and agree', () => {
    for (const lists of [[p(1, 2, 3, 4), p(3, 4, 5)], [p(1, 2, 3), p(2, 3, 4), p(3, 5)], [p(1, 2), p(2, 3), p(3, 4, 2), p(2, 6), p(7), p(2, 8)]]) {
      const n = lists.length, full = (1 << n) - 1
      const counts = regionCounts(lists)
      for (let m = 1; m <= full; m++) expect(choiceCodes(lists, m)).toHaveLength(counts[m])
      expect(counts.reduce((a, b) => a + b, 0)).toBe(choiceCodes(lists, 'every').length)
      expect(counts.reduce((a, v, k) => (k & 1 ? a : a + v), 0)).toBe(choiceCodes(lists, 'need').length)
      // Each list's bar: the regions holding it add up to its species.
      lists.forEach((l, i) => expect(counts.reduce((a, v, k) => (k & (1 << i) ? a + v : a), 0)).toBe(new Set(l.birds.map((b) => b.code)).size))
      expect([...memberships(lists).values()].every((k) => k > 0 && k <= full)).toBe(true)
    }
  })
  it('compares species when a link has no dates or places, and a choice’s birds keep their own list’s dates', () => {
    const rich = list(50, 9, 'Ada')
    const bare: SharePayload = { v: 1, birds: rich.birds.slice(0, 20).map((b) => ({ code: b.code })).concat([{ code: 'zzz-none' }]) }
    expect(choiceCodes([bare, rich], 0b11)).toHaveLength(20)
    expect(choiceCodes([bare, rich], 0b01)).toEqual(['zzz-none'])
    expect(choiceCodes([bare, rich], 0b10)).toHaveLength(30)
    const onlyAda = groupPayload([bare, rich], choiceCodes([bare, rich], 0b10))
    expect(onlyAda.birds.every((b) => b.ym !== undefined && b.p === undefined)).toBe(true)
    expect(groupPayload([bare, rich], choiceCodes([bare, rich], 0b11)).birds.every((b) => b.ym === undefined)).toBe(true)
  })
  it("a choice's collage holds exactly its count, heard-only and found-dead birds included", () => {
    const a = list(40, 21), b = list(40, 22)
    a.birds.forEach((x, i) => { if (i % 3 === 0) x.m = 1; else if (i % 3 === 1) x.m = 2 })
    const regions = { v: 1 as const, countries: { CA: 'Canada', KE: 'Kenya', AU: 'Australia' }, sub1: {} }
    for (const c of ['need', 'every', 1, 2, 3] as Choice[]) {
      const codes = choiceCodes([a, b], c)
      const { records } = payloadToRecords(groupPayload([a, b], codes), regions)
      expect(buildList(records, emptySaved().edits, DEFAULT_RULES)).toHaveLength(codes.length)
    }
  })
  it('a comparison link reopens to the same birds for every choice', () => {
    const lists = [list(80, 11, 'You'), list(90, 12, 'Sam'), list(70, 13)]
    const back = decodeCompare(encodeCompare(lists).token)
    for (const c of ['need', 'every', 1, 2, 3, 4, 5, 6, 7] as Choice[]) expect(sorted(choiceCodes(back, c))).toEqual(sorted(choiceCodes(lists, c)))
  })
})

describe('choosing (the chips and the diagram)', () => {
  it('opens on Yet to see with your own list, else every bird', () => {
    expect(firstChoice(true)).toBe('need')
    expect(firstChoice(false)).toBe('every')
  })
  it('a person’s chip adds or removes that person; Yet to see and Every bird give way; none left is every bird', () => {
    expect(toggleList('need', 0)).toBe(0b001)
    expect(toggleList('every', 2)).toBe(0b100)
    expect(toggleList(0b001, 1)).toBe(0b011)
    expect(toggleList(0b011, 2)).toBe(0b111)
    expect(toggleList(0b011, 0)).toBe(0b010)
    expect(toggleList(0b010, 1)).toBe('every')
  })
  it('a region of the circles chooses its people; outside them, every bird', () => {
    expect([1, 3, 6, 7].map(choiceAt)).toEqual([1, 3, 6, 7])
    expect(choiceAt(0)).toBe('every')
  })
  it('names the choice for the heading: one person, several, every list, yours alone', () => {
    expect(choiceWords(0b001, 3, false)).toEqual({ kind: 'one', lists: [0] })
    expect(choiceWords(0b001, 3, true)).toEqual({ kind: 'you', lists: [0] })
    expect(choiceWords(0b011, 3, true)).toEqual({ kind: 'some', lists: [0, 1] })
    expect(choiceWords(0b111, 3, true)).toEqual({ kind: 'all', lists: [0, 1, 2] })
    expect(choiceWords('need', 3, true)).toEqual({ kind: 'need', lists: [] })
    expect(choiceWords('every', 2, false)).toEqual({ kind: 'every', lists: [] })
    expect(joinNames(['Kalvin', 'Kalin'])).toBe('Kalvin & Kalin')
    expect(joinNames(['Robin', 'Sam', 'Ada'])).toBe('Robin, Sam & Ada')
  })
  it('the diagram marks the choice: its parts at full strength, the others faded; the bars the same', () => {
    const on = (c: Choice, n: number) => Array.from({ length: (1 << n) - 1 }, (_, k) => k + 1).filter((m) => partInChoice(c, m))
    expect(on('need', 3)).toEqual([2, 4, 6])
    expect(on(7, 3)).toEqual([7])
    expect(on(3, 3)).toEqual([3])
    expect(on(2, 3)).toEqual([2])
    expect(on('every', 2)).toEqual([1, 2, 3])
    expect([0, 1, 2].map((i) => barInChoice('need', i))).toEqual([false, true, true])
    expect([0, 1, 2].map((i) => barInChoice(0b100, i))).toEqual([false, false, true])
    expect([0, 1, 2].map((i) => barInChoice(0b011, i))).toEqual([true, true, false])
    expect([0, 1, 2].every((i) => barInChoice(7, i) && barInChoice('every', i))).toBe(true)
  })
  it('ranks the lists by species, most first, equal lists in their order', () => {
    expect(ranking([1, 3, 2, 3, 0])).toEqual([1, 3, 2, 0, 4])
  })
  it('the sticker grid, the page’s width: three across on phones, up to ten on a wide page', () => {
    expect(gridCols(280)).toBe(3)
    expect(gridCols(358)).toBe(3)
    expect(gridCols(460)).toBe(4)
    expect(gridCols(700)).toBe(6)
    expect(gridCols(1088)).toBe(9)
    expect(gridCols(1400)).toBe(10)
  })
  it('each list’s colour: the tokens in CSS, the same mix in hex for the card, six apart', () => {
    expect([0, 1, 2, 3].map(listColor)).toEqual(['var(--accent)', 'var(--ink)', 'var(--line)', 'color-mix(in srgb, var(--accent) 50%, var(--paper))'])
    const light = [0, 1, 2, 3, 4, 5].map((i) => listColorHex(i, SHARE_COLORS.light))
    expect(light.slice(0, 3)).toEqual([SHARE_COLORS.light.accent, SHARE_COLORS.light.ink, SHARE_COLORS.light.line])
    // Accent half and half with Paper: #92140c and #f6f4ef.
    expect(light[3]).toBe('#c4847e')
    expect(new Set(light).size).toBe(6)
    expect(new Set([0, 1, 2, 3, 4, 5].map((i) => listColorHex(i, SHARE_COLORS.dark))).size).toBe(6)
  })
})

describe('pasteRow', () => {
  const L = (name: string): SharePayload => ({ v: 1, name, titled: true, birds: [{ code: C(1) }] })
  const link = (p: SharePayload) => `${SHARE_ORIGIN}/s/${encodeShare(p).token}`
  let next = 10
  const codec = { decode: decodeShare, decodeC: decodeCompare, link, id: () => next++ }
  const blank = (id: number): CompareRow => ({ id, text: '', list: null })
  const names = (rows: CompareRow[]) => rows.map(rowName)
  it('one link fills its row and its name from the link; a typed name stays; text without a link empties the row', () => {
    const r = pasteRow([blank(1)], 0, `look: ${link(L('Sam'))}`, 5, codec)
    expect(r).toMatchObject({ bad: 0, over: 0 })
    expect(r.rows[0]).toMatchObject({ id: 1, text: `look: ${link(L('Sam'))}` })
    expect(names(r.rows)).toEqual(['Sam'])
    const typed = pasteRow([{ ...blank(1), name: 'Samuel' }], 0, link(L('Sam')), 5, codec)
    expect(names(typed.rows)).toEqual(['Samuel'])
    expect(pasteRow(r.rows, 0, 'hello', 5, codec).rows[0]).toEqual({ id: 1, text: 'hello', list: null })
    expect(pasteRow([blank(1)], 0, `${SHARE_ORIGIN}/s/1broken`, 5, codec)).toMatchObject({ bad: 1, rows: [{ list: null }] })
  })
  it('several links fill that row, the blank rows after it, then new rows, a link each, keeping the filled rows', () => {
    const ada = { id: 2, text: link(L('Ada')), list: L('Ada') }
    const rows = [blank(1), blank(3), ada, blank(4)]
    const r = pasteRow(rows, 0, [L('A'), L('B'), L('C'), L('D')].map(link).join(' '), 5, codec)
    expect(r.rows.map((x) => x.id)).toEqual([1, 3, 4, 10, 2])
    expect(names(r.rows)).toEqual(['A', 'B', 'C', 'D', 'Ada'])
    expect(r.rows[1].text).toBe(link(L('B')))
    expect(r.over).toBe(0)
  })
  it('a comparison link fills a row per list, within the room, counting the rest', () => {
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(L)
    const r = pasteRow([blank(1), blank(2)], 1, `${SHARE_ORIGIN}/c/${encodeCompare(six).token}`, 5, codec)
    expect(names(r.rows)).toEqual(['', 'a', 'b', 'c', 'd'])
    expect(r.over).toBe(2)
    expect(pasteRow([blank(1)], 0, `${SHARE_ORIGIN}/c/${encodeCompare(six).token}`, 6, codec).over).toBe(0)
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
