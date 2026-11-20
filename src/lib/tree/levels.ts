// The Tree view's three levels as rows and a drawing (pure). Level one is every family, level two one family's
// genera, level three one genus's species. Family and genus totals come from the eBird taxonomy the app ships
// (species.v1.json), so a group's count is "on the list / in the taxonomy"; the tree only decides where it is drawn.
// A group the tree splits (not one clade) is drawn as each of its parts, and a part counts its own tips only, so
// nothing is counted twice.
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
  /** A family (level one) or genus (level two). `row` is one of its species, for names. `part` when the tree splits it. */
  | { kind: 'group'; key: string; row: SpeciesRow; on: number; total: number; part?: [number, number]; dotted: boolean; top: number }
  /** `dotted`: placed without genetic data (a group: one species alone, so drawn by that species' own branch). */
  | { kind: 'species'; row: SpeciesRow; on: boolean; dotted: boolean; top: number }

export type LevelView = {
  rows: TreeRow[]
  /** The rows' height in px (the drawing's y range). */
  height: number
  drawing: Drawing
  /** The open family or genus is not one clade in the whole tree (the drawing keeps its species alone). */
  split: boolean
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
  const inScope = (r: SpeciesRow) => (!level.fam || r.fam === level.fam) && (!level.genus || genusOf(r.sci) === level.genus)
  const tips: number[] = []
  for (const tip of tree.tipOf.values()) { const r = rowOf(tip); if (r && inScope(r)) tips.push(tip) }
  const keyOf = (r: SpeciesRow) => (level.genus ? r.code : level.fam ? genusOf(r.sci) : r.fam)
  const root = cladeTree(tree, tips, (tip) => keyOf(rowOf(tip)!))
  if (!root) return undefined
  // Totals from the taxonomy, within the open scope.
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
    const r = rowOf(l.tips[0])!
    if (!level.fam && r.ord !== lastOrd) {
      rows.push({ kind: 'order', ord: r.ord, top })
      top += HEAD_H
      lastOrd = r.ord
    }
    ys.push(top + ROW_H / 2)
    const dotted = l.tips.length === 1 && tree.taxOnly[l.tips[0]] === 1
    if (level.genus) rows.push({ kind: 'species', row: r, on: onList.has(r.code), dotted, top })
    else {
      const n = parts.get(l.key)!
      if (n === 1) rows.push({ kind: 'group', key: l.key, row: r, on: on.get(l.key) ?? 0, total: total.get(l.key) ?? l.tips.length, dotted, top })
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
  return { rows, height: top, drawing, split: !!level.fam && !isClade(tree, tips) }
}
