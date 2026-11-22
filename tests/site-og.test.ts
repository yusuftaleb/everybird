// The site's link preview (src/lib/share/site-og.ts, drawn by scripts/build-data/build-og.tsx into public/og): the
// design checked by numbers, and the committed files' format, size and dimensions.
import { readFileSync, statSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { LANGS } from '@/i18n/langs'
import { getMessages } from '@/i18n/server'
import { WIDE_CHAR } from '@/lib/layout/count-box'
import type { SamplePackFile } from '@/lib/list/sample-pack'
import { SITE_OG, SITE_OG_BADGE, SITE_OG_GAP, SITE_OG_TYPE, badgeRect, centreSquare, overlaps, siteOgPath, siteOgTiles, siteTagline } from '@/lib/share/site-og'
import glyphs from './fixtures/glyph-advances.json'

const pack = JSON.parse(readFileSync('public/data/sample-pack.v1.json', 'utf8')) as SamplePackFile
const seed = pack.layouts.find((l) => l.layout === 'wide')!
const tiles = siteOgTiles(seed)

type FontKey = keyof typeof glyphs.fonts
const adv = (f: FontKey, c: string) => (glyphs.fonts[f].advances as Record<string, number>)[c]
/** Width at `px` (the fit tests' model: Cyrillic from Noto Sans, kana and Han one em, ’ as '). */
function width(font: FontKey, noto: FontKey, s: string, px: number, spacingEm = 0): number {
  return [...s.replace(/’/g, "'")].reduce((n, c) => {
    const a = adv(font, c) ?? adv(noto, c) ?? (WIDE_CHAR.test(c) ? 1 : undefined)
    if (a === undefined) throw new Error(`no advance for ${JSON.stringify(c)}`)
    return n + a + spacingEm
  }, glyphs.fonts[font].kernWidenEm) * px
}
/** Greedy lines at `room`: Latin and Cyrillic break at spaces, kana and Han anywhere. */
function lines(s: string, px: number, room: number): string[] {
  const words = s.match(WIDE_CHAR) ? [...s] : s.split(' ').map((w, i) => (i ? ` ${w}` : w))
  const out: string[] = []
  for (const w of words) {
    const last = out.at(-1)
    if (last !== undefined && width('satoshi-500', 'noto-sans-500', (last + w).trim(), px) <= room) out[out.length - 1] = last + w
    else out.push(w.trim())
  }
  return out
}

describe('the collage', () => {
  it('fills the card edge to edge with the sample in Free, at the app\'s own sizes', () => {
    expect(tiles.length).toBeGreaterThan(150)
    const side = tiles.map((t) => Math.max(t.box[2], t.box[3])).sort((a, b) => a - b)
    expect(side[side.length >> 1]).toBeGreaterThan(50) // about a sixth of a 400 px chat card: still birds
    // birds reach every edge of the card
    expect(Math.min(...tiles.map((t) => t.box[0]))).toBeLessThan(12)
    expect(Math.max(...tiles.map((t) => t.box[0] + t.box[2]))).toBeGreaterThan(SITE_OG.width - 12)
    expect(Math.min(...tiles.map((t) => t.box[1]))).toBeLessThan(0)
    expect(Math.max(...tiles.map((t) => t.box[1] + t.box[3]))).toBeGreaterThan(SITE_OG.height)
  })

  it('no sticker box touches the badge or comes within its gap', () => {
    const [x, y, w, h] = badgeRect()
    const clear = [x - SITE_OG_GAP, y - SITE_OG_GAP, w + 2 * SITE_OG_GAP, h + 2 * SITE_OG_GAP] as const
    expect(tiles.filter((t) => overlaps([...clear], t.box))).toEqual([])
    // the seed's own birds there were left out, not moved
    const k = SITE_OG.width / seed.W
    for (const t of tiles.slice(0, 20)) {
      const i = seed.codes.indexOf(t.code)
      expect(t.box[2]).toBeCloseTo(seed.boxes[4 * i + 2] * k, 6)
    }
  })

  it('the badge sits in the card\'s middle, inside the central square a chat may crop to', () => {
    const [x, y, w, h] = badgeRect()
    const [sx, sy, sw, sh] = centreSquare()
    expect([sx, sy, sw, sh]).toEqual([285, 0, 630, 630])
    expect(x).toBeGreaterThanOrEqual(sx + 24)
    expect(x + w).toBeLessThanOrEqual(sx + sw - 24)
    expect(y).toBeGreaterThanOrEqual(sy + 24)
    expect(y + h).toBeLessThanOrEqual(sy + sh - 24)
    expect(x + w / 2).toBe(SITE_OG.width / 2)
    expect(y + h / 2).toBe(SITE_OG.height / 2)
  })
})

describe('the badge\'s words, in every language', () => {
  const T = SITE_OG_TYPE
  const room = SITE_OG_BADGE.w - 2 * SITE_OG_BADGE.pad - 4 - 4 // the 2 px border each side, 4 px for kerning and rounding
  it('the mark and "Everybird" fit one row', () => {
    expect(T.mark + T.gap + width('cabinet-grotesk-700', 'noto-sans-700', 'Everybird', T.word, -0.01)).toBeLessThan(room)
  })

  it.each(LANGS)('%s: the tagline fits at most two lines, and the badge holds them', (lang) => {
    const title = getMessages(lang).page.meta.title
    expect(title.startsWith('Everybird · ')).toBe(true)
    const tagline = siteTagline(title)
    expect(tagline).not.toMatch(/—|!|！/)
    const ls = lines(tagline, T.tagline, room)
    expect(ls.length).toBeLessThanOrEqual(2)
    for (const l of ls) expect(width('satoshi-500', 'noto-sans-500', l, T.tagline)).toBeLessThanOrEqual(room)
    const height = 2 * SITE_OG_BADGE.pad + 4 + T.mark + T.below + ls.length * T.tagline * T.line
    expect(height).toBeLessThanOrEqual(SITE_OG_BADGE.h)
  })
})

describe('the committed images', () => {
  it.each(LANGS)('%s: a 1200 × 630 JPEG under 300 KB', async (lang) => {
    const file = `public${siteOgPath(lang)}`
    expect(statSync(file).size).toBeLessThan(300 * 1024)
    const m = await sharp(file).metadata()
    expect([m.format, m.width, m.height]).toEqual(['jpeg', SITE_OG.width, SITE_OG.height])
  })

  it('each language has its own picture (the tagline differs)', () => {
    const bytes = LANGS.map((l) => readFileSync(`public${siteOgPath(l)}`).toString('base64'))
    expect(new Set(bytes).size).toBe(LANGS.length)
  })
})
