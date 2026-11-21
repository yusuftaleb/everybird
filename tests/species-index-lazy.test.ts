// buildSpeciesIndex no longer normalises every name up front (rankByName prepares each row on first use): on the shipped
// species file, search and lookups give exactly what the index with the eager loop gave, in English and with local names.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildSpeciesIndex } from '@/lib/species/load'
import { prepared } from '@/lib/species/name-search'
import { setNames, type NameSet } from '@/lib/species/names'
import type { SpeciesFile, SpeciesRow } from '@/lib/species/types'

const read = <T,>(f: string): T => JSON.parse(readFileSync(join(__dirname, '../public/data', f), 'utf8')) as T
const shipped = read<SpeciesFile>('species.v1.json').species

/** The index as it was: every row prepared while the index is built. */
function eagerIndex(rows: SpeciesRow[]) {
  for (const r of rows) prepared(r)
  return buildSpeciesIndex(rows)
}

/** Queries from the data itself (whole names, first words, prefixes, genera) plus a few odd ones. */
function queries(rows: SpeciesRow[], local?: Record<string, string>): string[] {
  const out = new Set(['', '  ', 'a', 'the', 'gull', 'Grey', 'GREY HER', 'garza', 'é', "o'", 'zz', 'black-', 'Haliaeetus'])
  rows.forEach((r, i) => {
    if (i % 401) return
    const words = r.com.split(' ')
    out.add(r.com).add(words[0]).add(words[0].slice(0, 3)).add(r.sci.split(' ')[0]).add(`${words.at(-1)} ${words[0].slice(0, 2)}`)
    const l = local?.[r.code]
    if (l) out.add(l).add(l.split(' ')[0].slice(0, 4))
  })
  return [...out]
}

function same(names?: NameSet) {
  const a = eagerIndex(structuredClone(shipped)), b = buildSpeciesIndex(structuredClone(shipped))
  setNames(names ?? null)
  for (const q of queries(shipped, names?.names)) {
    // 200 hits: the first 20 (the default limit) and their order are in them.
    expect(b.search(q, 200).map((r) => r.code), q).toEqual(a.search(q, 200).map((r) => r.code))
  }
  expect(b.rows.map((r) => r.code)).toEqual(a.rows.map((r) => r.code))
  for (const r of shipped) expect(b.byCode.get(r.code)?.sci).toBe(a.byCode.get(r.code)?.sci)
  expect(b.byCode.get('nope')).toBeUndefined()
}

describe('buildSpeciesIndex without the eager name preparation', () => {
  afterEach(() => setNames(null))
  it('searches and looks up exactly as before, in English', () => same(), 60_000)
  it('searches and looks up exactly as before, with local names (es)', () => same(read<NameSet>('names.es.v1.json')), 60_000)
})
