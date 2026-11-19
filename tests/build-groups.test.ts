import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { buildGroups, fetchGroups, type ApiGroup } from '../scripts/build-data/build-groups'
import { inGroup, type GroupsFile } from '@/lib/search/groups'
import type { SpeciesFile } from '@/lib/species/types'
import synonyms from '../data/i18n/group-synonyms.json'

const published: GroupsFile = JSON.parse(readFileSync('public/data/groups.v1.json', 'utf8'))
const species: SpeciesFile = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8'))
const row = (name = 'Test birds'): ApiGroup => ({ groupName: name, groupOrder: 1, taxonOrderBounds: [[1, 3]] })
const sources = () => ({ en: [row()], es: [row('Aves')], pt: [row('Aves')], nl: [row('Vogels')], pl: [row('Ptaki')] })
const synthetic = { ebirdTaxonomy: '2026', species: [{ code: 'test', to: 2 }] } as SpeciesFile

describe('species groups', () => {
  it('covers every published species exactly once with all five names', () => {
    expect(published.taxonomy).toBe(species.ebirdTaxonomy)
    expect(new Set(published.groups.map((g) => g.id)).size).toBe(published.groups.length)
    for (const g of published.groups) for (const lang of ['en', 'es', 'pt', 'nl', 'pl'] as const) expect(g.name[lang].trim().length).toBeGreaterThan(0)
    for (const sp of species.species) expect(published.groups.filter((g) => inGroup(sp.to, g)), sp.code).toHaveLength(1)
    for (const id of Object.keys(synonyms)) expect(published.groups.some((g) => g.id === id), id).toBe(true)
  })
  it('builds from localized eBird bounds, refusing gaps, overlap, missing names and disjoint intervals', () => {
    expect(buildGroups(sources(), synthetic).groups[0]).toMatchObject({ id: 'test-birds', lo: 1, hi: 3 })
    const missing = sources(); missing.es = []
    expect(() => buildGroups(missing, synthetic)).toThrow(/es/)
    const disjoint = sources(); disjoint.en[0].taxonOrderBounds.push([7, 9])
    expect(() => buildGroups(disjoint, synthetic)).toThrow(/contiguous/)
    expect(() => buildGroups(sources(), { ...synthetic, species: [{ code: 'gap', to: 8 }] } as SpeciesFile)).toThrow(/exactly one/)
    const overlap = sources()
    for (const rows of Object.values(overlap)) rows.push({ ...row('Other'), groupOrder: 2 })
    expect(() => buildGroups(overlap, synthetic)).toThrow(/exactly one/)
  })
  it('uses only eBird GETs, puts the key in the header, maps Portuguese to pt_BR', async () => {
    const get = vi.fn<typeof fetch>(async () => new Response(JSON.stringify([row()])))
    const out = await fetchGroups(get, 'synthetic-test-key')
    expect(Object.keys(out)).toEqual(['en', 'es', 'pt', 'nl', 'pl'])
    expect(get).toHaveBeenCalledTimes(5)
    for (const args of get.mock.calls as unknown as [string, RequestInit][]) {
      expect(new URL(args[0]).host).toBe('api.ebird.org')
      expect(args[0]).not.toContain('synthetic-test-key')
      expect(args[1]).toMatchObject({ method: 'GET', headers: { 'X-eBirdApiToken': 'synthetic-test-key' } })
    }
    expect(get.mock.calls[2][0]).toContain('groupNameLocale=pt_BR')
  })
})
