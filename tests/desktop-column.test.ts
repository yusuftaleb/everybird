// The desktop wallpaper is crop-proof without detecting the screen (Safari hides it): 1920 × 1080 units drawn at 2× (3840 × 2160),
// and everything (collage, count, title, filter, latest-lifer row, hairline, wordmark, footer) inside the central 3:2 column,
// x in [150, 1770], 64 units of margin inside it. The vertical clearance: at least 60 from the top, 80 from the bottom.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { pl } from '@/i18n/messages/pl'
import { fr } from '@/i18n/messages/fr'
import { de } from '@/i18n/messages/de'
import { it as italian } from '@/i18n/messages/it'
import { sv } from '@/i18n/messages/sv'
import { da } from '@/i18n/messages/da'
import { ru } from '@/i18n/messages/ru'
import { ja } from '@/i18n/messages/ja'
import { zhHans } from '@/i18n/messages/zh-Hans'
import { zhHant } from '@/i18n/messages/zh-Hant'
import { describe, expect, it, vi, afterEach } from 'vitest'
import { CREDIT_MIN, DESKTOP_SIDE, IMAGE_SCALE, SMALL_INLINE, IMAGE_SIZE, cardDims, cardLayout, clearStickerCache, drawShareImage, imagePackSpec, prepareCard, renderShareImage, type CardFormat } from '@/lib/share/image'
import { entries, installStubs, NOW, pack, species } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

const M = 64
const LEFT = DESKTOP_SIDE, RIGHT = 1920 - DESKTOP_SIDE // 150, 1770
const TOP_CLEAR = 60, BOTTOM_CLEAR = 80
const CONTENTS = [
  { name: true, filter: true, latest: true },
  { name: false, filter: false, latest: true },
  { name: true, filter: false, latest: false },
  { name: false, filter: false, latest: false },
]

describe('the desktop size', () => {
  it('is always 1920 × 1080 units, a 3840 × 2160 PNG, whatever the screen', async () => {
    expect(DESKTOP_SIDE).toBe(150)
    expect(cardDims('desktop')).toEqual([1920, 1080])
    expect(IMAGE_SIZE.desktop).toEqual([1920, 1080])
    expect(IMAGE_SCALE.desktop).toBe(2)
    installStubs()
    vi.stubGlobal('window', { screen: { width: 1512, height: 982 }, devicePixelRatio: 2 })
    const real = document.createElement
    document.createElement = ((tag: string) => {
      const c = real(tag) as unknown as { width: number; height: number; toBlob?: (cb: (b: Blob | null) => void) => void }
      c.toBlob = (cb) => cb(new Blob([`${c.width}x${c.height}`]))
      return c
    }) as typeof document.createElement
    const blob = await renderShareImage({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: en.ui })
    expect(await blob.text()).toBe('3840x2160')
  })
})

