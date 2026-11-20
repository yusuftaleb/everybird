// Compare with friends (issue #10), the pure parts: the groups of a comparison and the links pasted in. No link-index
// import: the decoder is passed in, so this stays light.
import type { SharePayload } from './link'

/** A comparison's group: the species on every list (`who: 'all'`), or those on list `who`'s alone. Its birds are
 *  drawn from list `from` (the first list for 'all'), so a group's dates and places are one birder's. */
export type CompareGroup = { who: 'all' | number; from: number; codes: string[] }

/** Seen by everyone (for two lists, both of you), then each list's own birds, in list order. With `you` (the first list
 *  is the viewer's) and two lists, the other list's own birds come first: the birds the viewer still needs. */
export function compareGroups(lists: readonly SharePayload[], you = false): CompareGroup[] {
  const sets = lists.map((p) => new Set(p.birds.map((b) => b.code)))
  const count = new Map<string, number>()
  for (const s of sets) for (const c of s) count.set(c, (count.get(c) ?? 0) + 1)
  const all: CompareGroup = { who: 'all', from: 0, codes: [...(sets[0] ?? [])].filter((c) => count.get(c) === lists.length) }
  const own = sets.map((s, i): CompareGroup => ({ who: i, from: i, codes: [...s].filter((c) => count.get(c) === 1) }))
  return you && lists.length === 2 ? [own[1], all, own[0]] : [all, ...own]
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
  for (const piece of text.split(/\s+/)) {
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
