import { describe, expect, it } from 'vitest'
import { countHead, countriesLabel, filtersCount, filtersSpoken, panelHead, placesLabel, placesNoteFor, placesSpoken, placesUnplacedFor, showLabel, statusLabel, statusSpoken, timeSpoken, timeSummary } from '@/lib/list/filter-summary'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'

const t = en.ui

const name = (c: string) => ({ CA: 'Canada', EG: 'Egypt', US: 'United States', ZA: 'South Africa' })[c] ?? c
const regions = { countries: { CA: 'Canada', EG: 'Egypt', KE: 'Kenya' }, sub1: { 'CA-BC': 'British Columbia' } }

describe('countriesLabel (share image)', () => {
  it('one, two joined by +, three or more as "and N more"', () => {
    expect(countriesLabel(undefined, name, t)).toBeUndefined()
    expect(countriesLabel([], name, t)).toBeUndefined()
    expect(countriesLabel(['CA'], name, t)).toBe('Canada')
    expect(countriesLabel(['CA', 'EG'], name, t)).toBe('Canada + Egypt')
    expect(countriesLabel(['CA', 'EG', 'US'], name, t)).toBe('Canada and 2 more')
    expect(countriesLabel(['CA', 'EG', 'US', 'ZA'], name, t)).toBe('Canada and 3 more')
  })
})

describe('the Filters button’s words', () => {
  it('Places: spoken as the names', () => {
    expect(placesSpoken({ countries: ['CA', 'EG'] }, regions, t)).toBe('Canada, Egypt')
    expect(placesSpoken({}, regions, t)).toBeUndefined()
  })
  it('Places at every level: spoken in full, "; " between places once a province or county is in', () => {
    expect(placesSpoken({ countries: ['KE'], provinces: ['CA-BC'] }, regions, t)).toBe('Kenya; British Columbia, Canada')
    expect(placesSpoken({ counties: ['CA-BC|Capital'] }, regions, t)).toBe('Capital, British Columbia')
  })
  it('Places on the share image: short names, in the filter\'s order', () => {
    expect(placesLabel({}, regions, t)).toBeUndefined()
    expect(placesLabel({ provinces: ['CA-BC'] }, regions, t)).toBe('British Columbia')
    expect(placesLabel({ provinces: ['CA-BC'], countries: ['KE'] }, regions, t)).toBe('Kenya + British Columbia')
    expect(placesLabel({ counties: ['CA-BC|Capital', 'CA-BC|Okanagan', 'CA-BC|Sooke'] }, regions, t)).toBe('Capital and 2 more')
  })
  it('Time: years for a range, a month for one month; spoken in full', () => {
    expect(timeSummary({}, t)).toBeUndefined()
    expect(timeSummary({ from: '2022-01', to: '2024-12' }, t)).toBe('2022–2024')
    expect(timeSummary({ from: '2022-04', to: '2024-09' }, t)).toBe('Apr 2022–Sep 2024')
    expect(timeSummary({ from: '2022-01', to: '2024-09' }, t)).toBe('Jan 2022–Sep 2024')
    expect(timeSummary({ from: '2022-01', to: '2022-12' }, t)).toBe('2022')
    expect(timeSummary({ from: '2021-09', to: '2021-09' }, t)).toBe('Sep 2021')
    expect(timeSummary({ from: '2022-04' }, t)).toBe('from Apr 2022')
    expect(timeSummary({ from: '2022-01' }, t)).toBe('from 2022')
    expect(timeSummary({ to: '2024-09' }, t)).toBe('to Sep 2024')
    expect(timeSummary({ to: '2024-12' }, t)).toBe('to 2024')
    expect(timeSpoken({ from: '2022-04', to: '2024-09' }, t)).toBe('April 2022 to September 2024')
    expect(timeSpoken({ from: '2021-09', to: '2021-09' }, t)).toBe('September 2021')
    expect(timeSpoken({ to: '2024-09' }, t)).toBe('up to September 2024')
    expect(timeSpoken({}, t)).toBeUndefined()
  })
})

describe('in Spanish, Portuguese and Dutch', () => {
  it('"and N more", the Time summary and its spoken form use the language\'s words and months', () => {
    expect(countriesLabel(['CA', 'EG', 'US'], name, es.ui)).toBe('Canada y 2 más')
    expect(countriesLabel(['CA', 'EG'], name, es.ui)).toBe('Canada + Egypt')
    expect(placesLabel({ counties: ['CA-BC|Capital', 'CA-BC|Okanagan', 'CA-BC|Sooke'] }, regions, pt.ui)).toBe('Capital e mais 2')
    expect(timeSummary({ from: '2021-09', to: '2021-09' }, es.ui)).toBe('sept 2021')
    expect(timeSummary({ from: '2022-04', to: '2024-09' }, es.ui)).toBe('abr 2022–sept 2024')
    expect(timeSummary({ from: '2022-01', to: '2024-12' }, es.ui)).toBe('2022–2024')
    expect(timeSummary({ from: '2022-04' }, es.ui)).toBe('desde abr 2022')
    expect(timeSummary({ to: '2024-09' }, nl.ui)).toBe('t/m sep 2024')
    expect(timeSummary({ to: '2024-12' }, pt.ui)).toBe('até 2024')
    expect(timeSpoken({ from: '2022-04', to: '2024-09' }, es.ui)).toBe('abril de 2022 a septiembre de 2024')
    expect(timeSpoken({ from: '2021-09', to: '2021-09' }, pt.ui)).toBe('setembro de 2021')
    expect(timeSpoken({ to: '2024-09' }, es.ui)).toBe('hasta septiembre de 2024')
    expect(timeSpoken({ from: '2020-03', to: '2021-06' }, nl.ui)).toBe('maart 2020 tot en met juni 2021')
    expect(timeSpoken({}, es.ui)).toBeUndefined()
  })
})

