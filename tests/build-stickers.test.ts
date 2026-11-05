import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { MASK, decodeMask, maskCell, maskFromAlpha } from '../src/lib/layout/mask'
import { makeVariants } from '../scripts/build-data/build-stickers'

// fixture: 300x160 transparent canvas with an opaque 100x100 square at x100..199, y30..129
const fixture = readFileSync(resolve(__dirname, 'fixtures/build/sticker.png'))

describe('sticker variants', () => {
  it('variants have long side 128 and 384 and keep aspect within 1px', async () => {
    // a wide fixture: crop to 100x50 content by drawing a non-square sticker
    const wide = await sharp({ create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 9, g: 9, b: 9, alpha: 1 } } }).png().toBuffer(), left: 50, top: 80 }])
      .png().toBuffer()
    const r = await makeVariants(wide)
    expect(r.ar).toBeCloseTo(2, 5)
    for (const [size, buf] of [[128, r.v128], [384, r.v384]] as const) {
      const m = await sharp(buf).metadata()
      expect(Math.max(m.width!, m.height!)).toBe(size)
      expect(Math.abs(m.height! - size / r.ar)).toBeLessThanOrEqual(1)
    }
  })

  it('trims the transparent margin (fixture becomes square)', async () => {
    const r = await makeVariants(fixture)
    expect(r.ar).toBe(1)
    const m = await sharp(r.v384).metadata()
    expect([m.width, m.height]).toEqual([384, 384])
  })
})

describe('mask', () => {
  it('mask has MASK cells on the long side and marks opaque cells', async () => {
    const { data, info } = await sharp(fixture).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    const alpha = new Uint8Array(info.width * info.height)
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3]
    // untrimmed 300x160: long side 300 -> 24 cells, short 160 -> round(12.8)=13
    const [w, h, b64] = maskFromAlpha(alpha, info.width, info.height)
    expect([w, h]).toEqual([MASK, 13])
    const m = decodeMask([w, h, b64])
    // cell = 12.5 px wide, 12.3 px tall. square x100..200 -> cols 8..15; y30..130 -> rows 3..9 (full rows 3..9 partial coverage)
    for (let x = 0; x < w; x++) expect(maskCell(m, x, 0)).toBe(false)
    expect(maskCell(m, 11, 6)).toBe(true)
    expect(maskCell(m, 2, 6)).toBe(false)
    expect(maskCell(m, 20, 6)).toBe(false)
    expect(maskCell(m, 11, 12)).toBe(false)
    let set = 0
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (maskCell(m, x, y)) set++
    expect(set).toBeGreaterThanOrEqual(8 * 6)
    expect(set).toBeLessThanOrEqual(9 * 8)
  })

  it('tall images get MASK cells on the height', () => {
    const [w, h] = maskFromAlpha(new Uint8Array(50 * 200).fill(255), 50, 200)
    expect([w, h]).toEqual([6, MASK])
  })

  it('decodeMask(maskFromAlpha(x)) round-trips', () => {
    const w = 48, h = 48, alpha = new Uint8Array(w * h)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha[y * w + x] = (x + y) % 4 < 2 ? 255 : 0
    const enc = maskFromAlpha(alpha, w, h)
    const m = decodeMask(enc)
    expect(m.w).toBe(24); expect(m.h).toBe(24)
    expect(m.bits.length).toBe(Math.ceil((24 * 24) / 8))
    // re-encode bits -> base64 matches
    expect(Buffer.from(m.bits).toString('base64')).toBe(enc[2])
    // 2x2 blocks of the diagonal stripe pattern average to 127.5 -> 128 > 40 -> every cell set
    expect(m.bits.every((b) => b === 0xff)).toBe(true)
  })
})
