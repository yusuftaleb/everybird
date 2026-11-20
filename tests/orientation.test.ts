// The horizontal share images (desktop 16:9, wide 5:4) and the landscape poster's layouts: everything inside the card and
// clear of the platform's chrome, the latest row beside the footer where the card is wide and short, the packed collage
// filling the frame, the 2x desktop canvas, and the analytics allow-lists. Synthetic birds for the layout and the canvas;
// real masks and masses (public/data, as count-box.test.ts) for the packing. The print sizes are in print-landscape.test.ts.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
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
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ALLOWED as APP_ALLOWED } from '@/lib/analytics'
import { holeRects, rectGap, type Hole, type Rect } from '@/lib/layout/count-box'
import { decodeMask, maskCell, type Mask } from '@/lib/layout/mask'
import { packFrame, type PackBird, type PackResult } from '@/lib/layout/pack'
import {
  IMAGE_SCALE, IMAGE_SIZE, SAFE, cardLayout, drawShareImage, fitBox, fitPack, imageShape, isPrint, maxTileSide, packSpec,
  prepareCard, type CardFormat, type ImagePack,
} from '@/lib/share/image'
import { installStubs, NOW, entries, pack as harnessPack, species } from './fixtures/share-image-harness'
import { printDesign } from '@/lib/share/print'

afterEach(() => vi.unstubAllGlobals())

const M = 64
/** The gap between the footer line and the latest row beside it (image.ts FOOTER_GAP). */
const FOOTER_GAP = 32
const ONE_LINE_GAP = 14
const LANDSCAPE: CardFormat[] = ['desktop', 'wide', 'printLandscape']
const CONTENTS = [
  { name: true, filter: true, latest: true },
  { name: false, filter: false, latest: true },
  { name: true, filter: false, latest: false },
  { name: false, filter: false, latest: false },
]

// The real masks and masses, as count-box.test.ts loads them.
const DATA = resolve(__dirname, '../public/data')
let POOL: PackBird[] = []
beforeAll(() => {
  const masks = new Map<string, Mask>()
  for (const f of readdirSync(resolve(DATA, 'masks')).sort()) {
    const rec = JSON.parse(readFileSync(resolve(DATA, 'masks', f), 'utf8')) as Record<string, [number, number, string]>
    for (const [code, m] of Object.entries(rec)) masks.set(code, decodeMask(m))
  }
  const rows = (JSON.parse(readFileSync(resolve(DATA, 'species.v1.json'), 'utf8')).species as { code: string; g: number }[])
    .filter((s) => masks.has(s.code))
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  POOL = rows.map((s, i) => ({ id: i, mass: s.g, mask: masks.get(s.code)! }))
})
const sample = (n: number) => { const step = POOL.length / n; return Array.from({ length: n }, (_, i) => POOL[Math.floor(i * step)]) }

/** Silhouette cells of every placed sticker as rects about the frame's centre (count-box.test.ts's clash). */
function clash(birds: PackBird[], r: PackResult, hole: Hole, slack = 2) {
  const cx = r.W / 2, cy = r.H / 2
  const byId = new Map(birds.map((b) => [b.id, b]))
  let onText = 0, inAir = 0
  for (const [id, [x, y, w, h]] of r.boxes) {
    const m = byId.get(id)!.mask
    for (let j = 0; j < m.h; j++) for (let i = 0; i < m.w; i++) {
      if (!maskCell(m, i, j)) continue
      const sx = w / m.w, sy = h / m.h
      const c: Rect = [x + i * sx - cx, y + j * sy - cy, x + (i + 1) * sx - cx, y + (j + 1) * sy - cy]
      const d = Math.min(...holeRects(hole).map((t) => rectGap(c, t)))
      if (d <= 0) onText++
      if (d < hole.pad - slack) inAir++
    }
  }
  return { onText, inAir }
}

/** The collage's fill of its frame: the bounding box of the drawn stickers over the collage, as image.ts draws them. */
function fill(format: CardFormat, n: number) {
  const L = cardLayout(format, { name: true, filter: false, latest: true, count: n })
  const spec = packSpec(L)
  const r = packFrame(sample(n), spec.aspect, spec)
  const pack: ImagePack = { W: r.W, H: r.H, boxes: new Map([...r.boxes].map(([id, b]) => [String(id), b])) }
  const fit = fitPack(pack, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide))
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const [, b] of pack.boxes) {
    const [x, y, w, h] = fitBox(fit, b)
    x0 = Math.min(x0, x); x1 = Math.max(x1, x + w); y0 = Math.min(y0, y); y1 = Math.max(y1, y + h)
  }
  return { x: (x1 - x0) / L.collage.w, y: (y1 - y0) / L.collage.h, L, r, fit }
}

