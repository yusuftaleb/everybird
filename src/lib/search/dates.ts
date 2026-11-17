import { searchKey } from '../species/name-search'
import type { SearchLang } from './groups'

/** Month precision only; bounds are inclusive, matching Everybird's timeline. */
export type Period = { from?: string; to?: string; n: number; invalid?: boolean }
export type SearchWord = { key: string; raw: string; start: number; end: number; quoted: boolean }
const words = (s: string) => s.split('|').map(searchKey)
const DICT = {
  en: { link: 'to|through|thru|until|till', between: 'between', and: 'and', from: 'from', since: 'since', after: 'after', before: 'before', until: 'until', this: 'this', last: 'last|past', year: 'year|years', month: 'month|months', quarter: 'quarter|quarters' },
  es: { link: 'a|hasta', between: 'entre', and: 'y', from: 'de|desde', since: 'desde', after: 'después de', before: 'antes de', until: 'hasta', this: 'este|esta', last: 'último|últimos|última|últimas|pasado', year: 'año|años', month: 'mes|meses', quarter: 'trimestre|trimestres' },
  pt: { link: 'a|até', between: 'entre', and: 'e', from: 'de|desde', since: 'desde', after: 'depois de|após', before: 'antes de', until: 'até', this: 'este|esta', last: 'último|últimos|última|últimas|passado', year: 'ano|anos', month: 'mês|meses', quarter: 'trimestre|trimestres' },
  nl: { link: 'tot|tot en met', between: 'tussen', and: 'en', from: 'van|vanaf', since: 'sinds|vanaf', after: 'na', before: 'voor', until: 'tot', this: 'dit|deze', last: 'laatste|vorige|vorig|afgelopen', year: 'jaar|jaren', month: 'maand|maanden', quarter: 'kwartaal|kwartalen' },
  // Polish declines: "w tym roku", "w zeszłym roku", "ostatnie 3 miesiące", "od marca do maja".
  pl: { link: 'do', between: 'między|pomiędzy', and: 'i', from: 'od', since: 'od', after: 'po', before: 'przed', until: 'do', this: 'ten|ta|tym|tej|bieżący|bieżącym', last: 'ostatni|ostatnia|ostatnie|ostatnich|ostatnim|zeszły|zeszłym|ubiegły|ubiegłym|poprzedni|poprzednim', year: 'rok|roku|lata|lat', month: 'miesiąc|miesiąca|miesiącu|miesiące|miesięcy', quarter: 'kwartał|kwartału|kwartale|kwartały|kwartałów' },
} as const
export const SEARCH_CONNECTORS: Record<SearchLang, string[]> = {
  en: ['in', 'on', 'at', 'from', 'and'], es: ['en', 'de', 'desde', 'y'], pt: ['em', 'no', 'na', 'de', 'do', 'da', 'e'], nl: ['in', 'uit', 'van', 'en'],
  pl: ['w', 'we', 'z', 'ze', 'na', 'i'],
}
/** Spellings Intl's long month names don't cover (abbreviations and variants that aren't prefixes of them). Polish
 *  months after "od", "do" or a day are genitive ("od marca"), which Intl's standalone names ("marzec") don't cover. */
const MONTH_ALIASES: Partial<Record<SearchLang, [string, number][]>> = {
  es: [['setiembre', 8]],
  nl: [['mrt', 2]],
  pl: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'].map((m, i): [string, number] => [m, i]),
}
const monthCache = new Map<SearchLang, Map<string, number>>()
/** Month names for the UI language and English, keyed by searchKey, plus MONTH_ALIASES; the value is 0-based. */
export function monthIndex(lang: SearchLang): Map<string, number> {
  let index = monthCache.get(lang)
  if (!index) {
    index = new Map()
    for (const locale of new Set<SearchLang>(['en', lang])) {
      const fmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
      for (let m = 0; m < 12; m++) index.set(searchKey(fmt.format(new Date(Date.UTC(2020, m, 1)))), m)
    }
    for (const [name, m] of MONTH_ALIASES[lang] ?? []) index.set(searchKey(name), m)
    monthCache.set(lang, index)
  }
  return index
}
/**
 * The month a word names: a unique prefix of a month name. Three letters count only where `short` allows (a year
 * follows, or the word ends a range), so "mar" in "aves del mar" (the sea) is not March, and "mar 2020" is.
 */
export function monthOfWord(index: Map<string, number>, s: string, short: boolean): number | undefined {
  if (s.length < 3 || (s.length === 3 && !short)) return undefined
  const hits = new Set([...index].filter(([name]) => name.startsWith(s)).map(([, m]) => m))
  return hits.size === 1 ? [...hits][0] : undefined
}

