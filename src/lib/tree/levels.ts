// The Tree view's three levels as rows and a drawing (pure). Level one is every family, level two one family's
// genera, level three one genus's species. Family and genus totals come from the eBird taxonomy the app ships
// (species.v1.json), so a group's count is "on the list / in the taxonomy"; the tree only decides where it is drawn.
// A group the tree splits (not one branch of its own) is shown in one of two ways (`foldSplit`). Nearly one branch: the
// smallest branch holding the whole group holds at most two other groups, each wholly inside it, with fewer species
// together than the group; it is drawn as one row at that branch ("Macropygia with Turacoena"), counting the whole
// branch, and the groups inside get no row of their own. Scattered (any other): each part is its own row, counting its
// own tips only, so nothing is counted twice.
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
  /** A family (level one) or genus (level two). `row` is one of its species, for names. `part` when the tree scatters
   *  it; `with` one species of each group folded into its branch. */
  | { kind: 'group'; key: string; row: SpeciesRow; on: number; total: number; part?: [number, number]; with?: SpeciesRow[]; dotted: boolean; top: number }
  /** `dotted`: placed without genetic data (a group: one species alone, so drawn by that species' own branch). */
  | { kind: 'species'; row: SpeciesRow; on: boolean; dotted: boolean; top: number }

export type LevelView = {
  rows: TreeRow[]
  /** The rows' height in px (the drawing's y range). */
  height: number
  drawing: Drawing
  /** The open family or genus is not one branch in the whole tree (the drawing keeps its species alone). */
  split: boolean
  /** The open group is nearly one branch: one species of each group inside it, which the drawing includes. */
  inside?: SpeciesRow[]
  /** The level drawn: `level` with a folded family or genus replaced by the one whose branch holds it. */
  level: TreeLevel
}

/**
 * The split groups among `tips` (one key per tip): `into` maps a group folded into another's branch to that group,
 * `others` a folding group to the groups folded into it, `scattered` lists the split groups drawn as their parts.
 */
export type Folds = { into: Map<string, string>; others: Map<string, string[]>; scattered: Set<string> }

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
  const split: { key: string; size: number; others?: string[] }[] = []
  for (const [key, s] of span) {
    if (s.n < 2) continue
    let m = s.lo // the smallest branch holding the whole group
    while (end[m] <= s.hi) m = tree.parent[m]
    const inside = new Map<string, number>()
    for (let i = from(m), j = from(end[m]); i < j; i++) if (keys[i] !== key) inside.set(keys[i], (inside.get(keys[i]) ?? 0) + 1)
    if (!inside.size) continue
    const near = inside.size <= 2 && [...inside.values()].reduce((a, b) => a + b) < s.n && [...inside].every(([o, c]) => span.get(o)!.n === c)
    split.push({ key, size: end[m] - m, others: near ? [...inside.keys()] : undefined })
  }
  // Smaller branches first, so a group inside two nested ones ends in the outer; a folding group folded itself passes
  // its groups on (each fold has fewer species than its group, so there is no loop).
  const into = new Map<string, string>()
  for (const g of split.filter((g) => g.others).sort((a, b) => a.size - b.size)) for (const o of g.others!) into.set(o, g.key)
  const others = new Map<string, string[]>()
  for (const o of into.keys()) { const t = foldedInto(into, o); others.set(t, [...(others.get(t) ?? []), o]) }
  return { into, others, scattered: new Set(split.filter((g) => !g.others && !into.has(g.key)).map((g) => g.key)) }
}

