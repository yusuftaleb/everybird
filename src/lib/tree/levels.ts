// The Tree view's levels as rows and a drawing (pure). A level is the open branch (nothing, an order, a family, a
// family's genus); its tips are the rank one step under it (Yusuf, 2026-11-20: all birds shows the orders, an order its
// families, a family its genera, a genus its species), or the Display panel's Down to when that is deeper (round 6:
// `down`, offered as `downTo`, a rank over DRAW_CAP tips off; the ranks above it are the branches, as on the poster). Totals come from the
// eBird taxonomy the app ships (species.v1.json), so a group's count is "on the list / in the taxonomy"; the tree only
// decides where it is drawn.
// An open branch never shows one lone tip (round 6): it opens past every rank that would draw a single tip (an order
// with one family at its genera, a family with one genus at its species), past every rank of SMALL_STEP groups or fewer
// (Owls' two families open at their genera) while the next rank stays within MAX_TIPS, and a group of SPECIES_AT
// species or fewer opens straight at its species. MAX_TIPS guards the skip past lone tips: a rank it skips to that
// would draw more tips is not drawn (the rank above it is); on the shipped tree it never applies.
// A Tree poster draws the rank on screen, its Level, as the share image does (round 6, item 22: Print's own "Down to",
// one rank deeper, went).
// A group the tree splits (not one branch of its own) is drawn once (`foldSplit`), as one marked row at the smallest
// branch holding all of it within the open branch ("Macropygia with Turacoena"), counting the whole branch; the groups
// inside get no row of their own. When such a branch lies inside another, the outer one is the row.
import { genusOf } from '@/lib/list/filters'
import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { cladeTree, drawTree, isLeaf, leavesOf, type Drawing, type Leaf, type Node, type Tree } from './tree'

/** What the tips of the open branch are, top to bottom. */
export type TipRank = 'orders' | 'families' | 'genera' | 'species'
export const RANKS: readonly TipRank[] = ['orders', 'families', 'genera', 'species']
/** The most tips a skip past lone tips may reach (after Lifers only); past it the rank above is drawn. */
export const MAX_TIPS = 300
/** The most tips a rank picked in Down to may draw on screen (after Lifers only); past it the rank is offered off.
 *  Measured (round 6): the rows' first render grows about linearly, 0.45 s in jsdom for All birds' 1,970 genera, the
 *  largest rank it lets through, 1.4 s for Perching birds' 6,738 species, which it keeps off with All birds' 11,193. */
export const DRAW_CAP = 2000

/** Which branch is open (none, an order, a family, a family's genus: each step also names the ones above it, for the
 *  path). A value carried from before (a `tips` rank) is ignored. */
export type TreeLevel = { ord?: string; fam?: string; genus?: string }

/** Row heights in px: a tip (a 44px press; on screen a row grows with its name and the drawing follows the rows'
 *  measured centres, so these place the share image's rows and the drawing before measuring) and the group headings. */
export const ROW_H = 44
export const HEAD_H = 32
/** Rectangular: the drawing's column (px) for a view `width` px wide, half of it (round 6), between 112 and 640, leaving
 *  the rows at least 200px on a narrow view. */
export const rowsTreeW = (width: number): number => Math.round(Math.min(640, Math.max(112, Math.min(width * 0.5, width - 200))))

export { genusOf }

/** A rank a heading names: any group rank above the tips. */
export type HeadRank = Exclude<TipRank, 'species'>
/** One group a heading names: its rank, its key (order, family or genus) and one of its species, for names. */
export type HeadPart = { rank: HeadRank; key: string; row: SpeciesRow }
/** A run of tips in one group a heading names (round 6, item 10): the i-th tips `first` to `last` (in leaf order), for
 *  the named nodes (nodes.ts). A group split into runs by the tree has one per run. */
export type TipGroup = HeadPart & { first: number; last: number }

