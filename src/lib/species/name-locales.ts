// Name files are independent of the UI dictionaries and import taxonomy.
export const NAME_LOCALES = [
  'es', 'es_MX', 'es_EC', 'es_PY', 'es_UY', 'es_BO', 'es_PE', 'es_CR', 'es_VE',
  'es_AR', 'es_PA', 'es_HN', 'es_CL', 'es_CU', 'es_PR', 'es_DO', 'pt_BR', 'pt_PT', 'nl', 'pl',
] as const
export type NameLocale = typeof NAME_LOCALES[number]
/** The base name sets (no region): the ones the sample, the About demo and link previews use. */
export type NameBase = 'es' | 'pt_BR' | 'nl' | 'pl'
export const NAME_BASES: readonly NameBase[] = ['es', 'pt_BR', 'nl', 'pl']
export const NAME_BASE: Record<NameLocale, NameBase> = {
  es: 'es', es_MX: 'es', es_EC: 'es', es_PY: 'es', es_UY: 'es', es_BO: 'es', es_PE: 'es',
  es_CR: 'es', es_VE: 'es', es_AR: 'es', es_PA: 'es', es_HN: 'es', es_CL: 'es', es_CU: 'es',
  es_PR: 'es', es_DO: 'es', pt_BR: 'pt_BR', pt_PT: 'pt_BR', nl: 'nl', pl: 'pl',
}
export const REGION_LOCALE: Record<string, NameLocale> = {
  ES: 'es', MX: 'es_MX', EC: 'es_EC', PY: 'es_PY', UY: 'es_UY', BO: 'es_BO', PE: 'es_PE',
  CR: 'es_CR', VE: 'es_VE', AR: 'es_AR', PA: 'es_PA', HN: 'es_HN', CL: 'es_CL', CU: 'es_CU',
  PR: 'es_PR', DO: 'es_DO', BR: 'pt_BR', PT: 'pt_PT', NL: 'nl', BE: 'nl', PL: 'pl',
}
/** A UI language's base name set (es, pt_BR, nl, pl); English has none. Link previews use only these. */
export function baseOfLang(lang: string): NameBase | null {
  return lang === 'es' ? 'es' : lang === 'pt' ? 'pt_BR' : lang === 'nl' ? 'nl' : lang === 'pl' ? 'pl' : null
}
export function familyLang(l: NameLocale): 'es' | 'pt' | 'nl' | 'pl' {
  return l === 'nl' || l === 'pl' ? l : NAME_BASE[l] === 'es' ? 'es' : 'pt'
}