const month = (y: number, m: number) => {
  const at = new Date(Date.UTC(y, m, 1))
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`
}
const year = (s?: string) => !!s && /^(19|20)\d{2}$/.test(s)
/**
 * "ago" words by UI language: English and Dutch put it after the number ("2 years ago", "2 jaar geleden"), Spanish and
 * Portuguese before it ("hace 2 años", "há 2 anos"; searchKey drops the accent, so "ha" is "há").
 */
const AGO: Record<SearchLang, { before: string[]; after: string[] }> = {
  en: { before: [], after: ['ago'] },
  es: { before: ['hace'], after: [] },
  pt: { before: ['ha'], after: [] },
  nl: { before: [], after: ['geleden'] },
  pl: { before: [], after: ['temu'] },
}
/** Number words up to twelve in every language, keyed by searchKey; "a", "un", "um" and "een" count as one. */
const NUMBER_WORDS = new Map<string, number>(
  ([
    [1, 'one a an uno una un um uma een jeden jedna'], [2, 'two dos dois duas twee dwa dwie'], [3, 'three tres drie trzy'],
    [4, 'four cuatro quatro vier cztery'], [5, 'five cinco vijf piec'], [6, 'six seis zes szesc'],
    [7, 'seven siete sete zeven siedem'], [8, 'eight ocho oito acht osiem'], [9, 'nine nueve nove negen dziewiec'],
    [10, 'ten diez dez tien dziesiec'], [11, 'eleven once onze elf jedenascie'], [12, 'twelve doce doze twaalf dwanascie'],
  ] as [number, string][]).flatMap(([count, words]) => words.split(' ').map((w): [string, number] => [w, count])),
)

/** Date vocabulary and Intl month names are prepared once per parse; never reads the clock. */
export function dateParser(today: Date, lang: SearchLang) {
  const y = today.getFullYear(), mo = today.getMonth()
  const now = month(y, mo)
  const months = monthIndex(lang)
  type Point = { y: number; m: number; end: number; explicit: boolean; n: number }
  return (tokens: readonly SearchWord[], i: number): Period | undefined => {
    const keys = tokens.map((t) => t.quoted ? '' : t.key)
    const raw = tokens.map((t) => t.quoted ? '' : t.raw.toLowerCase())
    const is = (key: keyof typeof DICT.en, at: number): number => {
      for (const locale of new Set([lang, 'en'] as const)) {
        for (const phrase of words(DICT[locale][key]).sort((a, b) => b.length - a.length)) {
          const seq = phrase.split(' ')
          if (seq.every((s, j) => keys[at + j] === s)) return seq.length
        }
      }
      return 0
    }
    // inRange: the point is an end of a range, where a three-letter month is allowed without a year.
    const point = (at: number, inRange: boolean): Point | undefined => {
      const iso = /^(19\d{2}|20\d{2})-(0[1-9]|1[0-2])(?:-(\d{2}))?$/.exec(raw[at] ?? '')
      if (iso) {
        const yr = Number(iso[1]), m = Number(iso[2]) - 1
        if (iso[3] && (Number(iso[3]) < 1 || Number(iso[3]) > new Date(Date.UTC(yr, m + 1, 0)).getUTCDate())) return undefined
        return { y: yr, m, end: m, explicit: true, n: 1 }
      }
      const word = keys[at] ?? ''
      const m = monthOfWord(months, word, true)
      if (m !== undefined) {
        // Spanish/Portuguese "octubre de 2026" as well as "oct 2026".
        const de = (lang === 'es' || lang === 'pt') && keys[at + 1] === 'de' ? 1 : 0
        const explicit = year(keys[at + 1 + de])
        if (word.length === 3 && !explicit && !inRange) return undefined
        return { y: explicit ? Number(keys[at + 1 + de]) : y, m, end: m, explicit, n: explicit ? 2 + de : 1 }
      }
      if (year(keys[at])) return { y: Number(keys[at]), m: 0, end: 11, explicit: true, n: 1 }
    }
    // "N years ago" and "N months ago" (1 to 12, digits or words) name that whole calendar year or the single month.
    const agoWord = (side: 'before' | 'after', at: number): boolean => {
      const k = keys[at] ?? ''
      const locales: SearchLang[] = [lang, 'en']
      return !!k && locales.some((l) => AGO[l][side].includes(k))
    }
    const agoAt = (at: number): Period | undefined => {
      const before = agoWord('before', at)
      const numAt = before ? at + 1 : at
      const k = keys[numAt] ?? ''
      const num = /^\d+$/.test(k) ? Number(k) : NUMBER_WORDS.get(k)
      if (num === undefined || num < 1 || num > 12) return undefined
      const unitAt = numAt + 1
      const yearLen = is('year', unitAt), unitLen = yearLen || is('month', unitAt)
      if (!unitLen) return undefined
      const end = unitAt + unitLen
      if (!before && !agoWord('after', end)) return undefined
      const count = end - at + (before ? 0 : 1)
      if (yearLen) return { from: month(y - num, 0), to: month(y - num, 11), n: count }
      return { from: month(y, mo - num), to: month(y, mo - num), n: count }
    }
    const ago = agoAt(i)
    if (ago) return ago
    const lead = is('from', i) || is('between', i)
    const a = point(i + lead, true)
    if (a) {
      const edge = i + lead + a.n
      const link = /^[-–—/]$/.test(raw[edge] ?? '') ? 1 : is('link', edge) || (is('between', i) ? is('and', edge) : 0)
      const b = link ? point(edge + link, true) : undefined
      if (b) {
        // An explicit end year anchors an implicit start; an explicit start anchors an implicit end.
        if (!b.explicit) b.y = a.explicit ? a.y + (b.end < a.m ? 1 : 0) : y - (b.end > mo ? 1 : 0)
        if (!a.explicit) a.y = b.y - (a.m > b.end ? 1 : 0)
        const from = month(a.y, a.m), to = month(b.y, b.end)
        if (from <= to) return { from, to, n: lead + a.n + link + b.n }
        return { n: lead + a.n + link + b.n, invalid: true }
      }
    }
    // An English "from X" with no end is "since X" (Spanish and Dutch "de"/"van" are not, they link words).
    const since = keys[i] === 'from' ? point(i + 1, false) : undefined
    if (since) {
      if (!since.explicit && since.m > mo) since.y--
      const from = month(since.y, since.m)
      if (from > now) return undefined
      return { from, to: now, n: 1 + since.n }
    }
    for (const kind of ['since', 'after', 'before', 'until'] as const) {
      const n = is(kind, i)
      const p = n ? point(i + n, false) : undefined
      if (!p) continue
      if (!p.explicit && p.m > mo) p.y--
      if (kind === 'since' || kind === 'after') {
        const from = month(p.y, kind === 'after' ? p.end + 1 : p.m)
        if (from > now) return undefined
        return { from, to: now, n: n + p.n }
      }
      return { to: month(p.y, kind === 'before' ? p.m - 1 : p.end), n: n + p.n }
    }
    if ((lang === 'es' || lang === 'pt') && is('year', i) && is('last', i + 1)) {
      return { from: month(y - 1, 0), to: month(y - 1, 11), n: 2 }
    }
    if ((lang === 'es' || lang === 'pt') && is('month', i) && is('last', i + 1)) {
      return { from: month(y, mo - 1), to: month(y, mo - 1), n: 2 }
    }
    const back = is('last', i), current = is('this', i)
    if (back || current) {
      const start = i + (back || current)
      const count = /^\d+$/.test(keys[start] ?? '') ? Number(keys[start]) : undefined
      const unitAt = start + (count === undefined ? 0 : 1)
      const unit = is('year', unitAt) ? 'year' : is('month', unitAt) ? 'month' : is('quarter', unitAt) ? 'quarter' : undefined
      if (unit && count === undefined) {
        if (unit === 'year') return { from: month(y - (back ? 1 : 0), 0), to: month(y - (back ? 1 : 0), 11), n: unitAt - i + 1 }
        const width = unit === 'quarter' ? 3 : 1
        const first = Math.floor(mo / width) * width - (back ? width : 0)
        return { from: month(y, first), to: month(y, first + width - 1), n: unitAt - i + 1 }
      }
      if (back && unit && count && count <= 1200) {
        const width = unit === 'year' ? 12 : unit === 'quarter' ? 3 : 1
        // Whole calendar months, including the current one: last 3 months in November = Sep..Nov.
        return { from: month(y, mo - count * width + 1), to: now, n: unitAt - i + 1 }
      }
    }
    const q = /^q([1-4])$/.exec(keys[i] ?? '')
    if (q) {
      const yr = year(keys[i + 1]) ? Number(keys[i + 1]) : y
      const first = (Number(q[1]) - 1) * 3
      return { from: month(yr, first), to: month(yr, first + 2), n: year(keys[i + 1]) ? 2 : 1 }
    }
    // Reversed explicit spans remain text as a whole rather than turning into two unrelated dates.
    const p = point(i, false)
    if (!p) return undefined
    if (!p.explicit && p.m > mo) p.y--
    return { from: month(p.y, p.m), to: month(p.y, p.end), n: p.n }
  }
}
