import { fmt, plural, type Plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import { SLOTS, slotSource, unmatchedKey } from './model'
import type { ListEntry, Slot, SourceRecord } from './model'
import type { Saved } from './storage'

/** Every record the list is built from, with the slot it came from: each slot's records (SLOTS order), then the fixed
 *  unmatched rows (in their own slot). Hand ticks in `edits.added` are not here (buildList adds them as 'manual').
 *  Imported records of a species a source marks not countable (`notCountedCodes`) are left out; fixed rows stay. */
export function slottedRecords(saved: Saved): { slot: Slot; record: SourceRecord }[] {
  const out: { slot: Slot; record: SourceRecord }[] = []
  const off = notCountedCodes(saved)
  for (const slot of SLOTS) {
    for (const record of saved.records[slot] ?? []) if (slot === 'manual' || !off.has(record.code)) out.push({ slot, record })
  }
  for (const u of saved.unmatched) {
    const code = saved.edits.fixes[unmatchedKey(u)]
    if (!code) continue
    const slot = u.slot ?? u.source
    const record: SourceRecord = { code, source: slotSource(slot), date: u.date, place: u.place }
    if (u.seen) record.seen = u.seen
    if (u.seenMonths) record.seenMonths = u.seenMonths
    out.push({ slot, record })
  }
  return out
}

/** The species any source marks not countable (Saved.notCountable, every slot together). */
export function notCountedCodes(saved: Pick<Saved, 'notCountable'>): Set<string> {
  return new Set(Object.values(saved.notCountable ?? {}).flatMap((codes) => codes ?? []))
}

/** The source groups the summary compares: a source's export slots count together. */
export type Group = 'ebird' | 'inat' | 'obsorg' | 'sheet' | 'manual'
export const GROUPS: readonly Group[] = ['ebird', 'inat', 'obsorg', 'sheet', 'manual']
const groupOf = (slot: Slot): Group => slotSource(slot)
const ONLY_IN: Partial<Record<Group, RowCount['onlyIn']>> = { ebird: 'eBird', obsorg: 'observation.org' }

/** One Settings row's counts: the species it brings to the collage, and how many of them no other source has. */
export type RowCount = {
  species: number
  /** Species no other source has (a source's two files count as one); 0 when none, when the source's other row says
   *  it, or when no other source has species (then every bird is only there, and the row doesn't say so). */
  only: number
  /** 'here' ("12 only here"), or the source's name ("12 only in eBird") when both of its files are on the list. */
  onlyIn: 'here' | 'eBird' | 'observation.org'
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
 * "Only here" compares the groups (both eBird files are one source, and so are both observation.org files). With one
 * of a source's files on the list its row says "only here"; with both, the source's number is shown once, as "only in
 * eBird" / "only in observation.org", on its row with more species (the life list on a tie), since a bird only in
 * that source may be in either file or both.
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
  // A group's number is on its one row; for a source with two files (eBird, observation.org) with both on the list,
  // once, as "only in <source>", on the file with more species (the second slot on a tie: the life list).
  for (const g of GROUPS) {
    const slots = SLOTS.filter((s) => groupOf(s) === g)
    const only = many ? onlyOf(g) : 0
    if (slots.length === 1) {
      rows[slots[0]].only = only
      continue
    }
    const [a, b] = slots
    const both = species(a) > 0 && species(b) > 0
    const shows: Slot = !both ? (species(a) > 0 ? a : b) : species(a) > species(b) ? a : b
    rows[shows].only = only
    if (both) rows[shows].onlyIn = ONLY_IN[g]!
  }

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

/**
 * Settings' one line above the sources, in `t`'s language: "Your collage has 199 species: 185 from eBird, 11 more from
 * iNaturalist, 3 ticked by hand." One source: "Your collage has 576 species, all from iNaturalist." Null for an empty
 * list. Whole templates per group (`t.import.summary`), each plural on its own number, so gender and number agree.
 */
export function summaryLine(c: SourceCounts, t: Ui): string | null {
  if (!c.total) return null
  const s = t.import.summary
  const count = (n: number, p: Plural) => plural(p, n, { n: formatInt(n, t.num) })
  const head = count(c.total, s.head)
  if (c.parts.length <= 1) return c.parts[0] ? fmt(s.one, { head, all: count(c.total, s.all[c.parts[0].group]) }) : `${head}.`
  const parts = c.parts.map((p, i) => count(p.n, i > 0 && p.group !== 'ebird' ? s.more[p.group] : s.first[p.group]))
  return fmt(s.list, { head, parts: parts.join(', ') })
}

/** A row's counts as status parts: ["185 species", "12 only here"] (no "only" part at 0), in `t`'s language. */
export function countParts(r: RowCount, t: Ui): string[] {
  const n = (x: number) => formatInt(x, t.num)
  const parts = [plural(t.import.species, r.species, { n: n(r.species) })]
  if (r.only > 0) parts.push(fmt(r.onlyIn === 'here' ? t.import.onlyHere : r.onlyIn === 'eBird' ? t.import.onlyEbird : t.import.onlyObsorg, { n: n(r.only) }))
  return parts
}
