import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { pl } from '@/i18n/messages/pl'
import { fr } from '@/i18n/messages/fr'
import { de } from '@/i18n/messages/de'
import { it as italian } from '@/i18n/messages/it'
import { sv } from '@/i18n/messages/sv'
import { da } from '@/i18n/messages/da'
import { ru } from '@/i18n/messages/ru'
import { goalBasis, goalYears, hasDates, isGoalYear, isTarget, validBigYear, yearFilter, yearList } from '@/lib/list/big-year'
import { applyFilter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { buildSeen, type SeenIndex } from '@/lib/list/seen'
import { rangeFilter } from '@/lib/list/timeline'
import { makeReducer, initialState } from '@/lib/list/store'
import { prepareCard } from '@/lib/share/image'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

const makeSpecies = (n: number) =>
  buildSpeciesIndex(
    Array.from({ length: n }, (_, i) => ({
      code: `sp${i}`, com: `Bird ${i}`, sci: `Avis sp${i}`, ord: 'Passeriformes', fam: 'Avidae', famCom: 'Birds', to: i,
      g: 20, gSrc: 'family', st: true, ar: 1, q: true,
    }) as SpeciesRow),
  )

describe('bigYear helpers', () => {
  it('validates target, year and BigYear object', () => {
    expect(isTarget(300)).toBe(true)
    expect(isTarget(1)).toBe(true)
    expect(isTarget(0)).toBe(false)
    expect(isTarget(-5)).toBe(false)
    expect(isTarget(1.5)).toBe(false)
    expect(isGoalYear(2027)).toBe(true)
    expect(isGoalYear(99)).toBe(false)
    expect(validBigYear({ year: 2027, target: 300 })).toBe(true)
    expect(validBigYear({ year: 2027, target: 0 })).toBe(false)
    expect(validBigYear({ year: 2027, target: 300, extra: 1 })).toBe(false)
    expect(validBigYear(null)).toBe(false)
  })

  it('detects dates and builds sensible goalYears', () => {
    const emptySeen: SeenIndex = { byCode: new Map(), full: false, sig: '0' }
    const noDates: ListEntry[] = [{ code: 'sp0', heard: false, dead: false, media: false, sources: ['manual'] }]
    expect(hasDates(noDates, emptySeen)).toBe(false)

    const dated: ListEntry[] = [
      { code: 'sp0', date: '2023-04-01', heard: false, dead: false, media: false, sources: ['ebird'] },
      { code: 'sp1', date: '2025-06-15', heard: false, dead: false, media: false, sources: ['ebird'] },
    ]
    expect(hasDates(dated, emptySeen)).toBe(true)
    expect(goalYears(dated, new Date(2027, 0, 1))).toEqual([2027, 2026, 2025, 2024, 2023])
  })

  it('counts seen-in-year with seenMonths and lifers without seenMonths, agreeing with year filter', () => {
    const species = makeSpecies(150)
    // 120 species first seen in 2025, also seen in 2027 via seenMonths; 30 only seen in 2025.
    const records = Array.from({ length: 150 }, (_, i) => ({
      code: `sp${i}`,
      source: 'ebird' as const,
      date: '2025-05-01',
      place: { country: 'CA' },
      ...(i < 120 ? { seenMonths: ['2025-05,2027-03|CA'] } : { seenMonths: ['2025-05|CA'] }),
    }))
    const list: ListEntry[] = records.map((r) => ({ code: r.code, date: r.date, heard: false, dead: false, media: false, sources: ['ebird'] }))
    const seen = buildSeen(records, { removed: [], added: [], marks: {}, fixes: {} }, { hideHeard: false, hideDead: false, researchOnly: false }, list)

    expect(goalBasis(seen)).toBe('seen')
    const y2027 = yearList(list, 2027, species, seen)
    expect(y2027).toHaveLength(120)
    const months = ['2025-01', '2026-01', '2027-01', '2027-12']
    const rf = rangeFilter({ basis: 'seen' }, 2, 3, months)
    expect(applyFilter(list, rf, species, seen)).toHaveLength(120)
    expect(y2027.map((e) => e.code)).toEqual(applyFilter(list, yearFilter(2027, seen), species, seen).map((e) => e.code))

    // Life list only (no seenMonths): counts lifers first seen in 2027.
    const lifeOnlySeen: SeenIndex = { byCode: new Map(), full: false, sig: '0' }
    expect(goalBasis(lifeOnlySeen)).toBe('lifer')
    const mixedList: ListEntry[] = [
      { code: 'sp0', date: '2025-05-01', heard: false, dead: false, media: false, sources: ['ebird'] },
      { code: 'sp1', date: '2027-02-10', heard: false, dead: false, media: false, sources: ['ebird'] },
    ]
    expect(yearList(mixedList, 2027, species, lifeOnlySeen).map((e) => e.code)).toEqual(['sp1'])
  })

  it('store reducer saves and clears bigYear', () => {
    const species = makeSpecies(2)
    const reduce = makeReducer({ species })
    let s = initialState()
    s = reduce(s, { type: 'bigYear', bigYear: { year: 2027, target: 300 } })
    expect(s.saved.bigYear).toEqual({ year: 2027, target: 300 })
    s = reduce(s, { type: 'bigYear', bigYear: undefined })
    expect(s.saved.bigYear).toBeUndefined()
  })
})

describe('Big Year share card', () => {
  it('draws 120 / 300 with Big Year 2027 (seen) and New species in 2027 (lifer), and fits all languages', async () => {
    const species = makeSpecies(120)
    const entries: ListEntry[] = Array.from({ length: 120 }, (_, i) => ({
      code: `sp${i}`, date: '2027-03-01', heard: false, dead: false, media: false, sources: ['ebird'],
    }))
    const pack = { W: 1000, H: 1000, boxes: new Map(entries.map((e, i) => [e.code, [10 + (i % 10) * 80, 10 + Math.floor(i / 10) * 60, 40, 40]] as [string, [number, number, number, number]])) }

    const seenCard = await prepareCard({
      format: 'story', entries, species, pack, theme: 'light',
      goal: { year: 2027, target: 300, basis: 'seen' }, strings: en.ui,
    })
    expect(seenCard.countNum).toBe('120 / 300')
    expect(seenCard.label).toBe('Big Year 2027')

    const liferCard = await prepareCard({
      format: 'story', entries, species, pack, theme: 'light',
      goal: { year: 2027, target: 300, basis: 'lifer' }, strings: en.ui,
    })
    expect(liferCard.countNum).toBe('120 / 300')
    expect(liferCard.label).toBe('Big Year 2027 · New species in 2027')

    for (const m of [en, es, pt, nl, pl, fr, de, italian, sv, da, ru]) {
      const c = await prepareCard({
        format: 'square', entries, species, pack, theme: 'light',
        goal: { year: 2027, target: 300, basis: 'lifer' }, strings: m.ui,
      })
      expect(c.countNum).toBe('120 / 300')
      expect(c.label).toContain('2027')
    }
  })
})
