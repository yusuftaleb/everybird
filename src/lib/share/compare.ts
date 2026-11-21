// Compare with friends (issue #10), the pure parts: what a comparison shows (a choice of people, Yet to see, Every bird) and the links pasted in. No link-index
// import: the decoder is passed in, so this stays light.
import type { SharePayload } from './link'

/**
 * Each species in the comparison with the lists it is on, as a bit mask (bit i: list i), in first-seen order: the one
 * source of every count Compare shows, so the chips, the diagram, the bars and the grid never disagree.
 */
export function memberships(lists: readonly SharePayload[]): Map<string, number> {
  const m = new Map<string, number>()
  lists.forEach((p, i) => { for (const b of p.birds) m.set(b.code, (m.get(b.code) ?? 0) | (1 << i)) })
  return m
}

/**
 * What Compare shows (its chips, the pressed region of the diagram): 'need' (Yet to see: birds on some other list, not
 * the first), 'every' (every bird in the comparison), or a set of lists as a mask (bit i: list i): the birds on exactly
 * those lists and on no other, a region of the diagram (Kalvin alone, the pair Kalvin and Kalin, all three).
 */
export type Choice = 'need' | 'every' | number

/** The birds `choice` shows, in first-seen order. */
export function choiceCodes(lists: readonly SharePayload[], choice: Choice): string[] {
  const keep = (k: number) => (choice === 'every' ? true : choice === 'need' ? !(k & 1) : k === choice)
  return [...memberships(lists)].flatMap(([c, k]) => (keep(k) ? [c] : []))
}

/** Where Compare opens: Yet to see with the viewer's own list (`you`), else every bird. */
export const firstChoice = (you: boolean): Choice => (you ? 'need' : 'every')

/** A person's chip pressed: list `i` joins or leaves the people chosen (Yet to see and Every bird give way to it); none
 *  left is every bird. */
export function toggleList(choice: Choice, i: number): Choice {
  const next = (typeof choice === 'number' ? choice : 0) ^ (1 << i)
  return next || 'every'
}

/** A press on the diagram at a region of `mask` (diagram's maskAt): its people; outside the circles (0), every bird. */
export const choiceAt = (mask: number): Choice => mask || 'every'

/**
 * How the heading over the grid names `choice` (the words are the caller's): 'need', 'every', 'all' (on every list),
 * 'you' (the viewer's own list alone), 'one' (another list alone: `names` its name) or 'some' (several lists, not all:
 * `names` theirs, in list order).
 */
export function choiceWords(choice: Choice, n: number, you: boolean): { kind: 'need' | 'every' | 'all' | 'you' | 'one' | 'some'; lists: number[] } {
  if (choice === 'need' || choice === 'every') return { kind: choice, lists: [] }
  const lists = Array.from({ length: n }, (_, i) => i).filter((i) => choice & (1 << i))
  if (choice === (1 << n) - 1) return { kind: 'all', lists }
  if (lists.length === 1) return { kind: you && lists[0] === 0 ? 'you' : 'one', lists }
  return { kind: 'some', lists }
}

/**
 * Name `i` of `n` as a piece of a list of names, whose pieces join with spaces: commas between the names, " & " before
 * the last ("Robin, Sam & Ada"; two: "Ada & Sam"), the same in every language. A line break between pieces leaves a
 * comma at a line's end or "&" at the next one's start, never alone.
 */
export const titlePart = (name: string, i: number, n: number): string => (i === n - 1 && n > 1 ? `& ${name}` : i < n - 2 ? `${name},` : name)
/** Names joined as titlePart's pieces on one line: "Kalvin & Kalin", "Robin, Sam & Ada". */
export const joinNames = (names: readonly string[]): string => names.map((x, i) => titlePart(x, i, names.length)).join(' ')

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
 *  across. */
const TILE_MIN = 104
const TILE_GAP = 12
export const GRID_MAX = 10
export const gridCols = (width: number): number => Math.min(GRID_MAX, Math.max(3, Math.floor((width + TILE_GAP) / (TILE_MIN + TILE_GAP))))

const ones = (m: number) => { let k = 0; for (; m; m &= m - 1) k++; return k }
/**
 * The birds by family (round 6, item 12): `codes` in taxonomic order, grouped by `famOf` in the order each family first
 * comes; inside a family the birds most lists have first (by `mask`, their lists), then as given.
 */
