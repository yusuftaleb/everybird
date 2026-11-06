/**
 * A country's flag emoji from its ISO 3166-1 alpha-2 code, as two regional-indicator letters (A → U+1F1E6 …).
 * Undefined for anything that isn't exactly two letters A–Z (case-insensitive).
 */
export function flagEmoji(iso2: string | undefined): string | undefined {
  if (!iso2 || !/^[A-Za-z]{2}$/.test(iso2)) return undefined
  const A = 0x1f1e6
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => A + c.charCodeAt(0) - 65))
}
