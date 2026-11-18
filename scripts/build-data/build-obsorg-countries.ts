import { readFileSync, writeFileSync } from 'node:fs'

// Merge public /api/v1/countries snapshots requested with different Accept-Language headers.
const [edition, ...files] = process.argv.slice(2)
if (!/^\d{4}-\d{2}-\d{2}$/.test(edition ?? '') || files.length === 0) {
  throw new Error('Provide a snapshot date and one or more country JSON responses.')
}
const names = new Map<string, Set<string>>()
for (const file of files) {
  const { next, results } = JSON.parse(readFileSync(file, 'utf8')) as {
    next: string | null; results: { code: string; name: string }[]
  }
  if (next !== null || !results.length) throw new Error(`Expected a complete country response in ${file}.`)
  const codes = new Set<string>()
  for (const { code, name } of results) {
    if (!/^[A-Z]{2}$/.test(code) || !name?.trim() || codes.has(code)) throw new Error(`Invalid country entry in ${file}.`)
    codes.add(code)
    const aliases = names.get(code) ?? new Set<string>()
    aliases.add(name.normalize('NFC').trim())
    names.set(code, aliases)
  }
  if (names.size !== codes.size || [...names.keys()].some((code) => !codes.has(code))) {
    throw new Error('Country responses must cover the same codes.')
  }
}
const countryNames = Object.fromEntries([...names.keys()].sort().map((code) => [code, [...names.get(code)!].sort()]))
writeFileSync('data/obsorg-countries.json', JSON.stringify({ edition, countryNames }) + '\n')
