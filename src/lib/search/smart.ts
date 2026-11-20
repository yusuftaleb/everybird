// Port of Nest Ledger's deterministic tokenizer/used-word parser, with Everybird's month precision and entities.
import type { Filter } from '../list/filters'
import { parentKey, parsePlaceKey, placeName } from '../list/place-keys'
import { countryNameMap, sub1Names, SUB1_ALIASES, OBSORG_SUB1_ALIASES } from '../places/names'
import { hasSourcePlaceKey } from '../places/registry'
import { IMPORT_REGION_ALIASES } from '../places/region-mapping'
import { searchKey } from '../species/name-search'
import { foldName } from '../species/resolve'
import { ORDERS } from '../species/orders'
import type { Regions, SpeciesRow } from '../species/types'
import synonyms from '../../../data/i18n/group-synonyms.json'
import { dateParser, monthIndex, monthOfWord, SEARCH_CONNECTORS, type SearchWord } from './dates'
import { groupName, type BirdGroup, type SearchLang } from './groups'

export type SearchStatus = 'LC' | 'NT' | 'VU' | 'EN' | 'CR' | 'EW' | 'EX' | 'DD' | 'NE'
/** Contract for part B, types only: current filtering still ignores these fields. */
export type SmartFilterFields = { group?: string; basis?: 'lifer' | 'seen'; statuses?: SearchStatus[] }
export type SmartFilter = Partial<Filter & SmartFilterFields>
export type Chip = {
  kind: 'date' | 'place' | 'group' | 'order' | 'family' | 'status' | 'basis'
  label: string
  token: string
  /** Exact source span, so accents, punctuation, repeated words and quoted text survive removal. */
  start: number
  end: number
}
export type SearchContext = {
  today: Date
  lang: SearchLang
  groups: readonly BirdGroup[]
  regions: Regions
  /** Place keys (c:CA, s:CA-BC, k:CA-BC|Capital), with or without their ancestors. */
  listPlaces: readonly string[]
  /** Localized IUCN labels from item 3. Built-in words and English remain available. */
  statuses?: readonly { code: SearchStatus; name: string; aliases?: readonly string[] }[]
  /** Optional on-list taxonomy supplies family names, as searchCollage does. */
  species?: readonly Pick<SpeciesRow, 'ord' | 'fam' | 'famCom'>[]
  orderNames?: Readonly<Record<string, string>>
  familyNames?: Readonly<Record<string, string>>
}

