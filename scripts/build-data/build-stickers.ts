// Builds sticker variants (long side 128 and 384, trimmed webp), collision masks and `ar`.
// Run AFTER build-species: npx tsx scripts/build-data/build-stickers.ts [--force | --codes a,b,...]
// --codes regenerates just those codes (e.g. the ones check-stickers.ts reports); everything else is reused.
// Output: ${STICKERS_OUT:-../everybird-stickers}/v1/{128,384}/<code>.webp, public/data/masks/<Order>.v1.json,
// and the `ar` values in public/data/species.v1.json (build-stickers is the source of truth for `ar`).
// A stand-in row (`standIn`, set by build-species) gets a copy of its split sibling's two webp files under its own code,
// and its own mask entry and `ar` from that copy.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { maskFromAlpha } from '../../src/lib/layout/mask'
import type { Overrides, SpeciesFile } from '../../src/lib/species/types'
import { loadEbirdTaxonomy, loadHuashu, matchHuashu } from './build-species'

const WEBP = { quality: 80, effort: 6 } as const

export type Variants = { v128: Buffer; v384: Buffer; ar: number }

/** Alpha-bbox trim, then long-side 128 and 384 webp. ar = width/height of the 384 variant. */
export async function makeVariants(input: Buffer | string): Promise<Variants> {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
  }
  if (x1 < 0) throw new Error('sticker is fully transparent')
  const crop = { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }
  const variant = (size: number) =>
    sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .extract(crop).resize(size, size, { fit: 'inside', kernel: 'lanczos3' }).webp(WEBP).toBuffer()
  const [v128, v384] = await Promise.all([variant(128), variant(384)])
  const m = await sharp(v384).metadata()
  return { v128, v384, ar: Math.round((m.width! / m.height!) * 10000) / 10000 }
}

export async function maskOf(webp: Buffer | string): Promise<{ mask: [number, number, string]; ar: number }> {
  const { data, info } = await sharp(webp).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const alpha = new Uint8Array(info.width * info.height)
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
  return {
    mask: maskFromAlpha(alpha, info.width, info.height),
    ar: Math.round((info.width / info.height) * 10000) / 10000,
  }
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) await fn(items[i++]) }))
}

function readme(commit: string): string {
  return `# Everybird stickers

Stickers: huashu-bird-sticker, CC BY 4.0 (https://github.com/alchaincyf/huashu-bird-sticker).

These files are resized and trimmed from huashu-bird-sticker: each sticker is cropped to its
opaque bounding box and saved as WebP with its long side at 128 px (\`v1/128/<ebird-code>.webp\`)
and 384 px (\`v1/384/<ebird-code>.webp\`). Names are eBird species codes. Where several eBird
species share one huashu sticker, each code gets its own copy. A species with no huashu sticker of
its own, split from (or split off) one that has one, carries a copy of that sibling's sticker as a stand-in.

Source commit: ${commit} (https://github.com/alchaincyf/huashu-bird-sticker/commit/${commit})

Licensed under CC BY 4.0, see LICENSE. Credit "Stickers: huashu-bird-sticker, CC BY 4.0" wherever they appear.
`
}

async function main() {
  process.env.UV_THREADPOOL_SIZE ||= '16' // only effective if set before the first threadpool use
  const force = process.argv.includes('--force')
  const ci = process.argv.indexOf('--codes')
  const only = ci >= 0 ? new Set((process.argv[ci + 1] ?? '').split(',').map((c) => c.trim()).filter(Boolean)) : null
  if (only && !only.size) throw new Error('--codes needs a comma-separated list of codes')
  const regenerate = (code: string) => (only ? only.has(code) : force)
  const t0 = Date.now()
  const cwd = process.cwd()
  const raw = resolve(cwd, 'data/raw')
  const manifest = JSON.parse(readFileSync(resolve(raw, 'manifest.json'), 'utf8'))
  const taxa = loadEbirdTaxonomy(resolve(raw, 'ebird-taxonomy.json'))
  const overrides = JSON.parse(readFileSync(resolve(cwd, 'data/overrides.json'), 'utf8')) as Overrides
  const huashuDir = resolve(raw, 'huashu')
  const { matches } = matchHuashu(loadHuashu(huashuDir), taxa, overrides)

  const speciesPath = resolve(cwd, 'public/data/species.v1.json')
  const file = JSON.parse(readFileSync(speciesPath, 'utf8')) as SpeciesFile
  const out = resolve(cwd, process.env.STICKERS_OUT ?? '../everybird-stickers')
  const dirs = { 128: resolve(out, 'v1/128'), 384: resolve(out, 'v1/384') }
  mkdirSync(dirs[128], { recursive: true })
  mkdirSync(dirs[384], { recursive: true })
  sharp.concurrency(1) // parallelism comes from the pool; UV_THREADPOOL_SIZE must be >= pool size (set in main)

  // Stand-ins last, so a sibling made in this run is on disk before it is copied.
  const todo = file.species.filter((s) => s.st && !s.standIn)
  const standIns = file.species.filter((s) => s.st && s.standIn)
  const masks = new Map<string, Record<string, [number, number, string]>>()
  let done = 0, skipped = 0
  const paths = (code: string) => ({ p128: resolve(dirs[128], `${code}.webp`), p384: resolve(dirs[384], `${code}.webp`) })
  const each = async (row: SpeciesFile['species'][number]) => {
    const { p128, p384 } = paths(row.code)
    if (!regenerate(row.code) && existsSync(p128) && existsSync(p384)) {
      skipped++
    } else if (row.standIn) {
      const sib = paths(row.standIn)
      if (!existsSync(sib.p128) || !existsSync(sib.p384)) throw new Error(`${row.code}: stand-in ${row.standIn} has no webp files`)
      copyFileSync(sib.p128, p128)
      copyFileSync(sib.p384, p384)
    } else {
      const rec = matches.get(row.code)
      if (!rec?.sticker) throw new Error(`${row.code}: st:true but no matched sticker (run build-species first)`)
      const v = await makeVariants(resolve(huashuDir, rec.sticker.file))
      writeFileSync(p128, v.v128)
      writeFileSync(p384, v.v384)
    }
    const { mask, ar } = await maskOf(p384)
    row.ar = ar
    const ord = row.ord || 'Unknown'
    if (!masks.has(ord)) masks.set(ord, {})
    masks.get(ord)![row.code] = mask
    if (++done % 500 === 0) console.log(`${done}/${todo.length + standIns.length}`)
  }
  await pool(todo, 10, each)
  await pool(standIns, 10, each)

  const maskDir = resolve(cwd, 'public/data/masks')
  mkdirSync(maskDir, { recursive: true })
  for (const [ord, rec] of masks) {
    const sorted = Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(resolve(maskDir, `${ord}.v1.json`), JSON.stringify(sorted))
  }
  writeFileSync(speciesPath, JSON.stringify(file))

  const commit: string = manifest.huashuCommit
  writeFileSync(resolve(out, 'README.md'), readme(commit))
  writeFileSync(resolve(out, 'LICENSE'), readFileSync(resolve(huashuDir, 'LICENSES/CC-BY-4.0.txt')))
  console.log(`stickers: ${todo.length + standIns.length} (${standIns.length} stand-ins; ${skipped} reused), orders: ${masks.size}, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
