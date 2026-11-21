// The masks file, public/data/masks.v3.bin: every order's collision masks in one binary file, written by
// scripts/build-data/data-files.ts from public/data/masks/<Order>.v1.json (the build's source of truth) and read by the
// layout worker and the collage's hit-testing (data-url.ts fetchAllMasks) and the link preview (og-server.ts).
//
//   file    = zlib (RFC 1950) of the payload, by fflate at level 9: served as application/octet-stream, which no host
//             compresses again, so the file is the same size on R2 and on the Worker's /data fallback
//   payload = "EBM3", u32 LE header length, header, dims, planes
//   header  = UTF-8: one line per order, "Order:code,code,…", orders and codes sorted, lines joined by "\n"
//   dims    = per mask, in header order: u8 w, u8 h (cells, the longest side MASK)
//   planes  = every mask's rows in order, each row 24 bits with cell x at bit 23 - x (left-aligned, zero past w);
//             plane p holds byte p of every row. Byte-aligned rows split into planes give brotli and deflate runs
//             that base64 in JSON hid (tests/mask-file.test.ts has the sizes).
//
// The decoded masks are mask.ts's `Mask` ({ w, h, bits }, bits row-major and packed), bit for bit what decodeMask gives
// for the same mask in the JSON.
import { MASK, type Mask, type RawMask } from './mask'

const MAGIC = 'EBM3'
/** order -> code -> mask. */
export type MaskSet = Record<string, Record<string, Mask>>

/** The payload for these per-order tables (raw JSON masks), before compression. */
export function encodeMaskFile(tables: Iterable<[string, Record<string, RawMask>]>): Uint8Array {
  const orders = [...tables].sort(([a], [b]) => (a < b ? -1 : 1))
  const lines: string[] = []
  const masks: RawMask[] = []
  for (const [ord, rec] of orders) {
    const codes = Object.keys(rec).sort()
    for (const name of [ord, ...codes]) if (!/^[A-Za-z0-9_-]+$/.test(name)) throw new Error(`masks: bad name ${JSON.stringify(name)}`)
    lines.push(`${ord}:${codes.join(',')}`)
    for (const c of codes) masks.push(rec[c])
  }
  const header = new TextEncoder().encode(lines.join('\n'))
  const rows = masks.reduce((n, [, h]) => n + h, 0)
  const out = new Uint8Array(8 + header.length + 2 * masks.length + 3 * rows)
  out.set(new TextEncoder().encode(MAGIC))
  new DataView(out.buffer).setUint32(4, header.length, true)
  out.set(header, 8)
  let d = 8 + header.length, r = 0
  const plane = d + 2 * masks.length
  for (const [w, h, b64] of masks) {
    if (!(w >= 1 && w <= MASK && h >= 1 && h <= MASK)) throw new Error(`masks: bad size ${w}x${h}`)
    out[d++] = w
    out[d++] = h
    const bin = atob(b64)
    const bit = (i: number) => (bin.charCodeAt(i >> 3) >> (7 - (i & 7))) & 1
    for (let y = 0; y < h; y++, r++) {
      let v = 0
      for (let x = 0; x < w; x++) v |= bit(y * w + x) << (23 - x)
      out[plane + r] = v >>> 16
      out[plane + rows + r] = (v >>> 8) & 255
      out[plane + 2 * rows + r] = v & 255
    }
  }
  return out
}

/** The masks in a payload (inflated). Throws on anything that isn't one. */
export function decodeMaskFile(buf: Uint8Array): MaskSet {
  if (new TextDecoder().decode(buf.subarray(0, 4)) !== MAGIC) throw new Error('masks: not a masks file')
  const hl = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(4, true)
  const lines = new TextDecoder().decode(buf.subarray(8, 8 + hl)).split('\n')
  const ords = lines.map((l) => { const at = l.indexOf(':'); return [l.slice(0, at), l.slice(at + 1).split(',')] as const })
  const n = ords.reduce((s, [, c]) => s + c.length, 0)
  const dims = 8 + hl
  let rows = 0, bytes = 0
  for (let i = 0; i < n; i++) { rows += buf[dims + 2 * i + 1]; bytes += (buf[dims + 2 * i] * buf[dims + 2 * i + 1] + 7) >> 3 }
  // One buffer for every mask's bits (each mask a view of its part): 11k small allocations cost more than the decode.
  const all = new Uint8Array(bytes)
  const p0 = dims + 2 * n, p1 = p0 + rows, p2 = p1 + rows
  if (p2 + rows !== buf.length) throw new Error('masks: wrong length')
  const out: MaskSet = {}
  let i = 0, r = 0, o = 0
  for (const [ord, codes] of ords) {
    const table: Record<string, Mask> = (out[ord] = {})
    for (const code of codes) {
      const w = buf[dims + 2 * i], h = buf[dims + 2 * i + 1]
      i++
      // Row by row into the packed bits: `acc` holds the n (< 8) bits not yet written, plus the w just read.
      const start = o
      let acc = 0, k = 0
      for (let y = 0; y < h; y++, r++) {
        acc = (acc << w) | (((buf[p0 + r] << 16) | (buf[p1 + r] << 8) | buf[p2 + r]) >>> (24 - w))
        k += w
        while (k >= 8) { k -= 8; all[o++] = (acc >>> k) & 255 }
        acc &= (1 << k) - 1
      }
      if (k) all[o++] = (acc << (8 - k)) & 255
      table[code] = { w, h, bits: all.subarray(start, o) }
    }
  }
  return out
}

/** zlib-inflate the file: the platform's DecompressionStream (browsers, workers, Node, Cloudflare), else fflate. */
export async function inflateMaskFile(file: ArrayBuffer): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'function') {
    return new Uint8Array(await new Response(new Response(file).body!.pipeThrough(new DecompressionStream('deflate'))).arrayBuffer())
  }
  const { unzlibSync } = await import('fflate')
  return unzlibSync(new Uint8Array(file))
}

/** The masks in a fetched or read masks file. */
export async function readMaskFile(file: ArrayBuffer): Promise<MaskSet> {
  return decodeMaskFile(await inflateMaskFile(file))
}
