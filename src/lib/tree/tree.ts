// The bird tree (AvesData's dated summary tree, public/data/tree.v1.json, built by scripts/build-data/build-tree.ts):
// parsing its Newick text, node ages, and the drawings the Tree view shows. Pure: no React, no fetch.
//
// A drawing collapses the tree to the clades a level shows. `cladeTree(tree, tips, keyOf)` keeps the given tips only
// (the subtree they induce: other tips are dropped and the one-child nodes they leave are merged, branch lengths
// summed) and ends each branch at the largest clade whose tips all share a key: a family, a genus or one species.
// A family or genus that is not one clade in the tree ends several branches, each a leaf with the same key, so nothing
// is hidden or moved: the drawing is the published tree, read at that level.

/** The data file. `newick`'s tips are eBird species codes; branch lengths are millions of years. */
export type TreeFile = {
  v: 1
  /** "AvesData v1.7" */
  tree: string
  /** The tree's own taxonomy ("Clements 2025"). */
  taxonomy: string
  /** The eBird taxonomy the tips were matched to (species.v1.json's). */
  ebirdTaxonomy: string
  newick: string
}

/** Nodes in pre-order (0 is the root): parent (-1 for the root), the branch above each node, tip codes. */
export type Tree = {
  parent: Int32Array
  len: Float64Array
  /** Age in millions of years: 0 at the tips, the deepest path below each node. */
  age: Float64Array
  kids: number[][]
  code: (string | null)[]
  /** eBird code -> tip node. */
  tipOf: Map<string, number>
}

/** Parses Newick text whose labels hold no ( ) , : ; (eBird codes). Internal labels are ignored. */
export function parseNewick(s: string): Tree {
  const parent: number[] = []
  const len: number[] = []
  const code: (string | null)[] = []
  const stack: number[] = []
  let cur = -1
  let i = 0
  const open = () => {
    const n = parent.length
    parent.push(stack.length ? stack[stack.length - 1] : -1)
    len.push(0)
    code.push(null)
    return n
  }
  while (i < s.length) {
    const c = s[i]
    if (c === '(') {
      stack.push(open())
      i++
    } else if (c === ',' || c === ')' || c === ';') {
      if (c === ')') cur = stack.pop()!
      i++
    } else if (c === ':') {
      let j = i + 1
      while (j < s.length && !',);'.includes(s[j])) j++
      len[cur] = Number(s.slice(i + 1, j)) || 0
      i = j
    } else {
      let j = i
      while (j < s.length && !',):;('.includes(s[j])) j++
      const label = s.slice(i, j).trim()
      if (s[i - 1] !== ')' && label) {
        cur = open()
        code[cur] = label
      }
      i = j
    }
  }
  const n = parent.length
  const kids: number[][] = Array.from({ length: n }, () => [])
  for (let k = 1; k < n; k++) kids[parent[k]].push(k)
  const age = new Float64Array(n)
  for (let k = n - 1; k >= 0; k--) for (const c of kids[k]) age[k] = Math.max(age[k], age[c] + len[c])
  const tipOf = new Map<string, number>()
  code.forEach((c, k) => { if (c) tipOf.set(c, k) })
  return { parent: Int32Array.from(parent), len: Float64Array.from(len), age, kids, code, tipOf }
}

/** A drawn tip: its key, the tree's tips in it, its crown node and that node's age (0 for a single tip). */
export type Leaf = { key: string; tips: number[]; node: number; age: number }
export type Node = { age: number; kids: (Node | Leaf)[] }
export const isLeaf = (n: Node | Leaf): n is Leaf => 'key' in n

/**
 * The tree on `tips` alone, ending at the largest clades whose tips share `keyOf(tip)`. A leaf's `age` is its clade's
 * crown age (0 for a single tip). Undefined when no tip is given.
 */
