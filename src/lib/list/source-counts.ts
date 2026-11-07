import { SLOTS, slotSource, unmatchedKey } from './model'
import type { ListEntry, Slot, SourceRecord } from './model'
import type { Saved } from './storage'

/** Every record the list is built from, with the slot it came from: each slot's records (SLOTS order), then the fixed
 *  unmatched rows (in their own slot). Hand ticks in `edits.added` are not here (buildList adds them as 'manual'). */
export function slottedRecords(saved: Saved): { slot: Slot; record: SourceRecord }[] {
  const out: { slot: Slot; record: SourceRecord }[] = []
  for (const slot of SLOTS) for (const record of saved.records[slot] ?? []) out.push({ slot, record })
  for (const u of saved.unmatched) {
    const code = saved.edits.fixes[unmatchedKey(u)]
    if (!code) continue
    const slot = u.slot ?? u.source
    const record: SourceRecord = { code, source: slotSource(slot), date: u.date, place: u.place }
    if (u.seen) record.seen = u.seen
    out.push({ slot, record })
  }
  return out
}

/** The three sources the summary and "only here" compare: the two eBird files are one. */
export type Group = 'ebird' | 'inat' | 'manual'
export const GROUPS: readonly Group[] = ['ebird', 'inat', 'manual']
const groupOf = (slot: Slot): Group => (slot === 'ebird-list' ? 'ebird' : slot)

/** One Settings row's counts: the species it brings to the collage, and how many of them no other source has. */
export type RowCount = {
  species: number
  /** Species no other source has (the eBird files count as one source); 0 when none, when the other eBird row says
   *  it, or when no other source has species (then every bird is only there, and the row doesn't say so). */
  only: number
  /** 'here' ("12 only here"), or 'eBird' ("12 only in eBird") when both eBird files are on the list. */
  onlyIn: 'here' | 'eBird'
}

export type SourceCounts = {
  /** The collage's species (the list's length). */
  total: number
  rows: Record<Slot, RowCount>
  /** The summary's parts in source order, eBird → iNaturalist → by hand: each group's species not in an earlier one.
   *  Only groups that add species; they sum to `total`. */
  parts: { group: Group; n: number }[]
}

/**
 * What each source brings to the collage, from the list the collage shows (`list`, buildList's result for `saved`), so
 * the counts can never disagree with it. A source has a species when the species is on the list and the source holds
 * a record of it the rules count: research grade when `researchOnly`, not heard only (`hideHeard`) or found dead
 * (`hideDead`) unless the bird's marks say otherwise. Removed birds are off the list, fixed rows count in their own
 * slot, hand ticks (`records.manual` and `edits.added`) in 'manual'. A bird the rules keep only by its records
 * together (one heard, another dead) is credited to every source holding it, so every bird on the list has a source.
 *
 * "Only here" compares the three groups (both eBird files are one source). With one eBird file on the list its row
 * says "only here"; with both, eBird's number is shown once, as "only in eBird", on the eBird row with more species
 * (the life list on a tie), since a bird only in eBird may be in either file or both.
 */
export function sourceCounts(saved: Saved, list: readonly ListEntry[]): SourceCounts {
  const onList = new Set(list.map((e) => e.code))
  const { rules, edits } = saved
  const all = [...slottedRecords(saved), ...edits.added.map((record) => ({ slot: 'manual' as Slot, record }))]
  const strict = new Map<string, Set<Slot>>() // records that pass every rule on their own
  const loose = new Map<string, Set<Slot>>() // records that pass researchOnly only (the fallback)
  const add = (m: Map<string, Set<Slot>>, code: string, slot: Slot) => {
    const s = m.get(code)
    if (s) s.add(slot)
    else m.set(code, new Set([slot]))
  }
  for (const { slot, record: r } of all) {
    if (!onList.has(r.code)) continue
    if (rules.researchOnly && r.research === false) continue
    add(loose, r.code, slot)
    const mark = edits.marks[r.code] ?? {}
    if (rules.hideHeard && r.heard === true && mark.heard !== false) continue
    if (rules.hideDead && r.dead === true && mark.dead !== false) continue
    add(strict, r.code, slot)
  }

  const bySlot = new Map<Slot, Set<string>>(SLOTS.map((s) => [s, new Set()]))
  const byGroup = new Map<Group, Set<string>>(GROUPS.map((g) => [g, new Set()]))
  for (const code of onList) {
    const slots = strict.get(code) ?? loose.get(code)
    for (const slot of slots ?? []) {
      bySlot.get(slot)!.add(code)
      byGroup.get(groupOf(slot))!.add(code)
    }
  }
  const onlyOf = (g: Group) => {
    let k = 0
    for (const code of byGroup.get(g)!) if (GROUPS.every((o) => o === g || !byGroup.get(o)!.has(code))) k++
    return k
  }

  const species = (s: Slot) => bySlot.get(s)!.size
  const rows = {} as Record<Slot, RowCount>
  for (const s of SLOTS) rows[s] = { species: species(s), only: 0, onlyIn: 'here' }
  // With one source, everything is only there: say nothing.
  const many = GROUPS.filter((g) => byGroup.get(g)!.size > 0).length > 1
  rows.inat.only = many ? onlyOf('inat') : 0
  rows.manual.only = many ? onlyOf('manual') : 0
  const ebirdOnly = many ? onlyOf('ebird') : 0
  const both = species('ebird') > 0 && species('ebird-list') > 0
  const shows: Slot = !both ? (species('ebird') > 0 ? 'ebird' : 'ebird-list') : species('ebird') > species('ebird-list') ? 'ebird' : 'ebird-list'
  rows[shows].only = ebirdOnly
  if (both) rows[shows].onlyIn = 'eBird'

  const parts: SourceCounts['parts'] = []
  const before = new Set<string>()
  for (const g of GROUPS) {
    let n = 0
    for (const code of byGroup.get(g)!) {
      if (before.has(code)) continue
      before.add(code)
      n++
    }
    if (n > 0) parts.push({ group: g, n })
  }
  return { total: list.length, rows, parts }
}

const num = (x: number) => x.toLocaleString('en-US')
const FROM: Record<Group, string> = { ebird: 'from eBird', inat: 'from iNaturalist', manual: 'ticked by hand' }

/**
 * Settings' one line above the sources: "Your collage has 199 species: 185 from eBird, 11 more from iNaturalist,
 * 3 ticked by hand." One source: "Your collage has 576 species, all from iNaturalist." Null for an empty list.
 */
export function summaryLine(c: SourceCounts): string | null {
  if (!c.total) return null
  const head = `Your collage has ${num(c.total)} species`
  if (c.parts.length <= 1) return c.parts[0] ? `${head}, all ${FROM[c.parts[0].group]}.` : `${head}.`
  const body = c.parts.map((p, i) => `${num(p.n)} ${i > 0 && p.group !== 'manual' ? 'more ' : ''}${FROM[p.group]}`)
  return `${head}: ${body.join(', ')}.`
}

/** A row's counts as status parts: ["185 species", "12 only here"] (no "only" part at 0). */
export function countParts(r: RowCount): string[] {
  const parts = [`${num(r.species)} species`]
  if (r.only > 0) parts.push(`${num(r.only)} only ${r.onlyIn === 'here' ? 'here' : 'in eBird'}`)
  return parts
}
