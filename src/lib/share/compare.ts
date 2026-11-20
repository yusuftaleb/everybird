// Compare with friends (issue #10), the pure parts: the groups of a comparison and the links pasted in. No link-index
// import: the decoder is passed in, so this stays light.
import type { SharePayload } from './link'

/**
 * Each species in the comparison with the lists it is on, as a bit mask (bit i: list i), in first-seen order: the one
 * source of every count Compare shows, so the chips, the diagram and the bars never disagree.
 */
export function memberships(lists: readonly SharePayload[]): Map<string, number> {
  const m = new Map<string, number>()
  lists.forEach((p, i) => { for (const b of p.birds) m.set(b.code, (m.get(b.code) ?? 0) | (1 << i)) })
  return m
}

/** A chip's group: 'need' (birds on some other list, not the first: "Yet to see"), 'all' (on every list), a list's
 *  place (on that list alone) or 'every' (every bird in the comparison). */
export type GroupId = 'need' | 'all' | 'every' | number
export type CompareGroup = { id: GroupId; codes: string[] }

/**
 * The chips, in their order: Yet to see (only with `you`, the first list the viewer's own), on every list, each list's
 * own birds (the first list's first), every bird. Each group's codes in first-seen order.
 */
export function compareGroups(lists: readonly SharePayload[], you = false): CompareGroup[] {
  const m = [...memberships(lists)]
  const full = (1 << lists.length) - 1
  const pick = (f: (mask: number) => boolean) => m.flatMap(([c, k]) => (f(k) ? [c] : []))
  return [
    ...(you ? [{ id: 'need' as const, codes: pick((k) => !(k & 1)) }] : []),
    { id: 'all', codes: pick((k) => k === full) },
    ...lists.map((_, i): CompareGroup => ({ id: i, codes: pick((k) => k === 1 << i) })),
    { id: 'every', codes: m.map(([c]) => c) },
  ]
}

/** How many species each combination of lists holds, indexed by mask (index 0, on no list, stays 0): the diagram's numbers. */
export function regionCounts(lists: readonly SharePayload[]): number[] {
  const out = new Array<number>(1 << lists.length).fill(0)
  for (const k of memberships(lists).values()) out[k]++
  return out
}

/** The lists' places by their species counts, most first; equal lists keep their order (the bars). */
export function ranking(sizes: readonly number[]): number[] {
  return sizes.map((_, i) => i).sort((x, y) => sizes[y] - sizes[x] || x - y)
}

/** The sticker grid: tiles at least TILE_MIN px wide with TILE_GAP between, three to six across; GRID_ROWS rows show
 *  before "Show all". */
export const TILE_MIN = 104
export const TILE_GAP = 12
export const GRID_ROWS = 3
export const gridCols = (width: number): number => Math.min(6, Math.max(3, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP))))

/** Up to `n` of `codes`, in even steps through them (the card's strip of stickers). */
export const evenly = (codes: readonly string[], n: number): string[] =>
  codes.length <= n ? [...codes] : Array.from({ length: n }, (_, j) => codes[Math.floor((j * codes.length) / n)])

/** A group's birds as one payload: each bird from the first list holding it, with that list's date and marks (no places:
 *  each list numbers its own). */
export function groupPayload(lists: readonly SharePayload[], codes: readonly string[]): SharePayload {
  const keep = new Set(codes)
  const birds = lists.flatMap((l) => l.birds.filter((b) => keep.delete(b.code))).map((b) => ({ ...b }))
  for (const b of birds) delete b.p
  return { v: 1, birds }
}

/**
 * The pasted lists `held` with `incoming` added after them, at most `room` in all (the page's cap: COMPARE_MAX, one
 * less while the birder's own list joins them): the lists kept, the first ones, and how many were left out.
 */
export function addWithin(held: readonly SharePayload[], incoming: readonly SharePayload[], room: number): { lists: SharePayload[]; over: number } {
  const all = [...held, ...incoming]
  return { lists: all.slice(0, Math.max(0, room)), over: Math.max(0, all.length - Math.max(0, room)) }
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