export type TreeRow =
  /** A heading between the rows (round 6, item 10): the group at the rank right above the tips (families above genera,
   *  genera above species, orders above families), after the higher ranks that change at the same row, highest first
   *  ("Passeriformes · Thraupidae"). None for a rank the open branch fixes. */
  | { kind: 'head'; parts: HeadPart[]; top: number }
  /** An order, family or genus (LevelView.tips). `row` is one of its species, for names; `with` the groups inside its
   *  branch when it is marked (with Lifers only, those with a bird on the list), `holds` all of their keys (what opening
   *  the row filters to, beside its own); `sticker` the bird its tip shows (groupSticker). */
  | { kind: 'group'; key: string; row: SpeciesRow; on: number; total: number; with?: Inside[]; holds?: string[]; dotted: boolean; sticker?: SpeciesRow; top: number }
  /** `dotted`: placed without genetic data (a group: one species alone, so drawn by that species' own branch). */
  | { kind: 'species'; row: SpeciesRow; on: boolean; dotted: boolean; top: number }

/** A group inside a marked branch: one of its species, for names, and its own counts. */
export type Inside = { key: string; row: SpeciesRow; on: number; total: number }

export type LevelView = {
  rows: TreeRow[]
  /** The rows' height in px (the drawing's y range). */
  height: number
  drawing: Drawing
  /** The open order, family or genus is not one branch in the whole tree (the drawing keeps its species alone). */
  split: boolean
  /** The open group is a marked branch: one species of each group inside it, which the drawing includes. */
  inside?: SpeciesRow[]
  /** The level drawn: `level` with an order or family inside a marked branch replaced by the one whose row it is, and
   *  the order above an open family. A genus inside a marked branch opens on its own species. */
  level: TreeLevel
  /** The rank of the tips drawn. */
  tips: TipRank
  /** The Down to row's ranks: from the one step under the open branch down to the species, each with the tips it would
   *  draw here (after Lifers only); one over DRAW_CAP is offered off. */
  downTo: { rank: TipRank; n: number }[]
  /** The groups of the drawn rank in the open branch with a bird on the list, and all of them, in the taxonomy. */
  cover: [number, number]
  /** The runs of tips in each group the headings name, highest rank first (round 6, item 10: the named nodes). */
  groups: TipGroup[]
  /** The drawing's tree and the stem of a lone lineage (drawFan draws the same). */
  root?: Node | Leaf
  stem?: number
}

/**
 * The split groups among `tips` (one key per tip): `into` maps each group inside a marked branch to the group whose
 * row that branch is, `others` a marked group to the groups inside its branch.
 */
export type Folds = { into: Map<string, string>; others: Map<string, string[]> }

export function foldSplit(tree: Tree, tips: Iterable<number>, keyOf: (tip: number) => string): Folds {
  const n = tree.parent.length
  // Pre-order: node k's subtree is the nodes k .. end[k] - 1.
  const end = new Int32Array(n)
  for (let k = n - 1; k >= 0; k--) { const ks = tree.kids[k]; end[k] = ks.length ? end[ks[ks.length - 1]] : k + 1 }
  const sorted = Int32Array.from(tips).sort()
  const keys = Array.from(sorted, keyOf)
  const span = new Map<string, { lo: number; hi: number; n: number }>()
  sorted.forEach((t, i) => { const s = span.get(keys[i]); if (s) { s.hi = t; s.n++ } else span.set(keys[i], { lo: t, hi: t, n: 1 }) })
  const from = (x: number) => { let a = 0, b = sorted.length; while (a < b) { const m = (a + b) >> 1; if (sorted[m] < x) a = m + 1; else b = m } return a }
  // Each split group's smallest branch holding all of it (one that holds another group's tips too).
  const split: { key: string; m: number; n: number; lo: number }[] = []
  for (const [key, s] of span) {
    if (s.n < 2) continue
    let m = s.lo
    while (end[m] <= s.hi) m = tree.parent[m]
    for (let i = from(m), j = from(end[m]); i < j; i++) if (keys[i] !== key) { split.push({ key, m, n: s.n, lo: s.lo }); break }
  }
  // Outer branches first (pre-order), the larger group first on one branch: a branch inside a marked one is not marked,
  // and every tip in a marked branch belongs to its row. A group partly inside a marked branch cannot occur: its own
  // branch would hold the marked one and be marked instead.
  split.sort((a, b) => a.m - b.m || b.n - a.n || a.lo - b.lo)
  const into = new Map<string, string>(), others = new Map<string, string[]>()
  let last = -1
  for (const g of split) {
    if (g.m < last) continue
    last = end[g.m]
    const inside = new Set<string>()
    for (let i = from(g.m), j = from(last); i < j; i++) if (keys[i] !== g.key) inside.add(keys[i])
    for (const o of inside) into.set(o, g.key)
    others.set(g.key, [...inside])
  }
  return { into, others }
}