type Entity = { value: string; name: string; aliases: string[]; exactOnly?: boolean; codes?: string[] }
const GENERIC = new Set(['bird', 'birds', 'and', 'of', 'the', 'aves', 'vogel', 'vogels', 'oiseau', 'oiseaux', 'uccello', 'uccelli', 'fagel', 'faglar', 'fugl', 'fugle', 'птица', 'птицы', 'птиц', '鳥', '野鳥', '鳥類', '鸟', '鸟类', '鳥', '鳥兒', '鳥種'])
/** Words dropped from a phrase before group and taxon names are matched word by word ("aves de garzas" is "aves garzas"). */
const CONNECTOR_WORDS = new Set(['de', 'del', 'do', 'da', 'dos', 'das', 'la', 'el', 'los', 'las', 'of', 'the', 'van', 'der', 'het', 'du', 'des', 'le', 'les', 'die', 'das', 'den', 'dem', 'di', 'dei', 'degli', 'delle', 'della', 'il', 'gli', 'ノ', '的', '之'])
/** A province code typed as capitals ("BC", "ON"); lowercase "or", "no" and "al" are words, never codes. */
const isCodeWord = (raw: string) => /^\p{Lu}{2,}$/u.test(raw)
/** Words that join the parts of a group's name ('Ducks, Geese, and Waterfowl') and may be left out of a query. */
const GROUP_JOINERS = new Set(['and', 'y', 'e', 'et', 'und', 'och', 'og', 'и', 'ト', '和', '与', '與', '及'])
const singular = (s: string) => s.split(' ').map((w) => w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w).join(' ')
const unique = <T,>(xs: Iterable<T>) => [...new Set(xs)]
const STATUS_WORDS: Record<SearchLang, Record<string, SearchStatus[]>> = {
  en: { threatened: ['VU', 'EN', 'CR'], vulnerable: ['VU'], endangered: ['EN'], 'critically endangered': ['CR'], 'near threatened': ['NT'], 'least concern': ['LC'], extinct: ['EX'], 'extinct in the wild': ['EW'], 'data deficient': ['DD'], 'not evaluated': ['NE'] },
  es: { amenazadas: ['VU', 'EN', 'CR'], amenazados: ['VU', 'EN', 'CR'], amenazada: ['VU', 'EN', 'CR'], vulnerable: ['VU'], vulnerables: ['VU'], 'en peligro': ['EN'], 'en peligro de extinción': ['EN'], 'en peligro crítico': ['CR'], 'casi amenazadas': ['NT'], 'preocupación menor': ['LC'], extintas: ['EX'], 'extinta en estado silvestre': ['EW'], 'datos insuficientes': ['DD'], 'no evaluada': ['NE'] },
  pt: { ameaçadas: ['VU', 'EN', 'CR'], ameaçados: ['VU', 'EN', 'CR'], ameaçada: ['VU', 'EN', 'CR'], vulnerável: ['VU'], vulneráveis: ['VU'], 'em perigo': ['EN'], 'criticamente em perigo': ['CR'], 'quase ameaçada': ['NT'], 'pouco preocupante': ['LC'], extintas: ['EX'], 'extinta na natureza': ['EW'], 'dados insuficientes': ['DD'], 'não avaliada': ['NE'] },
  nl: { bedreigd: ['VU', 'EN', 'CR'], kwetsbaar: ['VU'], 'sterk bedreigd': ['EN'], 'ernstig bedreigd': ['CR'], 'gevoelig': ['NT'], 'niet bedreigd': ['LC'], uitgestorven: ['EX'], 'uitgestorven in het wild': ['EW'], 'onvoldoende gegevens': ['DD'], 'niet geëvalueerd': ['NE'] },
  // Plural "zagrożone" is the three threatened categories; singular "zagrożony" is Endangered, the IUCN name.
  pl: { zagrożone: ['VU', 'EN', 'CR'], zagrożonych: ['VU', 'EN', 'CR'], zagrożony: ['EN'], zagrożona: ['EN'], narażony: ['VU'], narażone: ['VU'], narażonych: ['VU'], 'krytycznie zagrożony': ['CR'], 'krytycznie zagrożone': ['CR'], 'bliski zagrożenia': ['NT'], 'bliskie zagrożenia': ['NT'], 'najmniejszej troski': ['LC'], wymarły: ['EX'], wymarłe: ['EX'], 'wymarły na wolności': ['EW'], 'wymarłe na wolności': ['EW'], 'brak danych': ['DD'], nieoceniony: ['NE'], nieocenione: ['NE'] },
  fr: { menacées: ['VU', 'EN', 'CR'], menacés: ['VU', 'EN', 'CR'], menacée: ['VU', 'EN', 'CR'], menacé: ['VU', 'EN', 'CR'], vulnérable: ['VU'], vulnérables: ['VU'], 'en danger': ['EN'], 'en danger critique': ['CR'], 'quasi menacée': ['NT'], 'quasi menacées': ['NT'], 'préoccupation mineure': ['LC'], éteinte: ['EX'], éteintes: ['EX'], 'éteinte à l’état sauvage': ['EW'], 'données insuffisantes': ['DD'], 'non évaluée': ['NE'], 'non évaluées': ['NE'] },
  // "bedroht" and the plural "gefährdete (Arten)" are the three threatened categories; "gefährdet" alone is Vulnerable, the IUCN name.
  de: { bedroht: ['VU', 'EN', 'CR'], bedrohte: ['VU', 'EN', 'CR'], bedrohten: ['VU', 'EN', 'CR'], gefährdete: ['VU', 'EN', 'CR'], gefährdeten: ['VU', 'EN', 'CR'], gefährdet: ['VU'], 'stark gefährdet': ['EN'], 'vom aussterben bedroht': ['CR'], 'potenziell gefährdet': ['NT'], 'nicht gefährdet': ['LC'], ausgestorben: ['EX'], 'in der natur ausgestorben': ['EW'], 'ungenügende datengrundlage': ['DD'], 'nicht beurteilt': ['NE'] },
  // "minacciate" (and its other genders) is the three threatened categories, as in IUCN's Italian "specie minacciate".
  it: { minacciate: ['VU', 'EN', 'CR'], minacciata: ['VU', 'EN', 'CR'], minacciati: ['VU', 'EN', 'CR'], minacciato: ['VU', 'EN', 'CR'], vulnerabile: ['VU'], vulnerabili: ['VU'], 'in pericolo': ['EN'], 'in pericolo critico': ['CR'], 'quasi minacciata': ['NT'], 'quasi minacciate': ['NT'], 'minor preoccupazione': ['LC'], estinta: ['EX'], estinte: ['EX'], 'estinta in natura': ['EW'], 'carente di dati': ['DD'], 'non valutata': ['NE'], 'non valutate': ['NE'] },
  // "hotade" is the three threatened categories (the Swedish Red List's "hotade arter"); the categories by their Red List names.
  sv: { hotade: ['VU', 'EN', 'CR'], hotad: ['VU', 'EN', 'CR'], hotat: ['VU', 'EN', 'CR'], sårbar: ['VU'], sårbara: ['VU'], 'starkt hotad': ['EN'], 'starkt hotade': ['EN'], 'akut hotad': ['CR'], 'akut hotade': ['CR'], 'nära hotad': ['NT'], 'nära hotade': ['NT'], livskraftig: ['LC'], livskraftiga: ['LC'], utdöd: ['EX'], utdöda: ['EX'], 'utdöd i vilt tillstånd': ['EW'], kunskapsbrist: ['DD'], 'ej bedömd': ['NE'], 'ej bedömda': ['NE'] },
  // "truede" is the three threatened categories (the Danish Red List's "truede arter"); the categories by their Red List names.
  da: { truede: ['VU', 'EN', 'CR'], truet: ['VU', 'EN', 'CR'], sårbar: ['VU'], sårbare: ['VU'], 'moderat truet': ['EN'], 'moderat truede': ['EN'], 'kritisk truet': ['CR'], 'kritisk truede': ['CR'], 'næsten truet': ['NT'], 'næsten truede': ['NT'], 'ikke truet': ['LC'], 'ikke truede': ['LC'], uddød: ['EX'], uddøde: ['EX'], 'uddød i naturen': ['EW'], 'utilstrækkelige data': ['DD'], 'ikke vurderet': ['NE'] },
  // "под угрозой" and "угрожаемые" are the three threatened categories; the categories by IUCN's (МСОП) Russian names.
  ru: { 'под угрозой': ['VU', 'EN', 'CR'], угрожаемые: ['VU', 'EN', 'CR'], угрожаемых: ['VU', 'EN', 'CR'], уязвимые: ['VU'], уязвимый: ['VU'], уязвимых: ['VU'], вымирающие: ['EN'], вымирающий: ['EN'], вымирающих: ['EN'], 'на грани исчезновения': ['CR'], 'на грани полного исчезновения': ['CR'], 'в критическом состоянии': ['CR'], 'близкие к уязвимому положению': ['NT'], 'близкий к уязвимому положению': ['NT'], 'вызывающие наименьшие опасения': ['LC'], 'наименьшие опасения': ['LC'], исчезнувшие: ['EX'], исчезнувший: ['EX'], вымершие: ['EX'], вымерший: ['EX'], 'исчезнувшие в дикой природе': ['EW'], 'вымершие в дикой природе': ['EW'], 'недостаточно данных': ['DD'], 'не оценивались': ['NE'], 'не оценен': ['NE'], неоцененные: ['NE'] },
  // IUCN's Japanese category names (ui.iucn.names), the Ministry of the Environment's Red List names Japanese readers
  // know (絶滅危惧IA類 = CR, IB類 = EN, II類 = VU, 近絶滅種), and 絶滅危惧(種) for the three threatened.
  ja: { 絶滅危惧: ['VU', 'EN', 'CR'], 絶滅危惧種: ['VU', 'EN', 'CR'], 危急: ['VU'], 危急種: ['VU'], '絶滅危惧ii類': ['VU'], 危機: ['EN'], '絶滅危惧ib類': ['EN'], 深刻な危機: ['CR'], '絶滅危惧ia類': ['CR'], 近絶滅種: ['CR'], 準絶滅危惧: ['NT'], 低懸念: ['LC'], 軽度懸念: ['LC'], 絶滅: ['EX'], 野生絶滅: ['EW'], データ不足: ['DD'], 情報不足: ['DD'], 未評価: ['NE'] },
  // IUCN's Chinese category names; "受威胁" (and "受胁") is the three threatened categories.
  'zh-Hans': { 受威胁: ['VU', 'EN', 'CR'], 受胁: ['VU', 'EN', 'CR'], 受威胁物种: ['VU', 'EN', 'CR'], 易危: ['VU'], 濒危: ['EN'], 极危: ['CR'], 近危: ['NT'], 无危: ['LC'], 灭绝: ['EX'], 野外灭绝: ['EW'], 数据缺乏: ['DD'], 未评估: ['NE'], 未予评估: ['NE'] },
  // "受威脅" is the three threatened categories (IUCN's Chinese "受威脅物種"); the categories by their Chinese Red List
  // names, with Taiwan's TBN variants (接近受脅, 數據缺乏) beside the ones the UI shows.
  'zh-Hant': { 受威脅: ['VU', 'EN', 'CR'], 受脅: ['VU', 'EN', 'CR'], 受威脅物種: ['VU', 'EN', 'CR'], 易危: ['VU'], 瀕危: ['EN'], 極危: ['CR'], 極度瀕危: ['CR'], 近危: ['NT'], 接近受脅: ['NT'], 無危: ['LC'], 暫無危機: ['LC'], 滅絕: ['EX'], 絕種: ['EX'], 野外滅絕: ['EW'], 資料缺乏: ['DD'], 數據缺乏: ['DD'], 未評估: ['NE'], 未予評估: ['NE'] },
}
const LIFERS: Record<SearchLang, string[]> = {
  en: ['lifer', 'lifers', 'new'], es: ['nuevas', 'nuevos', 'nueva', 'nuevo'], pt: ['novas', 'novos', 'nova', 'novo'], nl: ['nieuw', 'nieuwe'],
  // Plural only: "Nowa Zelandia" and "Nowy Jork" are places.
  pl: ['nowe', 'nowych'],
  // Plural only: "Nouvelle-Zélande" and "Nouvelle-Calédonie" are places.
  fr: ['nouvelles', 'nouveaux'],
  de: ['neue', 'neuen'],
  // Plural only: "Nuova Zelanda" and "Nuova Caledonia" are places.
  it: ['nuove', 'nuovi'],
  // Not "nya": "Nya Zeeland" and "Nya Kaledonien" are places. Swedish birders call a lifer a "kryss".
  sv: ['kryss', 'livskryss', 'nykryss'],
  // Plural only: "Ny Kaledonien" is a place.
  da: ['nye'],
  // Plural only: "Новая Зеландия" and "Новая Каледония" are places. Russian birders also say "лайфер".
  ru: ['новые', 'новых', 'лайфер', 'лайферы', 'лайферов'],
  // Japanese birders say ライファー; 初見 is "first time recorded".
  ja: ['ライファー', '初見'],
  // Chinese birders say 加新 for a lifer; 新鸟种 and 新增鸟种 are the plain forms.
  'zh-Hans': ['加新', '新鸟种', '新增鸟种'],
  // Taiwan birders call a lifer a "新種" (and adding one "加新"). Not "新": "新加坡" and "新喀里多尼亞" are places.
  'zh-Hant': ['新種', '新鳥種', '加新'],
}

