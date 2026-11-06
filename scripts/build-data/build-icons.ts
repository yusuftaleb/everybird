// Builds the site's icons from the Veery sticker (Yusuf's pick): npx tsx scripts/build-data/build-icons.ts
// Source: huashu's original (data/raw/huashu/stickers/…/Catharus_fuscescens.webp, 1070 px) when data/raw is
// present, else the trimmed 384 sticker (${STICKERS_OUT:-../everybird-stickers}/v1/384/veery.webp).
// Output (committed; reproducible from the same source):
//   app/favicon.ico        16, 32 and 48 (PNG-in-ICO), transparent, with a thin Paper halo
//   app/icon.png           256, transparent, with the halo (browsers scale it for tabs and bookmarks)
//   app/apple-icon.png     180 on Paper, ~12% padding (iOS rounds the corners itself)
//   public/icons/icon-192.png, icon-512.png   on Paper, ~12% padding (the web manifest, app/manifest.ts)
// The halo: the bird's alpha dilated by about 1px (scaled with size), filled with Paper under the bird, so the
// brown bird still reads on a dark browser tab bar; on a light tab bar Paper barely shows.
// The sticker is CC BY 4.0 (huashu-bird-sticker); About#credits covers it.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'

const ROOT = process.cwd() // run from the repo root, as the other build scripts
const ORIGINAL = join(ROOT, 'data/raw/huashu/stickers/Passeriformes/Turdidae/Catharus_fuscescens.webp')
const STICKER = join(process.env.STICKERS_OUT ?? join(ROOT, '..', 'everybird-stickers'), 'v1/384/veery.webp')
const PAPER = { r: 0xf6, g: 0xf4, b: 0xef }

type Img = { data: Buffer; w: number; h: number } // RGBA

/** The bird alone: cropped to its opaque pixels (alpha > 8). */
async function trimmed(src: string): Promise<Img> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 < 0) throw new Error('sticker is fully transparent')
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const out = await sharp(src).ensureAlpha().extract({ left: x0, top: y0, width: w, height: h }).raw().toBuffer()
  return { data: out, w, h }
}

/** The bird fitted (contain) into size − 2·pad, centred on a transparent size × size canvas. */
async function placed(bird: Img, size: number, pad: number): Promise<Buffer> {
  const box = size - 2 * pad
  const k = Math.min(box / bird.w, box / bird.h)
  const w = Math.max(1, Math.round(bird.w * k)), h = Math.max(1, Math.round(bird.h * k))
  const small = await sharp(bird.data, { raw: { width: bird.w, height: bird.h, channels: 4 } })
    .resize(w, h, { kernel: 'lanczos3' }).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: small, left: Math.round((size - w) / 2), top: Math.round((size - h) / 2) }])
    .raw().toBuffer()
}

/** Paper under the bird where its alpha, dilated by r px (round brush), is set; the bird composited on top. */
function withHalo(rgba: Buffer, size: number, r: number, strength = 0.9): Buffer {
  const a = new Float32Array(size * size)
  for (let i = 0; i < size * size; i++) a[i] = rgba[i * 4 + 3] / 255
  const halo = new Float32Array(size * size)
  const R = Math.ceil(r)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let m = 0
      for (let dy = -R; dy <= R; dy++)
        for (let dx = -R; dx <= R; dx++) {
          const d = Math.hypot(dx, dy)
          if (d > r + 0.5) continue
          const xx = x + dx, yy = y + dy
          if (xx < 0 || yy < 0 || xx >= size || yy >= size) continue
          const v = a[yy * size + xx] * Math.min(1, r + 0.5 - d) // soft edge
          if (v > m) m = v
        }
      halo[y * size + x] = m * strength
    }
  const out = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const fa = a[i], ha = halo[i]
    const oa = fa + ha * (1 - fa)
    if (oa <= 0) continue
    for (const [c, p] of [[0, PAPER.r], [1, PAPER.g], [2, PAPER.b]] as const)
      out[i * 4 + c] = Math.round((rgba[i * 4 + c] * fa + p * ha * (1 - fa)) / oa)
    out[i * 4 + 3] = Math.round(oa * 255)
  }
  return out
}

const png = (rgba: Buffer, size: number) => sharp(rgba, { raw: { width: size, height: size, channels: 4 } }).png({ compressionLevel: 9 }).toBuffer()

/** Tab-size icon: a tight crop (the bird nearly fills the square), transparent, with the halo. */
async function tabIcon(bird: Img, size: number): Promise<Buffer> {
  const r = Math.max(1, size / 32)
  const pad = Math.ceil(r) + (size >= 48 ? Math.round(size * 0.03) : 0)
  return png(withHalo(await placed(bird, size, pad), size, r), size)
}

/** Launcher icon: the bird on Paper with ~12% padding. */
async function onPaper(bird: Img, size: number): Promise<Buffer> {
  const bird8 = await placed(bird, size, Math.round(size * 0.12))
  const flat = await sharp({ create: { width: size, height: size, channels: 4, background: { ...PAPER, alpha: 1 } } })
    .composite([{ input: bird8, raw: { width: size, height: size, channels: 4 } }])
    .removeAlpha().png({ compressionLevel: 9 }).toBuffer()
  return flat
}

/** An ICO holding PNG images (supported by every current browser). */
function ico(images: { size: number; data: Buffer }[]): Buffer {
  const head = Buffer.alloc(6 + 16 * images.length)
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(images.length, 4)
  let offset = head.length
  images.forEach(({ size, data }, i) => {
    const e = 6 + 16 * i
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1)
    head.writeUInt8(0, e + 2); head.writeUInt8(0, e + 3)
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6)
    head.writeUInt32LE(data.length, e + 8); head.writeUInt32LE(offset, e + 12)
    offset += data.length
  })
  return Buffer.concat([head, ...images.map((i) => i.data)])
}

function write(rel: string, data: Buffer) {
  const p = join(ROOT, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, data)
  console.log(`${rel}  ${data.length} B`)
}

async function main() {
  const src = existsSync(ORIGINAL) ? ORIGINAL : STICKER
  if (!existsSync(src)) throw new Error(`no Veery source: ${ORIGINAL} or ${STICKER}`)
  console.log(`source: ${src.replace(ROOT + '/', '')}`)
  const bird = await trimmed(src)
  write('app/favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await tabIcon(bird, size) })))))
  write('app/icon.png', await tabIcon(bird, 256))
  write('app/apple-icon.png', await onPaper(bird, 180))
  write('public/icons/icon-192.png', await onPaper(bird, 192))
  write('public/icons/icon-512.png', await onPaper(bird, 512))
}

main().catch((e) => { console.error(e); process.exit(1) })