describe('placesNoteFor (the lifer-only notice)', () => {
  const rec = (seen?: string[]) => ({ code: 'a', source: 'ebird' as const, seen })
  const saved = (ebird: ReturnType<typeof rec>[], list: ReturnType<typeof rec>[] = []) => ({ records: { obsorg: [], 'obsorg-list': [], ebird, 'ebird-list': list, inat: [], sheet: [], manual: [] } })
  it('hidden on an empty list and when seen-here is known', () => {
    expect(placesNoteFor(saved([]), 0, false)).toBeUndefined()
    expect(placesNoteFor(saved([rec(['|CA'])]), 3, true)).toBeUndefined()
  })
  it('a MyEBirdData import saved before seen-here: import it again', () => {
    expect(placesNoteFor(saved([rec(), rec()]), 2, false)).toBe('reimport')
  })
  it('only the life list download or ticks by hand: add MyEBirdData or iNaturalist', () => {
    expect(placesNoteFor(saved([], [rec()]), 1, false)).toBe('add')
  })
})

describe('Status in words', () => {
  it('in each language: the full names and the Threatened label', () => {
    expect(statusSpoken({ statuses: ['VU', 'EN'] }, es.ui)).toBe('Vulnerable, En peligro')
    expect(statusSpoken({ statuses: ['VU', 'EN'] }, pt.ui)).toBe('Vulnerável, Em perigo')
    expect(statusSpoken({ statuses: ['VU', 'EN'] }, nl.ui)).toBe('Kwetsbaar, Bedreigd')
    expect(statusLabel(['VU', 'EN', 'CR'], es.ui)).toBe('Amenazadas')
    expect(statusLabel(['EN', 'CR'], nl.ui)).toBe('Bedreigd + Ernstig bedreigd')
  })
  it('spoken as the full names in IUCN_CATS order', () => {
    expect(statusSpoken({}, t)).toBeUndefined()
    expect(statusSpoken({ statuses: ['VU', 'EN'] }, t)).toBe('Vulnerable, Endangered')
    expect(statusSpoken({ statuses: ['CR', 'EX', 'DD'] }, t)).toBe('Critically Endangered, Extinct, Data Deficient')
    expect(statusSpoken({ statuses: ['VU', 'NE'] }, t)).toBe('Vulnerable, Not evaluated')
  })
  it('the share label: exactly VU, EN and CR read "Threatened"; else one, two joined by +, or "and N more"', () => {
    expect(statusLabel(undefined, t)).toBeUndefined()
    expect(statusLabel([], t)).toBeUndefined()
    expect(statusLabel(['VU', 'EN', 'CR'], t)).toBe('Threatened')
    expect(statusLabel(['EN'], t)).toBe('Endangered')
    expect(statusLabel(['VU', 'EN'], t)).toBe('Vulnerable + Endangered')
    expect(statusLabel(['NT', 'VU', 'EN', 'CR'], t)).toBe('Near Threatened and 3 more')
    expect(statusLabel(['VU', 'EN', 'CR', 'EW'], t)).toBe('Vulnerable and 3 more')
    expect(statusLabel(['NE'], t)).toBe('Not evaluated')
    expect(statusLabel(['VU', 'EN', 'CR', 'NE'], t)).toBe('Vulnerable and 3 more')
  })
})

