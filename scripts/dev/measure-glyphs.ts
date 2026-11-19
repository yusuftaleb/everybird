// Measures the served fonts' advance widths, for the unit tests that model text widths without a browser
// (tests/topbar-fit.test.ts). It downloads the woff2 files the site loads (Fontshare's CSS for Satoshi 500/700 and
// Cabinet Grotesk 700, Google Fonts' CSS for Geist Mono 500, the latin subset) into a temp dir, reads them with fontkit
// and writes each printable Latin-1 character's advance in em (no kerning), plus Polish's Latin Extended-A letters
// (EXTRA_CODEPOINTS: ą ć ę ł ń ś ź ż and their capitals, none of which are in Latin-1) from whichever face covers
// them (Fontshare sends one face that already has them; Google Fonts splits Geist Mono by unicode-range, so these
// come from its separate "latin-ext" face), plus `kernWidenEm`, the most kerning widens any of the top bar's words
// past the sum of its advances (about 0.01 em: kerning here nearly always tightens), to
// tests/fixtures/glyph-advances.json.
//
//   npx -p fontkit -p tsx tsx scripts/dev/measure-glyphs.ts [--out tests/fixtures/glyph-advances.json]
//
// fontkit isn't a dependency: `npx -p fontkit` installs it into npx's cache and puts that cache's node_modules/.bin on
// PATH, so the script resolves it from there (an ESM import from this file would look in the repo's node_modules).
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

type Glyph = { advanceWidth: number }
type Font = {
  unitsPerEm: number
  familyName: string
  glyphForCodePoint(cp: number): Glyph & { id: number }
  hasGlyphForCodePoint(cp: number): boolean
  layout(s: string): { advanceWidth: number }
}

function loadFontkit(): { create(buf: Buffer): Font } {
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (!dir.endsWith(join('node_modules', '.bin'))) continue
    try {
      return createRequire(join(dirname(dir), 'noop.js'))('fontkit')
    } catch {
      // Not this one.
    }
  }
  throw new Error('fontkit not found: run with `npx -p fontkit -p tsx tsx scripts/dev/measure-glyphs.ts`')
}

/** The site's own font CSS (app/[lang]/layout.tsx; Geist Mono through next/font/google, the same Google files). */
const SOURCES = [
  { key: 'satoshi-500', css: 'https://api.fontshare.com/v2/css?f[]=satoshi@500&display=swap' },
  { key: 'satoshi-700', css: 'https://api.fontshare.com/v2/css?f[]=satoshi@700&display=swap' },
  { key: 'cabinet-grotesk-700', css: 'https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@700&display=swap' },
  { key: 'geist-mono-500', css: 'https://fonts.googleapis.com/css2?family=Geist+Mono:wght@500&display=swap' },
] as const

/** Google serves woff2 only to a browser's User-Agent; a generic one. */
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

/** Polish's letters outside Latin-1 (U+0100-017F, Latin Extended-A), ó/Ó excepted: those are U+00F3/00D3, already
 *  in the 0x20-0xff loop below. */
const EXTRA_CODEPOINTS = [0x104, 0x105, 0x106, 0x107, 0x118, 0x119, 0x141, 0x142, 0x143, 0x144, 0x15a, 0x15b, 0x179, 0x17a, 0x17b, 0x17c]