describe('the orientation shapes', () => {
  it('turns story into desktop and post into wide when horizontal, and keeps square square', () => {
    expect(imageShape('story', 'vertical')).toBe('story')
    expect(imageShape('post', 'vertical')).toBe('post')
    expect(imageShape('story', 'horizontal')).toBe('desktop')
    expect(imageShape('post', 'horizontal')).toBe('wide')
    expect(imageShape('square', 'horizontal')).toBe('square')
    expect(IMAGE_SIZE.desktop).toEqual([1920, 1080])
    expect(IMAGE_SIZE.wide).toEqual([1350, 1080])
    expect(IMAGE_SCALE.desktop).toBe(2) // the PNG is 3840 × 2160
    expect(IMAGE_SCALE.wide).toBe(1)
  })

  it('tells a poster from a share image', () => {
    expect(isPrint('printLandscape') && isPrint('print')).toBe(true)
    expect(isPrint('desktop') || isPrint('story')).toBe(false)
  })
})

describe('the landscape layouts', () => {
  for (const format of LANDSCAPE) {
    for (const c of CONTENTS) {
      const name = `${format}${c.name ? ' name' : ''}${c.filter ? ' filter' : ''}${c.latest ? ' latest' : ' no-latest'}`
      it(`${name}: everything inside the card and clear of the menu bar, the Dock and each other`, () => {
        const L = cardLayout(format, { ...c, count: 197 })
        const { x, y, w, h } = L.collage
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x + w).toBeLessThanOrEqual(L.W)
        expect(y).toBeGreaterThanOrEqual(SAFE[format].top)
        if (L.name) expect(L.name.y).toBeGreaterThanOrEqual(SAFE[format].top)
        // The footer's line stays above the bottom safe line (the Dock on a desktop).
        expect(L.footer.y + L.footer.size).toBeLessThanOrEqual(L.H - SAFE[format].bottom)
        expect(L.footer.y).toBeGreaterThan(L.rule.y)
        if (L.latest) {
          expect(L.latest.x).toBeGreaterThanOrEqual(M)
          if (L.latest.oneLine) {
            // On the footer's line: the sticker sits in the band from the hairline to the footer's bottom.
            expect(L.latest.y).toBeGreaterThan(L.rule.y)
            expect(L.latest.y + L.latest.icon).toBeLessThanOrEqual(L.footer.y + L.footer.size + 8)
            expect(y + h).toBeLessThanOrEqual(L.rule.y)
          } else {
            expect(L.latest.x + L.latest.icon + 20 + L.latest.tw).toBeLessThanOrEqual(L.W - M)
            expect(y + h).toBeLessThanOrEqual(L.latest.y)
          }
        } else {
          expect(y + h).toBeLessThanOrEqual(L.rule.y)
        }
      })
    }
  }

  it('the desktop has the one-line footer; the 5:4 card keeps the row stacked; the landscape poster has none (its foot names the lifer)', () => {
    const content = { name: true, filter: true, latest: true, count: 197 }
    expect(cardLayout('desktop', content).latest?.oneLine).toBe(true)
    expect(cardLayout('wide', content).latest?.oneLine).toBe(false)
    expect(cardLayout('printLandscape', content).latest).toBeUndefined()
    expect(cardLayout('wide', content).latest?.x).toBe(M)
  })

  it('the one-line row is two lines on the footer’s line, on the right, with the hairline 40 above the footer', () => {
    const L = cardLayout('desktop', { name: true, filter: true, latest: true, count: 197 })
    const { latest, footer, rule } = L
    expect(latest!.oneLine).toBe(true)
    expect(latest!.icon).toBe(40)
    expect(rule.y).toBe(footer.y - 40)
    // The sticker's middle sits on the middle of the stacked label (above) and name (on the footer's baseline).
    expect(latest!.y + latest!.icon / 2).toBeCloseTo(footer.y + footer.size * 0.8 - 22, 0)
  })

  it('the collage gets the height the stacked row took: taller than the old two-row desktop, and no empty band', () => {
    const L = cardLayout('desktop', { name: true, filter: true, latest: true, count: 197 })
    // Name and filter over the top, the collage from there to 24 above the hairline.
    expect(L.collage.y + L.collage.h).toBe(L.rule.y - 24)
    expect(L.collage.h).toBeGreaterThan(650) // was 582 with a name, 522 with a name and a stacked row
    const bare = cardLayout('desktop', { name: false, filter: false, latest: true, count: 197 })
    expect(bare.collage.y).toBe(SAFE.desktop.top) // no title: the collage starts at the top margin
    expect(bare.collage.h).toBeGreaterThan(790)
  })
})

