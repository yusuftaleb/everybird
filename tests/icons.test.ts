import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import manifest from '../app/manifest'

// The Veery icons (scripts/build-data/build-icons.ts): sizes, transparency and the manifest's references.
describe('site icons', () => {
  it('favicon.ico holds PNGs at 16, 32 and 48', () => {
    const b = readFileSync('app/favicon.ico')
    expect(b.readUInt16LE(2)).toBe(1)
    const n = b.readUInt16LE(4)
    const sizes = Array.from({ length: n }, (_, i) => b.readUInt8(6 + 16 * i))
    expect(sizes).toEqual([16, 32, 48])
    for (let i = 0; i < n; i++) {
      const off = b.readUInt32LE(6 + 16 * i + 12)
      expect(b.subarray(off, off + 4).toString('latin1')).toBe('\x89PNG')
    }
  })
  it('icon.png is transparent; apple-icon and the manifest icons are opaque on Paper', async () => {
    const meta = async (p: string) => sharp(p).metadata()
    expect(await meta('app/icon.png')).toMatchObject({ width: 256, height: 256, hasAlpha: true })
    expect(await meta('app/apple-icon.png')).toMatchObject({ width: 180, height: 180, hasAlpha: false })
    for (const s of [192, 512]) expect(await meta(`public/icons/icon-${s}.png`)).toMatchObject({ width: s, height: s, hasAlpha: false })
    const { data } = await sharp('app/apple-icon.png').raw().toBuffer({ resolveWithObject: true })
    expect([...data.subarray(0, 3)]).toEqual([0xf6, 0xf4, 0xef]) // the corner is Paper
  })
  it('the manifest is Everybird on Paper and points at the 192 and 512 icons', () => {
    const m = manifest()
    expect(m).toMatchObject({ name: 'Everybird', background_color: '#f6f4ef', theme_color: '#f6f4ef' })
    expect(m.icons?.map((i) => i.src)).toEqual(['/icons/icon-192.png', '/icons/icon-512.png'])
  })
})
