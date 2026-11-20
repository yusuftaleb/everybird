// The groundwork for the first languages outside the Latin alphabet (Russian, Japanese, Chinese): search keys, browser
// tags, dates and the link preview's language mark.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { dayText, formatMonth, shortDay, yearFirst } from '@/i18n/format'
import { langCode } from '@/i18n/langs'
import { EN_UI } from '@/i18n/messages/en-ui'
import { stampDate } from '@/lib/share/stamp'
import { ogLang } from '@/lib/share/og'
import { foldName } from '@/lib/species/resolve'
import { nameTier, searchKey } from '@/lib/species/name-search'
import { monthIndex, monthOfWord } from '@/lib/search/dates'

/** searchKey before Cyrillic, kana and Han were kept: every Latin name must keep this key. */
const latinKey = (s: string) => foldName(s).replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()

const data = (f: string) => JSON.parse(readFileSync(join(process.cwd(), 'public/data', f), 'utf8'))

describe('searchKey', () => {
  it("keeps every Latin name's key as it was: English, scientific and every committed Latin-script names file", () => {
    const names: string[] = []
    for (const r of data('species.v1.json').species as { com: string; sci: string }[]) names.push(r.com, r.sci)
    const latin = /^names\.(es|pt|nl|pl|fr|de|it|sv|da)/
    for (const f of readdirSync(join(process.cwd(), 'public/data')).filter((f) => latin.test(f))) {
      const file = data(f) as { names: Record<string, string>; fam: Record<string, string> }
      names.push(...Object.values(file.names), ...Object.values(file.fam))
    }
    expect(names.length).toBeGreaterThan(100_000)
    const changed = names.filter((n) => searchKey(n) !== latinKey(n))
    expect(changed).toEqual([])
  })

  it('keeps Cyrillic, lower-cased, with ё as е', () => {
    expect(searchKey('Обыкновенная Пустельга')).toBe('обыкновенная пустельга')
    expect(searchKey('Чёрный дрозд')).toBe(searchKey('черный дрозд'))
    expect(searchKey('Ёлка')).toBe('елка')
  })

  it('keeps kana and Han, with hiragana as katakana, the voicing marks and ー', () => {
    expect(searchKey('オオワシ')).toBe('オオワシ')
    expect(searchKey('おおわし')).toBe(searchKey('オオワシ'))
    expect(searchKey('がん')).toBe(searchKey('ガン'))
    expect(searchKey('コーラル')).toBe('コーラル')
    expect(searchKey('白头海雕')).toBe('白头海雕')
    expect(searchKey('ヨーロッパ・コマドリ')).toBe('ヨーロッパ コマドリ')
  })

  it('a Han or katakana word matches inside a name (no spaces to split at); a Latin word only at a word start', () => {
    const eagle = { com: 'Bald Eagle', sci: 'Haliaeetus leucocephalus' }
    expect(nameTier(searchKey('agle'), eagle)).toBe(-1)
    expect(nameTier(searchKey('eag'), eagle)).toBe(1)
    expect(nameTier(searchKey('海雕'), { com: '白头海雕', sci: 'x' })).toBe(1)
    expect(nameTier(searchKey('わし'), { com: 'オオワシ', sci: 'x' })).toBe(1)
  })
})

describe('Japanese and Chinese months in the smart search', () => {
  it('"3月" and Intl\'s "三月" are months, whole names only; "1月" is not a prefix of "10月"', () => {
    for (const lang of ['en', 'es'] as const) {
      const index = monthIndex(lang)
      expect(monthOfWord(index, '3月', false)).toBe(2)
      expect(monthOfWord(index, '1月', false)).toBe(0)
      expect(monthOfWord(index, '10月', false)).toBe(9)
    }
    expect(monthOfWord(monthIndex('en'), '13月', true)).toBeUndefined()
  })
})

describe('langCode', () => {
  it('is the primary subtag, but Chinese by script: TW, HK, MO and Hant are Traditional, any other zh Simplified', () => {
    expect(langCode('es-AR')).toBe('es')
    expect(langCode('ru-RU')).toBe('ru')
    expect(langCode('ja')).toBe('ja')
    for (const t of ['zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant', 'zh-Hant-TW', 'zh-Hant-CN', 'ZH-tw', 'zh_TW']) expect(langCode(t), t).toBe('zh-Hant')
    for (const t of ['zh', 'zh-CN', 'zh-SG', 'zh-Hans', 'zh-Hans-TW', 'zh-HKX', 'ZH']) expect(langCode(t), t).toBe('zh-Hans')
    expect(langCode('x')).toBeUndefined()
    expect(langCode(undefined)).toBeUndefined()
  })
})

const CJK_MONTHS = Array.from({ length: 12 }, (_, i) => `${i + 1}月`)
describe('Japanese and Chinese dates', () => {
  it('put the year first: 2026年9月, 11月6日, 2025年3月1日', () => {
    expect(yearFirst(CJK_MONTHS)).toBe(true)
    expect(yearFirst(EN_UI.date.months)).toBe(false)
    expect(formatMonth('2026-09-14', CJK_MONTHS)).toBe('2026年9月')
    expect(formatMonth('2026', CJK_MONTHS)).toBe('2026')
    expect(dayText(new Date(2026, 10, 6), CJK_MONTHS, false)).toBe('11月6日')
    expect(shortDay(new Date(2025, 2, 1, 12).toISOString(), CJK_MONTHS, new Date(2026, 0, 1))).toBe('2025年3月1日')
    expect(stampDate(new Date(2026, 10, 14), { months: CJK_MONTHS })).toBe('2026年11月14日')
  })
  it('leave every other language as it was', () => {
    expect(formatMonth('2026-09', EN_UI.date.months)).toBe('Sep 2026')
    expect(shortDay(new Date(2026, 10, 6, 12).toISOString(), EN_UI.date.months, new Date(2026, 0, 1))).toBe('6 Nov')
    expect(stampDate(new Date(2026, 10, 14))).toBe('14 Nov 2026')
  })
})

describe('ogLang', () => {
  it("marks a Japanese or Chinese card so next/og's borrowed font has the right letter forms", () => {
    expect(ogLang('ja')).toBe('ja-JP')
    expect(ogLang('zh-Hans')).toBe('zh-CN')
    expect(ogLang('zh-Hant')).toBe('zh-TW')
    expect(ogLang('ru')).toBeUndefined()
    expect(ogLang('en')).toBeUndefined()
  })
})
