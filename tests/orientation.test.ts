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

afterEach(() => vi.unstubAllGlobals())

const M = 64
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
          // The row above the hairline (round 6, item 17), inside the margins, the collage above it.
          expect(L.latest.x).toBeGreaterThanOrEqual(M)
          expect(L.latest.x + L.latest.icon + 20 + L.latest.tw).toBeLessThanOrEqual(L.W - M)
          expect(L.latest.y + L.latest.icon).toBeLessThan(L.rule.y)
          expect(y + h).toBeLessThanOrEqual(L.latest.y)
        } else {
          expect(y + h).toBeLessThanOrEqual(L.rule.y)
        }
      })
    }
  }

  it('the desktop and the 5:4 card draw the row on one line above the hairline; the landscape poster has none (its foot names the lifer)', () => {
    const content = { name: true, filter: true, latest: true, count: 197 }
    expect(cardLayout('desktop', content).latest?.inline).toBe(true)
    expect(cardLayout('wide', content).latest?.inline).toBe(true)
    expect(cardLayout('printLandscape', content).latest).toBeUndefined()
    expect(cardLayout('wide', content).latest?.x).toBe(M)
  })

  it('the desktop\'s row: 40 units tall, 24 above the hairline, the hairline 30 above the footer (20 without the row)', () => {
    const L = cardLayout('desktop', { name: true, filter: true, latest: true, count: 197 })
    expect(L.latest!.icon).toBe(40)
    expect(L.rule.y).toBe(L.footer.y - 30)
    expect(L.latest!.y + L.latest!.icon).toBe(L.rule.y - 24)
    expect(L.collage.y + L.collage.h).toBe(L.latest!.y - 24)
    expect(cardLayout('desktop', { name: true, filter: true, latest: false, count: 197 }).rule.y).toBe(L.footer.y - 20)
  })
})

describe('the footer’s one line fits in every language', () => {
  for (const [lang, m] of Object.entries({ en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant })) {
    it(`${lang}: the credit beside the wordmark, whole, at 17px or more, inside the margin`, async () => {
      const opts = { format: 'desktop' as const, theme: 'light' as const, entries, species, pack: harnessPack, now: NOW, strings: m.ui }
      const card = await prepareCard(opts, IMAGE_SCALE.desktop)
      expect(card.credit.size).toBeGreaterThanOrEqual(17)
      // The estimate measureText makes without a DOM (0.6 em a character in mono): the credit ends inside the margin.
      const lineEnd = M + (card.credit.below ? 0 : card.brandW) + card.footerLine.length * 0.6 * card.credit.size
      expect(lineEnd).toBeLessThanOrEqual(card.L.collage.x + card.L.collage.w + 1)
    })
  }
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
    // Round 6, item 12: a short list is one snug group round the count, as large as the frame allows.
    it(`${format}, 12 species: a short list is one group filling most of the frame's height`, () => {
      const f = fill(format, 12)
      expect(f.y).toBeGreaterThan(0.75)
      expect(f.x * f.L.collage.w).toBeGreaterThan(f.y * f.L.collage.h)
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
