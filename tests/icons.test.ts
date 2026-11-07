import { existsSync, readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import manifest from '../app/manifest'
import { SITE_ICONS } from '../src/lib/site-icons'

// The origami-bird icons (scripts/build-data/build-icons.ts): sizes, backdrops, the dark variant and the declarations.
const px = async (p: string, x: number, y: number) => {
  const { data, info } = await sharp(p).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * 4
  return [...data.subarray(i, i + 4)]
}

describe('site icons', () => {
  it('favicon.ico (public/, so no sizes="any" link outranks the media-matched PNGs) holds PNGs at 16, 32 and 48', () => {
    expect(existsSync('app/favicon.ico')).toBe(false)
    const b = readFileSync('public/favicon.ico')
    expect(b.readUInt16LE(2)).toBe(1)
    const n = b.readUInt16LE(4)
    expect(Array.from({ length: n }, (_, i) => b.readUInt8(6 + 16 * i))).toEqual([16, 32, 48])
    for (let i = 0; i < n; i++) {
      const off = b.readUInt32LE(6 + 16 * i + 12)
      expect(b.subarray(off, off + 4).toString('latin1')).toBe('\x89PNG')
    }
  })
  it('tab icons are rounded tiles: Paper (light) or the dark tile, with a transparent corner', async () => {
    for (const s of [16, 32]) {
      expect(await sharp(`public/icons/icon-${s}.png`).metadata()).toMatchObject({ width: s, height: s })
      expect((await px(`public/icons/icon-${s}.png`, 0, 0))[3]).toBe(0) // rounded corner
      expect(await px(`public/icons/icon-${s}.png`, Math.round(s * 0.15), Math.round(s / 2))).toEqual([0xf6, 0xf4, 0xef, 255])
      expect(await px(`public/icons/icon-dark-${s}.png`, Math.round(s * 0.15), Math.round(s / 2))).toEqual([0x1e, 0x1e, 0x24, 255])
    }
  })
  it('the apple icon is full-bleed Paper (iOS rounds it); the manifest icons are 192 and 512', async () => {
    expect(await sharp('public/icons/apple-icon.png').metadata()).toMatchObject({ width: 180, height: 180, hasAlpha: false })
    expect((await px('public/icons/apple-icon.png', 0, 0)).slice(0, 3)).toEqual([0xf6, 0xf4, 0xef])
    for (const s of [192, 512]) expect(await sharp(`public/icons/icon-${s}.png`).metadata()).toMatchObject({ width: s, height: s })
    const m = manifest()
    expect(m).toMatchObject({ name: 'Everybird', background_color: '#f6f4ef', theme_color: '#f6f4ef' })
    expect(m.icons?.map((i) => i.src)).toEqual(['/icons/icon-192.png', '/icons/icon-512.png'])
  })
  it('the layout declares light and dark tab icons by media query, and the apple icon', () => {
    const icons = SITE_ICONS as unknown as { icon: { url: string; media?: string }[]; apple: { url: string }[] }
    expect(icons.icon.filter((i) => i.media === '(prefers-color-scheme: dark)').map((i) => i.url)).toEqual(['/icons/icon-dark-16.png', '/icons/icon-dark-32.png'])
    expect(icons.icon.filter((i) => i.media === '(prefers-color-scheme: light)').map((i) => i.url)).toEqual(['/icons/icon-16.png', '/icons/icon-32.png'])
    expect(icons.apple[0].url).toBe('/icons/apple-icon.png')
  })
})
