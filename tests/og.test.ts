import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { SharePayload } from '@/lib/share/link'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { OG_CACHE_COMPLETE, OG_CACHE_DEGRADED, ogCacheControl, ogDescription, ogName, ogResponseOptions, ogTitle, pickOgBirds, shareTitle, pickOgStickers, tryDecodeShare } from '@/lib/share/og'
import { coversLatin1, coversPolishExtra, parseFontFaces, pickFaces, serverNames } from '@/lib/share/og-server'

const T = en.ui

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
  it("document titles: a new link's title verbatim, an old link's bare name as before, generic without one", () => {
    expect(ogTitle({ ...p('Birds of 2026', 197), titled: true }, T)).toBe('Birds of 2026 · Everybird')
    expect(ogTitle({ ...p('Ada', 197), titled: true }, T)).toBe('Ada · Everybird')
    expect(ogTitle(p('Ada', 197), T)).toBe("Ada's life list · Everybird") // a link made before titles
    expect(ogTitle(p(undefined, 3), T)).toBe('A life list: 3 species')
    expect(ogTitle(p('  ', 1), T)).toBe('A life list: 1 species')
    expect(ogTitle(p(undefined, 1234), T)).toBe('A life list: 1,234 species')
    expect(ogTitle(null, T)).toBe('Everybird')
    expect(ogTitle(p('Ada', 2), T)).not.toMatch(/—/)
  })
  it("the page h1 (and the card's title): the title verbatim, an old bare name as \"<name>'s life list\"", () => {
    expect(ogName({ name: "Yusuf's Life List", titled: true }, T)).toBe("Yusuf's Life List")
    expect(ogName({ name: ' Ada Birder ' }, T)).toBe("Ada Birder's life list")
    expect(shareTitle({ name: 'Ada' }, T)).toBe("Ada's life list")
    expect(shareTitle({}, T)).toBeNull()
    expect(ogName({}, T)).toBe("A birder's life list")
  })
  it('describes what Everybird is, for someone who has never heard of it: the shared page\'s lede, one source', () => {
    expect(ogDescription(T)).toBe("Everybird turns a birder's life list into a sticker collage.")
    for (const m of [en, es, pt, nl]) expect(ogDescription(m.ui)).toBe(m.ui.shared.lede)
    expect(ogName({}, es.ui)).toBe(es.ui.shared.untitled)
  })
  it('titles in Spanish and Portuguese: a new title verbatim, numbers with the language\'s separator', () => {
    expect(ogTitle({ ...p('Aves de 2026', 197), titled: true }, es.ui)).toBe('Aves de 2026 · Everybird')
    expect(ogTitle(p(undefined, 1234), es.ui)).toBe('Una lista de vida: 1.234 especies')
    expect(ogTitle(p(undefined, 1), es.ui)).toBe('Una lista de vida: 1 especie')
    expect(ogTitle(p(undefined, 1234), pt.ui)).toBe('Uma lista de vida: 1.234 espécies')
    expect(ogTitle(p(undefined, 3), nl.ui)).toBe('Een levenslijst: 3 soorten')
    expect(ogTitle(null, pt.ui)).toBe('Everybird')
    expect(ogName({ name: 'Aves de 2026', titled: true }, pt.ui)).toBe('Aves de 2026')
    expect(ogName({}, es.ui)).toBe('La lista de vida de un observador de aves')
    expect(ogName({}, pt.ui)).toBe('A lista de vida de um observador de aves')
  })
  it('an old bare-name link reads "Lista de vida de Ada" in Spanish', () => {
    expect(shareTitle({ name: 'Ada' }, es.ui)).toBe('Lista de vida de Ada')
    expect(ogName({ name: ' Ada ' }, pt.ui)).toBe('Lista de vida de Ada')
    expect(ogName({ name: 'Ada' }, nl.ui)).toBe('Levenslijst van Ada')
    expect(ogTitle(p('Ada', 5), es.ui)).toBe('Lista de vida de Ada · Everybird')
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

describe('the card fonts cover Latin-1 and Polish', () => {
  // Google answers some user agents with one face per subset (unicode-range); the card must take the one with
  // Latin-1's accented letters (á, ã, ç, é, ë, ñ, ú), or "Última especie nueva" would draw in the fallback font;
  // and, since that face alone has no Polish letters (ą, ć, ę, ł, ń, ś, ź, ż), also the face that does, so "Kolaż
  // Ady" draws them too (satori tries each font registered for a family and weight in turn).
  const css = `@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url(https://g/ext.ttf) format('truetype'); unicode-range: U+0100-02BA, U+1E00-1EFF; }
@font-face { font-family: 'Geist Mono'; font-weight: 400; src: url(https://g/latin.ttf) format('truetype'); unicode-range: U+0000-00FF, U+0131, U+0152-0153; }
@font-face { font-family: 'Satoshi'; font-weight: 500; src: url(https://f/s.ttf) format('truetype'); }`
  it('keeps the unicode-range a face declares', () => {
    expect(parseFontFaces(css).map((f) => f.range)).toEqual(['U+0100-02BA, U+1E00-1EFF', 'U+0000-00FF, U+0131, U+0152-0153', undefined])
  })
  it('chooses the face whose range covers U+00C0 to U+00FF, plus one for Polish\'s extra letters; a face without a range covers everything', () => {
    const picked = pickFaces(parseFontFaces(css), [{ family: 'Geist Mono', weight: 400 }, { family: 'Satoshi', weight: 500 }])
    expect(picked.map((f) => f.url)).toEqual(['https://g/latin.ttf', 'https://g/ext.ttf', 'https://f/s.ttf'])
  })
  it('reads ranges, split spans and wildcards', () => {
    expect(coversLatin1('U+0000-00FF')).toBe(true)
    expect(coversLatin1('U+00C0-00DF, U+00E0-00FF')).toBe(true)
    expect(coversLatin1('U+00??')).toBe(true)
    expect(coversLatin1('U+0000-007F')).toBe(false)
    expect(coversLatin1('U+0100-024F')).toBe(false)
  })
  it('a face covers Polish\'s extra letters when its range touches any of them; no range covers everything', () => {
    expect(coversPolishExtra('U+0100-02BA, U+1E00-1EFF')).toBe(true)
    expect(coversPolishExtra('U+0000-00FF, U+0131, U+0152-0153')).toBe(false)
    expect(coversPolishExtra(undefined)).toBe(true)
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
  it('a collage that failed (species or stickers threw) keeps the short cache, even with nothing expected', () => {
    expect(ogResponseOptions(f, { placed: 0, expected: 0, failed: true }).headers['cache-control']).toBe(OG_CACHE_DEGRADED)
    expect(ogResponseOptions(f, { placed: 0, expected: 0 }).headers['cache-control']).toBe(OG_CACHE_COMPLETE)
  })
  it('a names file that failed to load (the card shows English names) gets the short cache', () => {
    expect(ogResponseOptions(f, { placed: 0, expected: 0, namesFailed: true }).headers['cache-control']).toBe(OG_CACHE_DEGRADED)
    expect(ogResponseOptions(f, { placed: 0, expected: 0, namesFailed: false }).headers['cache-control']).toBe(OG_CACHE_COMPLETE)
  })
  it('a broken token (no payload) gets the short cache', () => {
    expect(ogResponseOptions(f, { placed: 0, expected: 0, broken: true }).headers['cache-control']).toBe(OG_CACHE_DEGRADED)
  })
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
      const { default: Image } = await import('../app/[lang]/s/[token]/opengraph-image')
      const { encodeShare } = await import('@/lib/share/link')
      const token = encodeShare({ v: 1, name: 'Ada', birds: [{ code: 'grerhe1', ym: 1900 }, { code: 'lesrhe2' }] }).token
      for (const t of [token, 'garbage']) {
        const res = await Image({ params: Promise.resolve({ lang: 'en', token: t }) })
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

describe('the link preview in the page\'s language', () => {
  it('the page metadata is the language\'s, with og:locale; the image route is under app/[lang], so its URL is /pt/s/…', async () => {
    const { generateMetadata } = await import('../app/[lang]/s/[token]/page')
    const { encodeShare } = await import('@/lib/share/link')
    const token = encodeShare({ v: 1, birds: [{ code: 'ostric2', ym: 1500 }, { code: 'emu1' }] }).token
    const meta = await generateMetadata({ params: Promise.resolve({ lang: 'pt', token }) })
    expect(meta.title).toBe('Uma lista de vida: 2 espécies')
    expect(meta.description).toBe(pt.ui.shared.lede)
    expect(meta.openGraph).toMatchObject({ locale: 'pt_BR', title: meta.title, description: pt.ui.shared.lede })
    expect(meta.twitter).toMatchObject({ title: meta.title, description: pt.ui.shared.lede })
    const esMeta = await generateMetadata({ params: Promise.resolve({ lang: 'es', token }) })
    expect(esMeta.openGraph).toMatchObject({ locale: 'es_ES', title: 'Una lista de vida: 2 especies' })
    // og:image is Next's file convention: the route file sits at app/[lang]/s/[token]/opengraph-image.tsx, so the
    // rewritten /s/<token> gets /<lang>/s/<token>/opengraph-image… (e2e/og.spec.ts checks the rendered URL).
    expect(readFileSync(resolve('app/[lang]/s/[token]/opengraph-image.tsx'), 'utf8')).toContain('getMessages(lang)')
  })
  it('the image route draws in the URL\'s language and refuses an unknown one', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { default: Image } = await import('../app/[lang]/s/[token]/opengraph-image')
      const { encodeShare } = await import('@/lib/share/link')
      const token = encodeShare({ v: 1, name: 'Ada', birds: [{ code: 'grerhe1', ym: 1900 }] }).token
      const res = await Image({ params: Promise.resolve({ lang: 'pt', token }) })
      expect(res.status).toBe(200)
      await expect(Image({ params: Promise.resolve({ lang: 'zz', token }) })).rejects.toThrow()
    } finally {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    }
  })
})

describe('the link preview footer', () => {
  it('link previews carry the footer line without the date stamp', () => {
    const src = readFileSync(resolve('app/[lang]/s/[token]/opengraph-image.tsx'), 'utf8')
    expect(src).toContain('{FOOTER_LINE}')
    expect(src).not.toMatch(/stampDate|withStamp|share\/stamp/)
  })
})

describe('the link preview names', () => {
  const file = (l: string) => (JSON.parse(readFileSync(resolve(__dirname, `../public/data/names.${l}.v1.json`), 'utf8')) as { names: Record<string, string> }).names
  it("uses the URL language's base names, never a regional set", async () => {
    expect((await serverNames('es'))!.amerob).toBe(file('es').amerob)
    expect((await serverNames('es'))!.amerob).toBe('Zorzal americano')
    const pt = (await serverNames('pt'))!
    expect(pt.houspa).toBe(file('pt_BR').houspa)
    expect(pt.houspa).not.toBe(file('pt_PT').houspa) // pt_PT says "Pardal-do-telhado"
    expect((await serverNames('nl'))!.houspa).toBe('Huismus')
  })
  it('English has none (the card draws the English name)', async () => {
    expect(await serverNames('en')).toEqual({})
    expect(await serverNames('zz')).toEqual({})
  })
})
