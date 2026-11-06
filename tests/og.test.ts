import { describe, expect, it, vi } from 'vitest'
import type { SharePayload } from '@/lib/share/link'
import { OG_CACHE_COMPLETE, OG_CACHE_DEGRADED, OG_DESCRIPTION, ogCacheControl, ogName, ogResponseOptions, ogTitle, pickOgBirds, pickOgStickers, tryDecodeShare } from '@/lib/share/og'
import { parseFontFaces } from '@/lib/share/og-server'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ code: `b${i}`, to: (i + 1) * 10 }))

describe('pickOgBirds', () => {
  it('keeps a short list whole, in taxonomic order', () => {
    const shuffled = rows(40).reverse()
    expect(pickOgBirds(shuffled).map((b) => b.to)).toEqual(rows(40).map((b) => b.to))
  })
  it('steps evenly through taxonomic order, at most 60', () => {
    const picked = pickOgBirds(rows(197))
    expect(picked).toHaveLength(60)
    expect(new Set(picked.map((b) => b.code)).size).toBe(60)
    const idx = picked.map((b) => Number(b.code.slice(1)))
    expect(idx).toEqual([...idx].sort((a, b) => a - b))
    const gaps = idx.slice(1).map((v, i) => v - idx[i])
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1) // even steps
    expect(idx[0]).toBeLessThan(4) // covers the start and the end of the taxonomy
    expect(idx[59]).toBeGreaterThan(192)
  })
  it('handles exactly 60, 61 and an empty list', () => {
    expect(pickOgBirds(rows(60))).toHaveLength(60)
    expect(pickOgBirds(rows(61))).toHaveLength(60)
    expect(pickOgBirds([])).toEqual([])
  })
  it('does not mutate its input', () => {
    const input = rows(100).reverse()
    const copy = [...input]
    pickOgBirds(input)
    expect(input).toEqual(copy)
  })
})

describe('pickOgStickers', () => {
  it('picks only birds that have a sticker, so the card has no holes', () => {
    const all = Array.from({ length: 200 }, (_, i) => ({ code: `b${i}`, to: i + 1, st: i % 3 !== 0 }))
    const picked = pickOgStickers(all)
    expect(picked).toHaveLength(60)
    expect(picked.every((b) => b.st)).toBe(true)
    expect(pickOgStickers([{ code: 'x', to: 1, st: false }])).toEqual([])
  })
})

describe('metadata strings', () => {
  const p = (name: string | undefined, n: number): SharePayload => ({ v: 1, name, birds: Array.from({ length: n }, (_, i) => ({ code: `b${i}` })) })
  it('titles lead with the person and their count, with a colon (no em dash), and stay generic for a broken link', () => {
    expect(ogTitle(p('Ada', 197))).toBe("Ada's life list: 197 species")
    expect(ogTitle(p(undefined, 3))).toBe('A life list: 3 species')
    expect(ogTitle(p('  ', 1))).toBe('A life list: 1 species')
    expect(ogTitle(p('Ada', 1234))).toBe("Ada's life list: 1,234 species")
    expect(ogTitle(null)).toBe('Everybird')
    expect(ogTitle(p('Ada', 2))).not.toMatch(/—/)
  })
  it('the header name matches the shared page h1; the brand is not a possessive', () => {
    expect(ogName({ name: 'Ada Birder' })).toBe("Ada Birder's life list")
    expect(ogName({})).toBe("A birder's life list")
  })
  it('describes what Everybird is, for someone who has never heard of it', () => {
    expect(OG_DESCRIPTION).toBe("Everybird turns a birder's life list into a sticker collage.")
  })
  it('a broken or newer token decodes to null', () => {
    expect(tryDecodeShare('garbage')).toBeNull()
    expect(tryDecodeShare('%E0%A4%A')).toBeNull()
  })
})

describe('parseFontFaces', () => {
  it('prefers TTF over WOFF and never picks WOFF2; resolves protocol-relative urls', () => {
    const css = `@font-face { font-family: 'Satoshi'; src: url('//cdn.x/a.woff2') format('woff2'), url('//cdn.x/a.woff') format('woff'), url('//cdn.x/a.ttf') format('truetype'); font-weight: 500; }
@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url(https://g/x.woff) format('woff'); }
@font-face { font-family: 'Only2'; font-weight: 400; src: url(https://g/y.woff2) format('woff2'); }`
    expect(parseFontFaces(css)).toEqual([
      { family: 'Satoshi', weight: 500, url: 'https://cdn.x/a.ttf' },
      { family: 'Geist Mono', weight: 400, url: 'https://g/x.woff' },
    ])
  })
})

describe('ogCacheControl', () => {
  it('a complete card is content-addressed by its token: browsers a day, the CDN a year, stale for a week', () => {
    expect(ogCacheControl(true)).toBe('public, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800')
    expect(OG_CACHE_COMPLETE).toBe(ogCacheControl(true))
  })
  it('a degraded card (a font or a sticker missing) is cached a minute, so a hiccup does not stick', () => {
    expect(ogCacheControl(false)).toBe('public, max-age=60, s-maxage=60')
    expect(OG_CACHE_DEGRADED).toBe(ogCacheControl(false))
  })
})

describe('ogResponseOptions', () => {
  const f = [1, 2, 3]
  it('no fonts -> fonts undefined (so next/og keeps its default) and a short cache', () => {
    const o = ogResponseOptions([], { placed: 5, expected: 5 })
    expect(o.fonts).toBeUndefined()
    expect(o.headers['cache-control']).toContain('s-maxage=60')
  })
  it('complete card keeps the year-long cache; a missing font or sticker shortens it', () => {
    expect(ogResponseOptions(f, { placed: 60, expected: 60 }).headers['cache-control']).toBe(OG_CACHE_COMPLETE)
    expect(ogResponseOptions(f, { placed: 59, expected: 60 }).headers['cache-control']).toContain('s-maxage=60')
    expect(ogResponseOptions(f.slice(1), { placed: 60, expected: 60 }).headers['cache-control']).toContain('s-maxage=60')
  })
})

describe('the image route when every font and sticker fetch fails', () => {
  it('still returns a PNG (default font, no stickers)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { default: Image } = await import('../app/s/[token]/opengraph-image')
      const { encodeShare } = await import('@/lib/share/link')
      const token = encodeShare({ v: 1, name: 'Ada', birds: [{ code: 'grerhe1', ym: 1900 }, { code: 'lesrhe2' }] }).token
      for (const t of [token, 'garbage']) {
        const res = await Image({ params: Promise.resolve({ token: t }) })
        expect(res.status).toBe(200)
        expect(res.headers.get('content-type')).toContain('image/png')
        expect(res.headers.get('cache-control')).toContain('s-maxage=60')
        const png = Buffer.from(await res.arrayBuffer())
        expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 630])
      }
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })
})
