// The Tree view's levels as rows and a drawing (pure). A level is the open branch (nothing, an order, a family, a
// family's genus) and the rank of its tips (`TipRank`: orders, families, genera or species; by default the rank just
// under the open branch, so the first screen is every order). A rank that would draw more than MAX_TIPS tips is not
// offered. Totals come from the eBird taxonomy the app ships (species.v1.json), so a group's count is "on the list /
// in the taxonomy"; the tree only decides where it is drawn.
// A group the tree splits (not one branch of its own) is drawn once (`foldSplit`), as one marked row at the smallest
// branch holding all of it within the open branch ("Macropygia with Turacoena"), counting the whole branch; the groups
// inside get no row of their own. When such a branch lies inside another, the outer one is the row.
import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { cladeTree, drawTree, isLeaf, leavesOf, type Drawing, type Leaf, type Node, type Tree } from './tree'

/** What the tips of the open branch are: the level switch's four choices, top to bottom. */
export type TipRank = 'orders' | 'families' | 'genera' | 'species'
export const RANKS: readonly TipRank[] = ['orders', 'families', 'genera', 'species']
/** The most tips one drawing shows; a rank that would draw more is not offered (open a branch first). Lifers only
 *  counts first, so a short list can see every genus or species at once. */
export const MAX_TIPS = 300

/** Which branch is open (none, an order, a family, a family's genus: each step also names the ones above it, for the
 *  path) and the rank of its tips (absent: the rank just under the open branch). */
export type TreeLevel = { ord?: string; fam?: string; genus?: string; tips?: TipRank }

/** Row heights in px: a tip (a 44px press) and the order headings between groups. */
export const ROW_H = 44
export const HEAD_H = 32

export const genusOf = (sci: string): string => sci.split(' ')[0]

export type TreeRow =
  | { kind: 'order'; ord: string; top: number }
  /** An order, family or genus (LevelView.tips). `row` is one of its species, for names; `with` the groups inside its
   *  branch when it is marked; `sticker` the bird its tip shows (groupSticker). */
  | { kind: 'group'; key: string; row: SpeciesRow; on: number; total: number; with?: Inside[]; dotted: boolean; sticker?: SpeciesRow; top: number }
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
  /** The level drawn: `level` with an order or family inside a marked branch replaced by the one whose row it is, the
   *  order above an open family, and `tips` the rank drawn (absent when it is the default). A genus inside a marked
   *  branch opens on its own species. */
  level: TreeLevel
  /** The rank of the tips drawn. */
  tips: TipRank
  /** How many tips each offered rank would draw (after Lifers only); above MAX_TIPS it is not offered. */
  counts: Partial<Record<TipRank, number>>
  /** The groups of the drawn rank in the open branch with a bird on the list, and all of them, in the taxonomy. */
  cover: [number, number]
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
const NO_DRAWING: Drawing = { leaves: [], seen: '', unseen: '', seenDot: '', unseenDot: '', seenNodes: '', unseenNodes: '', rootAge: 1 }

const RAW_KEY: Record<TipRank, (r: SpeciesRow) => string> = { orders: (r) => r.ord, families: (r) => r.fam, genera: (r) => genusOf(r.sci), species: (r) => r.code }

/** How deep the open branch is: 0 nothing open, 1 an order, 2 a family, 3 a genus. */
export const depthOf = (l: TreeLevel): number => (l.genus ? 3 : l.fam ? 2 : l.ord ? 1 : 0)
/** The ranks the tips can have with `l` open: its children's rank and every rank below it (none above). */
export const ranksAt = (l: TreeLevel): TipRank[] => RANKS.slice(depthOf(l))

/**
 * The species a group's tip shows as its sticker: of the group's species on the list with a sticker, the first in
 * taxonomic order, so the same bird every time for the same list. Undefined when none has one.
 */
export function groupSticker(rows: Iterable<SpeciesRow>, onList: ReadonlySet<string>): SpeciesRow | undefined {
  let best: SpeciesRow | undefined
  for (const r of rows) if (r.st && onList.has(r.code) && (!best || r.to < best.to)) best = r
  return best
}