describe('everything on the desktop is inside the central column, clear of the top and bottom', () => {
  for (const c of CONTENTS) {
    for (const lang of ['en', 'es', 'nl', 'pt', 'pl', 'fr', 'de', 'it', 'sv', 'da', 'ru', 'ja', 'zh-Hans', 'zh-Hant'] as const) {
      const m = { en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant }[lang]
      const name = `${lang}${c.name ? ' name' : ''}${c.filter ? ' filter' : ''}${c.latest ? ' latest' : ' no-latest'}`
      it(name, async () => {
        installStubs()
        const long = 'A Black-crowned Night-Heron of a very long name'
        const card = await prepareCard({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: m.ui, latest: c.latest, name: c.name ? 'Ada Lovelace' : undefined, filterLabel: c.filter ? 'Perching birds · Canada + Egypt' : undefined, nameOf: () => long }, IMAGE_SCALE.desktop)
        const { L } = card
        expect(L.W).toBe(1920)
        expect(L.H).toBe(1080)
        // The collage frame and the tiles, and the count's box, stay in the column.
        expect(L.collage.x).toBe(LEFT + M)
        expect(L.collage.x + L.collage.w).toBe(RIGHT - M)
        for (const t of [...card.tiles, ...(card.lifer ? [card.lifer] : [])]) {
          expect(t.x).toBeGreaterThanOrEqual(LEFT)
          expect(t.x + t.w).toBeLessThanOrEqual(RIGHT)
        }
        // The text: the title and filter are drawn from the margin, fitted to the column's width; the footer line and the
        // latest-lifer row end inside it.
        expect(L.rule.y).toBeGreaterThan(L.collage.y)
        if (L.latest) expect(L.latest.x).toBeGreaterThanOrEqual(LEFT + M)
        if (L.latest) expect(L.latest.x + L.latest.icon + 20 + L.latest.tw).toBeLessThanOrEqual(RIGHT - M)
        expect(card.credit.size).toBeGreaterThanOrEqual(CREDIT_MIN)
        expect(LEFT + M + (card.credit.below ? 0 : card.brandW) + card.footerLine.length * 0.6 * card.credit.size).toBeLessThanOrEqual(RIGHT - M)
        // Vertical clearance.
        if (L.name) expect(L.name.y).toBeGreaterThanOrEqual(TOP_CLEAR)
        expect(L.collage.y).toBeGreaterThanOrEqual(TOP_CLEAR)
        expect(1080 - (L.footer.y + L.footer.size)).toBeGreaterThanOrEqual(BOTTOM_CLEAR)
        if (L.latest) expect(1080 - (L.latest.y + L.latest.icon)).toBeGreaterThanOrEqual(BOTTOM_CLEAR)
      })
    }
  }

  it('every drawn text, rule and image in the real draw calls starts and ends inside x in [150, 1770]', async () => {
    const logs = installStubs()
    const canvas = await drawShareImage({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: en.ui, name: 'Ada Lovelace', filterLabel: 'Perching birds · Canada + Egypt' })
    const log = logs.get(canvas as unknown as object)!
    const num = (a: string) => Number(a.trim())
    let n = 0
    let align = 'left'
    for (const line of log) {
      let m: RegExpExecArray | null
      if ((m = /^textAlign = "(\w+)"/.exec(line))) align = m[1]
      if ((m = /^fillText\(".*", ([\d.]+), ([\d.]+)\)$/.exec(line))) {
        n++
        // Left-aligned text starts at or after the margin; centred text (the count) is centred inside the column.
        if (align === 'left') expect(num(m[1])).toBeGreaterThanOrEqual(LEFT + M)
        else { expect(num(m[1])).toBeGreaterThan(LEFT + M); expect(num(m[1])).toBeLessThan(RIGHT - M) }
      }
      if ((m = /^fillRect\(([\d.]+), [\d.]+, ([\d.]+), ([\d.]+)\)$/.exec(line)) && num(m[3]) !== 1080) {
        const x = num(m[1]), w = num(m[2])
        if (w !== 1920) { expect(x).toBeGreaterThanOrEqual(LEFT); expect(x + w).toBeLessThanOrEqual(RIGHT) }
      }
      if ((m = /^drawImage\(img\([^)]*\), ([\d.]+), [\d.]+, ([\d.]+), [\d.]+\)$/.exec(line))) {
        expect(num(m[1])).toBeGreaterThanOrEqual(LEFT)
        expect(num(m[1]) + num(m[2])).toBeLessThanOrEqual(RIGHT)
      }
    }
    expect(n).toBeGreaterThan(4)
  })

  it('the bands stay empty: the layout reserves 150 units each side of the column, whatever the pack', () => {
    for (const c of CONTENTS) {
      const L = cardLayout('desktop', { ...c, count: 1089 })
      expect(L.collage.x).toBeGreaterThanOrEqual(LEFT)
      expect(L.collage.x + L.collage.w).toBeLessThanOrEqual(RIGHT)
    }
  })
})

