import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { SpeciesFile, TaxonomyFile } from '@/lib/species/types'

const root = process.cwd()
const read = <T>(p: string) => JSON.parse(readFileSync(resolve(root, p), 'utf8')) as T
const synonyms = () => read<Record<string, string>>('data/inat-synonyms.json')
const taxonomy = () => read<TaxonomyFile>('public/data/taxonomy.v1.json').taxa
const species = () => read<SpeciesFile>('public/data/species.v1.json').species

describe('inat-synonyms', () => {
  it('every synonym points to a code that exists in species.v1.json', () => {
    const codes = new Set(species().map((s) => s.code))
    const entries = Object.entries(synonyms())
    expect(entries.length).toBeGreaterThan(0)
    for (const [name, code] of entries) expect(codes.has(code), `${name} -> ${code}`).toBe(true)
  })

  it('maps the iNaturalist-lumped marsh wren to Western Marsh Wren', () => {
    const wmw = taxonomy().find((t) => t.sci === 'Cistothorus paludicola' && t.cat === 'species')
    expect(synonyms()['Cistothorus palustris']).toBe(wmw?.code)
  })

  it('keys are binomial-looking names', () => {
    for (const k of Object.keys(synonyms())) expect(k, k).toMatch(/^[A-Z][a-z]+ [a-z]+$/)
  })

  it('no key is already an exact species scientific name in the taxonomy, unless the synonym deliberately overrides it', () => {
    const bySpeciesSci = new Map(taxonomy().filter((t) => t.cat === 'species').map((t) => [t.sci, t.code]))
    for (const [k, code] of Object.entries(synonyms())) {
      const own = bySpeciesSci.get(k)
      // An exact match that points at the same code is dead weight.
      expect(own === code, `${k} already resolves to ${code}`).toBe(false)
    }
  })

  it('the published copy matches the source', () => {
    expect(read('public/data/inat-synonyms.v1.json')).toEqual(synonyms())
  })
})
