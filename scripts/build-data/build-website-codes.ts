// Writes data/website-lifelist-codes.json: the eBird codes on Yusuf's PUBLIC website life list
// (framer-site/content/lifelist/lifelist.json), sorted, codes only (no dates, places, names or sources). The huashu
// sync (scripts/sync/huashu-sync.ts) opens an issue when one of these species' stickers changes upstream, so the
// Framer site can be updated. Rerun when the website list changes.
//
//   npx tsx scripts/build-data/build-website-codes.ts <path/to/framer-site/content/lifelist/lifelist.json>
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The list's eBird codes, deduplicated and sorted. Anything but a code is left behind. */
export function websiteCodes(list: { species?: { code?: unknown }[] }): string[] {
  const codes = (list.species ?? []).map((s) => s.code).filter((c): c is string => typeof c === 'string' && /^[a-z0-9]+$/.test(c))
  return [...new Set(codes)].sort()
}

function main() {
  const src = process.argv[2]
  if (!src) {
    console.error('Usage: npx tsx scripts/build-data/build-website-codes.ts <path/to/framer-site/content/lifelist/lifelist.json>')
    process.exit(1)
  }
  if (/(^|\/)private\//.test(resolve(src))) throw new Error('Never read private/')
  const codes = websiteCodes(JSON.parse(readFileSync(src, 'utf8')))
  writeFileSync(resolve('data/website-lifelist-codes.json'), JSON.stringify(codes, null, 1) + '\n')
  console.log(`data/website-lifelist-codes.json: ${codes.length} codes`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()
