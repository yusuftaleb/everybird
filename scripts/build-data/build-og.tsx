// Builds the site's link preview, one per language: public/og/<lang>.jpg (1200 × 630, committed; pageSeo in
// src/lib/site-meta.ts points og:image and twitter:image at the page language's). The landing sample's wide seed
// layout in Free (src/lib/share/site-og.ts: scaled to the card's width, its middle band, the badge's hole cut from it)
// on Paper, and in the middle the badge: the origami mark in Accent, "Everybird" and the language's tagline. Drawn by
// next/og as the share link's card is, with its fonts and stickers (og-server.ts: Fontshare and Google, Noto Sans for
// Russian, Noto Sans JP/SC/TC fetched by next/og for the page's `lang`; stickers from the sticker host), then saved as
// JPEG with sharp so each file stays well under WhatsApp's 300 KB. Fonts are fetched, never written to disk.
// Rerun after build-sample-pack.ts or a tagline change.
//
//   npx tsx scripts/build-data/build-og.tsx [--out <dir>]   (--out: also copies the 14 files there, with sheet.jpg)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import sharp from 'sharp'
import { LANGS, type Lang } from '../../src/i18n/langs'
import { getMessages } from '../../src/i18n/server'
import { ORIGAMI_PATH } from '../../src/lib/origami-mark'
import { SHARE_COLORS } from '../../src/lib/share/image'
import { ogFontCount, ogLang } from '../../src/lib/share/og'
import { fetchStickers, ogFonts } from '../../src/lib/share/og-server'
import { SITE_OG, SITE_OG_BADGE, SITE_OG_TYPE, badgeRect, siteOgTiles, siteTagline } from '../../src/lib/share/site-og'
import type { SamplePackFile } from '../../src/lib/list/sample-pack'

const C = SHARE_COLORS.light
const CABINET = '"Cabinet Grotesk", "Noto Sans", sans-serif'
const SATOSHI = 'Satoshi, "Noto Sans", sans-serif'
const JPEG = { quality: 84, mozjpeg: true, chromaSubsampling: '4:4:4' } as const

function card(lang: Lang, tiles: { code: string; box: number[] }[], stickers: Map<string, string>) {
  const [bx, by, bw, bh] = badgeRect()
  const T = SITE_OG_TYPE
  return (
    <div lang={ogLang(lang)} style={{ display: 'flex', position: 'relative', width: '100%', height: '100%', background: C.paper, color: C.ink, fontFamily: SATOSHI }}>
      {tiles.map(({ code, box: [x, y, w, h] }) => (
        // satori draws these; next/image has no place here
        // eslint-disable-next-line @next/next/no-img-element
        <img key={code} alt="" src={stickers.get(code)!} width={Math.round(w)} height={Math.round(h)}
          style={{ position: 'absolute', left: Math.round(x), top: Math.round(y), objectFit: 'contain' }} />
      ))}
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'absolute',
        left: bx, top: by, width: bw, height: bh, padding: SITE_OG_BADGE.pad, background: C.paper,
        border: `2px solid ${C.hairline}`, borderRadius: SITE_OG_BADGE.r,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.gap }}>
          <svg width={T.mark} height={T.mark} viewBox="0 0 512 512"><path fill={C.accent} fillRule="evenodd" d={ORIGAMI_PATH} /></svg>
          <div style={{ display: 'flex', fontFamily: CABINET, fontWeight: 700, fontSize: T.word, lineHeight: 1, letterSpacing: -0.01 * T.word }}>Everybird</div>
        </div>
        <div style={{ display: 'flex', marginTop: T.below, fontSize: T.tagline, fontWeight: 500, lineHeight: T.line, textAlign: 'center', justifyContent: 'center' }}>
          {siteTagline(getMessages(lang).page.meta.title)}
        </div>
      </div>
    </div>
  )
}

async function main() {
  const at = process.argv.indexOf('--out')
  const out = at > 0 ? process.argv[at + 1] : undefined
  const pack = JSON.parse(readFileSync('public/data/sample-pack.v1.json', 'utf8')) as SamplePackFile
  const seed = pack.layouts.find((l) => l.layout === 'wide')!
  const tiles = siteOgTiles(seed)
  const sv = new Map(pack.species.map((r) => [r.code, r.sv]))
  // Tiles drawn past 128 px take the 384 file (scaled to 256), as the share link's card does.
  const large = new Set(tiles.filter((t) => Math.max(t.box[2], t.box[3]) > 128).map((t) => t.code))
  const stickers = await fetchStickers(tiles.map((t) => ({ code: t.code, sv: sv.get(t.code) })), 60_000, large)
  const missing = tiles.filter((t) => !stickers.has(t.code)).map((t) => t.code)
  if (missing.length) throw new Error(`stickers unavailable: ${missing.join(', ')}`)
  mkdirSync('public/og', { recursive: true })
  if (out) mkdirSync(out, { recursive: true })
  const files = new Map<Lang, Buffer>()
  for (const lang of LANGS) {
    const fonts = await ogFonts(lang)
    if (fonts.length < ogFontCount(lang)) throw new Error(`${lang}: fonts unavailable`)
    const png = Buffer.from(await new ImageResponse(card(lang, tiles, stickers), { ...SITE_OG, fonts }).arrayBuffer())
    const jpg = await sharp(png).jpeg(JPEG).toBuffer()
    writeFileSync(join('public/og', `${lang}.jpg`), jpg)
    if (out) writeFileSync(join(out, `${lang}.jpg`), jpg)
    files.set(lang, jpg)
    console.log(`${lang}: ${(jpg.length / 1024).toFixed(0)} KB`)
  }
  console.log(`${tiles.length} stickers`)
  if (out) {
    // A contact sheet for review: en, ja, ru, de and es at half size, two to a row.
    const pick: Lang[] = ['en', 'ja', 'ru', 'de', 'es']
    const w = SITE_OG.width / 2, h = SITE_OG.height / 2, gap = 16
    const parts = await Promise.all(pick.map(async (l, i) => ({
      input: await sharp(files.get(l)!).resize(w, h).toBuffer(),
      left: gap + (i % 2) * (w + gap), top: gap + Math.floor(i / 2) * (h + gap),
    })))
    const rows = Math.ceil(pick.length / 2)
    await sharp({ create: { width: 2 * w + 3 * gap, height: rows * h + (rows + 1) * gap, channels: 3, background: '#d9d6cf' } })
      .composite(parts).jpeg({ quality: 88 }).toFile(join(out, 'sheet.jpg'))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
