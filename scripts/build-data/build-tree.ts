// Writes public/data/tree.v1.json, the Tree view's data: AvesData v1.7's dated summary tree (the maximum clade
// credibility tree of its dated tree set, Clements 2025 labels; McTavish et al., "A complete and dynamic tree of
// birds", CC BY 4.0), with its tips relabelled as eBird species codes of the taxonomy species.v1.json ships.
//
// A tip's scientific name is matched to species.v1.json first; else the crosswalk's 2025 code for that name, when
// species.v1.json still has that code. Tips that match no species are pruned (their parent's other child takes the
// summed branch), as is a second tip for a code already placed. Branch lengths are kept, rounded to 0.001 million years.
// A tip missing from AvesData's tree of the species with genetic data (phylo_only_clements_labels.tre, the same
// labels) was placed by taxonomy alone; those are the file's `taxOnly` bits.
// data/tree-additions.json lists species of the eBird taxonomy that the tree lacks, each with the species it was split
// from and the source of that fact; each is attached beside its parent's tip, splitting off at half the parent's own
// branch (several from one parent share that split), and is marked as placed without genetic data. An addition whose
// code already has a tip, or whose parent has none, is skipped with a note, so a newer tree needs no code change.
// Needs data/raw/avesdata (npx tsx scripts/build-data/fetch-sources.ts --tree-only). Prints the counts.
//   npx tsx scripts/build-data/build-tree.ts
// Then rerun scripts/build-data/data-files.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'
import { packBits, parseNewick, type TreeFile } from '../../src/lib/tree/tree'

type Row = { code: string; sci: string }

/** The first tree of a NEXUS file as Newick, its [&…] comments removed. */
export function nexusTree(text: string): string {
  const m = /TREE\s+\S+\s*=\s*(?:\[&R\]\s*)?([^;]*;)/i.exec(text)
  if (!m) throw new Error('no TREE in the NEXUS file')
  return m[1].replace(/\[[^\]]*\]/g, '')
}

/** Tip label -> eBird code. */
export function matcher(species: Row[], crosswalk: { SPECIES_CODE?: string; SCI_NAME?: string; sci_name_2025?: string }[]) {
  const codes = new Set(species.map((r) => r.code))
  const bySci = new Map(species.map((r) => [r.sci.toLowerCase(), r.code]))
  const viaCode = new Map<string, string>()
  for (const r of crosswalk) {
    if (!r.SPECIES_CODE || !codes.has(r.SPECIES_CODE)) continue
    for (const sci of [r.sci_name_2025, r.SCI_NAME]) if (sci) viaCode.set(sci.toLowerCase(), r.SPECIES_CODE)
  }
  return (label: string): string | undefined => {
    const sci = label.replace(/_/g, ' ').trim().toLowerCase()
    return bySci.get(sci) ?? viaCode.get(sci)
  }
}

/** The tree with its tips relabelled by `codeOf`, unmatched and repeated tips pruned, as compact Newick. */
export function relabel(newick: string, codeOf: (label: string) => string | undefined): { newick: string; kept: number; unmatched: string[]; repeated: string[]; labelOf: Map<string, string> } {
  const t = parseNewick(newick)
  const n = t.parent.length
  const placed = new Map<string, string>()
  const keepCode: (string | undefined)[] = new Array(n)
  const unmatched: string[] = [], repeated: string[] = []
  for (let k = 0; k < n; k++) {
    const label = t.code[k]
    if (!label) continue
    const c = codeOf(label)
    if (!c) unmatched.push(label)
    else if (placed.has(c)) repeated.push(label)
    else { placed.set(c, label); keepCode[k] = c }
  }
  // live[k]: some kept tip under k.
  const live = new Uint8Array(n)
  for (let k = n - 1; k >= 0; k--) live[k] = keepCode[k] ? 1 : t.kids[k].some((c) => live[c]) ? 1 : 0
  const num = (x: number) => String(Math.round(x * 1000) / 1000)
  // Writes node k, `extra` being the length of merged one-child nodes above it.
  const write = (k: number, extra: number): string => {
    const ks = t.kids[k].filter((c) => live[c])
    if (ks.length === 1) return write(ks[0], extra + t.len[k])
    const len = `:${num(t.len[k] + extra)}`
    return ks.length ? `(${ks.map((c) => write(c, 0)).join(',')})${len}` : `${keepCode[k]}${len}`
  }
  const root = (() => { let k = 0; for (let ks = t.kids[k].filter((c) => live[c]); ks.length === 1; ks = t.kids[k].filter((c) => live[c])) k = ks[0]; return k })()
  const body = write(root, 0).replace(/:[^:(),]*$/, '')
  return { newick: `${body};`, kept: placed.size, unmatched, repeated, labelOf: placed }
}

