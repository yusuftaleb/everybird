import type { SpeciesIndex } from '@/lib/species/load'
import { applyFilter, type Filter } from './filters'
import type { ListEntry } from './model'
import { hasSeenMonths, type SeenIndex } from './seen'

/** A species goal: `year` set, that year's birds against `target` (the Big Year); left out, the shown list's (All time). */
export type BigYear = { year?: number; target: number }

export const TARGET_MAX = 99_999
export const isTarget = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= TARGET_MAX
export const isGoalYear = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 1000 && n <= 9999

export function validBigYear(x: unknown): x is BigYear {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const o = x as Record<string, unknown>
  const keys = Object.keys(o).length
  return isTarget(o.target) && (keys === 1 || (keys === 2 && isGoalYear(o.year)))
}

export const goalBasis = (seen: SeenIndex | undefined): 'seen' | 'lifer' => (hasSeenMonths(seen) ? 'seen' : 'lifer')

export function yearFilter(year: number, seen: SeenIndex | undefined): Filter {
  const f: Filter = { from: `${year}-01`, to: `${year}-12` }
  if (goalBasis(seen) === 'seen') f.basis = 'seen'
  return f
}

export function yearList(list: ListEntry[], year: number, species: SpeciesIndex, seen: SeenIndex | undefined): ListEntry[] {
  return applyFilter(list, yearFilter(year, seen), species, seen)
}

const yearOf = (date: string | undefined): number | undefined => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : undefined)

export function hasDates(list: readonly ListEntry[], seen: SeenIndex | undefined): boolean {
  return list.some((e) => yearOf(e.date) !== undefined) || hasSeenMonths(seen)
}

/** The goal's years, newest first: this year (a goal is often set before its first bird), then each year with a bird
 *  on the list (the year's own filter: lifers, or sightings when the list has months). */
export function listYears(list: ListEntry[], species: SpeciesIndex, seen: SeenIndex | undefined, now = new Date()): number[] {
  const current = now.getFullYear()
  return goalYears(list, now).filter((y) => y === current || yearList(list, y, species, seen).length > 0)
}

export function goalYears(list: readonly ListEntry[], now = new Date()): number[] {
  const current = now.getFullYear()
  let first = current
  for (const e of list) {
    const y = yearOf(e.date)
    if (y !== undefined && y < first) first = y
  }
  return Array.from({ length: current - first + 1 }, (_, i) => current - i)
}