// The hashes of every layout and every draw call of the other formats, taken before the desktop's column (cardLayout and
// drawShareImage on the harness, over the content combinations, counts and themes below): they must stay byte-identical.
// Retaken 2026-11-20 for the even spacing (no vertical spread on the story and the post: their tiles move, nothing else)
// and the poster's quiet head and foot (print and printLandscape); the square and the 5:4 wide stayed identical. The
// poster draws retaken for round 5 (the latest lifer at the foot's right end; layouts unchanged). Every format's draws
// retaken for round 6 (the footer's credit "Stickers: huashu-bird-sticker, CC BY 4.0", on its own line where it no longer
// fits beside the wordmark; layouts unchanged). Retaken again for round 6's Share and Print: the stacked latest lifer row
// keeps the head's gap from the collage (story, post, square and wide: their collages give up the room, so their tiles,
// count and outlines move; with the row off nothing changes), and the poster's foot draws the latest lifer's sticker
// before its words (print and printLandscape: one more drawImage; layouts unchanged). Retaken for round 6, item 17: the
// latest lifer row is the Tree's oldest lineage row (one line on the post, the 5:4 and the square, the smaller stacked row
// on the story), its gap the row's own, the room it frees the collage's (their row, tiles and count move; with the row off
// nothing changes; the posters are unchanged), then for the room kept under the collage on the story, the post and the
// square for the credit line the footer lifts the row by (their tiles and count move). Retaken for round 6, item 10: that
// room is kept without the row too (story, post, square: the collage ends a credit line higher, so the birds clear the
// lifted hairline), and the portrait poster keeps room for its foot's second line with the latest lifer (print).
// The layouts retaken for round 6, item 12: a small group's size cap (maxTile and maxSide of the 12-bird layouts, GROUP_TILE
// of the collage's shorter side; nothing else; the draws unchanged). tests/share-image-golden.test.ts's logs show each difference.
const BEFORE: Record<Exclude<CardFormat, 'desktop'>, { layout: string; draws: string }> = {
  story: { layout: '2a758cf254b2e9b93ad225fc67ab50c7ea0161d7', draws: 'a6510af37bdf6310ceee486709103ed6fafbd67c' },
  post: { layout: '12fe6e864052a8f663dcdf9454cf6038aab9411e', draws: 'ac03e3b5d68c16b0863f86fed8ee8a1ccc211b48' },
  square: { layout: '50f8870f865f176da7c25b3912113ad1485a0108', draws: 'afdda9c8379f5ea661d14bb9125444023a12cb18' },
  wide: { layout: '08fbc77c3a7dddb33e4fcb3a29470b3c95206cc9', draws: 'b697c1cdc3cbbc3e8347d352fcad3f9168887863' },
  print: { layout: '7e31248b24570465c3ee08f396f08f59412dc880', draws: '2c3bb2a19c65614da6256d60b9f3f825681e85cb' },
  printLandscape: { layout: '4753e9a64f9078440232e31ba21e5fc80f46ba12', draws: '21ba5288b3d830e3e1713889de2e15291860baa5' },
}
const sha = (s: string) => createHash('sha1').update(s).digest('hex')

describe('the other formats draw as before', () => {
  const FORMATS = Object.keys(BEFORE) as Exclude<CardFormat, 'desktop'>[]
  for (const f of FORMATS) {
    it(`${f}: the layouts are unchanged`, () => {
      const out: Record<string, unknown> = {}
      for (const c of CONTENTS) for (const count of [12, 197, 1089]) out[`${f} ${JSON.stringify(c)} ${count}`] = cardLayout(f, { ...c, count })
      expect(sha(JSON.stringify(out))).toBe(BEFORE[f].layout)
    })
    it(`${f}: the draw calls are unchanged`, async () => {
      const out: Record<string, string[]> = {}
      for (const theme of ['light', 'dark'] as const) for (const name of [undefined, 'Ada Lovelace’s life list']) for (const filterLabel of [undefined, 'Perching birds · Canada + Egypt']) for (const latest of [true, false]) {
        const logs = installStubs()
        clearStickerCache()
        const canvas = await drawShareImage({ format: f, theme, name, filterLabel, latest, entries, species, pack, now: NOW, strings: en.ui, printSize: 'A2' } as never)
        out[`${f} ${theme} ${name ? 'name' : '-'} ${filterLabel ? 'filter' : '-'} ${latest ? 'latest' : 'nolatest'}`] = logs.get(canvas as unknown as object)!
        vi.unstubAllGlobals()
      }
      expect(sha(JSON.stringify(out))).toBe(BEFORE[f].draws)
    })
  }
})