function tokenize(input: string, months: Map<string, number>): SearchWord[] {
  // Keep compounds (beija-flor, CA-BC), ISO dates, quotes and positions. A numeric year range splits at its dash.
  // Chinese and Japanese write a year and a month without spaces ("2024年3月"): "2024年" is the year 2024, "3月" a month.
  const re = /"[^"]*"|(?:19|20)\d{2}-\d{2}(?:-\d{2})?(?!\d)|(?:19|20)\d{2}年|\d{1,2}月|(?:19|20)\d{2}(?![\p{L}\p{N}])|[\p{L}\p{M}\p{N}]+(?:[-'’][\p{L}\p{M}]+)*|[-–—/]|[^\s]/gu
  const word = (text: string, start: number): SearchWord => ({ raw: text, key: /^\d{4}年$/.test(text) ? text.slice(0, 4) : searchKey(text), start, end: start + text.length, quoted: text.startsWith('"') })
  const isMonth = (text: string) => monthOfWord(months, searchKey(text), true) !== undefined
  const out: SearchWord[] = []
  for (const m of input.matchAll(re)) {
    // "Jan-Mar" is two months and a dash, as "Jan – Mar" is; "beija-flor" and "CA-BC" stay whole.
    const parts = /^([\p{L}\p{M}]+)-([\p{L}\p{M}]+)$/u.exec(m[0])
    if (parts && isMonth(parts[1]) && isMonth(parts[2])) {
      const start = m.index!
      out.push(word(parts[1], start), word('-', start + parts[1].length), word(parts[2], start + parts[1].length + 1))
    } else out.push(word(m[0], m.index!))
  }
  return out
}