export function byFamily(codes: readonly string[], famOf: (code: string) => string, mask: (code: string) => number): { fam: string; codes: string[] }[] {
  const out = new Map<string, string[]>()
  for (const c of codes) {
    const f = famOf(c)
    const g = out.get(f)
    if (g) g.push(c)
    else out.set(f, [c])
  }
  return [...out].map(([fam, cs]) => ({ fam, codes: cs.map((c, i) => [c, ones(mask(c)), i] as const).sort((a, b) => b[1] - a[1] || a[2] - b[2]).map((x) => x[0]) }))
}
/** Whether a choice's birds come from different lists, so each tile shows whose they are: Yet to see and Every bird. */
export const showsWho = (choice: Choice) => choice === 'need' || choice === 'every'

/**
 * Whether the diagram's part `mask` (the birds on exactly those of `n` lists) is `choice`'s, so the diagram marks it
 * and fades the rest: Yet to see is every part outside the first list; Every bird every part; a set of lists its own
 * part only (none in the flower for a set it has no part for).
 */
export function partInChoice(choice: Choice, mask: number): boolean {
  if (choice === 'every') return true
  if (choice === 'need') return !(mask & 1)
  return mask === choice
}
/** Whether list `i`'s bar holds some of `choice`'s birds (the bars' view of the same): every list's for Every bird,
 *  the others' for Yet to see, those of the lists chosen. */
export const barInChoice = (choice: Choice, i: number): boolean =>
  choice === 'every' || (choice === 'need' ? i !== 0 : !!(choice & (1 << i)))

/** The site's tokens a list's colour is made of (DESIGN.md Colors). */
type ListTone = 'accent' | 'ink' | 'line' | 'muted'
/**
 * Each list's colour by its place, the same everywhere (the set-up's dots, the pills, the circles and bars, the card):
 * Accent, Ink, Line, Accent at half on Paper, Muted, Line at half on Paper. Never the only cue: every part is named.
 */
const LIST_TONES: readonly (readonly [ListTone, number])[] = [['accent', 1], ['ink', 1], ['line', 1], ['accent', 0.5], ['muted', 1], ['line', 0.5]]
/** List `i`'s colour in CSS, from the page's tokens (so it follows the theme). */
/** List `i`'s colour is a 50% tone (lists 4 and 6): under 3:1 on Paper, so its dots carry a Line ring. */
export const listFaint = (i: number): boolean => LIST_TONES[i % LIST_TONES.length][1] < 1
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
 * then new ones after it, a list each, within `room`. `bad`: links that didn't open; `over`: lists left out past `room`;
 * `dup`: lists another row already holds, left out (a single one leaves the row its text and no list).
 */
export function pasteRow(
  rows: readonly CompareRow[], at: number, text: string, room: number, codec: RowCodec,
): { rows: CompareRow[]; bad: number; over: number; dup: number } {
  const r = linksIn(text, codec.decode, codec.decodeC)
  const row = rows[at]
  // A list another row already holds is refused (the same friend twice would draw "Only …: 0").
  const held = new Set(rows.filter((x, i) => i !== at && x.list).map((x) => sameKey(x.list!)))
  const fresh = r.lists.filter((p) => !held.has(sameKey(p)))
  const dup = r.lists.length - fresh.length
  if (fresh.length <= 1) return { rows: rows.map((x, i) => (i === at ? { ...x, text, list: fresh[0] ?? null } : x)), bad: r.bad, over: 0, dup }
  const before = rows.slice(0, at), after = rows.slice(at + 1)
  const kept = after.filter((x) => !blank(x)), spare = after.filter(blank)
  const lists = fresh.slice(0, Math.max(1, room - before.length - kept.length))
  const ids = [row.id, ...spare.map((x) => x.id)]
  const filled = lists.map((p, j): CompareRow => ({
    id: j < ids.length ? ids[j] : codec.id(), text: codec.link(p), list: p, ...(j === 0 && row.name !== undefined ? { name: row.name } : {}),
  }))
  // The blank rows not filled stay after them, as many as the room leaves.
  const rest = spare.slice(lists.length - 1).slice(0, Math.max(0, room - before.length - kept.length - filled.length))
  return { rows: [...before, ...filled, ...kept, ...rest], bad: r.bad, over: fresh.length - lists.length, dup }
}
/** Two lists are the same when they carry the same birds, dates, places and name (one link pasted twice). */
const sameKey = (p: SharePayload) => JSON.stringify(p)

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
