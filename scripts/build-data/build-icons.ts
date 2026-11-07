// Builds the site's icons: npx tsx scripts/build-data/build-icons.ts
// The mark is the origami bird from yusuftaleb.com's nav (Icons8, Fluent Systems Regular "Origami", id JUYuJxA8MPVT,
// unmodified shape; Icons8's free licence asks for a link, given on About#credits). Source: a 512px black-on-
// transparent PNG at .inbox/origami-icons8-512.png (git-ignored: Icons8's files stay out of the repo). Its alpha is
// the mask; the bird is recoloured, never redrawn.
// Every icon has a backdrop: the bird in Accent on a Paper tile (dark variant: coral on the dark Paper), at about
// 62% of the tile, optically centred. Output (committed):
//   public/favicon.ico                       16, 32, 48 (PNG-in-ICO), light: the legacy /favicon.ico request
//   public/icons/icon-{16,32}.png            light tab icons;  icon-dark-{16,32}.png  dark ones (media query)
//   public/icons/icon-{192,512}.png          rounded Paper tiles for the web manifest (app/manifest.ts)
//   public/icons/apple-icon.png              180, full-bleed Paper (iOS rounds the corners itself)
// app/layout.tsx declares them (metadata.icons) so the dark variant can carry its media query; an app/favicon.ico
// would add a sizes="any" link that browsers prefer over the media-matched ones.
// At 16px the bird's strokes are thickened a little (a dilation of the mask before scaling) so it stays legible.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import sharp from 'sharp'

const ROOT = process.cwd() // run from the repo root, as the other build scripts
const SOURCE = join(ROOT, '.inbox/origami-icons8-512.png')
type RGB = { r: number; g: number; b: number }
const hex = (h: string): RGB => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) })
export const LIGHT = { tile: hex('#f6f4ef'), bird: hex('#92140c') } // Paper, Accent
export const DARK = { tile: hex('#1e1e24'), bird: hex('#f06a5f') } // dark Paper, dark Accent (coral)
const BIRD_SHARE = 0.62 // the bird's longer side, as a share of the tile
const RADIUS = 0.22 // tile corner radius, as a share of the tile (tab and manifest icons)

type Mask = { a: Float32Array; w: number; h: number }

/** The source's alpha, cropped to the bird. */
async function birdMask(src: string): Promise<Mask> {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++)
      if (data[(y * info.width + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 < 0) throw new Error('the origami PNG is fully transparent')
  const w = x1 - x0 + 1, h = y1 - y0 + 1
  const a = new Float32Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = data[((y + y0) * info.width + x + x0) * 4 + 3] / 255
  return { a, w, h }
}

/** The mask thickened by r source pixels (a round max filter), with r of padding so nothing is cut. */
function dilate(m: Mask, r: number): Mask {
  if (r <= 0) return m
  const R = Math.ceil(r), w = m.w + 2 * R, h = m.h + 2 * R
  const a = new Float32Array(w * h)
  const offs: [number, number][] = []
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.hypot(dx, dy) <= r) offs.push([dx, dy])
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const v = m.a[y * m.w + x]
      if (v <= 0) continue
      for (const [dx, dy] of offs) {
        const i = (y + R + dy) * w + (x + R + dx)
        if (v > a[i]) a[i] = v
      }
    }
  return { a, w, h }
}

/** The bird mask scaled to fit `box` (contain), as an 8-bit alpha image. */
async function scaled(m: Mask, box: number): Promise<{ data: Buffer; w: number; h: number }> {
  const k = box / Math.max(m.w, m.h)
  const w = Math.max(1, Math.round(m.w * k)), h = Math.max(1, Math.round(m.h * k))
  const grey = Buffer.alloc(m.w * m.h)
  for (let i = 0; i < grey.length; i++) grey[i] = Math.round(m.a[i] * 255)
  // One channel out: a raw 1-channel input comes back as sRGB from resize unless the channel is extracted.
  const { data, info } = await sharp(grey, { raw: { width: m.w, height: m.h, channels: 1 } })
    .resize(w, h, { kernel: 'lanczos3' }).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
  if (info.channels !== 1 || data.length !== w * h) throw new Error(`mask resize gave ${info.channels} channels`)
  return { data, w, h }
}

/** Rounded-square coverage at pixel (x, y) of a size × size tile (radius r px), antialiased over the pixel. */
function tileCoverage(x: number, y: number, size: number, r: number): number {
  if (r <= 0) return 1
  let hit = 0
  const S = 4
  for (let sy = 0; sy < S; sy++)
    for (let sx = 0; sx < S; sx++) {
      const px = x + (sx + 0.5) / S, py = y + (sy + 0.5) / S
      const cx = Math.min(Math.max(px, r), size - r), cy = Math.min(Math.max(py, r), size - r)
      if (Math.hypot(px - cx, py - cy) <= r) hit++
    }
  return hit / (S * S)
}

/** One icon: the tile (rounded or full bleed) with the bird centred on it. */
export async function renderIcon(m: Mask, size: number, theme: typeof LIGHT, opts: { rounded: boolean }): Promise<Buffer> {
  // At 16px a regular-weight stroke falls under a pixel: thicken it (in source pixels) before scaling.
  const thick = size <= 16 ? dilate(m, Math.max(m.w, m.h) * 0.010) : size <= 32 ? dilate(m, Math.max(m.w, m.h) * 0.008) : m
  const bird = await scaled(thick, Math.round(size * BIRD_SHARE))
  // Optical centre: the origami's weight sits low, so nudge it up by 2% of the tile.
  const left = Math.round((size - bird.w) / 2), top = Math.round((size - bird.h) / 2 - size * 0.02)
  const r = opts.rounded ? size * RADIUS : 0
  const out = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const t = tileCoverage(x, y, size, r)
      const bx = x - left, by = y - top
      const b = bx >= 0 && by >= 0 && bx < bird.w && by < bird.h ? bird.data[by * bird.w + bx] / 255 : 0
      const i = (y * size + x) * 4
      out[i] = Math.round(theme.tile.r + (theme.bird.r - theme.tile.r) * b)
      out[i + 1] = Math.round(theme.tile.g + (theme.bird.g - theme.tile.g) * b)
      out[i + 2] = Math.round(theme.tile.b + (theme.bird.b - theme.tile.b) * b)
      out[i + 3] = Math.round(255 * t)
    }
  const img = sharp(out, { raw: { width: size, height: size, channels: 4 } })
  return (opts.rounded ? img : img.removeAlpha()).png({ compressionLevel: 9 }).toBuffer()
}

/** An ICO holding PNG images (supported by every current browser). */
export function ico(images: { size: number; data: Buffer }[]): Buffer {
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
  if (!existsSync(SOURCE)) throw new Error(`missing ${SOURCE}: the Icons8 "Origami" PNG (512px, black on transparent)`)
  const m = await birdMask(SOURCE)
  const tab = (size: number, theme: typeof LIGHT) => renderIcon(m, size, theme, { rounded: true })
  write('public/favicon.ico', ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, data: await tab(size, LIGHT) })))))
  for (const s of [16, 32]) {
    write(`public/icons/icon-${s}.png`, await tab(s, LIGHT))
    write(`public/icons/icon-dark-${s}.png`, await tab(s, DARK))
  }
  write('public/icons/icon-192.png', await tab(192, LIGHT))
  write('public/icons/icon-512.png', await tab(512, LIGHT))
  write('public/icons/apple-icon.png', await renderIcon(m, 180, LIGHT, { rounded: false }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(e); process.exit(1) })
