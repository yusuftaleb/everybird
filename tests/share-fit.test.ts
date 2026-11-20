// The share dialog's format control and its row of three quiet buttons must fit their column in every language, at
// every container-query step in share.css. No font runs in Node, so the widths are estimates from the character count
// (Satoshi's average advance is about .56em; .58 leaves a little room) and the thresholds are checked against them:
// each step's lower bound must hold the longest label set. The columns: the controls column is 300px from 720px,
// 420px from 1000px and 480px from 1200px, about 246px on a 320px phone.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { pl } from '@/i18n/messages/pl'
import { fr } from '@/i18n/messages/fr'
import { de } from '@/i18n/messages/de'
import { labelCells, WIDE_CHAR } from '@/lib/layout/count-box'
import { yearFirst } from '@/i18n/format'
import { it as italian } from '@/i18n/messages/it'
import { sv } from '@/i18n/messages/sv'
import { da } from '@/i18n/messages/da'
import { ru } from '@/i18n/messages/ru'
import { ja } from '@/i18n/messages/ja'
import { zhHans } from '@/i18n/messages/zh-Hans'
import { zhHant } from '@/i18n/messages/zh-Hant'

const LANG = { en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const
const css = readFileSync('src/components/share/share.css', 'utf8')

const EM = 0.58 // Satoshi 500 and 700, per character
/** A kana or Han character is one em (not measured; see topbar-fit.test.ts), any other EM. */
const text = (s: string, px: number) => [...s].reduce((w, c) => w + (WIDE_CHAR.test(c) ? 1 : EM), 0) * px
const COLUMNS = { laptop: 480, desktop: 420, narrow: 300, phone: 246 }

type FormatStep = { name: string; min: number; query: string | null; px: number; padX: number; gap: number; segPad: number }
// The format and orientation controls' steps, from share.css: words only (each button's spoken name keeps the ratio),
// 8px of padding under 400px of column, and under 290px the small words (each `query` is the text that must be in the file).
const FORMAT_STEPS: FormatStep[] = [
  { name: 'words', min: 400, query: null, px: 16, padX: 10, gap: 4, segPad: 4 },
  { name: 'tight words', min: 290, query: '@container (max-width: 399px) { .eb-share .eb-share-toprow', px: 16, padX: 8, gap: 4, segPad: 4 },
  { name: 'small words', min: 240, query: '@container (max-width: 289px)', px: 14, padX: 4, gap: 2, segPad: 2 },
]

const formatNeed = (labels: string[], s: FormatStep) =>
  2 + 2 * s.segPad + (labels.length - 1) * s.gap + labels.reduce((sum, label) => sum + 2 * s.padX + text(label, s.px), 0)

type RowStep = { name: string; min: number; query: string | null; icon: boolean; px: number; padX: number; gap: number }
const ROW_STEPS: RowStep[] = [
  { name: 'icons', min: 440, query: null, icon: true, px: 15, padX: 10, gap: 8 },
  { name: 'no icons', min: 400, query: '@container (max-width: 439px)', icon: false, px: 15, padX: 8, gap: 8 },
  { name: 'tight', min: 300, query: '@container (max-width: 399px)', icon: false, px: 14, padX: 6, gap: 6 },
]
const rowNeed = (labels: string[], s: RowStep) =>
  (labels.length - 1) * s.gap + labels.reduce((sum, label) => sum + 2 + 2 * s.padX + (s.icon ? 18 + 8 : 0) + text(label, s.px), 0)

describe("the share dialog's rows", () => {
  it('has the container queries the budget assumes', () => {
    for (const s of [...FORMAT_STEPS, ...ROW_STEPS]) if (s.query) expect(css).toContain(s.query)
    expect(css).toContain('@container (max-width: 299px)')
  })

  it("keeps each language's format labels inside the control at every step", () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const f = m.ui.share.format
      const labels = [f.story, f.post, f.square]
      for (const s of FORMAT_STEPS) {
        const need = formatNeed(labels, s)
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })

  it("keeps each language's horizontal labels (Desktop, 5:4) inside the control at every step", () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const f = m.ui.share.format
      const labels = [f.desktop, f.post, f.square]
      for (const s of FORMAT_STEPS) {
        const need = formatNeed(labels, s)
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })

  it('keeps Vertical | Horizontal on one line in every language at every step', () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const o = m.ui.share.orientation
      // Two segments: the format control's padding and gaps, so the budget is the same kind.
      for (const s of FORMAT_STEPS) {
        const need = formatNeed([o.vertical, o.horizontal], s)
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })

  it('picks the step that fits the 480, 420, 300 and 246px columns', () => {
    const stepFor = (w: number) => FORMAT_STEPS.find((s) => w >= s.min)!
    expect(stepFor(COLUMNS.laptop).name).toBe('words')
    expect(stepFor(COLUMNS.desktop).name).toBe('words')
    expect(stepFor(COLUMNS.narrow).name).toBe('tight words')
    expect(stepFor(COLUMNS.phone).name).toBe('small words')
  })

  it('puts the format and the orientation on one row at the 480px column, in every language but German and Russian', () => {
    // Measured advances (Satoshi 500; Noto Sans for what Satoshi lacks; a kana or Han character 1em), no kerning.
    const fonts = JSON.parse(readFileSync('tests/fixtures/glyph-advances.json', 'utf8')).fonts
    const sat = fonts['satoshi-500'].advances as Record<string, number>, noto = fonts['noto-sans-500'].advances as Record<string, number>
    const measured = (label: string) => [...label].reduce((n, c) => n + (sat[c] ?? noto[c] ?? 1), 0) * 16
    const seg = (labels: string[]) => 2 + 2 * 4 + (labels.length - 1) * 4 + labels.reduce((n, l) => n + 2 * 10 + measured(l), 0)
    const wraps: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const f = m.ui.share.format, o = m.ui.share.orientation
      const row = Math.max(seg([f.story, f.post, f.square]), seg([f.desktop, f.post, f.square])) + 8 + seg([o.vertical, o.horizontal])
      if (row > COLUMNS.laptop - 4) wraps.push(lang)
    }
    expect(wraps).toEqual(['de', 'ru'])
  })

  it('keeps Download and Copy link on one line in every language at 300px and up', () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const labels = [m.ui.share.downloadShort, m.ui.share.copyLink]
      for (const s of ROW_STEPS) {
        const need = rowNeed(labels, s)
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })
})