describe('the footer’s one line fits in every language', () => {
  for (const [lang, m] of Object.entries({ en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant })) {
    it(`${lang}: the credit stays on the wordmark’s line, at 17px or more, clear of the latest row`, async () => {
      const opts = { format: 'desktop' as const, theme: 'light' as const, entries, species, pack: harnessPack, now: NOW, strings: m.ui }
      const card = await prepareCard(opts, IMAGE_SCALE.desktop)
      expect(card.oneLine).toBeDefined()
      expect(card.credit.below).toBe(false)
      expect(card.credit.size).toBeGreaterThanOrEqual(17)
      // The estimate measureText makes without a DOM (0.6 em a character in mono): the credit ends before the row's block.
      const lineEnd = M + card.brandW + card.footerLine.length * 0.6 * card.credit.size
      expect(lineEnd).toBeLessThanOrEqual(card.oneLine!.x - FOOTER_GAP)
      // The row's block, right-aligned to the margin.
      const blockEnd = card.oneLine!.x + card.L.latest!.icon + ONE_LINE_GAP + Math.max(card.oneLine!.labelW, card.oneLine!.nameText.length * 0.56 * card.oneLine!.nameSize)
      expect(blockEnd).toBeLessThanOrEqual(card.L.collage.x + card.L.collage.w + 1)
    })
  }

  it('the 5:4 card (and a landscape-poster-wide card) would not hold the row beside the credit with a long name (so it stacks)', () => {
    // The widest name a row draws is clipped to 480 units; 22 characters at 30px is about 370 units, the name's common worst.
    const label = 'LATEST LIFER · SEP 2026'.length * (0.6 * 20 + 1.2) // mono 20px with 0.06em tracking
    const block = 40 + 14 + label + 14 + 22 * 0.56 * 30
    const credit17 = 59 * 0.6 * 17 // the stamped footer line, at the smallest size placeCredit keeps
    const brand = 181
    const wide = 1350 - 2 * M, landscape = printDesign('A2', true)[0] - 2 * M
    expect(brand + credit17 + FOOTER_GAP + block).toBeGreaterThan(wide)
    expect(brand + credit17 + FOOTER_GAP + block).toBeGreaterThan(landscape)
  })
})

describe('the packed collage uses the frame', () => {
  for (const format of LANDSCAPE) {
    for (const n of [197, 1089]) {
      it(`${format}, ${n} species: the stickers reach the frame's edges both ways`, () => {
        const f = fill(format, n)
        expect(f.x).toBeGreaterThan(0.95)
        expect(f.y).toBeGreaterThan(0.95)
      }, 60_000)
    }
    it(`${format}, 12 species: a short list still fills the frame's height and most of its width`, () => {
      const f = fill(format, 12)
      expect(f.x).toBeGreaterThan(0.8)
      expect(f.y).toBeGreaterThan(0.9)
    }, 60_000)
  }

  for (const format of LANDSCAPE) {
    for (const n of [197, 1089]) {
      it(`${format}, ${n} species: no sticker on the count, and the count's column is kept clear`, () => {
        const f = fill(format, n)
        // In px: the frame's width is the collage's, as count-box.test.ts does.
        const k = f.L.collage.w / f.r.W
        const px: PackResult = { ...f.r, W: f.r.W * k, H: f.r.H * k, boxes: new Map([...f.r.boxes].map(([id, [x, y, w, h]]) => [id, [x * k, y * k, w * k, h * k]])) }
        expect(clash(sample(n), px, f.L.count.hole, 2 * k)).toEqual({ onText: 0, inAir: 0 })
      }, 60_000)
    }
  }
})

describe('the 4K desktop image', () => {
  it('draws 3840 × 2160: the design at 2× (a setTransform of 2), and the vertical story at 1080 × 1920 without one', async () => {
    const logs = installStubs()
    const desktop = await drawShareImage({ format: 'desktop', theme: 'light', entries, species, pack: harnessPack, now: NOW, strings: en.ui })
    expect([desktop.width, desktop.height]).toEqual([3840, 2160])
    const dLog = logs.get(desktop as unknown as object)!
    expect(dLog).toContain('setTransform(2, 0, 0, 2, 0, 0)')
    expect(dLog.filter((l) => l.startsWith('fillText')).length).toBeGreaterThan(3)

    const story = await drawShareImage({ format: 'story', theme: 'light', entries, species, pack: harnessPack, now: NOW, strings: en.ui })
    expect([story.width, story.height]).toEqual([1080, 1920])
    expect(logs.get(story as unknown as object)!.some((l) => l.startsWith('setTransform'))).toBe(false)
  })

  it('the wide 5:4 image is 1350 × 1080 at 1×', async () => {
    installStubs()
    const wide = await drawShareImage({ format: 'wide', theme: 'dark', entries, species, pack: harnessPack, now: NOW, strings: en.ui })
    expect([wide.width, wide.height]).toEqual([1350, 1080])
  })
})

describe('analytics', () => {
  // The Worker's side of this check lives in tests/stats-worker.test.ts (Vercel's upload leaves workers/ out).
  it('the app allows the horizontal formats for downloads and shares alike', () => {
    for (const event of ['image_downloaded', 'shared'] as const) {
      expect(APP_ALLOWED[event]).toEqual(expect.arrayContaining(['desktop', 'wide']))
    }
  })
})
