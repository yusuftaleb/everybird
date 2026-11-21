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

/** The sticker grid, the page's full width: tiles at least TILE_MIN px wide with TILE_GAP between, three to GRID_MAX
 *  across; GRID_ROWS rows show before "Show all". */
export const TILE_MIN = 104
export const TILE_GAP = 12
export const GRID_ROWS = 3
export const GRID_MAX = 10
export const gridCols = (width: number): number => Math.min(GRID_MAX, Math.max(3, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP))))

/** A part of the diagram's group, by the lists it holds (`mask`, of `n`): every list's 'all', one list's own birds, or
 *  null for birds on some lists only (three circles' pairs) and outside the circles. */
export function groupOfMask(mask: number, n: number): GroupId | null {
  if (mask === (1 << n) - 1) return 'all'
  return mask > 0 && !(mask & (mask - 1)) ? Math.log2(mask) : null
}

/**
 * Whether the diagram's part `mask` (the birds on exactly those of `n` lists) holds group `id`'s birds, so the diagram
 * shows the chosen group at full strength and fades the rest: Yet to see is every part outside the first list; Every
 * bird every part.
 */
export function partInGroup(id: GroupId, mask: number, n: number): boolean {
  if (id === 'every') return true
  if (id === 'need') return !(mask & 1)
  if (id === 'all') return mask === (1 << n) - 1
  return mask === 1 << id
}
/** Whether list `i`'s bar holds some of group `id`'s birds (the bars' view of the same): every list's for Both and Every
 *  bird, the others' for Yet to see, its own for a list's own birds. */
export const barInGroup = (id: GroupId, i: number): boolean => id === 'every' || id === 'all' || (id === 'need' ? i !== 0 : id === i)

/** The site's tokens a list's colour is made of (DESIGN.md Colors). */
export type ListTone = 'accent' | 'ink' | 'line' | 'muted'
/**
 * Each list's colour by its place, the same everywhere (the set-up's dots, the pills, the circles and bars, the card):
 * Accent, Ink, Line, Accent at half on Paper, Muted, Line at half on Paper. Never the only cue: every part is named.
 */
export const LIST_TONES: readonly (readonly [ListTone, number])[] = [['accent', 1], ['ink', 1], ['line', 1], ['accent', 0.5], ['muted', 1], ['line', 0.5]]
/** List `i`'s colour in CSS, from the page's tokens (so it follows the theme). */
export function listColor(i: number): string {
  const [tone, p] = LIST_TONES[i % LIST_TONES.length]
  return p === 1 ? `var(--${tone})` : `color-mix(in srgb, var(--${tone}) ${p * 100}%, var(--paper))`
}
/** List `i`'s colour as #rrggbb, from a theme's token values (the card's canvas): the same mix as CSS color-mix in sRGB. */
export function listColorHex(i: number, c: Record<ListTone | 'paper', string>): string {
  const [tone, p] = LIST_TONES[i % LIST_TONES.length]
  const ch = (h: string, k: number) => parseInt(h.slice(1 + 2 * k, 3 + 2 * k), 16)
  return `#${[0, 1, 2].map((k) => Math.round(ch(c[tone], k) * p + ch(c.paper, k) * (1 - p)).toString(16).padStart(2, '0')).join('')}`
}

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

/** A friend's row in Compare's set-up: what was pasted, the name typed (none: the link's own), the list it opened. */
export type CompareRow = { id: number; text: string; name?: string; list: SharePayload | null }
const blank = (r: CompareRow) => !r.list && !r.text.trim() && r.name === undefined
/** A row's name: the one typed, else the link's own name or title as it carries it, else '' (the list is "Birder N"). */
export const rowName = (r: CompareRow): string => r.name ?? r.list?.name ?? ''

type RowCodec = {
  decode: (token: string) => SharePayload
  decodeC?: (token: string) => SharePayload[]
  /** A filled row's text when one paste held several lists: that list's own link. */
  link: (p: SharePayload) => string
  /** A new row's id. */
  id: () => number
}
/**
 * `text` typed or pasted into row `at` of `rows` (at most `room` rows: COMPARE_MAX, less the birder's own): one link
 * (or none yet) stays that row's; several links, or a comparison link, fill that row, then the blank rows after it,
 * then new ones after it, a list each, within `room`. `bad`: links that didn't open; `over`: lists left out past `room`.
 */
export function pasteRow(rows: readonly CompareRow[], at: number, text: string, room: number, codec: RowCodec): { rows: CompareRow[]; bad: number; over: number } {
  const r = linksIn(text, codec.decode, codec.decodeC)
  const row = rows[at]
  if (r.lists.length <= 1) return { rows: rows.map((x, i) => (i === at ? { ...x, text, list: r.lists[0] ?? null } : x)), bad: r.bad, over: 0 }
  const before = rows.slice(0, at), after = rows.slice(at + 1)
  const kept = after.filter((x) => !blank(x)), spare = after.filter(blank)
  const lists = r.lists.slice(0, Math.max(1, room - before.length - kept.length))
  const ids = [row.id, ...spare.map((x) => x.id)]
  const filled = lists.map((p, j): CompareRow => ({
    id: j < ids.length ? ids[j] : codec.id(), text: codec.link(p), list: p, ...(j === 0 && row.name !== undefined ? { name: row.name } : {}),
  }))
  // The blank rows not filled stay after them, as many as the room leaves.
  const rest = spare.slice(lists.length - 1).slice(0, Math.max(0, room - before.length - kept.length - filled.length))
  return { rows: [...before, ...filled, ...kept, ...rest], bad: r.bad, over: r.lists.length - lists.length }
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
