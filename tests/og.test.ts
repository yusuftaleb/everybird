import { describe, expect, it } from 'vitest'
import type { SharePayload } from '@/lib/share/link'
import { OG_DESCRIPTION, ogName, ogTitle, pickOgBirds, tryDecodeShare } from '@/lib/share/og'
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

describe('metadata strings', () => {
  const p = (name: string | undefined, n: number): SharePayload => ({ v: 1, name, birds: Array.from({ length: n }, (_, i) => ({ code: `b${i}` })) })
  it('titles with a name, without a name, and for a broken link', () => {
    expect(ogTitle(p('Ada', 197))).toBe("Ada's Everybird — 197 species")
    expect(ogTitle(p(undefined, 3))).toBe('An Everybird — 3 species')
    expect(ogTitle(p('  ', 1))).toBe('An Everybird — 1 species')
    expect(ogTitle(p('Ada', 1234))).toBe("Ada's Everybird — 1,234 species")
    expect(ogTitle(null)).toBe('Everybird')
  })
  it('the header name matches the shared page h1', () => {
    expect(ogName({ name: 'Ada Birder' })).toBe("Ada Birder's Everybird")
    expect(ogName({})).toBe('An Everybird')
  })
  it('describes the site by its tagline', () => {
    expect(OG_DESCRIPTION).toBe("Every bird you've ever seen.")
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