describe('observation.org: the unplaced line, and no MyEBirdData pitch without eBird', () => {
  type R = { code: string; source: 'ebird' | 'obsorg' | 'inat' | 'manual'; place?: { country: string }; seen?: string[] }
  const saved = (r: Partial<Record<'obsorg' | 'obsorg-list' | 'ebird' | 'ebird-list' | 'inat' | 'manual', R[]>>) => ({
    records: { obsorg: [], 'obsorg-list': [], ebird: [], 'ebird-list': [], inat: [], sheet: [], manual: [], ...r },
  })
  const listed = (code: string): R => ({ code, source: 'obsorg' })
  it('observation.org alone: no MyEBirdData pitch, the unplaced line', () => {
    const s = saved({ 'obsorg-list': [listed('a'), listed('b')] })
    expect(placesNoteFor(s, 2, false)).toBeUndefined()
    expect(placesUnplacedFor(s)).toBe('add')
  })
  it('with the eBird life list: both notes', () => {
    const s = saved({ 'obsorg-list': [listed('a')], 'ebird-list': [{ code: 'b', source: 'ebird', place: { country: 'CA' } }] })
    expect(placesNoteFor(s, 2, false)).toBe('add')
    expect(placesUnplacedFor(s)).toBe('add')
  })
  it('with MyEBirdData (seen-here full): only the unplaced line', () => {
    const s = saved({ 'obsorg-list': [listed('a')], ebird: [{ code: 'b', source: 'ebird', place: { country: 'CA' }, seen: ['2020-01-01|CA'] }] })
    expect(placesNoteFor(s, 2, true)).toBeUndefined()
    expect(placesUnplacedFor(s)).toBe('add')
  })
  it('the observations place the same birds: the unplaced line goes; while some stay unplaced it has no link', () => {
    const obs = (code: string): R => ({ code, source: 'obsorg', place: { country: 'NL' }, seen: ['2020-01-01|NL'] })
    expect(placesUnplacedFor(saved({ 'obsorg-list': [listed('a'), listed('b')], obsorg: [obs('a'), obs('b')] }))).toBeUndefined()
    expect(placesUnplacedFor(saved({ 'obsorg-list': [listed('a'), listed('b')], obsorg: [obs('a')] }))).toBe('plain')
  })
  it('an empty list: no line', () => {
    expect(placesUnplacedFor(saved({}))).toBeUndefined()
  })
  it('birds the birder removed are off the list: they never keep the line', () => {
    const s = { ...saved({ 'obsorg-list': [listed('a'), listed('b')], ebird: [{ code: 'b', source: 'ebird', place: { country: 'CA' } }] }), edits: { removed: ['a'] } }
    expect(placesUnplacedFor(s)).toBeUndefined()
    expect(placesUnplacedFor({ ...s, edits: { removed: [] } })).toBe('add')
    expect(placesUnplacedFor({ ...s, edits: { removed: ['a', 'b'] } })).toBeUndefined()
  })
  it('only records place a bird: a hand tick with a place (edits.added) does not', () => {
    const s = { ...saved({ 'obsorg-list': [listed('a')] }), edits: { removed: [], added: [{ code: 'a', place: { country: 'NL' } }] } }
    expect(placesUnplacedFor(s)).toBe('add')
  })
})

describe('countHead', () => {
  it('count first, " · N checked" only when some are', () => {
    expect(countHead(20, 'country', 7, t)).toBe('20 countries · 7 checked')
    expect(countHead(20, 'country', 0, t)).toBe('20 countries')
    expect(countHead(1, 'country', 0, t)).toBe('1 country')
    expect(countHead(8, 'province', 1, t)).toBe('8 states and provinces · 1 checked')
    expect(countHead(1, 'province', 0, t)).toBe('1 state or province')
    expect(countHead(14, 'county', 0, t)).toBe('14 counties')
    expect(countHead(5, 'status', 2, t)).toBe('5 categories · 2 checked')
    expect(countHead(1200, 'country', 0, t)).toBe('1,200 countries')
  })
})

describe('the Filters button and panel', () => {
  const r = { countries: { KE: 'Kenya', CA: 'Canada', EG: 'Egypt', PE: 'Peru' }, sub1: { 'CA-BC': 'British Columbia' } }
  it('filtersCount counts sections, not values', () => {
    expect(filtersCount({ countries: ['CA', 'EG', 'KE', 'PE'] })).toBe(1)
    expect(filtersCount({ countries: ['CA', 'EG', 'KE', 'PE'], from: '2020-01' })).toBe(2)
    expect(filtersCount({ countries: ['CA', 'EG', 'KE', 'PE'], from: '2020-01', statuses: ['VU'] })).toBe(3)
    expect(filtersCount({ order: 'X' })).toBe(0)
  })
  it('filtersSpoken names each section in full', () => {
    expect(filtersSpoken({ countries: ['KE'], provinces: ['CA-BC'], from: '2020-03', to: '2021-06', statuses: ['VU'] }, r, t)).toBe(
      'Places: Kenya; British Columbia, Canada. Time: March 2020 to June 2021. Conservation status: Vulnerable',
    )
    expect(filtersSpoken({ countries: ['KE'], from: '2020-03', statuses: ['VU'] }, r, es.ui)).toBe('Lugares: Kenya. Fechas: desde marzo de 2020. Estado de conservación: Vulnerable')
    expect(filtersSpoken({}, r, t)).toBeUndefined()
  })
  it('panelHead and showLabel', () => {
    expect(panelHead(3, 118, t)).toBe('Filters · 3 · 118 species')
    expect(panelHead(0, 1089, t)).toBe('Filters · 1,089 species')
    expect(showLabel(118, t)).toBe('Show 118 species')
    expect(showLabel(1, t)).toBe('Show 1 species')
    expect(panelHead(3, 118, es.ui)).toBe('Filtros · 3 · 118 especies')
    expect(showLabel(1, nl.ui)).toBe('1 soort tonen')
    expect(countHead(7, 'country', 2, pt.ui)).toBe('7 países · 2 com marca')
  })
})
