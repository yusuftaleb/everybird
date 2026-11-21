// BIRDBASE body masses (Şekercioğlu et al. 2025, Scientific Data, doi 10.1038/s41597-025-05615-3; CC BY 4.0): the
// compact extract data/raw/birdbase/birdbase-mass.csv (written by scripts/build-data/birdbase-extract.py from the
// workbook), read by build-species for the species that AVONET gives no mass. Only rows with a mass are in it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Papa from 'papaparse'

export const BIRDBASE_CSV = 'data/raw/birdbase/birdbase-mass.csv'
export const BIRDBASE_DOI = '10.1038/s41597-025-05615-3'

/** The name columns, in the order the matcher tries them. */
const BIRDBASE_SCI_COLUMNS = ['birdlife', 'hbw', 'ioc', 'ebird', 'avilist'] as const
export type BirdbaseColumn = (typeof BIRDBASE_SCI_COLUMNS)[number]
export type BirdbaseRow = {
  id: string; english: string
  sci: Record<BirdbaseColumn, string>
  massG: number
}

/** A row for a species, and how it was found: by one of its scientific-name columns, or by its English name. */
export type BirdbaseMatch = { row: BirdbaseRow; by: 'scientific'; column: BirdbaseColumn } | { row: BirdbaseRow; by: 'english' }

export type BirdbaseIndex = { sci: Record<BirdbaseColumn, Map<string, BirdbaseRow>>; english: Map<string, BirdbaseRow> }

const key = (s: string) => s.trim().toLowerCase()

/** Parses the extract. Throws on a row without a positive mass. */
export function parseBirdbase(csv: string): BirdbaseRow[] {
  const { data, errors } = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true })
  if (errors.length) throw new Error(`BIRDBASE extract: ${errors[0].message} (row ${errors[0].row})`)
  return data.map((r, i) => {
    const massG = Number(r.average_mass_g)
    if (!Number.isFinite(massG) || massG <= 0) throw new Error(`BIRDBASE extract row ${i + 2}: mass ${JSON.stringify(r.average_mass_g)}`)
    return {
      id: r.species_id,
      english: r.english_name,
      sci: { birdlife: r.latin_birdlife_first, hbw: r.hbw_birdlife, ioc: r.ioc_15_1, ebird: r.ebird_clements_2024b, avilist: r.avilist_v1_2025 },
      massG,
    }
  })
}

export function loadBirdbase(root = process.cwd()): BirdbaseRow[] {
  return parseBirdbase(readFileSync(resolve(root, BIRDBASE_CSV), 'utf8'))
}

/** Lookup tables; a name on several rows keeps the first (sheet order), so the match is deterministic. */
export function indexBirdbase(rows: readonly BirdbaseRow[]): BirdbaseIndex {
  const sci = Object.fromEntries(BIRDBASE_SCI_COLUMNS.map((c) => [c, new Map<string, BirdbaseRow>()])) as BirdbaseIndex['sci']
  const english = new Map<string, BirdbaseRow>()
  for (const r of rows) {
    for (const c of BIRDBASE_SCI_COLUMNS) {
      const k = key(r.sci[c])
      if (k && !sci[c].has(k)) sci[c].set(k, r)
    }
    const e = key(r.english)
    if (e && !english.has(e)) english.set(e, r)
  }
  return { sci, english }
}

/**
 * The BIRDBASE row for an eBird species: its scientific name against each name column in turn (BirdLife first, then
 * HBW, IOC, eBird/Clements, AviList), then its English name. Case-insensitive, exact otherwise. The first column with
 * a row decides. Every row in the extract has a mass, so a hit always carries one.
 */
export function matchBirdbase(index: BirdbaseIndex, sci: string, english: string): BirdbaseMatch | undefined {
  const s = key(sci)
  for (const column of BIRDBASE_SCI_COLUMNS) {
    const row = index.sci[column].get(s)
    if (row) return { row, by: 'scientific', column }
  }
  const row = index.english.get(key(english))
  return row ? { row, by: 'english' } : undefined
}
