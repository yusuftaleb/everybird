import { describe, expect, it } from 'vitest'
import { fmt, plural, rich, tagPlurals } from '@/i18n/core'
import { formatInt, formatMass, formatMonth, shortDay } from '@/i18n/format'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { getMessages } from '@/i18n/server'

describe('formatInt: grouped from 4 digits', () => {
  it('groups by language', () => {
    expect(formatInt(1089, en.ui.num)).toBe('1,089')
    expect(formatInt(1089, es.ui.num)).toBe('1.089')
    expect(formatInt(11019, pt.ui.num)).toBe('11.019')
    expect(formatInt(197, es.ui.num)).toBe('197')
    expect(formatInt(1089, nl.ui.num)).toBe('1.089')
  })
  it('handles big, small, negative and odd numbers', () => {
    expect(formatInt(1234567, en.ui.num)).toBe('1,234,567')
    expect(formatInt(1000, es.ui.num)).toBe('1.000')
    expect(formatInt(999, en.ui.num)).toBe('999')
    expect(formatInt(0, en.ui.num)).toBe('0')
    expect(formatInt(-1089, en.ui.num)).toBe('-1,089')
    expect(formatInt(1088.6, en.ui.num)).toBe('1,089')
    expect(formatInt(Number.NaN, en.ui.num)).toBe('')
  })
  it('agrees with en-US grouping for English', () => {
    for (const n of [0, 7, 99, 197, 1089, 11019, 123456, 9999999]) expect(formatInt(n, en.ui.num)).toBe(n.toLocaleString('en-US'))
  })
})

describe('formatMass', () => {
  it('uses the language’s decimal', () => {
    expect(formatMass(2400, es.ui.num)).toBe('2,4 kg')
    expect(formatMass(7.25, pt.ui.num)).toBe('7,3 g')
    expect(formatMass(33, nl.ui.num)).toBe('33 g')
  })
  it('reads as English always did: whole grams from 10, one decimal under 10 and for kilograms', () => {
    const cases: [number, string][] = [[33, '33 g'], [4.27, '4.3 g'], [1130, '1.1 kg'], [999.6, '1000 g'], [2400, '2.4 kg'], [7.25, '7.3 g'], [0, '0.0 g'], [10, '10 g'], [1_000_000, '1000.0 kg']]
    for (const [g, text] of cases) expect(formatMass(g, en.ui.num)).toBe(text)
    for (const g of [Number.NaN, -1, Infinity]) expect(formatMass(g, en.ui.num)).toBe('')
  })
})

describe('formatMonth', () => {
  it('uses the language’s months', () => {
    expect(formatMonth('2026-09', es.ui.date.months)).toBe('sept 2026')
    expect(formatMonth('2026-03', nl.ui.date.months)).toBe('mrt 2026')
    expect(formatMonth('2026-02-14', pt.ui.date.months)).toBe('fev 2026')
  })
  it('reads as English always did: "Sep 2026", a bare year, nothing for junk', () => {
    expect(en.ui.date.months).toHaveLength(12)
    const cases: [string | undefined, string][] = [['2026-09-30', 'Sep 2026'], ['2026-09', 'Sep 2026'], ['2022', '2022'], ['junk', ''], [undefined, ''], ['2026-13', '2026'], ['2026-00', '2026'], ['', '']]
    for (const [d, text] of cases) expect(formatMonth(d, en.ui.date.months)).toBe(text)
  })
})

