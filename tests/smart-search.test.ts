import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseSmart, withoutChip, type SearchContext } from '@/lib/search/smart'
import type { GroupsFile, SearchLang } from '@/lib/search/groups'
import { searchKey } from '@/lib/species/name-search'
const { groups }: GroupsFile = JSON.parse(readFileSync('public/data/groups.v1.json', 'utf8'))
const ctx: SearchContext = {
  today: new Date(2026, 10, 15, 12), lang: 'en', groups,
  regions: { v: 1, countries: { CA: 'Canada', MX: 'Mexico', NL: 'Netherlands', US: 'United States of America', GB: 'United Kingdom', AE: 'United Arab Emirates', GE: 'Georgia' },
    sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-BC': 'Baja County', 'US-GA': 'Georgia', 'US-CA': 'California', 'NL-NH': 'North Holland' } },
  listPlaces: ['k:CA-BC|Central Valley', 's:CA-ON', 's:US-GA', 's:US-CA', 's:NL-NH'],
  species: [{ ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows and jays' }],
}
const parse = (q: string, lang: SearchLang = 'en', extra: Partial<SearchContext> = {}) => parseSmart(q, { ...ctx, lang, ...extra })
const span = (q: string, lang: SearchLang = 'en') => { const { filter: f } = parse(q, lang); return [f.from, f.to] }

describe('approved smart-search verification cases', () => {
  it('waterfowl canada 2026 becomes group, c:CA and inclusive months with basis seen', () => {
    const r = parse('waterfowl canada 2026')
    expect(r.filter).toEqual({ group: 'waterfowl', countries: ['CA'], from: '2026-01', to: '2026-12', basis: 'seen' })
    expect(r.rest).toBe('')
    expect(r.chips.map((c) => c.kind)).toEqual(['group', 'place', 'date'])
  })
  it('handles spans, a bare latest month, last year, and hawks BC', () => {
    expect(span('oct 2025 - nov 2026')).toEqual(['2025-10', '2026-11'])
    expect(span('october')).toEqual(['2026-10', '2026-10'])
    expect(span('december')).toEqual(['2025-12', '2025-12'])
    expect(span('last year')).toEqual(['2025-01', '2025-12'])
    expect(parse('hawks BC').filter).toEqual({ group: 'vultures-hawks-and-allies', provinces: ['CA-BC'] })
  })
  it.each([
    ['es', 'patos méxico 2026', 'MX', '2026-01', '2026-12'],
    ['pt', 'patos méxico 2026', 'MX', '2026-01', '2026-12'],
    ['nl', 'eenden nederland 2025', 'NL', '2025-01', '2025-12'],
  ] as const)('%s groups, localized country names and years', (lang, q, country, from, to) => {
    expect(parse(q, lang).filter).toEqual({ group: 'waterfowl', countries: [country], from, to, basis: 'seen' })
    expect(parse(q, lang).rest).toBe('')
  })
  it.each(['en', 'es', 'pt', 'nl'] as const)('English works in %s, with lifers and unchanged leftovers', (lang) => {
    expect(parse('threatened', lang).filter.statuses).toEqual(['CR', 'EN', 'VU'])
    expect(parse('lifers 2024 Mystery Bird', lang)).toMatchObject({ filter: { basis: 'lifer', from: '2024-01', to: '2024-12' }, rest: 'Mystery Bird' })
    expect(parse('2024 new', lang).filter.basis).toBe('lifer')
    expect(parse('mysterious Zork!', lang).rest).toBe('mysterious Zork!')
  })
})

describe('every approved construction in every UI language', () => {
  it.each([
    ['en', 'waterfowl canada 2026', 'october', 'last year', 'hawks BC', 'threatened', 'lifers 2024'],
    ['es', 'patos canadá 2026', 'octubre', 'año pasado', 'águilas BC', 'amenazadas', 'nuevas 2024'],
    ['pt', 'patos canadá 2026', 'outubro', 'ano passado', 'gaviões BC', 'ameaçadas', 'novas 2024'],
    ['nl', 'eenden canada 2026', 'oktober', 'vorig jaar', 'haviken BC', 'bedreigd', 'nieuwe 2024'],
  ] as const)('%s recognizes groups, places, month names, spans, relative dates, status and lifers', (lang, q, month, last, hawk, status, lifer) => {
    expect(parse(q, lang).filter).toMatchObject({ group: 'waterfowl', countries: ['CA'], basis: 'seen', from: '2026-01', to: '2026-12' })
    expect(span(month, lang)).toEqual(['2026-10', '2026-10'])
    expect(span('oct 2025 - nov 2026', lang)).toEqual(['2025-10', '2026-11'])
    expect(span(last, lang)).toEqual(['2025-01', '2025-12'])
    expect(parse(hawk, lang).filter).toMatchObject({ group: 'vultures-hawks-and-allies', provinces: ['CA-BC'] })
    expect(parse(status, lang).filter.statuses).toEqual(['CR', 'EN', 'VU'])
    expect(parse(lifer, lang).filter).toMatchObject({ basis: 'lifer', from: '2024-01', to: '2024-12' })
    expect(parse('Unrecognized Thing!', lang).rest).toBe('Unrecognized Thing!')
  })
})

describe('ported date grammar at month precision', () => {
  it.each([
    ['july to oct', '2026-07', '2026-10'], ['from nov to feb', '2025-11', '2026-02'],
    ['between may and july 2025', '2025-05', '2025-07'], ['mar 2025 through jan', '2025-03', '2026-01'],
    ['oct / nov 2026', '2026-10', '2026-11'], ['2024-2025', '2024-01', '2025-12'],
    ['2026-07-04 to 2026-08-15', '2026-07', '2026-08'], ['2026-02', '2026-02', '2026-02'],
    ['q2 2025', '2025-04', '2025-06'], ['this quarter', '2026-10', '2026-12'], ['last quarter', '2026-07', '2026-09'],
    ['this year', '2026-01', '2026-12'], ['last month', '2026-10', '2026-10'], ['last 3 months', '2026-09', '2026-11'],
    ['since march', '2026-03', '2026-11'], ['after march', '2026-04', '2026-11'],
    ['until march', undefined, '2026-03'], ['before 2025', undefined, '2024-12'],
  ])('%s', (q, from, to) => expect(span(q)).toEqual([from, to]))
  it.each([
    ['es', 'entre octubre de 2025 y noviembre de 2026', '2025-10', '2026-11'],
    ['es', 'octubre 2025 hasta noviembre 2026', '2025-10', '2026-11'],
    ['pt', 'outubro de 2025 até novembro de 2026', '2025-10', '2026-11'],
    ['nl', 'oktober 2025 tot en met november 2026', '2025-10', '2026-11'],
    ['es', 'año pasado', '2025-01', '2025-12'], ['pt', 'ano passado', '2025-01', '2025-12'],
    ['es', 'último año', '2025-01', '2025-12'], ['pt', 'último ano', '2025-01', '2025-12'], ['nl', 'vorig jaar', '2025-01', '2025-12'],
    ['es', 'desde marzo', '2026-03', '2026-11'], ['pt', 'desde março', '2026-03', '2026-11'], ['nl', 'sinds maart', '2026-03', '2026-11'],
  ] as const)('%s: %s', (lang, q, from, to) => expect(span(q, lang)).toEqual([from, to]))
  it('refuses invalid dates, two-letter months and ambiguous prefixes', () => {
    for (const q of ['2026-02-30', '2026-13', '20260', '2026abc', 'ma', 'ju']) expect(parse(q).chips).toEqual([])
    expect(parse('2026-02-28').filter.from).toBe('2026-02')
    expect(parse('2026 - 2025')).toMatchObject({ filter: {}, rest: '2026 - 2025' })
  })
})

describe('"ago" phrases name one calendar year or month (today is 2026-11-15)', () => {
  it.each([
    ['en', '2 years ago', '2024-01', '2024-12'], ['en', 'a year ago', '2025-01', '2025-12'], ['en', 'twelve years ago', '2014-01', '2014-12'],
    ['en', '3 months ago', '2026-08', '2026-08'], ['en', 'a month ago', '2026-10', '2026-10'], ['en', '12 months ago', '2025-11', '2025-11'],
    ['es', 'hace 2 años', '2024-01', '2024-12'], ['es', 'hace un año', '2025-01', '2025-12'], ['es', 'hace dos años', '2024-01', '2024-12'],
    ['es', 'hace 3 meses', '2026-08', '2026-08'], ['es', 'hace un mes', '2026-10', '2026-10'],
    ['pt', 'há 2 anos', '2024-01', '2024-12'], ['pt', 'ha 2 anos', '2024-01', '2024-12'], ['pt', 'há um ano', '2025-01', '2025-12'],
    ['pt', 'há 3 meses', '2026-08', '2026-08'], ['pt', 'há um mês', '2026-10', '2026-10'], ['pt', 'há três meses', '2026-08', '2026-08'],
    ['nl', '2 jaar geleden', '2024-01', '2024-12'], ['nl', 'een jaar geleden', '2025-01', '2025-12'], ['nl', 'twee jaar geleden', '2024-01', '2024-12'],
    ['nl', '3 maanden geleden', '2026-08', '2026-08'], ['nl', 'een maand geleden', '2026-10', '2026-10'],
  ] as const)('%s: %s', (lang, q, from, to) => expect(span(q, lang)).toEqual([from, to]))
  it('sets the seen basis and consumes the whole phrase, so the rest is left alone', () => {
    expect(parse('2 years ago')).toMatchObject({ filter: { from: '2024-01', to: '2024-12', basis: 'seen' }, rest: '' })
    expect(parse('a month ago')).toMatchObject({ filter: { from: '2026-10', to: '2026-10', basis: 'seen' }, rest: '' })
    expect(parse('hace 2 años', 'es')).toMatchObject({ rest: '' })
    expect(parse('lifers 3 months ago').filter).toMatchObject({ basis: 'lifer', from: '2026-08', to: '2026-08' })
  })
  it('reads inside a longer query and leaves the other words to the parser', () => {
    const r = parse('herons 2 years ago in Canada')
    expect(r.filter).toMatchObject({ countries: ['CA'], from: '2024-01', to: '2024-12', basis: 'seen' })
    expect(r.rest).not.toMatch(/ago|years/)
  })
  it('leaves plain numbers and unfinished phrases untouched', () => {
    expect(parse('2 herons')).toMatchObject({ filter: {}, rest: '2' })
    expect(parse('2 herons').chips.some((c) => c.kind === 'date')).toBe(false)
    expect(parse('2 years in Canada').filter.from).toBeUndefined()
    expect(parse('ago 2 years').filter.from).toBeUndefined()
    expect(parse('13 years ago').filter.from).toBeUndefined()
    expect(parse('hace 2 herons', 'es').filter.from).toBeUndefined()
  })
})

describe('places and taxonomy', () => {
  it('resolves country aliases, full codes and exact county names', () => {
    expect(parse('USA UK UAE').filter.countries).toEqual(['AE', 'GB', 'US'])
    expect(parse('CA-BC').filter.provinces).toEqual(['CA-BC'])
    expect(parse('Central Valley').filter.counties).toEqual(['CA-BC|Central Valley'])
    expect(parse('Central').filter.counties).toBeUndefined()
    expect(parse('Noord-Holland', 'nl').filter.provinces).toEqual(['NL-NH'])
  })
  it('prefers on-list ambiguous names and never guesses between tied places', () => {
    expect(parse('Georgia').filter.provinces).toEqual(['US-GA'])
    expect(parse('Georgia', 'en', { listPlaces: [] }).chips).toHaveLength(0)
    expect(parse('BC', 'en', { listPlaces: ['s:CA-BC', 's:US-BC'] }).chips).toHaveLength(0)
    expect(parse('BC', 'en', { listPlaces: [] }).chips).toHaveLength(0)
    expect(parse('on 2026').filter.provinces).toBeUndefined()
    expect(parse('ON 2026').filter.provinces).toEqual(['CA-ON'])
  })
  it('matches multiword groups, singulars, prefixes, orders and families', () => {
    expect(parse('Hawks, Eagles, and Kites').filter.group).toBe('vultures-hawks-and-allies')
    expect(parse('hummingbird').filter.group).toBe('hummingbirds')
    expect(parse('hummingb').filter.group).toBeUndefined() // part of a name is no group
    expect(parse('Passeriformes').filter.order).toBe('Passeriformes')
    expect(parse('perching birds').filter.order).toBe('Passeriformes')
    expect(parse('Corvidae').filter).toMatchObject({ order: 'Passeriformes', family: 'Corvidae' })
    expect(parse('crows and jays').filter.family).toBe('Corvidae')
    expect(parse('New World Sparrows').filter.group).toBe('new-world-sparrows')
  })
})

describe('localized status and lifer vocabulary', () => {
  it.each([
    ['en', 'critically endangered', ['CR']], ['es', 'amenazadas', ['CR', 'EN', 'VU']],
    ['es', 'en peligro', ['EN']], ['pt', 'ameaçadas', ['CR', 'EN', 'VU']], ['pt', 'em perigo', ['EN']],
    ['nl', 'bedreigd', ['CR', 'EN', 'VU']], ['nl', 'ernstig bedreigd', ['CR']],
  ] as const)('%s: %s', (lang, q, status) => expect(parse(q, lang).filter.statuses).toEqual(status))
  it.each(['en', 'es', 'pt', 'nl'] as const)('%s understands IUCN codes', (lang) => {
    expect(parse('VU EN CR NT LC DD NE EX EW', lang).filter.statuses).toEqual(['CR', 'DD', 'EN', 'EW', 'EX', 'LC', 'NE', 'NT', 'VU'])
  })
  it('does not read Spanish en as endangered, and accepts contextual status labels', () => {
    expect(parse('patos en méxico', 'es')).toMatchObject({ filter: { group: 'waterfowl', countries: ['MX'] }, rest: '' })
    expect(parse('patos en méxico', 'es').filter.statuses).toBeUndefined()
    expect(parse('Custom label', 'en', { statuses: [{ code: 'NT', name: 'Custom label' }] }).filter.statuses).toEqual(['NT'])
  })
})

describe('source spans and purity', () => {
  it('quotes force bird-name text, preserving case and punctuation in leftovers', () => {
    expect(parse('"Canada Goose" 2026')).toMatchObject({ filter: { from: '2026-01' }, rest: 'Canada Goose' })
    expect(parse('"threatened" "october"').filter).toEqual({})
    expect(parse('Odd Bird! in Canada').rest).toBe('Odd Bird!')
  })
  it.each(['en', 'es', 'pt', 'nl'] as const)('removes only the selected %s chip with original accents/case', (lang) => {
    const q = 'patos MÉXICO 2026 Mystery'
    const r = parse(q, lang)
    const place = r.chips.find((c) => c.kind === 'place')!
    expect(withoutChip(q, place)).toBe('patos 2026 Mystery')
    expect(withoutChip('a changed query', place)).toBe('a changed query')
  })
  it('retains quoted duplicates and removes a span including its connector', () => {
    const q = '"Canada" in Canada 2026'
    const r = parse(q)
    expect(withoutChip(q, r.chips.find((c) => c.kind === 'place')!)).toBe('"Canada" 2026')
    const range = 'Odd Bird oct 2025 - nov 2026'
    expect(withoutChip(range, parse(range).chips.find((c) => c.kind === 'date')!)).toBe('Odd Bird')
  })
  it('is deterministic and does not mutate the context', () => {
    const before = JSON.stringify(ctx)
    expect(parse('waterfowl canada 2026')).toEqual(parse('waterfowl canada 2026'))
    expect(JSON.stringify(ctx)).toBe(before)
    expect(parse('')).toEqual({ filter: {}, chips: [], rest: '' })
  })
})

// nf-9 bug check (2026-11-15): connectors, bare three-letter months, province suffixes, hyphenated ranges, "from X",
// month aliases and the waterfowl synonyms.
describe('nf-9 review fixes: connectors and whole words in group names', () => {
  it.each([
    ['es', 'aves de garzas'], ['es', 'aves del mar'], ['es', 'aves de la costa'], ['es', 'aves de'], ['pt', 'aves do Brasil'],
  ] as const)('%s "%s" never yields Birds-of-Paradise', (lang, q) => {
    expect(parse(q, lang).filter.group).not.toBe('birds-of-paradise')
  })
  it('still reads "aves del paraíso" as Birds-of-Paradise', () => {
    expect(parse('aves del paraíso', 'es').filter.group).toBe('birds-of-paradise')
  })
})

describe('nf-9 review fixes: three-letter months', () => {
  it('"aves del mar" has no date, and a bare "mar" is not March', () => {
    for (const q of ['aves del mar', 'mar']) {
      const r = parse(q, 'es')
      expect(r.chips.filter((c) => c.kind === 'date')).toEqual([])
      expect(r.filter.from).toBeUndefined()
      expect(r.filter.to).toBeUndefined()
    }
  })
  it('"mar 2020" is March 2020 and "marzo" is March', () => {
    expect(parse('mar 2020', 'es').filter).toMatchObject({ from: '2020-03', to: '2020-03' })
    expect(parse('marzo', 'es').filter).toMatchObject({ from: '2026-03', to: '2026-03' })
  })
})

describe('nf-9 review fixes: province code suffixes need an uppercase code', () => {
  const listed = { ...ctx, listPlaces: ['s:US-OR', 's:AR-A', 's:CM-NO', 's:US-AL', 's:CA-BC'] }
  it.each(['or', 'a', 'no', 'al'])('lowercase "%s" is an ordinary word, not a province', (q) => {
    expect(parseSmart(q, { ...listed, lang: 'en' }).filter.provinces).toBeUndefined()
  })
  it('an uppercase BC with CA-BC on the list is still British Columbia', () => {
    expect(parseSmart('BC', { ...listed, lang: 'en' }).filter.provinces).toEqual(['CA-BC'])
  })
})

describe('nf-9 review fixes: hyphenated month ranges', () => {
  it('"Jan-Mar 2020" and "oct-dec 2025" are month ranges', () => {
    expect(span('Jan-Mar 2020')).toEqual(['2020-01', '2020-03'])
    expect(span('oct-dec 2025')).toEqual(['2025-10', '2025-12'])
  })
  it('"Nov-Feb" matches the en-dash form, spanning the year boundary', () => {
    expect(span('Nov-Feb')).toEqual(span('Nov–Feb'))
    expect(span('Nov-Feb')).toEqual(['2025-11', '2026-02'])
  })
  it('spaced and en-dash forms keep working', () => {
    expect(span('Jan - Mar 2020')).toEqual(['2020-01', '2020-03'])
    expect(span('Jan – Mar 2020')).toEqual(['2020-01', '2020-03'])
  })
  it('compounds and place codes stay whole', () => {
    expect(parse('beija-flor', 'pt').filter.group).toBe('hummingbirds')
    expect(parse('CA-BC').filter.provinces).toEqual(['CA-BC'])
  })
})

describe('nf-9 review fixes: "from X" with no end is since X', () => {
  it('"birds from 2019" is since January 2019', () => {
    expect(span('birds from 2019')).toEqual(['2019-01', '2026-11'])
  })
  it('"from March 2020" is since March 2020', () => {
    expect(span('from March 2020')).toEqual(['2020-03', '2026-11'])
  })
  it('"from nov to feb" stays a range', () => {
    expect(span('from nov to feb')).toEqual(['2025-11', '2026-02'])
  })
})

describe('nf-9 review fixes: month spellings', () => {
  it('"mrt 2020" is March 2020 and "setiembre 2020" is September 2020', () => {
    expect(span('mrt 2020', 'nl')).toEqual(['2020-03', '2020-03'])
    expect(span('setiembre 2020', 'es')).toEqual(['2020-09', '2020-09'])
  })
})

describe('nf-9 review fixes: waterbird words', () => {
  it('the waterfowl synonyms no longer list waterbird words', () => {
    const file = JSON.parse(readFileSync('data/i18n/group-synonyms.json', 'utf8'))
    expect(JSON.stringify(file.waterfowl)).not.toMatch(/acuáticas|aquáticas|watervogels/)
  })
  it('"aves aquáticas" (pt) is not waterfowl', () => {
    expect(parse('aves aquáticas', 'pt').filter.group).not.toBe('waterfowl')
  })
})

describe('places under the continent model (nf-10 keys)', () => {
  const regions = { v: 1 as const, countries: { CA: 'Canada', FR: 'France', KE: 'Kenya' }, sub1: { 'CA-BC': 'British Columbia', 'FR-973': 'French Guiana' } }
  it('a listed country, province or overseas part parses to keys a continent-aware filter accepts', () => {
    const listPlaces = ['n:NA', 'c:CA', 's:CA-BC', 'n:AF', 'c:KE', 'n:SA', 'c:FR@SA', 's:FR-973']
    expect(parse('canada', 'en', { regions, listPlaces }).filter).toEqual({ countries: ['CA'] })
    expect(parse('kenya', 'en', { regions, listPlaces }).filter).toEqual({ countries: ['KE'] })
    expect(parse('french guiana', 'en', { regions, listPlaces }).filter).toEqual({ provinces: ['FR-973'] })
    // A plain country key is valid in the continent model: France itself (Europe), whatever else the list holds.
    expect(parse('france', 'en', { regions, listPlaces }).filter).toEqual({ countries: ['FR'] })
  })
})

describe('Polish (pl)', () => {
  it('reads Polish groups (and English ones), places, months (genitive too), relative dates, status and lifers', () => {
    expect(parse('blaszkodziobe kanada 2026', 'pl').filter).toMatchObject({ group: 'waterfowl', countries: ['CA'], basis: 'seen', from: '2026-01', to: '2026-12' })
    expect(parse('waterfowl kanada 2026', 'pl').filter).toMatchObject({ group: 'waterfowl', countries: ['CA'] })
    expect(parse('szponiaste BC', 'pl').filter).toMatchObject({ group: 'vultures-hawks-and-allies', provinces: ['CA-BC'] })
    expect(parse('blaszkodziobe', 'pl').chips[0].label).toBe('Blaszkodziobe')
    expect(span('październik', 'pl')).toEqual(['2026-10', '2026-10'])
    expect(span('od marca do maja', 'pl')).toEqual(['2026-03', '2026-05'])
    expect(span('w zeszłym roku', 'pl')).toEqual(['2025-01', '2025-12'])
    expect(span('ostatnie 3 miesiące', 'pl')).toEqual(['2026-09', '2026-11'])
    expect(span('dwa lata temu', 'pl')).toEqual(['2024-01', '2024-12'])
    expect(parse('zagrożone', 'pl').filter.statuses).toEqual(['CR', 'EN', 'VU'])
    expect(parse('zagrożony', 'pl').filter.statuses).toEqual(['EN'])
    expect(parse('nowe 2024', 'pl').filter).toMatchObject({ basis: 'lifer', from: '2024-01', to: '2024-12' })
    expect(parse('Mysterious Thing', 'pl').rest).toBe('Mysterious Thing')
  })
  it('folds ł like any accent, so "labedz" finds "Łabędź"', () => {
    expect(searchKey('Łabędź niemy')).toBe('labedz niemy')
    expect(searchKey('w zeszłym roku')).toBe('w zeszlym roku')
  })
})