/** The group whose row shows `key` (itself unless folded). */
export function foldedInto(into: ReadonlyMap<string, string>, key: string): string {
  while (into.has(key)) key = into.get(key)!
  return key
}

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
  // The open family and genus, a folded one replaced by its holder, and the groups in that holder's branch.
  const famFolds = foldSplit(tree, all, (tip) => rowOf(tip)!.fam)
  const fam = level.fam ? foldedInto(famFolds.into, level.fam) : undefined
  const fams = fam ? new Set([fam, ...famFolds.others.get(fam) ?? []]) : undefined
  const famTips = fams ? all.filter((tip) => fams.has(rowOf(tip)!.fam)) : all
  const genFolds = fam ? foldSplit(tree, famTips, (tip) => genusOf(rowOf(tip)!.sci)) : undefined
  const genus = genFolds && level.genus ? foldedInto(genFolds.into, level.genus) : undefined
  const genera = genus ? new Set([genus, ...genFolds!.others.get(genus) ?? []]) : undefined
  const tips = genera ? famTips.filter((tip) => genera.has(genusOf(rowOf(tip)!.sci))) : famTips
  const inScope = (r: SpeciesRow) => (!fams || fams.has(r.fam)) && (!genera || genera.has(genusOf(r.sci)))
  const folds = genus ? undefined : genFolds ?? famFolds
  const rawKey = (r: SpeciesRow) => (genus ? r.code : fam ? genusOf(r.sci) : r.fam)
  const keyOf = (r: SpeciesRow) => (folds ? foldedInto(folds.into, rawKey(r)) : rawKey(r))
  const root = cladeTree(tree, tips, (tip) => keyOf(rowOf(tip)!))
  if (!root) return undefined
  // One species of a group, for its names (a family's or a genus's: `byGenus`).
  const rowFor = (key: string, byGenus: boolean) => species.rows.find((r) => (byGenus ? genusOf(r.sci) : r.fam) === key)!
  // Totals from the taxonomy, within the open scope; a folded group counts toward the row that holds it.
  const total = new Map<string, number>(), on = new Map<string, number>()
  for (const r of species.rows) {
    if (!inScope(r)) continue
    const k = keyOf(r)
    total.set(k, (total.get(k) ?? 0) + 1)
    if (onList.has(r.code)) on.set(k, (on.get(k) ?? 0) + 1)
  }
  const leaves = leavesOf(root)
  const parts = new Map<string, number>()
  for (const l of leaves) parts.set(l.key, (parts.get(l.key) ?? 0) + 1)
  const seenPart = new Map<string, number>()
  const rows: TreeRow[] = []
  const ys: number[] = []
  let top = 0
  let lastOrd: string | undefined
  for (const l of leaves) {
    // The group's own species names the row (a folded branch may start with a species of a group inside it).
    const r = rowOf(l.tips.find((tip) => rawKey(rowOf(tip)!) === l.key) ?? l.tips[0])!
    if (!fam && r.ord !== lastOrd) {
      rows.push({ kind: 'order', ord: r.ord, top })
      top += HEAD_H
      lastOrd = r.ord
    }
    ys.push(top + ROW_H / 2)
    const dotted = l.tips.length === 1 && tree.taxOnly[l.tips[0]] === 1
    if (genus) rows.push({ kind: 'species', row: r, on: onList.has(r.code), dotted, top })
    else {
      const n = parts.get(l.key)!
      const folded = folds!.others.get(l.key)
      if (n === 1) rows.push({ kind: 'group', key: l.key, row: r, on: on.get(l.key) ?? 0, total: total.get(l.key) ?? l.tips.length, with: folded?.map((o) => rowFor(o, !!fam)), dotted, top })
      else {
        const i = (seenPart.get(l.key) ?? 0) + 1
        seenPart.set(l.key, i)
        const mine = l.tips.filter((tip) => onList.has(tree.code[tip]!)).length
        rows.push({ kind: 'group', key: l.key, row: r, on: mine, total: l.tips.length, part: [i, n], dotted, top })
      }
    }
    top += ROW_H
  }
  const tipRows = rows.filter((r) => r.kind !== 'order')
  // One lineage alone (a genus of one species, a family of one genus): its stem, from the split above it.
  const stem = isLeaf(root) && tree.parent[root.node] >= 0 ? tree.age[tree.parent[root.node]] : undefined
  const drawing = drawTree(root, (_, i) => { const r = tipRows[i]; return r.kind === 'species' ? r.on : r.kind === 'group' && r.on > 0 }, (i) => ys[i], stem, (_, i) => tipRows[i].dotted)
  const inGroup = genus ? genFolds!.others.get(genus)?.map((o) => rowFor(o, true)) : fam ? famFolds.others.get(fam)?.map((o) => rowFor(o, false)) : undefined
  return { rows, height: top, drawing, split: !inGroup && !!fam && !isClade(tree, tips), inside: inGroup, level: { fam, genus } }
}
