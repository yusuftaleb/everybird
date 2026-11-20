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
  // French elides before a vowel, and searchKey drops the apostrophe: "l'année" is "lannee", "jusqu'à" "jusqua".
  fr: { link: 'à|au|jusqu’à|jusqu’au|jusqu’en', between: 'entre', and: 'et', from: 'de|du|depuis', since: 'depuis', after: 'après', before: 'avant', until: 'jusqu’à|jusqu’au|jusqu’en', this: 'ce|cet|cette', last: 'dernier|dernière|derniers|dernières|passé|passée', year: 'an|ans|année|années|l’an|l’année', month: 'mois', quarter: 'trimestre|trimestres' },
  de: { link: 'bis', between: 'zwischen', and: 'und', from: 'von|ab', since: 'seit|ab', after: 'nach', before: 'vor', until: 'bis', this: 'dieses|diesen|diesem|dieser|diese', last: 'letzte|letzten|letztes|letzter|letztem|vergangene|vergangenen|vergangenes|vorige|vorigen|voriges', year: 'jahr|jahre|jahren|jahres', month: 'monat|monate|monaten|monats', quarter: 'quartal|quartale|quartalen|quartals' },
  // Italian elides too: searchKey reads "dall'aprile" as "dallaprile", "l'anno" as "lanno".
  it: { link: 'a|al|fino a|fino al', between: 'tra|fra', and: 'e', from: 'da|dal|dalla', since: 'da|dal|dalla|dall’', after: 'dopo', before: 'prima di|prima del|prima', until: 'fino a|fino al', this: 'questo|questa', last: 'ultimo|ultima|ultimi|ultime|scorso|scorsa|passato|passata', year: 'anno|anni|l’anno', month: 'mese|mesi', quarter: 'trimestre|trimestri' },
  // "i år" is this year: "i" counts as "this" only before a year or month.
  sv: { link: 'till|fram till', between: 'mellan', and: 'och', from: 'från', since: 'sedan|från', after: 'efter', before: 'före|innan', until: 'till|fram till', this: 'i|detta|denna|den här|det här', last: 'förra|senaste|de senaste|sista', year: 'år|året|åren', month: 'månad|månaden|månader|månaderna', quarter: 'kvartal|kvartalet|kvartalen' },
  // "i år" is this year, as in Swedish.
  da: { link: 'til|frem til', between: 'mellem', and: 'og', from: 'fra', since: 'siden|fra', after: 'efter', before: 'før|inden', until: 'til|indtil', this: 'i|denne|dette', last: 'sidste|de sidste|forrige', year: 'år|året|årene', month: 'måned|måneden|måneder|månederne', quarter: 'kvartal|kvartalet|kvartaler' },
  // Russian declines: "в этом году", "в прошлом году", "последние 3 месяца", "с марта по май", "между мартом и маем".
  // "до" is "before" ("до 2024": up to Dec 2023) on its own, and links a range ("с марта до мая").
  ru: { link: 'по|до', between: 'между', and: 'и', from: 'с|со|от', since: 'с|со|начиная с', after: 'после', before: 'до|раньше', until: 'по|вплоть до', this: 'этот|этом|этого|эта|этой|это|текущий|текущем|текущего|нынешний|нынешнем', last: 'прошлый|прошлом|прошлого|прошлая|прошлой|последний|последнем|последнего|последние|последних|минувший|минувшем|предыдущий|предыдущем', year: 'год|года|году|годом|годы|годов|лет', month: 'месяц|месяца|месяце|месяцем|месяцы|месяцев', quarter: 'квартал|квартала|квартале|кварталы|кварталов' },
  // Japanese is written on spaces here ("3月 から 5月"); since, after, before and until follow the date ("2024年 から",
  // POSTFIX). Kana are folded to katakana by searchKey on both sides.
  ja: { link: 'から', between: '間', and: 'と', from: 'から', since: '以降|から', after: '以降', before: '以前|より前', until: 'まで', this: 'この|今', last: '過去|直近|最近', year: '年|年間', month: 'か月|ヶ月|カ月|ヵ月|箇月', quarter: '四半期' },
  // Chinese is written on spaces here ("从 3月 到 5月", "最近 3 个月", "2 年 前"); since, after, before and until may
  // also follow the date ("2020年 以来", "2024年 以前", POSTFIX).
  'zh-Hans': { link: '到|至|直到', between: '介于|在', and: '和|与|到|至', from: '从|自', since: '自|自从|从|以来', after: '晚于|以后|之后', before: '早于|以前|之前', until: '截至|直到|到', this: '本|这|这个|今', last: '最近|过去|上|上个|去', year: '年', month: '月|个月', quarter: '季度|个季度' },
} as const
export const SEARCH_CONNECTORS: Record<SearchLang, string[]> = {
  en: ['in', 'on', 'at', 'from', 'and'], es: ['en', 'de', 'desde', 'y'], pt: ['em', 'no', 'na', 'de', 'do', 'da', 'e'], nl: ['in', 'uit', 'van', 'en'],
  pl: ['w', 'we', 'z', 'ze', 'na', 'i'],
  fr: ['en', 'au', 'aux', 'dans', 'de', 'du', 'des', 'le', 'la', 'les', 'et'],
  de: ['in', 'im', 'aus', 'vom', 'die', 'der', 'das', 'den', 'und'],
  it: ['in', 'a', 'al', 'nel', 'nella', 'di', 'del', 'della', 'dal', 'il', 'lo', 'gli', 'e'],
  // "för" opens "för 2 år sedan" (2 years ago).
  sv: ['i', 'på', 'från', 'och', 'för'],
  // "for" opens "for 2 år siden" (2 years ago).
  da: ['i', 'på', 'fra', 'og', 'for'],
  // "за" opens "за последние 3 месяца"; "в"/"во" "в этом году", "в Канаде".
  ru: ['в', 'во', 'на', 'из', 'за', 'и'],
  ja: ['の', 'で', 'に', 'と'],
  'zh-Hans': ['在', '于', '的', '和'],
}
/** Spellings Intl's long month names don't cover (abbreviations and variants that aren't prefixes of them). Polish
 *  months after "od", "do" or a day are genitive ("od marca"), which Intl's standalone names ("marzec") don't cover. */