function faceUrl(face: string): string | undefined {
  const url = /url\(['"]?([^'")]+\.woff2)['"]?\)\s*format\(['"]woff2['"]\)/.exec(face)?.[1]
  return url ? (url.startsWith('//') ? `https:${url}` : url) : undefined
}

/** Every `@font-face` block's declared range (undefined when the CSS doesn't split by subset, as Fontshare's doesn't)
 *  and woff2 URL. */
function faces(css: string): { range?: string; url: string }[] {
  return css
    .split('@font-face')
    .slice(1)
    .flatMap((face) => {
      const url = faceUrl(face)
      return url ? [{ range: /unicode-range:\s*([^;]+);/.exec(face)?.[1], url }] : []
    })
}

/** Whether a face's unicode-range (comma-separated `U+XXXX` or `U+XXXX-YYYY` entries) covers a code point; undefined
 *  (no unicode-range in the CSS at all) covers everything. */
function covers(range: string | undefined, cp: number): boolean {
  if (range === undefined) return true
  return range.split(',').some((part) => {
    const m = /U\+([0-9A-F]+)(?:-([0-9A-F]+))?/i.exec(part.trim())
    if (!m) return false
    const start = Number.parseInt(m[1], 16)
    const end = m[2] ? Number.parseInt(m[2], 16) : start
    return cp >= start && cp <= end
  })
}

/** The woff2 URL of the face that covers Latin-1 (Google splits a family by unicode-range; Fontshare sends one face). */
function woff2Url(css: string): string {
  const f = faces(css).find((f) => covers(f.range, 0x41))
  if (!f) throw new Error('no woff2 face for Latin-1 in the CSS')
  return f.url
}

async function main() {
  const at = process.argv.indexOf('--out')
  const out = resolve(at > 0 ? process.argv[at + 1] : 'tests/fixtures/glyph-advances.json')
  const fontkit = loadFontkit()
  const dir = mkdtempSync(join(tmpdir(), 'everybird-glyphs-'))
  const fonts: Record<string, { family: string; url: string; kernWidenEm: number; advances: Record<string, number> }> = {}
  for (const s of SOURCES) {
    const css = await (await fetch(s.css, { headers: { 'User-Agent': UA } })).text()
    const url = woff2Url(css)
    const buf = Buffer.from(await (await fetch(url)).arrayBuffer())
    writeFileSync(join(dir, `${s.key}.woff2`), buf)
    const font = fontkit.create(buf)
    const advances: Record<string, number> = {}
    const advanceOf = (f: Font, cp: number) => Math.round((f.glyphForCodePoint(cp).advanceWidth / f.unitsPerEm) * 1e5) / 1e5
    for (let cp = 0x20; cp <= 0xff; cp++) {
      if (cp >= 0x7f && cp < 0xa0) continue
      if (!font.hasGlyphForCodePoint(cp)) continue
      advances[String.fromCodePoint(cp)] = advanceOf(font, cp)
    }
    const extraFonts = new Map<string, Font>()
    for (const cp of EXTRA_CODEPOINTS) {
      if (font.hasGlyphForCodePoint(cp)) {
        advances[String.fromCodePoint(cp)] = advanceOf(font, cp)
        continue
      }
      const face = faces(css).find((f) => covers(f.range, cp))
      if (!face) throw new Error(`${s.key}: no face covers U+${cp.toString(16)}`)
      let extra = extraFonts.get(face.url)
      if (!extra) {
        extra = fontkit.create(Buffer.from(await (await fetch(face.url)).arrayBuffer()))
        extraFonts.set(face.url, extra)
      }
      if (!extra.hasGlyphForCodePoint(cp)) throw new Error(`${s.key}: ${face.url} lacks U+${cp.toString(16)}`)
      advances[String.fromCodePoint(cp)] = advanceOf(extra, cp)
    }
    // How far kerning moves the top bar's words from the sum of their advances (the fit test's margin covers it).
    const words = ['Everybird', 'Collage', 'Colagem', 'Kolaż', 'Settings', 'Ajustes', 'Instellingen', 'Ustawienia', 'About', 'Acerca de', 'Sobre', 'Over', 'O aplikacji']
    const worst = Math.max(...words.map((w) => (font.layout(w).advanceWidth - [...w].reduce((n, c) => n + font.glyphForCodePoint(c.codePointAt(0)!).advanceWidth, 0)) / font.unitsPerEm))
    fonts[s.key] = { family: font.familyName, url, kernWidenEm: Math.max(0, Math.round(worst * 1e4) / 1e4), advances }
    console.log(`${s.key}: ${Object.keys(advances).length} glyphs from ${url}; kerning widens a nav word by at most ${worst.toFixed(4)} em (negative: it only tightens)`)
  }
  writeFileSync(out, `${JSON.stringify({ note: 'Generated by scripts/dev/measure-glyphs.ts: advance widths in em, no kerning.', fonts }, null, 1)}\n`)
  console.log(`wrote ${out}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