export type Addition = { code: string; parent: string; source: string }

/**
 * `newick` with each addition attached beside its parent's tip: the parent's branch of length L becomes L/2 to a new
 * node holding the parent and every addition from it, each at L/2. Skips (with the reason) an addition whose code has
 * a tip already, or whose parent has none.
 */
export function attach(newick: string, additions: readonly Addition[]): { newick: string; added: string[]; skipped: string[] } {
  const tips = parseNewick(newick).tipOf
  const byParent = new Map<string, string[]>()
  const added: string[] = [], skipped: string[] = []
  for (const a of additions) {
    if (tips.has(a.code)) skipped.push(`${a.code}: has a tip of its own`)
    else if (!tips.has(a.parent)) skipped.push(`${a.code}: its parent ${a.parent} has no tip`)
    else { byParent.set(a.parent, [...(byParent.get(a.parent) ?? []), a.code]); added.push(a.code) }
  }
  let out = newick
  for (const [p, codes] of byParent) {
    out = out.replace(new RegExp(`([(,])${p}:([^,);]+)`), (_, pre: string, len: string) => {
      const h = String(Math.round((Number(len) / 2) * 1000) / 1000)
      return `${pre}(${[p, ...codes].map((c) => `${c}:${h}`).join(',')}):${h}`
    })
  }
  return { newick: out, added, skipped }
}

/** The packed `taxOnly` bits of `newick`'s tips, in order. */
export function taxOnlyBits(newick: string, isTaxOnly: (code: string) => boolean): string {
  const t = parseNewick(newick)
  return packBits(t.code.filter((c): c is string => !!c).map(isTaxOnly))
}

function main() {
  const root = process.cwd()
  const raw = resolve(root, 'data/raw/avesdata')
  const species = JSON.parse(readFileSync(resolve(root, 'public/data/species.v1.json'), 'utf8')) as { ebirdTaxonomy: string; species: Row[] }
  const cross = Papa.parse<Record<string, string>>(readFileSync(resolve(raw, 'OTT_crosswalk_2025.csv'), 'utf8'), { header: true, skipEmptyLines: true }).data
  const nex = readFileSync(resolve(raw, 'summary_dated_clements.nex'), 'utf8')
  const genetic = parseNewick(readFileSync(resolve(raw, 'phylo_only_clements_labels.tre'), 'utf8').trim()).tipOf
  const additions = JSON.parse(readFileSync(resolve(root, 'data/tree-additions.json'), 'utf8')) as Addition[]
  const out = relabel(nexusTree(nex), matcher(species.species, cross))
  const att = attach(out.newick, additions)
  for (const note of att.skipped) console.log('addition skipped:', note)
  const added = new Set(att.added)
  const isTaxOnly = (c: string) => added.has(c) || !genetic.has(out.labelOf.get(c)!)
  const taxOnly = taxOnlyBits(att.newick, isTaxOnly)
  const dotted = [...out.labelOf.keys(), ...added].filter(isTaxOnly).length
  const file: TreeFile = { v: 1, tree: 'AvesData v1.7', taxonomy: 'Clements 2025', ebirdTaxonomy: species.ebirdTaxonomy, newick: att.newick, taxOnly }
  const text = JSON.stringify(file)
  writeFileSync(resolve(root, 'public/data/tree.v1.json'), text)
  const missing = species.species.filter((r) => !att.newick.includes(`(${r.code}:`) && !att.newick.includes(`,${r.code}:`)).length
  console.log(`tree.v1.json: ${(text.length / 1024).toFixed(1)} KB; ${out.kept} of ${species.species.length} species placed, ${att.added.length} added beside their parent, ${missing} without a tip; ${out.unmatched.length} tips matched no species, ${out.repeated.length} repeated a code`)
  console.log(`${dotted} tips placed without genetic data (${dotted - att.added.length} by taxonomy alone, ${genetic.size} tips in the genetic-data tree)`)
  if (out.unmatched.length) console.log('unmatched tips:', out.unmatched.slice(0, 40).join(' '))
}

if (process.argv[1] && /build-tree\.ts$/.test(process.argv[1])) main()