/** The group whose row shows `key` (itself unless inside a marked branch). */
export const foldedInto = (into: ReadonlyMap<string, string>, key: string): string => into.get(key) ?? key

/** Whether `tips` are exactly the tips under their most recent common ancestor. */
export function isClade(tree: Tree, tips: readonly number[]): boolean {
  if (tips.length < 2) return true
  const n = tree.parent.length
  const mark = new Int32Array(n), all = new Int32Array(n)
  for (const t of tips) mark[t] = 1
  let mrca = 0
  for (let k = n - 1; k >= 0; k--) {
    if (!tree.kids[k].length) all[k] = 1
    if (k > 0) { mark[tree.parent[k]] += mark[k]; all[tree.parent[k]] += all[k] }
  }
  // The MRCA is the last node in pre-order that holds every tip.
  for (let k = 0; k < n; k++) if (mark[k] === tips.length) mrca = k
  return all[mrca] === tips.length
}

/** A level with no row left ("Lifers only" where no bird of the list is). */
const NO_DRAWING: Drawing = { leaves: [], seen: '', unseen: '', seenDot: '', unseenDot: '', rootAge: 1 }

const RAW_KEY: Record<TipRank, (r: SpeciesRow) => string> = { orders: (r) => r.ord, families: (r) => r.fam, genera: (r) => genusOf(r.sci), species: (r) => r.code }

/** How deep the open branch is: 0 nothing open, 1 an order, 2 a family, 3 a genus. */
export const depthOf = (l: TreeLevel): number => (l.genus ? 3 : l.fam ? 2 : l.ord ? 1 : 0)

/**
 * The species a group's tip shows as its sticker: of the group's species on the list with a sticker, the first in
 * taxonomic order, so the same bird every time for the same list (undefined when none of them has one). A group with no
 * bird on the list shows its first species in taxonomic order that has a sticker, which the view dims as it dims a
 * species off the list (Yusuf, 2026-11-20, round 6).
 */
export function groupSticker(rows: Iterable<SpeciesRow>, onList: ReadonlySet<string>): SpeciesRow | undefined {
  let best: SpeciesRow | undefined, any: SpeciesRow | undefined, seen = false
  for (const r of rows) {
    const on = onList.has(r.code)
    seen ||= on
    if (r.st && on && (!best || r.to < best.to)) best = r
    if (r.st && (!any || r.to < any.to)) any = r
  }
  return seen ? best : any
}

/** A group of at most this many species opens straight at its species (round 6). */
export const SPECIES_AT = 12
/** A step whose rank would draw this many groups or fewer draws the next rank down instead (round 6: Owls' two families,
 *  Owls and Barn Owls, open at their genera). */
export const SMALL_STEP = 3

/**
 * The rows and drawing of `level`, with `onList` the codes on the (filtered) list. `mine` ("Lifers only") keeps only the
 * rows with a bird on the list, and inside a marked row only those groups: the folds are decided on the full tree first,
 * then the tree is cut down to the kept rows' tips. The tips are the rank one step under the open branch, past lone
 * tips (see the header); `rank` draws another rank at or under it instead (the unit tests read the folds at every rank).
 * `down`, the Display panel's Down to (round 6): the deeper of it and that step is drawn, within DRAW_CAP tips.
 * Undefined when nothing is drawn (with `mine`, rows are empty instead).
 */
