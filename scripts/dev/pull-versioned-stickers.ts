// Downloads the versioned stickers (data/sticker-versions.json: v1/{128,384}/<code>.<sv>.webp) that a huashu sync
// published to R2 into the local stickers checkout, so the dev sticker server and the e2e tests show them (without a
// STICKERS_REPO_TOKEN the sync never commits them to everybird-stickers). Skips files already there. Read-only on the
// remote side.
//
//   npx tsx scripts/dev/pull-versioned-stickers.ts    (STICKERS_DIR, default ../everybird-stickers; FROM, default
//                                                      https://stickers.yusuftaleb.com)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { stickerPath } from '../../src/lib/sticker-url'

const dir = resolve(process.env.STICKERS_DIR ?? '../everybird-stickers')
const from = (process.env.FROM ?? 'https://stickers.yusuftaleb.com').replace(/\/+$/, '')
const vPath = resolve('data/sticker-versions.json')
const versions = existsSync(vPath) ? (JSON.parse(readFileSync(vPath, 'utf8')) as Record<string, string>) : {}
const todo = Object.entries(versions).flatMap(([code, sv]) => ([128, 384] as const).map((size) => stickerPath(code, size, sv)))
  .filter((rel) => !existsSync(join(dir, rel)))
async function main() {
  let next = 0, got = 0
  const failed: string[] = []
  await Promise.all(Array.from({ length: 16 }, async () => {
    while (next < todo.length) {
      const rel = todo[next++]
      try {
        const res = await fetch(`${from}/${rel}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        mkdirSync(dirname(join(dir, rel)), { recursive: true })
        writeFileSync(join(dir, rel), Buffer.from(await res.arrayBuffer()))
        got++
      } catch (e) { failed.push(`${rel}: ${(e as Error).message}`) }
    }
  }))
  console.log(`${Object.keys(versions).length} versioned stickers; ${got} files downloaded into ${dir}, ${failed.length} failed`)
  if (failed.length) { console.error(failed.slice(0, 20).join('\n')); process.exit(1) }
}

main().catch((e) => { console.error(e); process.exit(1) })