const MONTH_ALIASES: Partial<Record<SearchLang, [string, number][]>> = {
  es: [['setiembre', 8]],
  nl: [['mrt', 2]],
  pl: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'].map((m, i): [string, number] => [m, i]),
  // "d'avril", "d'août", "d'octobre" (the elided "de").
  fr: [['d’avril', 3], ['d’août', 7], ['d’octobre', 9]],
  // "Maerz" for März without the umlaut, Austrian "Jänner".
  de: [['maerz', 2], ['jänner', 0]],
  // Russian months after "с", "до" or a day are genitive ("с марта"), after "в" prepositional ("в марте"), after "между"
  // instrumental ("между мартом и маем"); Intl's long months are the nominative ("март").
  ru: [
    ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
    ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'],
    ['январём', 'февралём', 'мартом', 'апрелем', 'маем', 'июнем', 'июлем', 'августом', 'сентябрём', 'октябрём', 'ноябрём', 'декабрём'],
  ].flatMap((forms) => forms.map((m, i): [string, number] => [m, i])),
}
const monthCache = new Map<SearchLang, Map<string, number>>()
/** Month names for the UI language and English, keyed by searchKey, plus MONTH_ALIASES and "1月" … "12月"; the value is 0-based. */
export function monthIndex(lang: SearchLang): Map<string, number> {
  let index = monthCache.get(lang)
  if (!index) {
    index = new Map()
    for (const locale of new Set<SearchLang>(['en', lang])) {
      const fmt = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' })
      for (let m = 0; m < 12; m++) index.set(searchKey(fmt.format(new Date(Date.UTC(2020, m, 1)))), m)
    }
    for (const [name, m] of MONTH_ALIASES[lang] ?? []) index.set(searchKey(name), m)
    // "3月", as Japanese and Chinese write a month (Intl's Chinese name is "三月").
    for (let m = 0; m < 12; m++) index.set(`${m + 1}月`, m)
    monthCache.set(lang, index)
  }
  return index
}
/**
 * The month a word names: a unique prefix of a month name. Three letters count only where `short` allows (a year
 * follows, or the word ends a range), so "mar" in "aves del mar" (the sea) is not March, and "mar 2020" is.
 */
