import type { TaxonRow } from './types'
import type { TaxonomyIndex } from './load'

export type { SpeciesIndex, TaxonomyIndex } from './load'
export type Resolution =
  | { code: string; via: 'sci' | 'com' | 'taxonOrder' }
  | { code: null; reason: 'not-species' | 'no-match'; suggestion?: string }

/** Lower-case, collapse spaces, drop parenthetical and [group] text. */
export function normalizeSci(s: string): string {
  return s
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Lower-case, accents stripped, spaces collapsed (common names). */
export function foldName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** A species resolves to itself; anything with reportAs resolves to that; the rest is not a species. */
function fromRow(row: TaxonRow, via: 'sci' | 'com' | 'taxonOrder'): Resolution {
  if (row.cat === 'species') return { code: row.code, via }
  if (row.reportAs) return { code: row.reportAs, via }
  return { code: null, reason: 'not-species' }
}

export function resolveName(t: TaxonomyIndex, q: { sci?: string; com?: string; taxonOrder?: number }): Resolution {
  if (q.sci) {
    const row = t.bySci.get(normalizeSci(q.sci))
    if (row) return fromRow(row, 'sci')
  }
  if (q.com) {
    const row = t.byCom.get(foldName(q.com))
    if (row) return fromRow(row, 'com')
  }
  if (q.taxonOrder !== undefined) {
    const row = t.byOrder.get(q.taxonOrder)
    if (row) return fromRow(row, 'taxonOrder')
  }
  const suggestion = suggest(t, q)
  return suggestion ? { code: null, reason: 'no-match', suggestion } : { code: null, reason: 'no-match' }
}

const MAX_DIST = 3
type Candidates = { code: string; sci: string; com: string }
const candCache = new WeakMap<TaxonomyIndex, Candidates[]>()

/** Nearest species code by Levenshtein on sci name (<=3), else on common name. Computed only on no-match. */
function suggest(t: TaxonomyIndex, q: { sci?: string; com?: string }): string | undefined {
  let cands = candCache.get(t)
  if (!cands) {
    cands = t.rows
      .filter((r) => r.cat === 'species')
      .map((r) => ({ code: r.code, sci: normalizeSci(r.sci), com: foldName(r.com) }))
    candCache.set(t, cands)
  }
  const nearest = (needle: string, key: 'sci' | 'com') => {
    let best: string | undefined
    let bestD = MAX_DIST + 1
    for (const c of cands) {
      const d = boundedLevenshtein(needle, c[key], bestD - 1)
      if (d < bestD) {
        bestD = d
        best = c.code
        if (d === 0) break
      }
    }
    return best
  }
  if (q.sci) {
    const hit = nearest(normalizeSci(q.sci), 'sci')
    if (hit) return hit
  }
  if (q.com) return nearest(foldName(q.com), 'com')
  return undefined
}

/** Levenshtein distance, or max+1 if it exceeds max. Length-bound and row-min early exit. */
function boundedLevenshtein(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let min = i
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1))
      cur[j] = v
      if (v < min) min = v
    }
    if (min > max) return max + 1
    prev = cur
  }
  return prev[b.length] > max ? max + 1 : prev[b.length]
}
