// Builds sticker variants (long side 128 and 384, trimmed webp), collision masks and `ar`.
// Run AFTER build-species: npx tsx scripts/build-data/build-stickers.ts [--force | --codes a,b,...]
// --codes regenerates just those codes (e.g. the ones check-stickers.ts reports) and merges their masks and `ar` into
// the committed public/data/masks/*.json and species.v1.json, so it needs no other sticker on disk; species without
// a sticker leave the masks. Without --codes every sticker's mask is measured from its file on disk.
// Output: ${STICKERS_OUT:-../everybird-stickers}/v1/{128,384}/<code>.webp (<code>.<sv>.webp for a versioned sticker,
// see src/lib/sticker-url.ts), public/data/masks/<Order>.v1.json, and the `ar` values in public/data/species.v1.json
// (build-stickers is the source of truth for `ar`).
// Refuses to run unless data/raw/huashu is at data/huashu.lock.json's commit, and to build any sticker whose source
// blob isn't the one the lock records as published (huashu-pin.ts).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { maskFromAlpha } from '../../src/lib/layout/mask'
import type { Overrides, SpeciesFile, SpeciesRow } from '../../src/lib/species/types'
import { LARGE, SMALL, stickerPath } from '../../src/lib/sticker-url'
import { loadEbirdTaxonomy, loadHuashu, matchHuashu } from './build-species'
import { assertRawPinned, assertShippedSource, readLock } from './huashu-pin'

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

export type Mask = [number, number, string]
/** Every order's mask table: order -> code -> mask (public/data/masks/<Order>.v1.json). */
export type MaskTables = Map<string, Record<string, Mask>>

export function readMaskTables(dir: string): MaskTables {
  const out: MaskTables = new Map()
  if (!existsSync(dir)) return out
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.v1.json')).sort()) {
    out.set(f.slice(0, -'.v1.json'.length), JSON.parse(readFileSync(resolve(dir, f), 'utf8')))
  }
  return out
}

/** Writes each order's table with its codes sorted (the format build-stickers has always written). */
export function writeMaskTables(dir: string, tables: MaskTables): void {
  mkdirSync(dir, { recursive: true })
  for (const [ord, rec] of tables) {
    const sorted = Object.fromEntries(Object.entries(rec).sort(([a], [b]) => (a < b ? -1 : 1)))
    writeFileSync(resolve(dir, `${ord}.v1.json`), JSON.stringify(sorted))
  }
}

/**
 * Rebuilds the stickers of `codes` (from `source(code)`, the huashu file) into `out` and merges every species' mask
 * and `ar` into `masks` and `rows` (both mutated): a rebuilt sticker is measured from its new 384 file; any other
 * sticker keeps the mask it has (or, missing one, is measured from its file in `out`); a species without a sticker
 * leaves the masks and gets ar 1. Returns the files written, relative to `out`.
 */