describe('the option switches and Print\'s actions', () => {
  // Measured advances (Satoshi 500; Noto Sans for what Satoshi lacks; a kana or Han character 1em), as above.
  const fonts = JSON.parse(readFileSync('tests/fixtures/glyph-advances.json', 'utf8')).fonts
  const sat = fonts['satoshi-500'].advances as Record<string, number>, noto = fonts['noto-sans-500'].advances as Record<string, number>
  const measured = (label: string, px: number) => [...label].reduce((n, c) => n + (sat[c] ?? noto[c] ?? 1), 0) * px

  it('keeps every switch on one line, its label beside it, at the 300px column and up (a pair that can\'t share a row wraps whole)', () => {
    // share.css: a paired switch is its label, 12px, the 36px track; the row has 12px padding each side.
    expect(css).toMatch(/\.eb-share \.eb-share-pair > \.eb-share-opt \{[^}]*flex: none;[^}]*gap: 12px/)
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const s = m.ui.share
      for (const label of [s.showLatest, s.print.showNames, s.dark, s.transparent, m.ui.collage.controls.lifersOnly, s.hideTotals]) {
        const need = 2 * 12 + measured(label, 16) + 12 + 36
        if (need > COLUMNS.narrow) over.push(`${lang} "${label}": ${Math.ceil(need)}px`)
      }
    }
    expect(over).toEqual([])
  })

  it('puts Print\'s two actions on one row at the 420px column in every language, labels never wrapped', () => {
    // .eb-share-duo: two .eb-btn (18px padding each side, an 18px icon and 8px before the 15px label, 1px border), 8px apart.
    expect(css).toMatch(/\.eb-share-duo > \.eb-btn \{ white-space: nowrap; \}/)
    const btn = (label: string) => 2 + 2 * 18 + 18 + 8 + measured(label, 15)
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const p = m.ui.share.print
      for (const [a, b] of [[p.make, m.ui.share.copyLink], [p.png, p.pdf]]) {
        const need = btn(a) + 8 + btn(b)
        if (need > COLUMNS.desktop) over.push(`${lang} ${a} + ${b}: ${Math.ceil(need)}px`)
      }
    }
    expect(over).toEqual([])
  })
})

describe("the desktop's one-line footer", () => {
  // The worst case in every language: the credit at 17px (its smallest), the latest row's label (uppercase mono 20px,
  // tracked .06em) with the longest month, and a 22-character name at 30px (the row clips a name past 480 units). The
  // desktop line is 1792 units wide (1920 less the 64 side margins); the wordmark is about 181 of them.
  const LINE_W = 1920 - 2 * 64
  const BRAND = 181
  const CREDIT_CHARS = 81 // "everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0 · 14 Nov 2026"
  const MONO_EM_20 = 0.6 * 20 + 0.06 * 20
  it('fits the credit at 17px or more beside the row, in every language', () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const longest = Math.max(...m.ui.date.months.map(labelCells))
      const label = `${m.ui.share.latestLifer} · ${'x'.repeat(longest)} 2026${yearFirst(m.ui.date.months) ? '年' : ''}`.toUpperCase()
      const row = 40 + 14 + labelCells(label) * MONO_EM_20 + 14 + 22 * 0.56 * 30
      const need = BRAND + 32 + CREDIT_CHARS * 0.6 * 17 + row
      if (need > LINE_W) over.push(`${lang}: needs ${Math.ceil(need)}px, the line is ${LINE_W}px`)
    }
    expect(over).toEqual([])
  })
})
