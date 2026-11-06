import { FLAG_URLS } from './flag-urls'

/**
 * A country's flag (flag-icons' 4x3 SVG, served from this origin) by its ISO 3166-1 alpha-2 code, case-insensitive;
 * undefined for a code the set lacks or anything that isn't two letters.
 */
export function flagSrc(iso2: string | undefined): string | undefined {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return undefined
  const f = FLAG_URLS[iso2.toUpperCase()]
  return f === undefined ? undefined : typeof f === 'string' ? f : f.src
}