export async function updateStickers(o: {
  rows: SpeciesRow[]; codes: ReadonlySet<string>; source: (code: string) => string; out: string; masks: MaskTables
  concurrency?: number
  /** Called with each source's bytes before it is built; throw to refuse (build-stickers checks the lock). */
  check?: (code: string, source: Buffer) => void
}): Promise<string[]> {
  const { rows, codes, out, masks } = o
  const where = new Map<string, string>() // code -> order holding its mask
  for (const [ord, rec] of masks) for (const c of Object.keys(rec)) where.set(c, ord)
  const drop = (code: string) => { const ord = where.get(code); if (ord) delete masks.get(ord)![code] }
  const put = (row: SpeciesRow, mask: Mask) => {
    drop(row.code)
    const ord = row.ord || 'Unknown'
    if (!masks.has(ord)) masks.set(ord, {})
    masks.get(ord)![row.code] = mask
  }
  const written: string[] = []
  let rebuilt = 0
  await pool(rows, o.concurrency ?? 8, async (row) => {
    if (!row.st) { drop(row.code); row.ar = 1; return }
    if (codes.has(row.code)) {
      const src = readFileSync(o.source(row.code))
      o.check?.(row.code, src)
      const v = await makeVariants(src)
      for (const [size, buf] of [[SMALL, v.v128], [LARGE, v.v384]] as const) {
        const rel = stickerPath(row.code, size, row.sv)
        mkdirSync(resolve(out, rel, '..'), { recursive: true })
        writeFileSync(resolve(out, rel), buf)
        written.push(rel)
      }
      const { mask, ar } = await maskOf(v.v384)
      row.ar = ar
      put(row, mask)
      if (++rebuilt % 500 === 0) console.log(`${rebuilt}/${codes.size} stickers rebuilt`)
      return
    }
    const ord = where.get(row.code)
    if (ord && (row.ord || 'Unknown') === ord) return // unchanged: keeps its mask and ar
    const p384 = resolve(out, stickerPath(row.code, LARGE, row.sv))
    if (!existsSync(p384)) throw new Error(`${row.code}: has a sticker but no mask and no ${p384}`)
    const { mask, ar } = await maskOf(p384)
    row.ar = ar
    put(row, mask)
  })
  return written.sort()
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
species share one huashu sticker, each code gets its own copy.

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
  const lock = readLock(cwd)
  assertRawPinned(manifest, lock)
  // Never build a sticker from a source other than the one the lock records as published: after a sync, an old
  // drawing under a new versioned name (or a new one under an old, immutable name) would go out.
  const check = (code: string, src: Buffer) => assertShippedSource(code, src, lock)
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

  const todo = file.species.filter((s) => s.st)
  const sourceOf = (code: string) => {
    const rec = matches.get(code)
    if (!rec?.sticker) throw new Error(`${code}: st:true but no matched sticker (run build-species first)`)
    return resolve(huashuDir, rec.sticker.file)
  }
  const maskDir = resolve(cwd, 'public/data/masks')
  if (only) {
    const masks = readMaskTables(maskDir)
    const written = await updateStickers({ rows: file.species, codes: only, source: sourceOf, out, masks, concurrency: 10, check })
    writeMaskTables(maskDir, masks)
    writeFileSync(speciesPath, JSON.stringify(file))
    console.log(`stickers: ${written.length / 2} rebuilt, masks merged, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
    return
  }
  const masks = new Map<string, Record<string, Mask>>()
  let done = 0, skipped = 0
  await pool(todo, 10, async (row) => {
    const src = sourceOf(row.code)
    const p128 = resolve(out, stickerPath(row.code, SMALL, row.sv)), p384 = resolve(out, stickerPath(row.code, LARGE, row.sv))
    if (!regenerate(row.code) && existsSync(p128) && existsSync(p384)) {
      skipped++
    } else {
      const buf = readFileSync(src)
      check(row.code, buf)
      const v = await makeVariants(buf)
      writeFileSync(p128, v.v128)
      writeFileSync(p384, v.v384)
    }
    const { mask, ar } = await maskOf(p384)
    row.ar = ar
    const ord = row.ord || 'Unknown'
    if (!masks.has(ord)) masks.set(ord, {})
    masks.get(ord)![row.code] = mask
    if (++done % 500 === 0) console.log(`${done}/${todo.length}`)
  })

  writeMaskTables(maskDir, masks)
  writeFileSync(speciesPath, JSON.stringify(file))

  const commit: string = manifest.huashuCommit
  writeFileSync(resolve(out, 'README.md'), readme(commit))
  writeFileSync(resolve(out, 'LICENSE'), readFileSync(resolve(huashuDir, 'LICENSES/CC-BY-4.0.txt')))
  console.log(`stickers: ${todo.length} (${skipped} reused), orders: ${masks.size}, ${((Date.now() - t0) / 1000).toFixed(0)}s`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