/**
 * The rows and drawing of `level`, with `onList` the codes on the (filtered) list. `mine` ("Lifers only") keeps only the
 * rows with a bird on the list, and inside a marked row only those groups: the folds are decided on the full tree first,
 * then the tree is cut down to the kept rows' tips. The tips are `level.tips` when that rank is offered and draws at
 * most MAX_TIPS tips, else the nearest rank above it that does (the open branch's children always do). Undefined when
 * nothing is drawn (with `mine`, rows are empty instead).
 */
export function levelView(tree: Tree, species: SpeciesIndex, level: TreeLevel, onList: ReadonlySet<string>, mine = false): LevelView | undefined {
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

  // Each offered rank: its folds within the open branch and how many tips it draws (after folding, each key is one branch).
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
  const offered = ranksAt(at)
  const ranks = new Map(offered.map((r) => [r, rankOf(r)] as const))
  const counts: Partial<Record<TipRank, number>> = {}
  for (const [r, v] of ranks) counts[r] = v.count
  let ri = Math.max(0, offered.indexOf(level.tips ?? offered[0]))
  while (ri > 0 && ranks.get(offered[ri])!.count > MAX_TIPS) ri--
  const rank = offered[ri]
  const { rawKey, folds, keyOf } = ranks.get(rank)!
  if (ri > 0) at.tips = rank

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
  const base = { split, inside, level: at, tips: rank, counts, cover }
  if (!root) return mine && tips.length ? { ...base, rows: [], height: 0, drawing: NO_DRAWING } : undefined
  const rows: TreeRow[] = []
  const ys: number[] = []
  let top = 0
  let lastOrd: string | undefined
  for (const l of leavesOf(root)) {
    // The group's own species names the row (a marked branch may start with a species of a group inside it).
    const r = rowOf(l.tips.find((tip) => rawKey(rowOf(tip)!) === l.key) ?? l.tips[0])!
    if (!ord && !fam && rank !== 'orders' && r.ord !== lastOrd) {
      rows.push({ kind: 'order', ord: r.ord, top })
      top += HEAD_H
      lastOrd = r.ord
    }
    ys.push(top + ROW_H / 2)
    const dotted = l.tips.length === 1 && tree.taxOnly[l.tips[0]] === 1
    if (rank === 'species') rows.push({ kind: 'species', row: r, on: onList.has(r.code), dotted, top })
    else rows.push({ kind: 'group', key: l.key, row: r, on: byRow.on.get(l.key) ?? 0, total: byRow.total.get(l.key) ?? l.tips.length, with: insideOf(folds!.others.get(l.key)), dotted, sticker: groupSticker(members.get(l.key) ?? [], onList), top })
    top += ROW_H
  }
  const tipRows = rows.filter((r) => r.kind !== 'order')
  // One lineage alone (a genus of one species, a family of one genus): its stem, from the split above it.
  const stem = isLeaf(root) && tree.parent[root.node] >= 0 ? tree.age[tree.parent[root.node]] : undefined
  const drawing = drawTree(root, tipOn(tipRows), (i) => ys[i], stem, (_, i) => tipRows[i].dotted)
  return { ...base, rows, height: top, drawing, root, stem }
}

/** Whether the i-th tip of `tips` (a level's rows without headings) has a bird on the list: drawTree's and drawFan's `seen`. */
export const tipOn = (tips: readonly TreeRow[]) => (_: Leaf, i: number): boolean => {
  const r = tips[i]
  return r.kind === 'species' ? r.on : r.kind === 'group' && r.on > 0
}

/** How many orders, families and genera of the taxonomy (`rows`) the species `codes` cover: [covered, in the taxonomy]. */
export function taxonCover(rows: readonly SpeciesRow[], codes: ReadonlySet<string>): Record<'orders' | 'families' | 'genera', [number, number]> {
  const rank = { orders: (r: SpeciesRow) => r.ord, families: (r: SpeciesRow) => r.fam, genera: (r: SpeciesRow) => genusOf(r.sci) }
  const out = {} as Record<keyof typeof rank, [number, number]>
  for (const [k, of] of Object.entries(rank) as [keyof typeof rank, (r: SpeciesRow) => string][]) {
    const all = new Set<string>(), on = new Set<string>()
    for (const r of rows) { all.add(of(r)); if (codes.has(r.code)) on.add(of(r)) }
    out[k] = [on.size, all.size]
  }
  return out
}
