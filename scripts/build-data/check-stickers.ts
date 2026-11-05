// Decodes every sticker in ${STICKERS_OUT:-../everybird-stickers}/v1/{128,384}/*.webp with sharp and lists the ones
// that fail (truncated or corrupt files), so they can be rebuilt with build-stickers --codes <a,b,...>.
// Also checks that both sizes exist for every code. Exit code 1 when anything is wrong.
//   npx tsx scripts/build-data/check-stickers.ts
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

export type StickerCheck = { checked: number; failed: { file: string; error: string }[]; missing: string[] }

/** Fully decodes each webp (raw pixels, not just the header), CONCURRENCY at a time. */
export async function checkStickers(root: string, concurrency = 16): Promise<StickerCheck> {
  const sizes = ['128', '384'] as const
  const files = sizes.flatMap((s) => readdirSync(resolve(root, 'v1', s)).filter((f) => f.endsWith('.webp')).map((f) => `${s}/${f}`))
  const codes = sizes.map((s) => new Set(files.filter((f) => f.startsWith(`${s}/`)).map((f) => f.slice(s.length + 1, -5))))
  const missing = [...new Set([...codes[0], ...codes[1]])].filter((c) => !codes[0].has(c) || !codes[1].has(c)).sort()
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
  return { checked: files.length, failed, missing }
}

async function main() {
  const root = resolve(process.cwd(), process.env.STICKERS_OUT ?? '../everybird-stickers')
  const r = await checkStickers(root)
  for (const f of r.failed) console.log(`FAIL ${f.file}: ${f.error}`)
  for (const c of r.missing) console.log(`MISSING one size: ${c}`)
  const codes = [...new Set([...r.failed.map((f) => f.file.split('/')[1].slice(0, -5)), ...r.missing])]
  console.log(`checked ${r.checked} files: ${r.failed.length} failed to decode, ${r.missing.length} codes missing a size`)
  if (codes.length) {
    console.log(`rebuild: npx tsx scripts/build-data/build-stickers.ts --codes ${codes.join(',')}`)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