describe('shortDay', () => {
  const now = new Date('2026-11-15T12:00:00Z')
  it('reads as Settings always did in English ("6 Nov", "1 Mar 2025"), and "6 Sep", never "Sept"', () => {
    expect(shortDay('2026-11-06T10:00:00Z', en.ui.date.months, now)).toBe('6 Nov')
    expect(shortDay('2025-03-01T10:00:00Z', en.ui.date.months, now)).toBe('1 Mar 2025')
    expect(shortDay('2026-01-20T10:00:00Z', en.ui.date.months, now)).toBe('20 Jan')
    expect(shortDay('2026-09-20T10:00:00Z', en.ui.date.months, now)).toBe('20 Sep')
  })
  it('adds the year only when it is not this year, and says nothing for a bad date', () => {
    expect(shortDay('2026-11-06T10:00:00Z', es.ui.date.months, now)).toBe('6 nov')
    expect(shortDay('2025-09-01T10:00:00Z', es.ui.date.months, now)).toBe('1 sept 2025')
    expect(shortDay('2026-09-06T10:00:00Z', en.ui.date.months, now)).toBe('6 Sep')
    expect(shortDay('nope', en.ui.date.months, now)).toBe('')
    expect(shortDay('', en.ui.date.months, now)).toBe('')
  })
})

describe('core', () => {
  it('plural: one exactly when n is 1', () => {
    const p = { one: '{n} especie', other: '{n} especies' }
    expect(plural(p, 0, { n: '0' })).toBe('0 especies')
    expect(plural(p, 1, { n: '1' })).toBe('1 especie')
    expect(plural(p, 2, { n: '2' })).toBe('2 especies')
    expect(plural(p, 1089, { n: '1.089' })).toBe('1.089 especies')
    expect(plural(p, 3)).toBe('3 especies')
  })
  it("plural: few and many by Intl.PluralRules for the dictionary's language, else other", () => {
    const live = getMessages('pl').ui.count.live // tagged by server.ts
    expect([0, 1, 2, 4, 5, 12, 22, 25, 101, 1.5].map((n) => plural(live, n))).toEqual(
      ['0 gatunków', '1 gatunek', '2 gatunki', '4 gatunki', '5 gatunków', '12 gatunków', '22 gatunki', '25 gatunków', '101 gatunków', '1.5 gatunków'])
    // Russian (planned): 21 takes `one`, and a missing form falls back to `other`.
    const ru = { one: '{n} вид', few: '{n} вида', other: '{n} видов' }
    tagPlurals('ru', ru)
    expect([1, 21, 3, 5, 11].map((n) => plural(ru, n))).toEqual(['1 вид', '21 вид', '3 вида', '5 видов', '11 видов'])
    // An untagged plural, or one with no few or many, keeps the two-form rule.
    expect(plural({ one: 'a', few: 'b', other: 'c' }, 2)).toBe('c')
    const ptLive = getMessages('pt').ui.count.live
    expect(plural(ptLive, 0)).toBe(fmt(ptLive.other, { n: 0 }))
  })
  it('fmt fills known keys and leaves unknown ones', () => {
    expect(fmt("{name}'s birds", { name: 'Ada' })).toBe("Ada's birds")
    expect(fmt('{a} and {b}', { a: 1 })).toBe('1 and {b}')
    expect(fmt('no vars')).toBe('no vars')
  })
  it('rich: tags become nodes, text stays text', () => {
    expect(rich('Read <link>the guide</link>.', { link: (c) => c.toUpperCase() }).join('')).toBe('Read THE GUIDE.')
    expect(rich('<b>one</b> and <i>two</i>', { b: (c) => `[${c}]`, i: (c) => `(${c})` }).join('')).toBe('[one] and (two)')
    expect(rich('no tags', {})).toEqual(['no tags'])
    expect(rich('an <x>unknown</x> tag', {}).join('')).toBe('an unknown tag')
  })
})

describe('pluralWord', () => {
  it('is the form for the count without the number (a label under a big number)', async () => {
    const { pluralWord } = await import('@/i18n/core')
    expect(pluralWord({ one: '{n} family', other: '{n} families' }, 1)).toBe('family')
    expect(pluralWord({ one: '{n} family', other: '{n} families' }, 5)).toBe('families')
    expect(pluralWord({ one: '{n}科', other: '{n}科' }, 3)).toBe('科')
    expect(pluralWord({ one: '{n} kraj', other: 'Kraje: {n}' }, 5)).toBe('Kraje')
  })
})
