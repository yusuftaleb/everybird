import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { detectFile, slotOfKind } from '@/lib/import/detect'
import { DamagedCsvError, OBSORG_SYNONYMS, parseObsOrgSpecies, resolveObsOrgName, rowKind } from '@/lib/import/obsorg'
import { resolveName } from '@/lib/species/resolve'
import { buildTaxonomyIndex } from '@/lib/species/load'
import { REGION_RULES } from '@/lib/import/inat-rules'
import { fixture, taxonomy as t } from './obsorg-helpers'
const publicT = buildTaxonomyIndex(JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')).taxa)
const parse = (csv = fixture('species-observed-nl')) => {
  const result = parseObsOrgSpecies(csv, t, {})
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('observation.org species export', () => {
  it('detects file kinds, delimiters, BOM, quoted headers and Excel', () => {
    for (const delimiter of [',', ';', '\t']) {
      expect(detectFile('\uFEFF' + fixture('species-observed-nl').split('\n')[0].split(',').map(x => `"${x}"`).join(delimiter))).toBe('obsorg-species')
    }
    expect(detectFile(fixture('observations-nl').split('\n')[0])).toBe('obsorg-observations')
    expect(detectFile('PK\u0003\u0004…')).toBe('xlsx')
    expect(detectFile('a,b', 'x.XLSX')).toBe('xlsx')
    expect(slotOfKind('obsorg-species')).toBe('obsorg-list')
    expect(slotOfKind('obsorg-observations')).toBe('obsorg')
    expect(slotOfKind('xlsx')).toBe('sheet')
    expect(slotOfKind('unsupported-sheet')).toBeNull()
    expect(slotOfKind('unknown')).toBeNull()
    expect(slotOfKind('ebird-lifelist')).toBe('ebird-list')
  })
  it('counts species, reduces subspecies, deduplicates, and keeps the earliest date', () => {
    const r = parse()
    expect(Object.fromEntries(r.records.map(x => [x.code, x.date]))).toEqual({ norfli: '2020-04-11', yerwar: '2019-08-20', rupgri: '2018-01-15', mallar3b: '2017-03-02', blakit1: '2022-07-09', hoocro1: '2016-10-10' })
    expect(r.rows).toBe(15)
    expect(r.records.every(x => x.source === 'obsorg' && !x.place && !x.seen && !x.assigned)).toBe(true)
  })
  it('skips and names aggregates, hybrids, forms and varieties before resolution', () => {
    const r = parse()
    expect(r.skipped).toBe(0)
    expect(r.unmatched.filter(x => x.reason === 'not-species').map(x => x.row)).toEqual([8,9,10,11,12])
    expect(r.unmatched.filter(x => x.reason === 'not-species').every(x => x.sci && x.com)).toBe(true)
  })
  it('only subspecies reduce to their binomial, including synonyms', () => {
    expect(resolveObsOrgName(t, 'Colaptes auratus x Colaptes chrysoides', 'species', {}).code).toBeNull()
    expect(resolveObsOrgName(t, 'Colaptes auratus luteus', 'subspecies', {})).toMatchObject({ code: 'norfli' })
    expect(resolveObsOrgName(t, 'Milvus aegyptius parasitus', 'subspecies', {})).toMatchObject({ code: 'blakit1' })
    expect(resolveObsOrgName(t, 'Avis antiqua', 'synonym', { 'Avis antiqua': 'gilfli' })).toMatchObject({ code: 'gilfli' })
  })
  it('matches only scientific names and keeps unmatched dates and suggestions', () => {
    const r = parse()
    expect(r.unmatched.find(x => x.row === 13)).toMatchObject({ source: 'obsorg', sci: 'Avis inventa', date: '2023-02-02', reason: 'no-match' })
    expect(r.unmatched.find(x => x.row === 14)?.suggestion).toBe('rupbus')
    expect(parse('name,scientific name,species type\nNorthern Flicker,Nomen nescio,species\nDemo,Columba livia,species').unmatched[0].reason).toBe('no-match')
  })
  it('drops groups without any matching bird and returns no-birds for an empty or wholly nonbird file', () => {
    expect(parse().unmatched.some(x => x.sci === 'Bufo bufo')).toBe(false)
    expect(parseObsOrgSpecies('scientific name,group,species type\nBufo bufo,Amphibians,species', t, {})).toEqual({ error: 'no-birds' })
    expect(parseObsOrgSpecies('', t, {})).toEqual({ error: 'no-birds' })
  })
  it('classifies unknown translated types by name shape', () => {
    expect(rowKind('espèce', 'Columba livia')).toBe('species')
    for (const sci of ['Anas a x Anas b', 'Larus spec.', 'A b × C d', 'A b (c)', 'A b / C d']) expect(rowKind('xyz', sci)).toBe('skip')
    expect(rowKind('xyz', 'A b c')).toBe('subspecies')
    const r = parse(fixture('species-observed-en'))
    expect(r.records.map(x => x.code).sort()).toEqual(['gilfli','norfli','rocpig','yerwar'])
    expect(r.unmatched.map(x => x.reason)).toEqual(['not-species','no-match'])
  })
  it('handles BOM, CRLF, semicolons, trimmed headers and invalid dates', () => {
    expect(parse('\uFEFF' + fixture('species-observed-nl').replaceAll('\n','\r\n')).records).toEqual(parse().records)
    expect(parse(fixture('species-observed-en').replaceAll(',', ';')).records).toHaveLength(4)
    expect(parse(' Scientific Name , Species Type , Date First Observed \nColumba livia,species,not-a-date').records[0].date).toBeUndefined()
  })
  it('does not resolve prototype property names as row types or synonym codes', () => {
    expect(rowKind('constructor', 'A b c')).toBe('subspecies')
    expect(resolveObsOrgName(t, 'constructor', 'species', {}).code).toBeNull()
    expect(resolveObsOrgName(t, 'toString', 'species', {}).code).toBeNull()
  })
  it('region-rule names already resolve exactly; synonym keys miss and targets are real species', () => {
    const publicT = buildTaxonomyIndex(JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')).taxa)
    for (const name of Object.keys(REGION_RULES)) expect(resolveName(publicT, { sci: name })).toMatchObject({ via: 'sci' })
    const species = new Set(JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')).species.map((x: {code:string}) => x.code))
    for (const [sci, code] of Object.entries(OBSORG_SYNONYMS)) {
      expect(resolveName(publicT, { sci }).code).toBeNull()
      expect(species.has(code)).toBe(true)
    }
  })
  it('NFC-normalises the type, rejects a damaged CSV, reads a short or long row, and counts undated species', () => {
    expect(rowKind('variëteit'.normalize('NFD'), 'Anas platyrhynchos domesticus')).toBe('skip')
    expect(() => parseObsOrgSpecies('scientific name,species type\nColumba livia,"species', t, {})).toThrow(DamagedCsvError)
    expect(() => parseObsOrgSpecies('naam,soort\nColumba livia,soort', t, {})).toThrow('Malformed observation.org CSV.')
    // One row with an extra field, one cut short (a trailing partial line): both read, the file kept.
    const ragged = parse('scientific name,species type,date first observed\nColumba livia,species,2020-01-01,SENTINEL\nGyps rueppelli,species,2021-01-01\nColaptes auratus')
    expect(ragged.records.map(x => [x.code, x.date])).toEqual([['rocpig','2020-01-01'],['rupgri','2021-01-01'],['norfli',undefined]])
    expect(JSON.stringify(ragged)).not.toContain('SENTINEL')
    // Dates are ISO only: a day-month-year date is not guessed at; the bird counts, undated.
    const r = parseObsOrgSpecies('scientific name,species type,date first observed\nColumba livia,species,03-04-2020\nColaptes auratus,species,\nGyps rueppelli,species,2020-01-01', t, {})
    if ('error' in r) throw new Error(r.error)
    expect(r.records).toHaveLength(3)
    expect(r.undated).toBe(2)
    expect(parse().undated).toBe(0)
    // Species, not rows: two undated rows of one bird are one; a dated row of it anywhere dates it.
    expect(parse('scientific name,species type,date first observed\nColumba livia,species,\nColumba livia,species,\nGyps rueppelli,species,\nGyps rueppelli,species,2020-01-01').undated).toBe(1)
  })
  it('a subspecies of a regional split takes its epithet’s eBird species; the species name its exact match', () => {
    const r = parseObsOrgSpecies(['scientific name,species type,date first observed', 'Muscicapa striata tyrrhenica,ondersoort,2020-06-01', 'Tringa semipalmata inornata,ondersoort,2020-06-01', 'Myophonus caeruleus flavirostris,ondersoort,2020-06-01', 'Muscicapa striata,soort,2020-06-01'].join('\n'), publicT, {})
    if ('error' in r) throw new Error(r.error)
    expect(r.records.map(x => x.code)).toEqual(['spofly3','willet3','bluwht2','spofly2'])
    expect(resolveObsOrgName(publicT, 'Muscicapa striata', 'species', {})).toEqual({ code: 'spofly2', via: 'sci' })
    // An epithet the rule doesn't list reduces as any subspecies does; a species row never reads the rule.
    expect(resolveObsOrgName(publicT, 'Muscicapa striata constructor', 'subspecies', {}).code).toBe('spofly2')
    expect(resolveObsOrgName(publicT, 'Tringa semipalmata', 'species', {}).code).toBe('willet2')
  })
  it('forms and varieties are skipped as not species although their names alone would resolve', () => {
    const r = parse()
    for (const row of [11, 12]) {
      const u = r.unmatched.find(x => x.row === row)!
      expect(u.reason).toBe('not-species')
      expect(resolveName(t, { sci: u.sci! }).code, u.sci).not.toBeNull()
    }
    expect(r.unmatched.filter(x => x.row >= 11 && x.row <= 12).map(x => x.sci)).toEqual(['Columba livia (domestica)', 'Anas platyrhynchos (domesticus)'])
  })
})