export function levelView(tree: Tree, species: SpeciesIndex, level: TreeLevel, onList: ReadonlySet<string>, mine = false, rank?: TipRank, down?: TipRank): LevelView | undefined {
  const rowOf = (tip: number) => species.byCode.get(tree.code[tip]!)
  const all: number[] = []
  for (const tip of tree.tipOf.values()) if (rowOf(tip)) all.push(tip)
  // The open order, family (one inside a marked branch replaced by that branch's own) and genus, with the groups inside
  // a marked one; a genus inside a marked branch opens alone. An order's branch counts only with no family open: a
  // family is read on the whole tree, as on the families level.
  const ordFolds = level.ord && !level.fam ? foldSplit(tree, all, (tip) => rowOf(tip)!.ord) : undefined
  const ord = ordFolds ? foldedInto(ordFolds.into, level.ord!) : undefined
  const ords = ord ? new Set([ord, ...ordFolds!.others.get(ord) ?? []]) : undefined
  const famFolds = level.fam ? foldSplit(tree, all, (tip) => rowOf(tip)!.fam) : undefined
  const fam = famFolds ? foldedInto(famFolds.into, level.fam!) : undefined
  const fams = fam ? new Set([fam, ...famFolds!.others.get(fam) ?? []]) : undefined
  const famTips = fams ? all.filter((tip) => fams.has(rowOf(tip)!.fam)) : ords ? all.filter((tip) => ords.has(rowOf(tip)!.ord)) : all
  const genFolds = fam && level.genus ? foldSplit(tree, famTips, (tip) => genusOf(rowOf(tip)!.sci)) : undefined
  const genus = level.genus && genFolds?.into.has(level.genus) ? undefined : level.genus
  const genera = genus ? new Set([genus, ...genFolds?.others.get(genus) ?? []]) : level.genus ? new Set([level.genus]) : undefined
  const tips = genera ? famTips.filter((tip) => genera.has(genusOf(rowOf(tip)!.sci))) : famTips
  const inScope = (r: SpeciesRow) => (!ords || ords.has(r.ord)) && (!fams || fams.has(r.fam)) && (!genera || genera.has(genusOf(r.sci)))
  const scopeRows = species.rows.filter(inScope)
  const at: TreeLevel = { ord: fam ? species.rows.find((r) => r.fam === fam)?.ord : ord, fam, genus: level.genus }

  // Each rank at or under the open branch: its folds within it and how many tips it draws (after folding, each key is
  // one branch).
  const rankOf = (rank: TipRank) => {
    const rawKey = RAW_KEY[rank]
    const folds = rank === 'species' ? undefined : foldSplit(tree, tips, (tip) => rawKey(rowOf(tip)!))
    const keyOf = (r: SpeciesRow) => (folds ? foldedInto(folds.into, rawKey(r)) : rawKey(r))
    const on = new Set<string>()
    if (mine) for (const r of scopeRows) if (onList.has(r.code)) on.add(keyOf(r))
    const keys = new Set<string>()
    for (const tip of tips) { const k = keyOf(rowOf(tip)!); if (!mine || on.has(k)) keys.add(k) }
    return { rawKey, folds, keyOf, count: keys.size }
  }
  const offered = RANKS.slice(depthOf(at))
  const ranks = new Map<TipRank, ReturnType<typeof rankOf>>()
  const rankAt = (r: TipRank) => { let v = ranks.get(r); if (!v) ranks.set(r, (v = rankOf(r))); return v }
  // The rank one step under the open branch (round 6: never one lone tip): past every rank that would draw a single tip
  // (an order with one family opens at its genera, a family with one genus at its species), and straight at the
  // species for a group of SPECIES_AT species or fewer. Nothing open: the orders.
  let ri = 0
  const skipLone = () => { while (ri < offered.length - 1 && rankAt(offered[ri]).count === 1) ri++ }
  if (rank && offered.includes(rank)) ri = offered.indexOf(rank)
  else if (depthOf(at) > 0) {
    skipLone()
    // A smarter step (round 6): a rank of SMALL_STEP groups or fewer is not worth a step, so the next rank down is
    // drawn instead, again while that holds, as long as the next one stays within MAX_TIPS.
    while (ri < offered.length - 1 && rankAt(offered[ri]).count <= SMALL_STEP && rankAt(offered[ri + 1]).count <= MAX_TIPS) ri++
    if (rankAt('species').count <= SPECIES_AT) ri = offered.length - 1
  }
  while (ri > 0 && rankAt(offered[ri]).count > MAX_TIPS) ri--
  // Down to (round 6, the Display panel's): the chosen rank when it is deeper than that step, else the step; a chosen
  // rank over DRAW_CAP tips here falls back to the deepest one within it (the choice itself is kept). The row offers the
  // ranks from the step down to the species, each with its count.
  const stepAt = ri
  if (down && rank === undefined) {
    let di = offered.indexOf(down)
    while (di > ri && rankAt(offered[di]).count > DRAW_CAP) di--
    if (di > ri) ri = di
  }
  const downTo = offered.slice(stepAt).map((r) => ({ rank: r, n: rankAt(r).count }))
  const drawnRank = offered[ri]
  const { rawKey, folds, keyOf } = rankAt(drawnRank)

  // Totals from the taxonomy, within the open scope, per group (`own`) and per row (a group inside a marked branch
  // counts toward its row).
  const count = () => ({ total: new Map<string, number>(), on: new Map<string, number>() })
  const own = count(), byRow = count()
  const first = new Map<string, SpeciesRow>()
  const members = new Map<string, SpeciesRow[]>()
  for (const r of scopeRows) {
    for (const [c, k] of [[own, rawKey(r)], [byRow, keyOf(r)]] as const) {
      c.total.set(k, (c.total.get(k) ?? 0) + 1)
      if (onList.has(r.code)) c.on.set(k, (c.on.get(k) ?? 0) + 1)
    }
    if (!first.has(rawKey(r))) first.set(rawKey(r), r)
    const m = members.get(keyOf(r))
    if (m) m.push(r)
    else members.set(keyOf(r), [r])
  }
  const insideOf = (keys: string[] | undefined): Inside[] | undefined =>
    keys?.map((key) => ({ key, row: first.get(key)!, on: own.on.get(key) ?? 0, total: own.total.get(key) ?? 0 })).filter((w) => !mine || w.on > 0)
  const openKey = (r: SpeciesRow) => (genus ? genusOf(r.sci) : fam ? r.fam : r.ord)
  const insideKeys = genus ? genFolds?.others.get(genus) : genera ? undefined : fam ? famFolds!.others.get(fam) : ord ? ordFolds!.others.get(ord) : undefined
  const inside = insideKeys?.map((key) => species.rows.find((r) => openKey(r) === key)!)
  const split = !inside && !!(ord || fam) && !isClade(tree, tips)
  const cover: [number, number] = [own.on.size, own.total.size]
  const drawn = mine ? tips.filter((tip) => (byRow.on.get(keyOf(rowOf(tip)!)) ?? 0) > 0) : tips
  const root = cladeTree(tree, drawn, (tip) => keyOf(rowOf(tip)!))
  const head = { split, inside, level: at, tips: drawnRank, cover, downTo }
  if (!root) return mine && tips.length ? { ...head, rows: [], height: 0, drawing: NO_DRAWING, groups: [] } : undefined
  const rows: TreeRow[] = []
  const ys: number[] = []
  let top = 0
  // The headings' ranks (round 6, item 10): every rank between the open branch and the tips, so the last is the rank
  // right above the tips; a heading names the highest of them that changes at its row and every one under it.
  const headRanks = RANKS.slice(depthOf(at), RANKS.indexOf(drawnRank)) as HeadRank[]
  const headKey = (k: HeadRank, r: SpeciesRow) => RAW_KEY[k](r)
  let last: string[] = []
  const groups: TipGroup[] = []
  const open: TipGroup[] = []
  let tipNo = 0
  for (const l of leavesOf(root)) {
    // The group's own species names the row (a marked branch may start with a species of a group inside it).
    const r = rowOf(l.tips.find((tip) => rawKey(rowOf(tip)!) === l.key) ?? l.tips[0])!
    const keys = headRanks.map((k) => headKey(k, r))
    const from = keys.findIndex((k, j) => k !== last[j])
    if (from >= 0) {
      rows.push({ kind: 'head', parts: headRanks.slice(from).map((k, j) => ({ rank: k, key: keys[from + j], row: r })), top })
      top += HEAD_H
      last = keys
      for (let j = from; j < headRanks.length; j++) groups.push((open[j] = { rank: headRanks[j], key: keys[j], row: r, first: tipNo, last: tipNo }))
    }
    for (const g of open) g.last = tipNo
    tipNo++
    ys.push(top + ROW_H / 2)
    const dotted = l.tips.length === 1 && tree.taxOnly[l.tips[0]] === 1
    if (drawnRank === 'species') rows.push({ kind: 'species', row: r, on: onList.has(r.code), dotted, top })
    else rows.push({ kind: 'group', key: l.key, row: r, on: byRow.on.get(l.key) ?? 0, total: byRow.total.get(l.key) ?? l.tips.length, with: insideOf(folds!.others.get(l.key)), holds: folds!.others.get(l.key), dotted, sticker: groupSticker(members.get(l.key) ?? [], onList), top })
    top += ROW_H
  }
  const tipRows = rows.filter((r) => r.kind !== 'head')
  // One lineage alone (a genus of one species, a family of one genus): its stem, from the split above it.
  const stem = isLeaf(root) && tree.parent[root.node] >= 0 ? tree.age[tree.parent[root.node]] : undefined
  const drawing = drawTree(root, tipOn(tipRows), (i) => ys[i], stem, (_, i) => tipRows[i].dotted)
  // Highest rank first, the larger runs before the smaller (the named nodes place them in this order).
  groups.sort((a, b) => headRanks.indexOf(a.rank) - headRanks.indexOf(b.rank) || a.first - b.first)
  return { ...head, rows, height: top, drawing, root, stem, groups }
}

