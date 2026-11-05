// Maintains data/link-index.json: eBird species codes, append-only, so share links stay valid.
// Run: npx tsx scripts/build-data/link-index.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export function updateLinkIndex(existing: string[], current: string[]): string[] {
  const now = new Set(current)
  const seen = new Set(existing)
  for (const code of existing) {
    if (!now.has(code)) throw new Error(`link index: code "${code}" vanished from the species list`)
  }
  // existing codes must keep their relative order within the current (taxonomic) list
  const order = current.filter((c) => seen.has(c))
  existing.forEach((code, i) => {
    if (order[i] !== code) throw new Error(`link index: code "${code}" moved (index ${i}, now before "${order[i]}")`)
  })
  return [...existing, ...current.filter((c) => !seen.has(c))]
}

export function main(root = resolve(__dirname, '../..')): number {
  const species = JSON.parse(readFileSync(resolve(root, 'public/data/species.v1.json'), 'utf8')) as { species: { code: string }[] }
  const current = species.species.map((s) => s.code)
  const path = resolve(root, 'data/link-index.json')
  const existing: string[] = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : []
  const next = updateLinkIndex(existing, current)
  mkdirSync(resolve(root, 'data'), { recursive: true })
  writeFileSync(path, JSON.stringify(next) + '\n')
  console.log(`link-index: ${next.length} codes (${next.length - existing.length} appended)`)
  return next.length
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