// The "Show latest lifer" switch never changes the arrangement: one pack spec for on and off, and the same pack fitted into
// the (for the stacked formats taller) area, so every bird keeps its place.
describe('the latest lifer switch', () => {
  const ALL: CardFormat[] = ['story', 'post', 'square', 'wide', 'desktop', 'print', 'printLandscape']
  for (const f of ALL) {
    // Round 6: without the row an image's collage takes its room, so it packs for that taller frame (no empty bands); a
    // poster has no row (its foot names the lifer), so the landscape one's pack is the same either way, and the portrait
    // one's, whose foot keeps room for the lifer's own line (item 10), is made for its taller frame without it.
    it(`${f}: ${f === 'printLandscape' ? 'the pack spec is the same with the row on and off' : 'without the row the pack is made for the taller frame'}, with and without a name and a filter`, () => {
      for (const name of [false, true]) for (const filter of [false, true]) {
        const on = imagePackSpec(f, { name, filter, latest: true, count: 185 })
        const off = imagePackSpec(f, { name, filter, latest: false, count: 185 })
        if (f === 'printLandscape') expect(off).toEqual(on)
        else {
          expect(off.aspect).toBeLessThan(on.aspect)
          expect(off.maxTile).toBe(on.maxTile)
        }
      }
    })
    it(`${f}: the tiles keep their order and their relative places with the row off`, async () => {
      installStubs()
      const base = { format: f, theme: 'light' as const, entries, species, pack, now: NOW, strings: en.ui, printSize: 'A2' as const }
      const on = await prepareCard({ ...base, latest: true } as never)
      const off = await prepareCard({ ...base, latest: false } as never)
      const mid = (t: { x: number; y: number; w: number; h: number }) => [t.x + t.w / 2, t.y + t.h / 2]
      // The same birds in the same order (a bigger tile may take the 384 file instead of the 128).
      const bird = (u: string | null) => u?.replace(/\/v1\/\d+\//, '/')
      expect(off.tiles.map((t) => bird(t.url))).toEqual(on.tiles.map((t) => bird(t.url)))
      const rank = (xs: number[]) => xs.map((v) => xs.filter((u) => u < v - 1e-6).length)
      for (const k of [0, 1]) expect(rank(off.tiles.map((t) => mid(t)[k]))).toEqual(rank(on.tiles.map((t) => mid(t)[k])))
      // The images: the same pack, fitted into the taller area. The poster has no row (its foot names the lifer), so the
      // landscape one's collage is the same with the switch on or off; the portrait one's takes its foot's second line.
      if (f === 'printLandscape') expect(off.L.collage).toEqual(on.L.collage)
      else expect(off.L.collage.h).toBeGreaterThan(on.L.collage.h)
    })
  }
})

// The latest lifer's row (round 6, item 17: the Tree's oldest lineage row): on one line on the desktop, the post (and
// its 5:4) and the square, the name right after the sticker, never cut, in the longest common names of every language;
// the detail after it, its place dropped where it doesn't fit.
describe('long latest-lifer names on the one-line row', () => {
  const data = (f: string) => JSON.parse(readFileSync(`public/data/${f}`, 'utf8'))
  const longest = (names: string[]) => names.filter((n) => n.length <= 40).sort((a, b) => b.length - a.length)[0]
  const NAMES: Record<string, string> = {
    en: longest((data('species.v1.json').species as { com: string }[]).map((r) => r.com)),
    es: longest(Object.values(data('names.es.v1.json').names as Record<string, string>)),
    pt: longest(Object.values(data('names.pt_BR.v1.json').names as Record<string, string>)),
    nl: longest(Object.values(data('names.nl.v1.json').names as Record<string, string>)),
    pl: longest(Object.values(data('names.pl.v1.json').names as Record<string, string>)),
    fr: longest(Object.values(data('names.fr_FR.v1.json').names as Record<string, string>)),
    de: longest(Object.values(data('names.de.v1.json').names as Record<string, string>)),
    it: longest(Object.values(data('names.it.v1.json').names as Record<string, string>)),
    sv: longest(Object.values(data('names.sv.v1.json').names as Record<string, string>)),
    da: longest(Object.values(data('names.da.v1.json').names as Record<string, string>)),
    ru: longest(Object.values(data('names.ru.v1.json').names as Record<string, string>)),
    ja: longest(Object.values(data('names.ja.v1.json').names as Record<string, string>)),
    'zh-Hans': longest(Object.values(data('names.zh_SIM.v1.json').names as Record<string, string>)),
    'zh-Hant': longest(Object.values(data('names.zh.v1.json').names as Record<string, string>)),
    forty: 'Northern Rough-winged Swallow-and-Martin!',
  }
  for (const [lang, name] of Object.entries(NAMES)) {
    it(`${lang}: "${name}" (${name.length}) is drawn whole at its size on every one-line card, the detail after it`, async () => {
      const m = { en, es, pt, nl, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant, forty: en }[lang as 'en']
      for (const format of ['desktop', 'post', 'wide', 'square'] as const) {
        const logs = installStubs()
        clearStickerCache()
        const canvas = await drawShareImage({ format, theme: 'light', entries, species, pack, now: NOW, strings: m.ui, nameOf: () => name })
        const log = logs.get(canvas as unknown as object)!
        const i = log.findIndex((l) => l.startsWith(`fillText(${JSON.stringify(name)},`))
        expect(i, `${lang} ${format}`).toBeGreaterThan(-1)
        expect(log.slice(0, i).reverse().find((l) => l.startsWith('font = '))).toContain(`${SMALL_INLINE.name}px`)
        expect(log.slice(i + 1).some((l) => l.startsWith(`fillText(${JSON.stringify(m.ui.share.latestLifer)}`) || l.startsWith(`fillText("${m.ui.share.latestLifer} ·`))).toBe(true)
      }
    })
  }
  it('a name too long for the line shrinks to fit, never cut; the detail gives way', async () => {
    const logs = installStubs()
    const name = 'A Very Long Imaginary Bird Name That Cannot Possibly Fit Here, Not Even On A Desktop Wallpaper At All, Truly'
    const canvas = await drawShareImage({ format: 'square', theme: 'light', entries, species, pack, now: NOW, strings: en.ui, nameOf: () => name })
    const log = logs.get(canvas as unknown as object)!
    expect(log.some((l) => l.startsWith(`fillText(${JSON.stringify(name)},`))).toBe(true)
    expect(log.some((l) => l.includes('…'))).toBe(false)
  })
  it('the row stays above the hairline, clear of the bottom; lifer off: the hairline 20 above the footer line', () => {
    const L = cardLayout('desktop', { name: false, filter: false, latest: true, count: 185 })
    expect(L.latest!.y + L.latest!.icon).toBeLessThan(L.rule.y)
    expect(1080 - (L.latest!.y + L.latest!.icon)).toBeGreaterThanOrEqual(BOTTOM_CLEAR)
    const off = cardLayout('desktop', { name: false, filter: false, latest: false, count: 185 })
    expect(off.rule.y).toBe(off.footer.y - 20)
    expect(off.collage.h).toBeGreaterThan(L.collage.h)
    expect(off.footer.y).toBe(L.footer.y)
  })
})