/** A place key and every ancestor of it under the continent model (`k:` -> `s:` -> `c:` -> `n:`; an overseas part's country key is `c:FR@SA`). */
function addWithAncestors(set: Set<string>, key: string) {
  for (let k: string | undefined = key; k; k = parentKey(k)) set.add(k)
}

function places(ctx: SearchContext): Entity[] {
  const out = new Map<string, Entity>()
  const add = (value: string, aliases: string[], exactOnly = false, codes: string[] = []) => {
    const existing = out.get(value)
    if (existing) {
      existing.aliases.push(...aliases.map(searchKey))
      existing.codes = [...(existing.codes ?? []), ...codes.map(searchKey)]
    } else out.set(value, { value, name: placeName(value, ctx.regions), aliases: aliases.map(searchKey), exactOnly, codes: codes.map(searchKey) })
  }
  const countries = countryNameMap(ctx.regions, ['en', ctx.lang], { includeRegistry: false })
  for (const [name, code] of countries) add(`c:${code}`, [name])
  for (const [code, name] of Object.entries(ctx.regions.sub1)) {
    const obsorgAliases = (OBSORG_SUB1_ALIASES[code] ?? []).filter((a) => !countries.has(foldName(a)))
    add(`s:${code}`, [code, ...sub1Names(name), ...(SUB1_ALIASES[code] ?? []), ...obsorgAliases, ...(IMPORT_REGION_ALIASES[code] ?? [])])
  }
  const onList = new Set<string>()
  for (const key of ctx.listPlaces) {
    const p = parsePlaceKey(key)
    if (!p) continue
    addWithAncestors(onList, key)
    if (p.level === 'county') add(key, [placeName(key, ctx.regions)], true)
    if (p.sub1 && hasSourcePlaceKey(p.sub1)) add(`s:${p.sub1}`, [placeName(`s:${p.sub1}`, ctx.regions)])
  }
  // Short sub1 suffixes ("BC" of CA-BC) are codes only for places on this list: exact, and only as typed in capitals.
  for (const key of onList) {
    const p = parsePlaceKey(key)!
    if (p.level === 'province' && !hasSourcePlaceKey(p.sub1!)) add(key, [], false, [p.sub1!.split('-').slice(1).join('-')])
  }
  return [...out.values()].map((p) => ({ ...p, aliases: unique(p.aliases), codes: unique(p.codes ?? []) }))
}

