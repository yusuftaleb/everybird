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
import { describe, expect, it, vi, afterEach } from 'vitest'
import { CREDIT_MIN, DESKTOP_SIDE, FOOTER_LIFT, IMAGE_SCALE, IMAGE_SIZE, cardDims, cardLayout, clearStickerCache, drawShareImage, imagePackSpec, prepareCard, renderShareImage, type CardFormat } from '@/lib/share/image'
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
    for (const lang of ['en', 'es', 'nl', 'pt', 'pl', 'fr', 'de', 'it', 'sv', 'da', 'ru', 'ja'] as const) {
      const m = { en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja }[lang]
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
        if (card.oneLine) {
          const { icon } = L.latest!
          const blockEnd = card.oneLine.x + icon + 14 + Math.max(card.oneLine.labelW, card.oneLine.nameText.length * 0.5 * card.oneLine.nameSize)
          expect(card.oneLine.x).toBeGreaterThanOrEqual(LEFT + M)
          expect(blockEnd).toBeLessThanOrEqual(RIGHT - M + 1)
          expect(card.credit.below).toBe(false)
          expect(card.credit.size).toBeGreaterThanOrEqual(CREDIT_MIN)
          expect(LEFT + M + card.brandW + card.footerLine.length * 0.6 * card.credit.size).toBeLessThanOrEqual(card.oneLine.x - 32)
        } else {
          expect(LEFT + M + card.brandW + card.footerLine.length * 0.6 * card.credit.size).toBeLessThanOrEqual(RIGHT - M)
        }
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
const BEFORE: Record<Exclude<CardFormat, 'desktop'>, { layout: string; draws: string }> = {
  story: { layout: '42ea58674d4ee8d18505c49684fe983e7edf1b10', draws: 'b0ded4d027f4cc596410b35a1f4846b52e62ea3c' },
  post: { layout: '6385621f4f386188b50d6ff70c67618f6e3644a4', draws: '0518e41faffdfefc76fe286a74296ab4e54c8c56' },
  square: { layout: '9baa675c2529f2777654d3ec49d5940ebd5ad2f4', draws: '24075c510ce9b9e68892a3e731f3d63cd57a1b01' },
  wide: { layout: '4e9d6e75750df1125d6ac5c9c4159790b8af3f4b', draws: '44f52e9bb3bdd87d450385258b9e77289f5ce407' },
  print: { layout: 'bd2bbab39ecbf7d82d9e7aadffb714b7f2601f7c', draws: '1357a1f83954c8b9461ead75455dc42a4f2d1c7b' },
  printLandscape: { layout: '68b608dbefd61791383888516529cf2b1644805a', draws: 'b8db39bea513454e900b6c67feffea8f96cfee20' },
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
describe('the latest lifer switch does not rearrange the collage', () => {
  const ALL: CardFormat[] = ['story', 'post', 'square', 'wide', 'desktop', 'print', 'printLandscape']
  for (const f of ALL) {
    it(`${f}: the pack spec is the same with the row on and off, with and without a name and a filter`, () => {
      for (const name of [false, true]) for (const filter of [false, true]) {
        const on = imagePackSpec(f, { name, filter, latest: true, count: 185 })
        const off = imagePackSpec(f, { name, filter, latest: false, count: 185 })
        expect(off).toEqual(on)
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
      expect(off.L.collage.h).toBeGreaterThan(on.L.collage.h) // every format: the same pack, fitted into the taller area
    })
  }
})

// The latest lifer's name on the desktop footer: the label over the name, the name gets the whole right-hand room, shrinks to 80%
// before it is clipped, and is never clipped up to about 40 characters, in the longest common names of every language.
describe('long latest-lifer names on the desktop footer', () => {
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
    forty: 'Northern Rough-winged Swallow-and-Martin!',
  }
  for (const [lang, name] of Object.entries(NAMES)) {
    it(`${lang}: "${name}" (${name.length}) is drawn whole, at 80% of its size or more`, async () => {
      installStubs()
      const m = { en, es, pt, nl, pl, fr, de, it: italian, sv, da, ru, ja, forty: en }[lang as 'en']
      const card = await prepareCard({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: m.ui, nameOf: () => name }, IMAGE_SCALE.desktop)
      expect(card.oneLine!.nameText).toBe(name)
      expect(card.oneLine!.nameSize).toBeGreaterThanOrEqual(30 * 0.8)
      expect(card.credit.below).toBe(false)
    })
  }
  it('a name of 60 characters shrinks to 80% and only then gets an ellipsis', async () => {
    installStubs()
    const name = 'A Very Long Imaginary Bird Name That Cannot Possibly Fit Here'
    const card = await prepareCard({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: en.ui, nameOf: () => name }, 2)
    expect(card.oneLine!.nameSize).toBe(24)
    expect(card.oneLine!.nameText.endsWith('…')).toBe(true)
  })
  it('the stack stays inside the footer band: the hairline above the label, the sticker clear of the bottom', () => {
    const L = cardLayout('desktop', { name: false, filter: false, latest: true, count: 185 })
    expect(L.rule.y).toBeLessThan(L.footer.y - 20) // above the label's top
    expect(L.latest!.y).toBeGreaterThan(L.rule.y)
    expect(1080 - (L.latest!.y + L.latest!.icon)).toBeGreaterThanOrEqual(BOTTOM_CLEAR)
  })
  it('lifer off: the hairline is 20 above the footer line (no gap), the collage taller by the 20 that frees', () => {
    const on = cardLayout('desktop', { name: false, filter: false, latest: true, count: 185 })
    const off = cardLayout('desktop', { name: false, filter: false, latest: false, count: 185 })
    expect(off.rule.y).toBe(off.footer.y - 20)
    expect(on.rule.y).toBe(on.footer.y - 40)
    expect(off.collage.h - on.collage.h).toBe(20)
    expect(off.footer.y).toBe(on.footer.y)
    expect(1080 - (off.footer.y + off.footer.size)).toBeGreaterThanOrEqual(BOTTOM_CLEAR)
  })
  it('lifer on: the wordmark and credit caps are centred on the two-line block (equal air above and below)', async () => {
    installStubs()
    const card = await prepareCard({ format: 'desktop', theme: 'light', entries, species, pack, now: NOW, strings: en.ui }, 2)
    const { L } = card
    const baseline = L.footer.y + L.footer.size * 0.8 - FOOTER_LIFT
    const capsMid = baseline - 0.35 * L.footer.size // Cabinet caps are about 0.7 em tall
    const blockTop = L.footer.y + L.footer.size * 0.8 - 44 // the label's cap top
    const blockBottom = L.footer.y + L.footer.size * 0.8 // the name's baseline
    expect(capsMid).toBeCloseTo((blockTop + blockBottom) / 2, 0)
    expect(capsMid).toBeCloseTo(L.latest!.y + L.latest!.icon / 2, 0)
  })
})
