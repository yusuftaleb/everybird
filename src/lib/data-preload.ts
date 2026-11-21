// Data files a page always needs, requested from its HTML head (React's preload) so they download alongside the page's
// JavaScript instead of after it. Server-safe. The preload is the request fetchData makes (its first URL, CORS without
// credentials, as a plain fetch() of another origin is), so the fetch takes the preloaded response.
import { preload } from 'react-dom'
import { dataUrls } from './data-url'
import type { DataFile } from './data-files'
import { baseOfLang } from './species/name-locales'

export function preloadData(names: readonly DataFile[], fetchPriority?: 'high' | 'low'): void {
  for (const name of names) preload(dataUrls(name)[0], { as: 'fetch', crossOrigin: 'anonymous', ...(fetchPriority ? { fetchPriority } : {}) })
}

/** What loadSpecies fetches (the groups file rides along). */
export const SPECIES_FILES: readonly DataFile[] = ['species.v1.json', 'groups.v1.json']
/** The landing sample in a UI language: the pack and the groups file (loadSamplePack), and the sample's names in that
 *  language's base set (loadSampleNames; none in English). */
export function sampleFiles(lang: string): DataFile[] {
  const base = baseOfLang(lang)
  return ['sample-pack.v1.json', 'groups.v1.json', ...(base ? [`sample-names.${base}.v1.json` as DataFile] : [])]
}
