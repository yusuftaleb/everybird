// GET-only eBird species groups. The public endpoint needs no key; EBIRD_API_KEY, when set by the existing
// environment, is sent in the header only. All four responses are validated before the output is replaced.
import { readFileSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { fetchBytes } from './fetch-sources'
import type { BirdGroup, GroupLang as SearchLang, GroupsFile } from '../../src/lib/search/groups'
import { inGroup } from '../../src/lib/search/groups'
import type { SpeciesFile } from '../../src/lib/species/types'

export type ApiGroup = { groupName: string; groupOrder: number; taxonOrderBounds: [number, number][] }
export const GROUP_LOCALES = { en: 'en', es: 'es', pt: 'pt_BR', nl: 'nl', pl: 'pl' } as const
const idOf = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function buildGroups(sources: Record<SearchLang, ApiGroup[]>, species: SpeciesFile): GroupsFile {
  const ids = new Set<string>()
  const groups: BirdGroup[] = sources.en.map((en) => {
    const id = idOf(en.groupName)
    if (!id || ids.has(id)) throw new Error('Duplicate or empty group id')
    ids.add(id)
    // Never silently turn disjoint intervals into one broad interval.
    if (en.taxonOrderBounds.length !== 1) throw new Error(`${id}: expected one contiguous taxon-order interval`)
    const [lo, hi] = en.taxonOrderBounds[0]
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new Error(`${id}: invalid bounds`)
    const name = {} as BirdGroup['name']
    for (const lang of Object.keys(GROUP_LOCALES) as SearchLang[]) {
      const rows = sources[lang]
      const matches = rows.filter((r) => r.groupOrder === en.groupOrder)
      const row = matches[0]
      if (rows.length !== sources.en.length || matches.length !== 1 || !row.groupName?.trim() ||
          JSON.stringify(row.taxonOrderBounds) !== JSON.stringify(en.taxonOrderBounds)) {
        throw new Error(`${id}: missing or mismatched ${lang} group`)
      }
      name[lang] = row.groupName.normalize('NFC').replace(/\s+/g, ' ').trim()
    }
    return { id, name, lo, hi }
  })
  for (const sp of species.species) {
    if (groups.filter((g) => inGroup(sp.to, g)).length !== 1) throw new Error(`${sp.code}: must belong to exactly one group`)
  }
  return { v: 1, taxonomy: species.ebirdTaxonomy, groups }
}

export async function fetchGroups(get: typeof fetch = fetch, key = process.env.EBIRD_API_KEY): Promise<Record<SearchLang, ApiGroup[]>> {
  const out = {} as Record<SearchLang, ApiGroup[]>
  for (const lang of Object.keys(GROUP_LOCALES) as SearchLang[]) {
    const url = `https://api.ebird.org/v2/ref/sppgroup/ebird?groupNameLocale=${GROUP_LOCALES[lang]}`
    const body = await fetchBytes(url, { fetch: (url, init) => get(url, { ...init, method: 'GET', ...(key ? { headers: { 'X-eBirdApiToken': key } } : {}) }) })
    out[lang] = JSON.parse(body.toString('utf8'))
  }
  return out
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  fetchGroups().then((sources) => {
    const species: SpeciesFile = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8'))
    const out = buildGroups(sources, species)
    writeFileSync('public/data/groups.v1.json', JSON.stringify(out) + '\n')
    console.log(`${out.groups.length} groups; ${species.species.length} species covered`)
  }).catch(() => { console.error('Groups build failed; check eBird responses against the pinned taxonomy. No output written.'); process.exitCode = 1 })
}
