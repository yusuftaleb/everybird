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
import { ja } from '@/i18n/messages/ja'
import { zhHans } from '@/i18n/messages/zh-Hans'
import { zhHant } from '@/i18n/messages/zh-Hant'
import { stampDate, stampStrings, withStamp } from '@/lib/share/stamp'

// The footer line as image.ts has it (FOOTER_LINE); this file must not import image.ts.
const FOOTER = 'everybird.yusuftaleb.com · stickers by huashu'

describe('stampDate', () => {
  it('reads "14 Nov 2026" from the local date', () => {
    expect(stampDate(new Date(2026, 10, 14, 23, 59))).toBe('14 Nov 2026')
  })
  it('has no leading zero and uses the short months of the rest of the site', () => {
    expect(stampDate(new Date(2026, 10, 4))).toBe('4 Nov 2026')
    expect(stampDate(new Date(2026, 8, 30))).toBe('30 Sep 2026')
    expect(stampDate(new Date(2027, 0, 1))).toBe('1 Jan 2027')
  })
  it('takes other month names, so a language is a strings object, with no prefix', () => {
    const es = { months: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'] }
    expect(stampDate(new Date(2026, 10, 14), es)).toBe('14 nov 2026')
  })
  it('each language: the date only, from its own months (no "Al", "Em" or "Per")', () => {
    const d = new Date(2026, 10, 14)
    expect(stampDate(d, stampStrings(en.ui))).toBe('14 Nov 2026')
    for (const m of [es, pt, nl, fr, italian, sv, da]) expect(stampDate(d, stampStrings(m.ui))).toBe('14 nov 2026')
    expect(stampDate(d, stampStrings(pl.ui))).toBe('14 lis 2026')
    expect(stampDate(d, stampStrings(de.ui))).toBe('14 Nov 2026')
    expect(stampDate(d, stampStrings(zhHant.ui))).toBe('2026年11月14日')
    expect(stampDate(d, stampStrings(zhHans.ui))).toBe('2026年11月14日')
    expect(stampDate(d, stampStrings(ja.ui))).toBe('2026年11月14日')
    expect(stampDate(d, stampStrings(ru.ui))).toBe('14 ноя 2026')
    expect(stampDate(new Date(2026, 8, 30), stampStrings(es.ui))).toBe('30 sept 2026')
    expect(stampDate(new Date(2026, 4, 1), stampStrings(nl.ui))).toBe('1 mei 2026')
  })
  it('is empty for an invalid date', () => {
    expect(stampDate(new Date(NaN))).toBe('')
  })
})

describe('withStamp', () => {
  it('ends the line with the stamp after a middle dot', () => {
    expect(withStamp(FOOTER, '14 Nov 2026')).toBe('everybird.yusuftaleb.com · stickers by huashu · 14 Nov 2026')
  })
  it('leaves the line alone without a stamp', () => {
    expect(withStamp(FOOTER, '')).toBe(FOOTER)
  })
})
