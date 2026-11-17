// Run fetch-sources.ts [--names-only] first. No sticker changes or uploads.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { familyLang, NAME_BASE, NAME_LOCALES } from '../../src/lib/species/name-locales'
import type { NameLocale } from '../../src/lib/species/name-locales'
import type { SpeciesFile, SpeciesRow } from '../../src/lib/species/types'
import { assertSameSpeciesCodes } from './fetch-sources'

export type NameGroup = { englishName: string; groupName: string }
type RawGroup = { groupOrder: number; groupName: string }
type RawTaxon = { speciesCode: string; comName: string; category: string }

function sorted(entries: Iterable<[string, string]>): Record<string, string> {
  return Object.fromEntries([...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
}

/** NFC, every whitespace run (NBSP included) to one space, trimmed. */
export function normalizeName(name: string): string {
  return name.normalize('NFC').replace(/[\s\u00a0\u202f]+/g, ' ').trim()
}

/** eBird fills a missing translation with the English name, in pt_BR/pt_PT in lower case: not a translation. */
export function isTranslation(name: string, en: string): boolean {
  return name !== '' && name.toLowerCase() !== normalizeName(en).toLowerCase()
}

/** First translated name wins; an English fallback in a regional set (any case) never hides the base. */
export function mergeChain(english: Map<string, string>, chain: Map<string, string>[]): Record<string, string> {
  const names = new Map<string, string>()
  for (const [code, en] of english) {
    for (const set of chain) {
      const raw = set.get(code)
      const name = raw === undefined ? '' : normalizeName(raw)
      if (isTranslation(name, en)) {
        names.set(code, name)
        break
      }
    }
  }
  return sorted(names)
}

/**
 * Capitalise only the first code point (every locale: eBird has a few lower-case starts, "pardela de Hawaii"),
 * preserving all remaining spelling and punctuation, inner Title Case included (that is eBird's data).
 */
export function capFirst(name: string): string {
  const first = [...name][0]
  return first ? first.toUpperCase() + name.slice(first.length) : name
}

/**
 * An eBird group name usable as one family's label: not the family's scientific name (or any …idae name), and no
 * bracketed aside ("Anambés (Cotinga)"). Anything else is left to the hand file.
 */
export function usableGroupName(name: string, fam: string): boolean {
  return name !== fam && !name.includes('(') && !/\p{L}+idae\b/u.test(name)
}

/** Hand labels first, then exact English group matches (a group containing several families is not one's name). */
export function familyNames(groups: NameGroup[], species: Pick<SpeciesRow, 'fam' | 'famCom'>[], hand: Record<string, string>): Record<string, string> {
  const byEnglish = new Map(groups.map((g) => [g.englishName, g.groupName]))
  const names = new Map<string, string>()
  for (const s of species) {
    if (Object.hasOwn(hand, s.fam)) {
      const name = normalizeName(hand[s.fam])
      if (name) names.set(s.fam, name)
      continue
    }
    const raw = byEnglish.get(s.famCom)
    const name = raw === undefined ? '' : normalizeName(raw)
    if (name && usableGroupName(name, s.fam) && isTranslation(name, s.famCom)) names.set(s.fam, name)
  }
  return sorted(names)
}

const FETCH_NAMES = 'npx tsx scripts/build-data/fetch-sources.ts --names-only'

/** Rebuild every locale from the same pinned taxonomy; output contains only published species codes. */
export function writeNames(): void {
  const root = process.cwd()
  const raw = resolve(root, 'data/raw')
  const read = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
  const readRaw = <T>(file: string): T => {
    const path = resolve(raw, file)
    if (!existsSync(path)) throw new Error(`data/raw/${file} is missing: run ${FETCH_NAMES}`)
    return read<T>(path)
  }
  const species = read<SpeciesFile>(resolve(root, 'public/data/species.v1.json'))
  const manifest = readRaw<{ ebirdTaxonomy: string }>('manifest.json')
  if (manifest.ebirdTaxonomy !== species.ebirdTaxonomy) throw new Error(`names taxonomy ${manifest.ebirdTaxonomy} does not match species.v1.json's ${species.ebirdTaxonomy}: run fetch-sources.ts --names-only (it pins species.v1.json's year), or for the yearly upgrade fetch-sources.ts --taxonomy <YYYY|latest> then npm run data`)
  const englishRows = readRaw<RawTaxon[]>('ebird-taxonomy.json')
  // English reference names come from the same raw taxonomy as the translations, limited to published codes.
  const published = new Set(species.species.map((s) => s.code))
  const english = new Map(englishRows.filter((r) => r.category === 'species' && published.has(r.speciesCode)).map((r) => [r.speciesCode, r.comName]))
  const missing = [...published].filter((code) => !english.has(code))
  if (missing.length) throw new Error(`data/raw/ebird-taxonomy.json lacks ${missing.length} published species (${missing.slice(0, 5).join(', ')}): run ${FETCH_NAMES}`)
  const sets = new Map<NameLocale, Map<string, string>>()
  for (const locale of NAME_LOCALES) {
    const rows = readRaw<RawTaxon[]>(`ebird-taxonomy.${locale}.json`)
    assertSameSpeciesCodes(englishRows, rows, locale)
    sets.set(locale, new Map(rows.map((r) => [r.speciesCode, capFirst(normalizeName(r.comName))])))
  }
  const englishGroups = new Map(readRaw<RawGroup[]>('ebird-groups.en.json').map((g) => [g.groupOrder, g.groupName]))
  const families = new Map<string, Record<string, string>>()
  for (const lang of ['es', 'pt', 'nl', 'pl'] as const) {
    const groups = readRaw<RawGroup[]>(`ebird-groups.${lang}.json`).map((g): NameGroup => {
      const englishName = englishGroups.get(g.groupOrder)
      if (!englishName) throw new Error(`No English group for ${lang} group ${g.groupOrder}`)
      return { englishName, groupName: g.groupName }
    })
    const hand = read<Record<string, string>>(resolve(root, `data/i18n/families.${lang}.json`))
    const fam = familyNames(groups, species.species, hand)
    const unlabelled = [...new Set(species.species.map((s) => s.fam))].filter((f) => !Object.hasOwn(fam, f)).sort()
    if (unlabelled.length) console.warn(`${lang}: ${unlabelled.length} families have no label (English shows): ${unlabelled.join(', ')}; add them to data/i18n/families.${lang}.json`)
    families.set(lang, fam)
  }
  mkdirSync(resolve(root, 'public/data'), { recursive: true })
  for (const locale of NAME_LOCALES) {
    const base = NAME_BASE[locale]
    const chain = locale === base ? [sets.get(locale)!] : [sets.get(locale)!, sets.get(base)!]
    const names = mergeChain(english, chain)
    const file = { v: 1, locale, taxonomy: species.ebirdTaxonomy, names, fam: families.get(familyLang(locale))! }
    writeFileSync(resolve(root, `public/data/names.${locale}.v1.json`), JSON.stringify(file))
    console.log(`${locale}: ${Object.keys(names).length} species names, ${Object.keys(file.fam).length} families`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) writeNames()
