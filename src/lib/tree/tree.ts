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
  /** The tips placed without genetic data (by taxonomy alone, or added beside a relative): one bit per tip in the
   *  Newick's order (`packBits`). Absent in files made before it: nothing is marked. */
  taxOnly?: string
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Bits as text, six per character (bit i is bit i % 6 of character i / 6). */
export function packBits(bits: readonly boolean[]): string {
  let out = ''
  for (let i = 0; i < bits.length; i += 6) {
    let v = 0
    for (let b = 0; b < 6; b++) if (bits[i + b]) v |= 1 << b
    out += B64[v]
  }
  return out
}
export const bitAt = (packed: string, i: number): boolean => ((B64.indexOf(packed[i / 6 | 0] ?? 'A') >> i % 6) & 1) === 1

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
  /** 1 at a tip placed without genetic data (TreeFile.taxOnly). */
  taxOnly: Uint8Array
}

/** Parses Newick text whose labels hold no ( ) , : ; (eBird codes). Internal labels are ignored. `taxOnly` is the
 *  file's packed bits, one per tip in reading order. */
export function parseNewick(s: string, taxOnly?: string): Tree {
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
  const marks = new Uint8Array(n)
  let tipNo = 0
  code.forEach((c, k) => {
    if (!c) return
    tipOf.set(c, k)
    if (taxOnly && bitAt(taxOnly, tipNo)) marks[k] = 1
    tipNo++
  })
  return { parent: Int32Array.from(parent), len: Float64Array.from(len), age, kids, code, tipOf, taxOnly: marks }
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
  /** Branch paths: rounded elbows in the rows (y from `yOf`, x from 0, the root's age, to `width`, today); in the fan
   *  and the circle (drawFan) an arc along the parent's ring, a rounded join, then a line out along the child's radius.
   *  Branches simply join: no dot marks a node (Yusuf, 2026-11-20). */
  seen: string
  unseen: string
  /** The own branches of the dotted leaves (the part after the join), drawn dotted. */
  seenDot: string
  unseenDot: string
  /** The oldest node drawn, in millions of years (the axis's left end, the fan's centre). */
  rootAge: number
}

/** How round a branch's corner is (px; less where the branch is shorter), as the site's corners. */
export const CORNER = 8
/** A tip's hollow dot (px). */
export const TIP_R = 3.5

/** One branch: from its parent node (age, position in leaf units) to its child's. */
export type Branch = { pa: number; py: number; ca: number; cy: number; on: boolean; dot: boolean }

/**
 * The branches of a drawing, laid out by nothing yet: a node sits midway between its first and last child, a leaf at
 * `yOf(i)` and age 0 (a tip reaches today). A drawing that is one leaf is its stem, from `stemAge`.
 */
export function branchesOf(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, yOf: (i: number) => number, stemAge: number | undefined, dotted: (leaf: Leaf, i: number) => boolean): { leaves: Leaf[]; branches: Branch[]; rootAge: number } {
  const leaves = leavesOf(root)
  const rootAge = (isLeaf(root) ? stemAge : root.age) || 1
  const branches: Branch[] = []
  let row = 0
  // Returns [y, seen, dotted] of the subtree (dotted only for a leaf).
  const walk = (n: Node | Leaf): [number, boolean, boolean] => {
    if (isLeaf(n)) { const i = row++; return [yOf(i), seen(n, i), dotted(n, i)] }
    const parts = n.kids.map((k) => [k, ...walk(k)] as const)
    const y = (parts[0][1] + parts[parts.length - 1][1]) / 2
    for (const [k, ky, ks, kd] of parts) branches.push({ pa: n.age, py: y, ca: isLeaf(k) ? 0 : k.age, cy: ky, on: ks, dot: kd })
    return [y, parts.some((p) => p[2]), false]
  }
  if (isLeaf(root)) branches.push({ pa: rootAge, py: yOf(0), ca: 0, cy: yOf(0), on: seen(root, 0), dot: dotted(root, 0) })
  else walk(root)
  return { leaves, branches, rootAge }
}

const n1 = (v: number) => +v.toFixed(1)
/** A circle as path data (one path holds every tip's dot, or an age ring). */
export const circlePath = (x: number, y: number, r = TIP_R): string => `M${n1(x - r)} ${n1(y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`

/**
 * The rows' drawing: each branch an elbow from its parent node down to its child, its corner rounded (CORNER, less
 * on a short branch), in `seen` when some leaf below is on the list. `yOf(i)` is the i-th leaf's y (default: one unit
 * per leaf). A leaf for which `dotted` holds has its own branch (the part after the corner) in `seenDot` / `unseenDot`
 * instead; the vertical part, which siblings can overlap, stays solid. Coordinates are px when `width` is the
 * drawing's width in px.
 */
export function drawTree(root: Node | Leaf, seen: (leaf: Leaf, i: number) => boolean, yOf: (i: number) => number = (i) => i + 0.5, stemAge?: number, dotted: (leaf: Leaf, i: number) => boolean = () => false, width = 1000): Drawing {
  const { leaves, branches, rootAge } = branchesOf(root, seen, yOf, stemAge, dotted)
  const x = (age: number) => n1((1 - age / rootAge) * width)
  const on: string[] = [], off: string[] = [], onDot: string[] = [], offDot: string[] = []
  for (const b of branches) {
    const px = x(b.pa), end = x(b.ca), py = n1(b.py), cy = n1(b.cy)
    const dy = cy - py
    let solid: string, dot = ''
    if (Math.abs(dy) < 0.05) {
      solid = `M${px} ${cy}H${end}`
      if (b.dot) { dot = solid; solid = '' }
    } else {
      const r = n1(Math.min(CORNER, Math.abs(dy), Math.max(0, end - px)))
      const s = Math.sign(dy)
      const turn = `M${px} ${py}${r < Math.abs(dy) ? `V${n1(cy - s * r)}` : ''}Q${px} ${cy} ${n1(px + r)} ${cy}`
      if (b.dot) { solid = turn; dot = `M${n1(px + r)} ${cy}H${end}` } else solid = `${turn}H${end}`
    }
    if (solid) (b.on ? on : off).push(solid)
    if (dot) (b.on ? onDot : offDot).push(dot)
  }
  return { leaves, seen: on.join(''), unseen: off.join(''), seenDot: onDot.join(''), unseenDot: offDot.join(''), rootAge }
}

/** An age for the axis and the fact line: whole millions from 10, else up to two decimals ("0,5" with a comma decimal). */
export function formatAge(v: number, num: { decimal: string }): string {
  const r = v >= 10 ? Math.round(v) : +v.toFixed(v >= 1 ? 1 : 2)
  return String(r).replace('.', num.decimal)
}
