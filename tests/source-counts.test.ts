// Settings > Your list: what each source brings to the collage ("185 species · 12 only here") and the summary line,
// counted from the list the collage shows, so they always agree with it. Synthetic codes only.
import { describe, expect, it } from 'vitest'
import { buildList } from '@/lib/list/build-list'
import { DEFAULT_RULES, unmatchedKey, type Rules, type SourceRecord, type Unmatched } from '@/lib/list/model'
import { countParts, sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { emptySaved, type Saved } from '@/lib/list/storage'
import { recordsOf } from '@/lib/list/store'

const r = (code: string, source: SourceRecord['source'], extra: Partial<SourceRecord> = {}): SourceRecord => ({ code, source, date: '2024-05-04', ...extra })

/**
 * Life list download: a b c d(heard only) + a fixed row k. MyEBirdData: b c e h(heard) x(removed). iNaturalist: c f
 * g(not research grade) h. By hand: a (also on eBird) and m.
 */
function fixture(rules: Partial<Rules> = {}, marks: Saved['edits']['marks'] = {}): Saved {
  const s = emptySaved()
  s.records['ebird-list'] = [r('a', 'ebird'), r('b', 'ebird'), r('c', 'ebird'), r('d', 'ebird', { heard: true })]
  s.records.ebird = [r('b', 'ebird'), r('c', 'ebird'), r('e', 'ebird'), r('h', 'ebird', { heard: true }), r('x', 'ebird')]
  s.records.inat = [r('c', 'inat', { research: true }), r('f', 'inat', { research: true }), r('g', 'inat', { research: false }), r('h', 'inat', { research: true })]
  const u: Unmatched = { source: 'ebird', slot: 'ebird-list', row: 9, com: 'Typo bird', reason: 'no-match', date: '2020-01-01' }
  s.unmatched = [u]
  s.edits = { removed: ['x'], added: [r('a', 'manual'), r('m', 'manual')], marks, fixes: { [unmatchedKey(u)]: 'k' } }
  s.rules = { ...DEFAULT_RULES, ...rules }
  return s
}
/** The collage's list, built as the store builds it. */
const listOf = (s: Saved) => buildList(recordsOf(s), s.edits, s.rules)
const counts = (s: Saved) => sourceCounts(s, listOf(s))
const sum = (c: ReturnType<typeof sourceCounts>) => c.parts.reduce((a, p) => a + p.n, 0)

describe('sourceCounts', () => {
  it('counts each row, the eBird files as one source for "only here", and parts that sum to the collage', () => {
    const c = counts(fixture())
    expect(c.total).toBe(10) // a b c d e h k f g m; x removed
    expect(c.rows['ebird-list']).toEqual({ species: 5, only: 4, onlyIn: 'eBird' }) // a b c d k; only eBird: b d e k
    expect(c.rows.ebird).toEqual({ species: 4, only: 0, onlyIn: 'here' }) // b c e h: eBird's number is on the bigger row
    expect(c.rows.inat).toEqual({ species: 4, only: 2, onlyIn: 'here' }) // c f g h; only f g
    expect(c.rows.manual).toEqual({ species: 2, only: 1, onlyIn: 'here' }) // a m; only m
    expect(c.parts).toEqual([{ group: 'ebird', n: 7 }, { group: 'inat', n: 2 }, { group: 'manual', n: 1 }])
    expect(sum(c)).toBe(c.total)
    expect(summaryLine(c)).toBe('Your collage has 10 species: 7 from eBird, 2 more from iNaturalist, 1 ticked by hand.')
    expect(countParts(c.rows['ebird-list'])).toEqual(['5 species', '4 only in eBird'])
    expect(countParts(c.rows.ebird)).toEqual(['4 species'])
    expect(countParts(c.rows.inat)).toEqual(['4 species', '2 only here'])
  })

  it('hide heard only: a heard-only bird leaves, and a source whose only record was heard no longer brings it', () => {
    const c = counts(fixture({ hideHeard: true }))
    expect(c.total).toBe(9) // d goes; h stays (iNaturalist saw it) but MyEBirdData's h was heard only
    expect(c.rows['ebird-list']).toMatchObject({ species: 4, only: 3 }) // a b c k; only eBird: b e k
    expect(c.rows.ebird.species).toBe(3) // b c e
    expect(c.rows.inat).toMatchObject({ species: 4, only: 3 }) // c f g h; only f g h
    expect(c.parts.map((p) => p.n)).toEqual([5, 3, 1])
    expect(sum(c)).toBe(c.total)
  })

  it('a mark saying not heard only keeps the bird and its source', () => {
    const c = counts(fixture({ hideHeard: true }, { d: { heard: false } }))
    expect(c.total).toBe(10)
    expect(c.rows['ebird-list'].species).toBe(5)
    expect(sum(c)).toBe(c.total)
  })

  it('research grade only drops the observation the community has not agreed on', () => {
    const c = counts(fixture({ researchOnly: true }))
    expect(c.total).toBe(9) // g goes
    expect(c.rows.inat).toMatchObject({ species: 3, only: 1 }) // c f h; only f
    expect(c.parts.map((p) => p.n)).toEqual([7, 1, 1])
    expect(sum(c)).toBe(c.total)
  })

  it('one eBird file says "only here"; one source says "all from"; nothing says nothing', () => {
    const s = fixture()
    s.records.ebird = []
    const c = counts(s)
    expect(c.rows['ebird-list']).toEqual({ species: 5, only: 3, onlyIn: 'here' }) // b d k
    expect(countParts(c.rows['ebird-list'])).toEqual(['5 species', '3 only here'])
    const inat = emptySaved()
    inat.records.inat = [r('f', 'inat')]
    expect(summaryLine(counts(inat))).toBe('Your collage has 1 species, all from iNaturalist.')
    const hand = emptySaved()
    hand.edits = { ...hand.edits, added: [r('m', 'manual'), r('n', 'manual')] }
    expect(summaryLine(counts(hand))).toBe('Your collage has 2 species, all ticked by hand.')
    expect(summaryLine(counts(emptySaved()))).toBeNull()
  })

  it('a source wholly inside an earlier one adds no part', () => {
    const s = emptySaved()
    s.records['ebird-list'] = [r('a', 'ebird'), r('b', 'ebird')]
    s.records.inat = [r('a', 'inat')]
    const c = counts(s)
    expect(c.parts).toEqual([{ group: 'ebird', n: 2 }])
    expect(summaryLine(c)).toBe('Your collage has 2 species, all from eBird.')
    expect(c.rows.inat).toEqual({ species: 1, only: 0, onlyIn: 'here' })
  })

  it('a lone source (or the two eBird files alone) never says "only here"', () => {
    const s = emptySaved()
    s.records['ebird-list'] = [r('a', 'ebird'), r('b', 'ebird')]
    s.records.ebird = [r('b', 'ebird'), r('c', 'ebird')]
    const c = counts(s)
    expect(c.rows['ebird-list']).toMatchObject({ species: 2, only: 0 })
    expect(c.rows.ebird).toMatchObject({ species: 2, only: 0 })
    expect(summaryLine(c)).toBe('Your collage has 3 species, all from eBird.')
  })

  it('a bird kept only by two records together (one heard, one dead) still has a source', () => {
    const s = emptySaved()
    s.records['ebird-list'] = [r('a', 'ebird', { heard: true })]
    s.records.inat = [r('a', 'inat', { dead: true })]
    s.rules = { ...DEFAULT_RULES, hideHeard: true, hideDead: true }
    const c = counts(s)
    expect(c.total).toBe(1)
    expect(sum(c)).toBe(1)
  })
})