/** Recognized spans become filters; every other word stays in its original spelling for bird-name search. */
export function parseSmart(input: string, ctx: SearchContext): { filter: SmartFilter; chips: Chip[]; rest: string } {
  const filter: SmartFilter = {}
  const chips: Chip[] = []
  const tokens = tokenize(input, monthIndex(ctx.lang))
  const used = tokens.map(() => false)
  const invalidDates = new Set<number>()
  const languages = unique(['en', ctx.lang] as SearchLang[])
  const connectors = new Set(languages.flatMap((lang) => SEARCH_CONNECTORS[lang]).map(searchKey))
  const lifers = new Set(languages.flatMap((lang) => LIFERS[lang]).map(searchKey))
  const periodAt = dateParser(ctx.today, ctx.lang)
  const placeEntities = places(ctx)
  const onList = new Set<string>()
  for (const key of ctx.listPlaces) {
    const p = parsePlaceKey(key)
    if (p) addWithAncestors(onList, key)
  }
  const groupEntities: Entity[] = ctx.groups.map((g) => ({ value: g.id, name: groupName(g, ctx.lang),
    aliases: unique(languages.flatMap((lang) => [g.name[lang] ?? '', ...((synonyms as Record<string, Partial<Record<SearchLang, string[]>>>)[g.id]?.[lang] ?? [])])).filter(Boolean).map(searchKey),
  }))
  const orderEntities = Object.entries({ ...ORDERS, ...ctx.orderNames }).map(([value, name]) => ({ value, name, aliases: [value, name, ORDERS[value]].filter(Boolean).map(searchKey) }))
  const familyEntities = unique((ctx.species ?? []).map((s) => s.fam)).map((value) => {
    const sp = ctx.species!.find((s) => s.fam === value)!
    const name = ctx.familyNames?.[value] ?? sp.famCom ?? value
    return { value, name, aliases: unique([value, name, sp.famCom]).filter(Boolean).map(searchKey) }
  })
  const statuses = new Map<string, SearchStatus[]>()
  for (const lang of languages) for (const [word, codes] of Object.entries(STATUS_WORDS[lang])) statuses.set(searchKey(word), codes)
  for (const s of ctx.statuses ?? []) for (const word of [s.name, ...(s.aliases ?? [])]) statuses.set(searchKey(word), [s.code])
  for (const code of ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD', 'NE'] as SearchStatus[]) statuses.set(code.toLowerCase(), [code])
  const addChip = (kind: Chip['kind'], label: string, i: number, n: number, lead = false) => {
    // A leading connector belongs to this chip only when immediately adjacent and unused; never discard all stopwords.
    if (lead && i > 0 && !used[i - 1] && !tokens[i - 1].quoted && connectors.has(tokens[i - 1].key)) { i--; n++ }
    for (let k = i; k < i + n; k++) used[k] = true
    const start = tokens[i].start, end = tokens[i + n - 1].end
    chips.push({ kind, label, token: input.slice(start, end), start, end })
  }
  const match = (entities: Entity[], phrase: string, fuzzy: boolean) => {
    const exact = entities.filter((e) => e.aliases.includes(phrase))
    if (exact.length || !fuzzy) return exact
    const words = phrase.split(' ').filter((w) => w && !CONNECTOR_WORDS.has(w))
    if (words.join(' ').length < 4 || words.every((w) => GENERIC.has(w))) return exact
    // Each word must match a whole word of the name (a prefix only from four letters: "hummingb"), never the name's start.
    const fits = (name: string) => {
      const nameWords = name.split(' ')
      return words.every((w) => nameWords.some((nw) => nw === w || w.length >= 4 && nw.startsWith(w)))
    }
    return entities.filter((e) => !e.exactOnly && e.aliases.some((name) => singular(name) === singular(phrase) || fits(name)))
  }
  // A group needs the query's words to be a whole group name or synonym (connectors aside, plural or not), never a
  // part of one: "great blue heron" names no group, though "great", "blue" and "heron" each sit inside some group's name.
  const bare = (s: string) => singular(s.split(' ').filter((w) => w && !CONNECTOR_WORDS.has(w) && !GROUP_JOINERS.has(w)).join(' '))
  const matchGroup = (phrase: string) => {
    const p = bare(phrase)
    return p ? groupEntities.filter((g) => g.aliases.some((a) => bare(a) === p)) : []
  }
  for (let i = 0; i < tokens.length; i++) {
    if (used[i] || tokens[i].quoted) continue
    const t = tokens[i]
    if (!invalidDates.has(i) && !chips.some((c) => c.kind === 'date')) {
      const period = periodAt(tokens, i)
      if (period?.invalid) {
        for (let j = i; j < i + period.n; j++) invalidDates.add(j)
      } else if (period && !used.slice(i, i + period.n).some(Boolean)) {
        if (period.from) filter.from = period.from
        if (period.to) filter.to = period.to
        if (filter.basis !== 'lifer') filter.basis = 'seen'
        const label = period.from === period.to ? period.from! : `${period.from ?? '…'}–${period.to ?? '…'}`
        addChip('date', label, i, period.n, true)
        continue
      }
    }
    // Longest contiguous entity first, like Nest Ledger. Counties can have more than four words.
    for (let n = Math.min(12, tokens.length - i); n >= 1; n--) {
      // A lone lifer word ("nieuwe", "new") is the basis switch, never a whole-word match inside a group's name.
      if (n === 1 && lifers.has(t.key)) break
      if (tokens.slice(i, i + n).some((t, j) => t.quoted || used[i + j] || !t.key && !/^[,&.]$/.test(t.raw))) continue
      const phrase = tokens.slice(i, i + n).map((t) => t.raw === '&' ? 'and' : t.key).filter(Boolean).join(' ')
      const status = statuses.get(phrase)
      // Spanish/Dutch "en" is a connector; the IUCN abbreviation is EN.
      if (status && !(n === 1 && connectors.has(phrase) && t.raw !== t.raw.toUpperCase())) {
        filter.statuses = unique([...(filter.statuses ?? []), ...status]).sort()
        addChip('status', input.slice(t.start, tokens[i + n - 1].end), i, n)
        break
      }
      let hits = match(placeEntities, phrase, false)
      if (n === 1 && isCodeWord(t.raw)) hits = unique([...hits, ...placeEntities.filter((e) => e.codes?.includes(phrase))])
      if (hits.length > 1) {
        const listed = hits.filter((p) => onList.has(p.value))
        if (listed.length) hits = listed
      }
      // Code suffix ON must not steal the ordinary English connector "on".
      if (n === 1 && connectors.has(phrase) && t.raw !== t.raw.toUpperCase()) hits = []
      if (hits.length === 1) {
        const hit = hits[0], p = parsePlaceKey(hit.value)!
        const field = p.level === 'country' ? 'countries' : p.level === 'province' ? 'provinces' : 'counties'
        const value = p.level === 'country' ? p.country : p.level === 'province' ? p.sub1! : `${p.sub1}|${p.county}`
        filter[field] = unique([...(filter[field] ?? []), value]).sort()
        addChip('place', hit.name, i, n, true)
        break
      }
      if (!filter.group) {
        const exactTaxon = match(familyEntities, phrase, false).length || match(orderEntities, phrase, false).length
        const hits = exactTaxon ? match(groupEntities, phrase, false) : matchGroup(phrase)
        if (hits.length === 1) {
          filter.group = hits[0].value
          addChip('group', hits[0].name, i, n)
          break
        }
      }
      if (!filter.order && !filter.family) {
        const orders = match(orderEntities, phrase, true), families = match(familyEntities, phrase, true)
        if (orders.length === 1) {
          filter.order = orders[0].value
          addChip('order', orders[0].name, i, n)
          break
        }
        if (families.length === 1) {
          filter.family = families[0].value
          filter.order = ctx.species?.find((s) => s.fam === families[0].value)?.ord
          addChip('family', families[0].name, i, n)
          break
        }
      }
    }
    if (!used[i] && lifers.has(t.key)) {
      filter.basis = 'lifer'
      addChip('basis', t.raw, i, 1)
    }
  }
  // Remove only recognized spans from the source, keeping unrecognized spelling, punctuation and word order.
  const spans = chips.slice().sort((a, b) => b.start - a.start)
  let rest = input
  for (const { start, end } of spans) rest = rest.slice(0, start) + ' ' + rest.slice(end)
  rest = rest.replace(/"([^"]*)"/g, '$1').replace(/\s+/g, ' ').trim()
  return { filter, chips, rest }
}

/** Remove exactly this chip's source span. A stale chip is harmless (the UI reparses after every edit). */
export function withoutChip(input: string, chip: Chip): string {
  if (input.slice(chip.start, chip.end) !== chip.token) return input
  return (input.slice(0, chip.start) + ' ' + input.slice(chip.end)).replace(/\s+/g, ' ').trim()
}
