// The share dialog's format control and its row of three quiet buttons must fit their column in every language, at
// every container-query step in share.css. No font runs in Node, so the widths are estimates from the character count
// (Satoshi's average advance is about .56em; .58 leaves a little room) and the thresholds are checked against them:
// each step's lower bound must hold the longest label set. The columns: the controls column is 300px from 720px and
// 420px from 1000px, about 246px on a 320px phone.
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
const MONO_EM = 0.62 // Geist Mono 12px plus .02em of tracking
const RATIOS = ['9:16', '4:5', '1:1']
/** Horizontal: 16:9 (the desktop, in place of the story), 5:4 (the wide post) and 1:1 (square). */
const RATIOS_WIDE = ['16:9', '5:4', '1:1']
/** A kana or Han character is one em (not measured; see topbar-fit.test.ts), any other EM. */
const text = (s: string, px: number) => [...s].reduce((w, c) => w + (WIDE_CHAR.test(c) ? 1 : EM), 0) * px
const COLUMNS = { desktop: 420, narrow: 300, phone: 246 }

type FormatStep = { name: string; min: number; query: string | null; icon: boolean; hint: boolean; px: number; padX: number; gap: number; segPad: number }
// The steps, from share.css: the base and its three container queries (each `query` is the text that must be in the file).
const FORMAT_STEPS: FormatStep[] = [
  { name: 'icons and ratios', min: 500, query: null, icon: true, hint: true, px: 16, padX: 14, gap: 4, segPad: 4 },
  { name: 'ratios', min: 384, query: '@container (max-width: 499px)', icon: false, hint: true, px: 16, padX: 8, gap: 4, segPad: 4 },
  { name: 'words', min: 290, query: '@container (max-width: 383px)', icon: false, hint: false, px: 16, padX: 8, gap: 4, segPad: 4 },
  { name: 'small words', min: 240, query: '@container (max-width: 289px)', icon: false, hint: false, px: 14, padX: 4, gap: 2, segPad: 2 },
]

const formatNeed = (labels: string[], s: FormatStep, ratios: string[] = RATIOS) =>
  2 + 2 * s.segPad + 2 * s.gap +
  labels.reduce((sum, label, i) => sum + 2 * s.padX + (s.icon ? 18 + 8 : 0) + text(label, s.px) + (s.hint ? 8 + ratios[i].length * MONO_EM * 12 : 0), 0)

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
        const need = formatNeed(labels, s, RATIOS_WIDE)
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })

  it('keeps Vertical | Horizontal on one line in every language at every step', () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(LANG)) {
      const o = m.ui.share.orientation
      // Two segments, no icon and no ratio: the format control's padding and gaps, so the budget is the same kind.
      for (const s of FORMAT_STEPS) {
        const need = formatNeed([o.vertical, o.horizontal], { ...s, icon: false, hint: false })
        if (need > s.min) over.push(`${lang} ${s.name}: needs ${Math.ceil(need)}px, step starts at ${s.min}px`)
      }
    }
    expect(over).toEqual([])
  })

  it('picks the step that fits the 420, 300 and 246px columns', () => {
    const stepFor = (w: number) => FORMAT_STEPS.find((s) => w >= s.min)!
    expect(stepFor(COLUMNS.desktop).name).toBe('ratios')
    expect(stepFor(COLUMNS.narrow).name).toBe('words')
    expect(stepFor(COLUMNS.phone).name).toBe('small words')
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

describe("the desktop's one-line footer", () => {
  // The worst case in every language: the credit at 17px (its smallest), the latest row's label (uppercase mono 20px,
  // tracked .06em) with the longest month, and a 22-character name at 30px (the row clips a name past 480 units). The
  // desktop line is 1792 units wide (1920 less the 64 side margins); the wordmark is about 181 of them.
  const LINE_W = 1920 - 2 * 64
  const BRAND = 181
  const CREDIT_CHARS = 59 // "everybird.yusuftaleb.com · stickers by huashu · 14 Nov 2026"
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
