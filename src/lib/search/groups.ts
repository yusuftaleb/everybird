import type { Lang } from '../../i18n/langs'

/** Every UI language: the smart search reads its words in each. */
export type SearchLang = Lang
/** The languages groups.v1.json names every group in (build-groups' GROUP_LOCALES); other languages fall back to English. */
export type GroupLang = 'en' | 'es' | 'pt' | 'nl' | 'pl'
/** eBird's named groups, with inclusive bounds in the pinned taxonomy's taxon order. */
export type BirdGroup = {
  id: string
  name: Record<GroupLang, string> & Partial<Record<SearchLang, string>>
  lo: number
  hi: number
}
export type GroupsFile = { v: 1; taxonomy: string; groups: BirdGroup[] }
export const inGroup = (taxonOrder: number, group: BirdGroup): boolean => taxonOrder >= group.lo && taxonOrder <= group.hi
/** A group's name in a UI language, English when the file has none in it. */
export const groupName = (group: BirdGroup, lang: SearchLang): string => group.name[lang] || group.name.en
