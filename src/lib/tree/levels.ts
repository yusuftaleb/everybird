// The Tree view's three levels as rows and a drawing (pure). Level one is every family, level two one family's
// genera, level three one genus's species. Family and genus totals come from the eBird taxonomy the app ships
// (species.v1.json), so a group's count is "on the list / in the taxonomy"; the tree only decides where it is drawn.
// A group the tree splits (not one branch of its own) is drawn once (`foldSplit`), as one marked row at the smallest
// branch holding all of it within the level ("Macropygia with Turacoena"), counting the whole branch; the groups
// inside get no row of their own. When such a branch lies inside another, the outer one is the row.
import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { cladeTree, drawTree, isLeaf, leavesOf, type Drawing, type Tree } from './tree'

/** Which level is open: none (families), a family, or a family's genus. */
export type TreeLevel = { fam?: string; genus?: string }

/** Row heights in px: a tip (a 44px press) and the order headings between families. */
export const ROW_H = 44
export const HEAD_H = 32

export const genusOf = (sci: string): string => sci.split(' ')[0]

export type TreeRow =
  | { kind: 'order'; ord: string; top: number }
  /** A family (level one) or genus (level two). `row` is one of its species, for names; `with` the groups inside its
   *  branch when it is marked. */
  | { kind: 'group'; key: string; row: SpeciesRow; on: number; total: number; with?: Inside[]; dotted: boolean; top: number }
  /** `dotted`: placed without genetic data (a group: one species alone, so drawn by that species' own branch). */
  | { kind: 'species'; row: SpeciesRow; on: boolean; dotted: boolean; top: number }

/** A group inside a marked branch: one of its species, for names, and its own counts. */
export type Inside = { key: string; row: SpeciesRow; on: number; total: number }

export type LevelView = {
  rows: TreeRow[]
  /** The rows' height in px (the drawing's y range). */
  height: number
  drawing: Drawing
  /** The open family or genus is not one branch in the whole tree (the drawing keeps its species alone). */
  split: boolean
  /** The open group is a marked branch: one species of each group inside it, which the drawing includes. */
  inside?: SpeciesRow[]
  /** The level drawn: `level` with a family inside a marked branch replaced by the family whose row it is. A genus
   *  inside one opens on its own species. */
  level: TreeLevel
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

/** The rows and drawing of `level`, with `onList` the codes on the (filtered) list. Undefined when nothing is drawn. */
export function levelView(tree: Tree, species: SpeciesIndex, level: TreeLevel, onList: ReadonlySet<string>): LevelView | undefined {
  const rowOf = (tip: number) => species.byCode.get(tree.code[tip]!)
  const all: number[] = []
  for (const tip of tree.tipOf.values()) if (rowOf(tip)) all.push(tip)
  // The open family (one inside a marked branch replaced by that branch's family) and genus, with the groups inside
  // a marked one; a genus inside a marked branch opens alone.
  const famFolds = foldSplit(tree, all, (tip) => rowOf(tip)!.fam)
  const fam = level.fam ? foldedInto(famFolds.into, level.fam) : undefined
  const fams = fam ? new Set([fam, ...famFolds.others.get(fam) ?? []]) : undefined
  const famTips = fams ? all.filter((tip) => fams.has(rowOf(tip)!.fam)) : all
  const genFolds = fam ? foldSplit(tree, famTips, (tip) => genusOf(rowOf(tip)!.sci)) : undefined
  const genus = level.genus && genFolds?.into.has(level.genus) ? undefined : level.genus
  const genera = genus ? new Set([genus, ...genFolds!.others.get(genus) ?? []]) : level.genus ? new Set([level.genus]) : undefined
  const tips = genera ? famTips.filter((tip) => genera.has(genusOf(rowOf(tip)!.sci))) : famTips
  const inScope = (r: SpeciesRow) => (!fams || fams.has(r.fam)) && (!genera || genera.has(genusOf(r.sci)))
  const folds = genera ? undefined : genFolds ?? famFolds
  const rawKey = (r: SpeciesRow) => (genera ? r.code : fam ? genusOf(r.sci) : r.fam)
  const keyOf = (r: SpeciesRow) => (folds ? foldedInto(folds.into, rawKey(r)) : rawKey(r))
  const root = cladeTree(tree, tips, (tip) => keyOf(rowOf(tip)!))
  if (!root) return undefined
  // Totals from the taxonomy, within the open scope, per group (`own`) and per row (a group inside a marked branch
  // counts toward its row).
  const count = () => ({ total: new Map<string, number>(), on: new Map<string, number>() })
  const own = count(), byRow = count()
  const first = new Map<string, SpeciesRow>()
  for (const r of species.rows) {
    if (!inScope(r)) continue
    for (const [c, k] of [[own, rawKey(r)], [byRow, keyOf(r)]] as const) {
      c.total.set(k, (c.total.get(k) ?? 0) + 1)
      if (onList.has(r.code)) c.on.set(k, (c.on.get(k) ?? 0) + 1)
    }
    if (!first.has(rawKey(r))) first.set(rawKey(r), r)
  }
  const insideOf = (keys: string[] | undefined): Inside[] | undefined =>
    keys?.map((key) => ({ key, row: first.get(key)!, on: own.on.get(key) ?? 0, total: own.total.get(key) ?? 0 }))
  const rows: TreeRow[] = []
  const ys: number[] = []
  let top = 0
  let lastOrd: string | undefined
  for (const l of leavesOf(root)) {
    // The group's own species names the row (a marked branch may start with a species of a group inside it).
    const r = rowOf(l.tips.find((tip) => rawKey(rowOf(tip)!) === l.key) ?? l.tips[0])!
    if (!fam && r.ord !== lastOrd) {
      rows.push({ kind: 'order', ord: r.ord, top })
      top += HEAD_H
      lastOrd = r.ord
    }
    ys.push(top + ROW_H / 2)
    const dotted = l.tips.length === 1 && tree.taxOnly[l.tips[0]] === 1
    if (genera) rows.push({ kind: 'species', row: r, on: onList.has(r.code), dotted, top })
    else rows.push({ kind: 'group', key: l.key, row: r, on: byRow.on.get(l.key) ?? 0, total: byRow.total.get(l.key) ?? l.tips.length, with: insideOf(folds!.others.get(l.key)), dotted, top })
    top += ROW_H
  }
  const tipRows = rows.filter((r) => r.kind !== 'order')
  // One lineage alone (a genus of one species, a family of one genus): its stem, from the split above it.
  const stem = isLeaf(root) && tree.parent[root.node] >= 0 ? tree.age[tree.parent[root.node]] : undefined
  const drawing = drawTree(root, (_, i) => { const r = tipRows[i]; return r.kind === 'species' ? r.on : r.kind === 'group' && r.on > 0 }, (i) => ys[i], stem, (_, i) => tipRows[i].dotted)
  const inside = (genus ? genFolds!.others.get(genus) : genera ? undefined : fam ? famFolds.others.get(fam) : undefined)
    ?.map((key) => species.rows.find((r) => (genus ? genusOf(r.sci) : r.fam) === key)!)
  return { rows, height: top, drawing, split: !inside && !!fam && !isClade(tree, tips), inside, level: { fam, genus: level.genus } }
}