export function cladeTree(tree: Tree, tips: Iterable<number>, keyOf: (tip: number) => string): Node | Leaf | undefined {
  const n = tree.parent.length
  const on = new Uint8Array(n)
  for (const t of tips) on[t] = 1
  // pure[k]: the key every kept tip under k shares, null when they differ, undefined when none is kept.
  const pure: (string | null | undefined)[] = new Array(n)
  for (let k = n - 1; k >= 0; k--) {
    const ks = tree.kids[k]
    if (!ks.length) { pure[k] = on[k] ? keyOf(k) : undefined; continue }
    let p: string | null | undefined
    for (const c of ks) {
      const q = pure[c]
      if (q === undefined) continue
      p = p === undefined ? q : p === q ? p : null
    }
    pure[k] = p
  }
  const live = (k: number) => tree.kids[k].filter((c) => pure[c] !== undefined)
  const leaf = (k: number): Leaf => {
    const out: number[] = []
    const walk = [k]
    while (walk.length) {
      const x = walk.pop()!
      const ks = live(x)
      if (!ks.length) out.push(x)
      else walk.push(...ks.reverse())
    }
    let crown = k
    for (let ks = live(crown); ks.length === 1; ks = live(crown)) crown = ks[0]
    return { key: pure[k]!, tips: out, node: crown, age: tree.age[crown] }
  }
  const build = (k: number): Node | Leaf => {
    if (pure[k] !== null) return leaf(k)
    const ks = live(k)
    return ks.length === 1 ? build(ks[0]) : { age: tree.age[k], kids: ks.map(build) }
  }
  return pure[0] === undefined ? undefined : build(0)
}

/** The leaves, top to bottom. */
export function leavesOf(root: Node | Leaf): Leaf[] {
  const out: Leaf[] = []
  const walk = (x: Node | Leaf) => { if (isLeaf(x)) out.push(x); else x.kids.forEach(walk) }
  walk(root)
  return out
}

/** How long ago a tip split from its nearest relatives: its own branch, in millions of years. */
export const tipBranch = (tree: Tree, tip: number): number => tree.len[tip]

/**
 * The oldest lineage among `codes`: the tip whose own branch is the longest (the longest time since it split from
 * its closest relatives in the whole tree). Codes without a tip are skipped.
 */
export function oldestLineage(tree: Tree, codes: Iterable<string>): { code: string; age: number } | undefined {
  let best: { code: string; age: number } | undefined
  for (const c of codes) {
    const tip = tree.tipOf.get(c)
    if (tip === undefined) continue
    const age = tree.len[tip]
    if (!best || age > best.age) best = { code: c, age }
  }
  return best
}

/** Round tick values from `max` down to 0, about `count` of them (steps of 1, 2 or 5 times a power of ten). */
export function ageTicks(max: number, count = 5): number[] {
  if (!(max > 0)) return [0]
  const raw = max / count
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw)!
  const out: number[] = []
  for (let v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6)
  return out
}

export type Drawing = {
  leaves: Leaf[]
  /** Elbow paths: y from `yOf`, x from 0 (the root's age) to `width` (today). */
  seen: string
  unseen: string
  /** The oldest node drawn, in millions of years (the axis's left end). */
  rootAge: number
}

/**
 * The elbows of a drawing: each branch from its parent node down to its child, in `seen` when some leaf below is on the
 * list. `yOf(i)` is the i-th leaf's y (default: one unit per leaf). A drawing that is one leaf is its stem, from
 * `stemAge` (the split from its closest relatives) to today.
 */
export function drawTree(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, yOf: (i: number) => number = (i) => i + 0.5, stemAge?: number, width = 1000): Drawing {
  const leaves = leavesOf(root)
  const rootAge = (isLeaf(root) ? stemAge : root.age) || 1
  const x = (age: number) => +((1 - age / rootAge) * width).toFixed(1)
  let row = 0
  const on: string[] = [], off: string[] = []
  // Returns [y, seen] of the subtree.
  const walk = (n: Node | Leaf): [number, boolean] => {
    if (isLeaf(n)) { const i = row++; return [yOf(i), seen(n, i)] }
    const parts = n.kids.map((k) => [k, ...walk(k)] as const)
    const y = (parts[0][1] + parts[parts.length - 1][1]) / 2
    const px = x(n.age)
    for (const [k, ky, ks] of parts) (ks ? on : off).push(`M${px} ${y}V${ky}H${isLeaf(k) ? width : x(k.age)}`)
    return [y, parts.some((p) => p[2])]
  }
  if (isLeaf(root)) (seen(root, 0) ? on : off).push(`M0 ${yOf(0)}H${width}`)
  else walk(root)
  return { leaves, seen: on.join(''), unseen: off.join(''), rootAge }
}

/** An age for the axis and the fact line: whole millions from 10, else up to two decimals ("0,5" with a comma decimal). */
export function formatAge(v: number, num: { decimal: string }): string {
  const r = v >= 10 ? Math.round(v) : +v.toFixed(v >= 1 ? 1 : 2)
  return String(r).replace('.', num.decimal)
}