/** The rank line above the tree (round 6): the rank drawn and how many of its groups the rows draw, `n` (a marked row
 *  counts the groups inside it too), with `total`, the rank's groups in the open branch in the taxonomy, only when
 *  Lifers only (`mine`) leaves some out ("65 of 143 families"; else "29 genera"). */
export function rankCount(view: Pick<LevelView, 'rows' | 'tips' | 'cover'>, mine: boolean): { rank: TipRank; n: number; total?: number } {
  let n = 0
  for (const r of view.rows) if (r.kind === 'species') n++; else if (r.kind === 'group') n += 1 + (r.with?.length ?? 0)
  return { rank: view.tips, n, ...(mine && n < view.cover[1] ? { total: view.cover[1] } : {}) }
}

/** The Down to row's choices for a view (round 6): its ranks from the one step under the open branch down to the
 *  species, each over DRAW_CAP tips off with why ('mine': too many even with Lifers only on, so only opening a branch
 *  helps; 'all': Lifers only would help too); none when one rank is left (a genus, or a branch that opens at its species). */
export function downOptions(view: Pick<LevelView, 'downTo'>, mine: boolean): { rank: TipRank; off?: 'tooMany' | 'tooManyMine' }[] {
  if (view.downTo.length < 2) return []
  return view.downTo.map(({ rank, n }) => (n > DRAW_CAP ? { rank, off: mine ? 'tooManyMine' : 'tooMany' } : { rank }))
}

