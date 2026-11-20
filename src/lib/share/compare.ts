// Compare with friends (issue #10), the pure parts: the groups of a comparison and the links pasted in. No link-index
// import: the decoder is passed in, so this stays light.
import type { SharePayload } from './link'

/** A comparison's group: the species on every list (`who: 'all'`), or those on list `who`'s alone. Its birds are
 *  drawn from list `from` (the first list for 'all'), so a group's dates and places are one birder's. */
export type CompareGroup = { who: 'all' | number; from: number; codes: string[] }

/** Seen by everyone, then each list's own birds (on no other list), in list order: the groups of three or more lists. */
export function compareGroups(lists: readonly SharePayload[]): CompareGroup[] {
  const sets = lists.map((p) => new Set(p.birds.map((b) => b.code)))
  const count = new Map<string, number>()
  for (const s of sets) for (const c of s) count.set(c, (count.get(c) ?? 0) + 1)
  const all: CompareGroup = { who: 'all', from: 0, codes: [...(sets[0] ?? [])].filter((c) => count.get(c) === lists.length) }
  const own = sets.map((s, i): CompareGroup => ({ who: i, from: i, codes: [...s].filter((c) => count.get(c) === 1) }))
  return [all, ...own]
}

/** One of the three parts of the first list against another: the other's birds the first lacks, both, the first's alone. */
export type PairPart = 'other' | 'both' | 'first'
export type PairGroup = CompareGroup & { part: PairPart }
export const PAIR_PARTS: readonly PairPart[] = ['other', 'both', 'first']

/**
 * The first list against list `k` (the Venn's two circles), in PAIR_PARTS order: the birds on `k` that the first
 * lacks (drawn from `k`, so its dates and places), those on both and those on the first alone (both from the first).
 * With two lists they are compareGroups' groups; with more, the other lists don't count.
 */
export function pairGroups(lists: readonly SharePayload[], k: number): PairGroup[] {
  const a = new Set(lists[0].birds.map((b) => b.code))
  const b = new Set(lists[k].birds.map((x) => x.code))
  return [
    { part: 'other', who: k, from: k, codes: [...b].filter((c) => !a.has(c)) },
    { part: 'both', who: 'all', from: 0, codes: [...a].filter((c) => b.has(c)) },
    { part: 'first', who: 0, from: 0, codes: [...a].filter((c) => !b.has(c)) },
  ]
}

/** The lists' places, most species first; equal lists keep their order. */
export function ranking(lists: readonly SharePayload[]): number[] {
  const n = lists.map((p) => new Set(p.birds.map((b) => b.code)).size)
  return n.map((_, i) => i).sort((x, y) => n[y] - n[x] || x - y)
}

/**
 * Up to `n` codes from `groups`, in group order, each group's share in proportion to its size (at least one from every
 * group with birds, while `n` allows), taken in even steps through it: the comparison card's stickers.
 */
export function spread(groups: readonly (readonly string[])[], n: number): string[] {
  const total = groups.reduce((s, g) => s + g.length, 0)
  if (total <= n) return groups.flat()
  const want = groups.map((g) => (g.length ? Math.max(1, Math.floor((n * g.length) / total)) : 0))
  // Hand out what rounding left, biggest groups first; or take back what the minimum of one overshot, from the
  // biggest share, and when every share is one (more groups than `n`), from the smallest groups.
  const order = groups.map((_, i) => i).sort((x, y) => groups[y].length - groups[x].length)
  let left = n - want.reduce((s, w) => s + w, 0)
  for (let j = 0; left > 0; j = (j + 1) % order.length) {
    const i = order[j]
    if (want[i] < groups[i].length) { want[i]++; left-- }
  }
  while (left < 0) {
    const i = order.find((x) => want[x] > 1) ?? [...order].reverse().find((x) => want[x] > 0)!
    want[i]--
    left++
  }
  return groups.flatMap((g, i) => Array.from({ length: want[i] }, (_, j) => g[Math.floor((j * g.length) / want[i])]))
}

/** Every bird in the comparison, once, in first-seen order, with whether each list has it (the species × people table). */
export function compareTable(lists: readonly SharePayload[]): { code: string; on: boolean[] }[] {
  const sets = lists.map((p) => new Set(p.birds.map((b) => b.code)))
  const codes = new Set(lists.flatMap((p) => p.birds.map((b) => b.code)))
  return [...codes].map((code) => ({ code, on: sets.map((s) => s.has(code)) }))
}

/** The group as one list's payload: its birds, with that list's own dates, places, marks and name. */
export function groupPayload(lists: readonly SharePayload[], g: CompareGroup): SharePayload {
  const keep = new Set(g.codes)
  const p = lists[g.from]
  return { ...p, birds: p.birds.filter((b) => keep.has(b.code)) }
}

/**
 * The share links in pasted text, chat around them included: every `…/s/<token>` (any origin, any language prefix) and
 * every bare token, once each, decoded with `decode`; with `decodeC`, every comparison link `…/c/<token>` too (the URL
 * form only: a bare word starting with "c" is just a word), its lists in its place. `compared`: a comparison link
 * opened. `bad` counts the links that don't open; other words are ignored.
 */
export function linksIn(
  text: string, decode: (token: string) => SharePayload, decodeC?: (token: string) => SharePayload[],
): { lists: SharePayload[]; bad: number; compared: boolean } {
  const seen = new Set<string>()
  const lists: SharePayload[] = []
  let bad = 0, compared = false
  // A one-line field drops the line breaks between pasted links ("…/s/1abchttps://…"): split before every scheme too.
  for (const piece of text.replace(/https?:\/\//g, ' $&').split(/\s+/)) {
    const c = decodeC && /\/c\/(c[A-Za-z0-9_-]+)/.exec(piece)?.[1]
    const token = c || (/\/s\/([A-Za-z0-9_-]+)/.exec(piece)?.[1] ?? /^(?!\d+$)1[A-Za-z0-9_-]{8,}$/.exec(piece)?.[0])
    if (!token || seen.has(token)) continue
    seen.add(token)
    try {
      if (c) { lists.push(...decodeC(c)); compared = true }
      else lists.push(decode(token))
    } catch {
      bad++
    }
  }
  return { lists, bad, compared }
}
