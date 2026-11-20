// Name files are independent of the UI dictionaries and import taxonomy.
export const NAME_LOCALES = [
  'es', 'es_MX', 'es_EC', 'es_PY', 'es_UY', 'es_BO', 'es_PE', 'es_CR', 'es_VE',
  'es_AR', 'es_PA', 'es_HN', 'es_CL', 'es_CU', 'es_PR', 'es_DO', 'pt_BR', 'pt_PT', 'nl', 'pl',
  'fr_FR', 'fr', 'de', 'it', 'sv', 'da',
] as const
export type NameLocale = typeof NAME_LOCALES[number]
/** The base name sets: the ones the sample, the About demo and link previews use. French's is fr_FR (France's names,
 *  also given to Belgium, Switzerland and a bare "fr"); eBird's plain `fr` is North American French, for Canada. */
export type NameBase = 'es' | 'pt_BR' | 'nl' | 'pl' | 'fr_FR' | 'de' | 'it' | 'sv' | 'da'
export const NAME_BASES: readonly NameBase[] = ['es', 'pt_BR', 'nl', 'pl', 'fr_FR', 'de', 'it', 'sv', 'da']
export const NAME_BASE: Record<NameLocale, NameBase> = {
  es: 'es', es_MX: 'es', es_EC: 'es', es_PY: 'es', es_UY: 'es', es_BO: 'es', es_PE: 'es',
  es_CR: 'es', es_VE: 'es', es_AR: 'es', es_PA: 'es', es_HN: 'es', es_CL: 'es', es_CU: 'es',
  es_PR: 'es', es_DO: 'es', pt_BR: 'pt_BR', pt_PT: 'pt_BR', nl: 'nl', pl: 'pl', fr_FR: 'fr_FR', fr: 'fr_FR', de: 'de', it: 'it', sv: 'sv', da: 'da',
}
/** One name set per region, used only when its language is the UI language. A bilingual region keeps its majority
 *  language (BE: nl, CH: de), so a French reader there gets the base; eBird has no fr_BE or fr_CH set (both return
 *  plain `fr`), and German has one set for Germany, Austria and Switzerland (de_AT and de_CH return `de`). */
export const REGION_LOCALE: Record<string, NameLocale> = {
  ES: 'es', MX: 'es_MX', EC: 'es_EC', PY: 'es_PY', UY: 'es_UY', BO: 'es_BO', PE: 'es_PE',
  CR: 'es_CR', VE: 'es_VE', AR: 'es_AR', PA: 'es_PA', HN: 'es_HN', CL: 'es_CL', CU: 'es_CU',
  PR: 'es_PR', DO: 'es_DO', BR: 'pt_BR', PT: 'pt_PT', NL: 'nl', BE: 'nl', PL: 'pl', FR: 'fr_FR', CA: 'fr', DE: 'de', AT: 'de', CH: 'de', IT: 'it', SE: 'sv', DK: 'da',
}
const LANG_BASE: Record<string, NameBase> = { es: 'es', pt: 'pt_BR', nl: 'nl', pl: 'pl', fr: 'fr_FR', de: 'de', it: 'it', sv: 'sv', da: 'da' }
/** A UI language's base name set (es, pt_BR, nl, pl, fr_FR, de, it, sv, da); English has none. Link previews use only these. */
export function baseOfLang(lang: string): NameBase | null {
  return LANG_BASE[lang] ?? null
}
/** The family-label languages (data/i18n/families.<lang>.json), one per UI language with names. */
export const FAMILY_LANGS = ['es', 'pt', 'nl', 'pl', 'fr', 'de', 'it', 'sv', 'da'] as const
export type FamilyLang = typeof FAMILY_LANGS[number]
/** eBird's Chinese sets: zh_SIM is Simplified, plain zh Traditional. */
const FAMILY_OF: Partial<Record<string, string>> = { zh_SIM: 'zh-Hans', zh: 'zh-Hant' }
/** A name set's family-label language: every other locale starts with its UI language's code (es_MX -> es, fr_FR -> fr). */
export function familyLang(l: NameLocale): FamilyLang {
  return (FAMILY_OF[l] ?? l.slice(0, 2)) as FamilyLang
}