/** Whether the i-th tip of `tips` (a level's rows without headings) has a bird on the list: drawTree's and drawFan's `seen`. */
export const tipOn = (tips: readonly TreeRow[]) => (_: Leaf, i: number): boolean => {
  const r = tips[i]
  return r.kind === 'species' ? r.on : r.kind === 'group' && r.on > 0
}

/** How many species, genera, families and orders of the taxonomy (`rows`) the species `codes` cover: [covered, in the
 *  taxonomy] (the tree image's four totals). */
export function taxonCover(rows: readonly SpeciesRow[], codes: ReadonlySet<string>): Record<'species' | 'genera' | 'families' | 'orders', [number, number]> {
  const rank = { species: (r: SpeciesRow) => r.code, genera: (r: SpeciesRow) => genusOf(r.sci), families: (r: SpeciesRow) => r.fam, orders: (r: SpeciesRow) => r.ord }
  const out = {} as Record<keyof typeof rank, [number, number]>
  for (const [k, of] of Object.entries(rank) as [keyof typeof rank, (r: SpeciesRow) => string][]) {
    const all = new Set<string>(), on = new Set<string>()
    for (const r of rows) { all.add(of(r)); if (codes.has(r.code)) on.add(of(r)) }
    out[k] = [on.size, all.size]
  }
  return out
}
