// Decodes every sticker in ${STICKERS_OUT:-../everybird-stickers}/v1/{128,384}/*.webp with sharp and lists the ones
// that fail (truncated or corrupt files), so they can be rebuilt with build-stickers --codes <a,b,...>.
// v1/128 and v1/384 must exist; both screen sizes must exist for every file name. 1024 files are decoded when present.
// --tier 1024 also requires the print file of every species with a sticker in public/data/species.v1.json, at the
// path its current `sv` names (superseded versions on disk are not expected to have one). Exit code 1 when anything
// is wrong.
//   npx tsx scripts/build-data/check-stickers.ts [--tier 1024]
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import type { SpeciesFile } from '../../src/lib/species/types'
import { PRINT, stickerPath } from '../../src/lib/sticker-url'

type StickerCheck = {
  checked: number
  failed: { file: string; error: string }[]
  /** File names (code or code.sv) that have one screen size but not the other. */
  missing: string[]
  /** Print mode: bare codes whose current 1024 file is missing. */
  printMissing: string[]
}
type PrintRow = Pick<SpeciesFile['species'][number], 'code' | 'st' | 'sv'>

/** Fully decodes each webp (raw pixels, not just the header), CONCURRENCY at a time. Throws when a screen tier's directory is missing. */
export async function checkStickers(root: string, concurrency = 16, opts: { print?: PrintRow[] } = {}): Promise<StickerCheck> {
  for (const s of ['128', '384']) if (!existsSync(resolve(root, 'v1', s))) throw new Error(`no ${resolve(root, 'v1', s)}: not a stickers checkout`)
  const sizes = ['128', '384', '1024'] as const
  const files = sizes.flatMap((s) => (existsSync(resolve(root, 'v1', s)) ? readdirSync(resolve(root, 'v1', s)) : []).filter((f) => f.endsWith('.webp')).map((f) => `${s}/${f}`))
  const names = sizes.map((s) => new Set(files.filter((f) => f.startsWith(`${s}/`)).map((f) => f.slice(s.length + 1, -5))))
  const missing = [...new Set([...names[0], ...names[1]])].filter((c) => !names[0].has(c) || !names[1].has(c)).sort()
  const have = new Set(files)
  const printMissing = (opts.print ?? []).filter((r) => r.st && !have.has(stickerPath(r.code, PRINT, r.sv).slice(3))).map((r) => r.code).sort()
  const failed: StickerCheck['failed'] = []
  let next = 0
  const worker = async () => {
    while (next < files.length) {
      const file = files[next++]
      try {
        const { info } = await sharp(resolve(root, 'v1', file)).raw().toBuffer({ resolveWithObject: true })
        if (!info.width || !info.height) throw new Error('empty image')
      } catch (e) {
        failed.push({ file, error: e instanceof Error ? e.message : String(e) })
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  failed.sort((a, b) => a.file.localeCompare(b.file))
  return { checked: files.length, failed, missing, printMissing }
}

/** A file name's eBird code: `crowa.0a1b2c3d4e` -> `crowa`. */
const bare = (name: string) => name.split('.')[0]

/** The rebuild commands for a check's failures, with bare codes (build-stickers adds each row's `sv` itself). */
export function rebuildHints(r: StickerCheck): string[] {
  const join = (codes: string[]) => [...new Set(codes)].sort().join(',')
  const screen = join([...r.failed.filter((f) => !f.file.startsWith('1024/')).map((f) => bare(f.file.split('/')[1].slice(0, -5))), ...r.missing.map(bare)])
  const print = join([...r.failed.filter((f) => f.file.startsWith('1024/')).map((f) => bare(f.file.slice(5, -5))), ...r.printMissing])
  return [
    ...(screen ? [`npx tsx scripts/build-data/build-stickers.ts --codes ${screen}`] : []),
    ...(print ? [`npx tsx scripts/build-data/build-stickers.ts --tier 1024 --codes ${print}`] : []),
  ]
}

async function main() {
  const root = resolve(process.cwd(), process.env.STICKERS_OUT ?? '../everybird-stickers')
  const ti = process.argv.indexOf('--tier')
  if (ti >= 0 && process.argv[ti + 1] !== '1024') throw new Error('--tier supports only 1024')
  const print = ti >= 0 ? (JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/species.v1.json'), 'utf8')) as SpeciesFile).species : undefined
  const r = await checkStickers(root, 16, { print })
  for (const f of r.failed) console.log(`FAIL ${f.file}: ${f.error}`)
  for (const c of r.missing) console.log(`MISSING one size: ${c}`)
  for (const c of r.printMissing) console.log(`MISSING print file: ${c}`)
  console.log(`checked ${r.checked} files: ${r.failed.length} failed to decode, ${r.missing.length} codes missing a size` +
    (print ? `, ${r.printMissing.length} missing a print file` : ''))
  const hints = rebuildHints(r)
  if (hints.length) {
    for (const h of hints) console.log(`rebuild: ${h}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