export function monthOfWord(index: Map<string, number>, s: string, short: boolean): number | undefined {
  // A Japanese or Chinese month ("3月", "三月") is two or three characters and only ever its exact name.
  if (s.endsWith('月')) return index.get(s)
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
  fr: { before: ['il y a'], after: [] },
  // "vor 2 Jahren"; "vor 2024" (before) is read when no count of 1 to 12 follows.
  de: { before: ['vor'], after: [] },
  it: { before: [], after: ['fa'] },
  sv: { before: [], after: ['sedan'] },
  da: { before: [], after: ['siden'] },
  ru: { before: [], after: ['назад', 'тому назад'] },
  // "2 年 前", "3 か月 前".
  ja: { before: [], after: ['前'] },
  // "2 年 前", "3 个月 前", "两 年 以前".
  'zh-Hans': { before: [], after: ['前', '以前', '之前'] },
}
/** Number words up to twelve in every language, keyed by searchKey; "a", "un", "um" and "een" count as one. */
const NUMBER_WORDS = new Map<string, number>(
  ([
    [1, 'one a an uno una un um uma een jeden jedna une ein einem einen einer ett en et один одна одно одну 一 一'], [2, 'two dos dois duas twee dwa dwie deux zwei due tva to два две 二 二 两'], [3, 'three tres drie trzy trois drei tre три 三 三'],
    [4, 'four cuatro quatro vier cztery quattro fyra fire четыре 四 四'], [5, 'five cinco vijf piec cinq funf cinque fem пять 五 五'], [6, 'six seis zes szesc sechs sei sex seks шесть 六 六'],
    [7, 'seven siete sete zeven siedem sept sieben sette sju syv семь 七 七'], [8, 'eight ocho oito acht osiem huit otto atta otte восемь 八 八'], [9, 'nine nueve nove negen dziewiec neuf neun nio ni девять 九 九'],
    [10, 'ten diez dez tien dziesiec dix zehn dieci tio ti десять 十 十'], [11, 'eleven once onze elf jedenascie undici elva elleve одиннадцать 十一 十一'], [12, 'twelve doce doze twaalf dwanascie douze zwolf dodici tolv двенадцать 十二 十二'],
  ] as [number, string][]).flatMap(([count, words]) => words.split(' ').map((w): [string, number] => [w, count])),
)

/** One-word periods (Japanese and Chinese write them unspaced, "今年"): this or last year or month, keyed by searchKey. */
type PeriodWord = 'thisYear' | 'lastYear' | 'thisMonth' | 'lastMonth'
const PERIOD_WORDS: Partial<Record<string, Record<string, PeriodWord>>> = {
  ja: { 今年: 'thisYear', 去年: 'lastYear', 昨年: 'lastYear', 今月: 'thisMonth', 先月: 'lastMonth' },
  'zh-Hans': { 今年: 'thisYear', 去年: 'lastYear', 本月: 'thisMonth', 这个月: 'thisMonth', 上个月: 'lastMonth', 上月: 'lastMonth' },
}
/** Languages that put since, after, before and until after the date ("2024年 から", "2020年 以来"). */
const POSTFIX = new Set<string>(['ja', 'zh-Hans'])

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
    // The word's length in tokens ("il y a" is three), 0 when none is there.
    const agoWord = (side: 'before' | 'after', at: number): number => {
      for (const l of new Set<SearchLang>([lang, 'en'])) {
        for (const phrase of AGO[l][side]) {
          const seq = phrase.split(' ')
          if (seq.every((s, j) => keys[at + j] === s)) return seq.length
        }
      }
      return 0
    }
    const agoAt = (at: number): Period | undefined => {
      const before = agoWord('before', at)
      const numAt = at + before
      const k = keys[numAt] ?? ''
      const num = /^\d+$/.test(k) ? Number(k) : NUMBER_WORDS.get(k)
      if (num === undefined || num < 1 || num > 12) return undefined
      const unitAt = numAt + 1
      const yearLen = is('year', unitAt), unitLen = yearLen || is('month', unitAt)
      if (!unitLen) return undefined
      const end = unitAt + unitLen
      const after = before ? 0 : agoWord('after', end)
      if (!before && !after) return undefined
      const count = end - at + after
      if (yearLen) return { from: month(y - num, 0), to: month(y - num, 11), n: count }
      return { from: month(y, mo - num), to: month(y, mo - num), n: count }
    }
    const ago = agoAt(i)
    if (ago) return ago
    const word = PERIOD_WORDS[lang]?.[keys[i] ?? '']
    if (word) {
      const at = word.endsWith('Year') ? y - (word === 'lastYear' ? 1 : 0) : y, m = mo - (word === 'lastMonth' ? 1 : 0)
      return word.endsWith('Year') ? { from: month(at, 0), to: month(at, 11), n: 1 } : { from: month(at, m), to: month(at, m), n: 1 }
    }
    const lead = is('from', i) || is('between', i)
    const a = point(i + lead, true)
    if (a) {
      const edge = i + lead + a.n
      const link = /^[-–—/〜～]$/.test(raw[edge] ?? '') ? 1 : is('link', edge) || (is('between', i) ? is('and', edge) : 0)
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
    // A date with since, after, before or until: before it ("since 2020"), or after it in POSTFIX languages.
    const post = POSTFIX.has(lang) ? point(i, false) : undefined
    for (const kind of ['since', 'after', 'before', 'until'] as const) {
      const n = post ? is(kind, i + post.n) : is(kind, i)
      const p = post ? (n ? { ...post } : undefined) : n ? point(i + n, false) : undefined
      if (!p) continue
      if (!p.explicit && p.m > mo) p.y--
      if (kind === 'since' || kind === 'after') {
        const from = month(p.y, kind === 'after' ? p.end + 1 : p.m)
        if (from > now) return undefined
        return { from, to: now, n: n + p.n }
      }
      return { to: month(p.y, kind === 'before' ? p.m - 1 : p.end), n: n + p.n }
    }
    // The noun before "last": "año pasado", "mês passado", "l'année dernière", "le mois dernier", "anno scorso".
    const nounFirst = lang === 'es' || lang === 'pt' || lang === 'fr' || lang === 'it'
    const yearLen = nounFirst ? is('year', i) : 0
    if (yearLen && is('last', i + yearLen)) {
      return { from: month(y - 1, 0), to: month(y - 1, 11), n: yearLen + is('last', i + yearLen) }
    }
    if (nounFirst && is('month', i) && is('last', i + 1)) {
      return { from: month(y, mo - 1), to: month(y, mo - 1), n: 2 }
    }
    // French puts the count first: "les 3 derniers mois" (the leading "les" is a connector the chip takes).
    if (lang === 'fr' && /^\d+$/.test(keys[i] ?? '') && is('last', i + 1)) {
      const count = Number(keys[i]), unitAt = i + 1 + is('last', i + 1)
      const unit = is('year', unitAt) ? 12 : is('quarter', unitAt) ? 3 : is('month', unitAt) ? 1 : 0
      if (unit && count >= 1 && count <= 1200) return { from: month(y, mo - count * unit + 1), to: now, n: unitAt - i + 1 }
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
