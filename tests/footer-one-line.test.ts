// Round 6: the share images' and posters' footer is one line under the hairline: the wordmark, then the link to the
// credits (FOOTER_LINE), and the date at the right on the same baseline; never a second line, nothing overlapping, in
// every format, poster size and language. The collage takes back the room the old footer's two lines kept under it.
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
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CREDIT_MIN, DATE_GAP, FOOTER_LINE, POSTER_FOOT, cardLayout, drawShareImage, prepareCard, type CardFormat } from '@/lib/share/image'
import { PRINT_SIZES, printDesign } from '@/lib/share/print'
import { stampDate, stampStrings } from '@/lib/share/stamp'
import { entries, installStubs, pack, species } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

const LANGS = { en, es, nl, pt, pl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant }
const IMAGES = ['story', 'post', 'square', 'desktop', 'wide'] as const
const POSTERS = ['print', 'printLandscape'] as const
// The harness's mono face: 0.6 em a character (installStubs).
const mono = (s: string, px: number) => s.length * 0.6 * px
// The language's longest date stamp: the 28th of its longest month name.
const longestDay = (ui: typeof en.ui) => {
  const days = Array.from({ length: 12 }, (_, m) => new Date(2026, m, 28))
  return days.reduce((a, b) => (stampDate(b, stampStrings(ui)).length > stampDate(a, stampStrings(ui)).length ? b : a))
}

describe('the footer is one line, the wordmark, the link and the date, in every format, size and language', () => {
  for (const [lang, m] of Object.entries(LANGS)) {
    const now = longestDay(m.ui)
    const cases: { format: CardFormat; size?: (typeof PRINT_SIZES)[number] }[] = [
      ...IMAGES.map((format) => ({ format })),
      ...POSTERS.flatMap((format) => PRINT_SIZES.map((size) => ({ format, size }))),
    ]
    it(`${lang}: beside the wordmark, whole, the date at the right clear of the link`, async () => {
      installStubs()
      for (const { format, size } of cases) {
        const card = await prepareCard({ format, theme: 'light', entries, species, pack, now, strings: m.ui, latest: true, name: 'Ada Lovelace', printSize: size })
        const at = `${format} ${size ?? ''}`
        const min = format.startsWith('print') ? POSTER_FOOT.min : CREDIT_MIN
        expect(card.credit.brand, at).toBe(true)
        expect(card.credit.size, at).toBeGreaterThanOrEqual(min)
        expect(card.footerLine, at).toBe(FOOTER_LINE)
        expect(card.stamp, at).toBe(stampDate(now, stampStrings(m.ui)))
        // The link ends at least DATE_GAP before the right-aligned date starts, both inside the content's width.
        const linkEnd = card.brandW + mono(card.footerLine, card.credit.size)
        const dateStart = card.L.collage.w - mono(card.stamp, card.credit.size)
        expect(linkEnd + DATE_GAP, at).toBeLessThanOrEqual(dateStart)
      }
    })
  }

  for (const format of [...IMAGES, ...POSTERS]) {
    it(`${format}: draws the three on one baseline under the hairline, nothing else`, async () => {
      const logs = installStubs()
      const now = new Date(2026, 10, 21)
      const canvas = await drawShareImage({ format, theme: 'light', entries, species, pack, now, strings: en.ui, latest: true, name: 'Ada Lovelace', printSize: 'A2' })
      const log = logs.get(canvas as unknown as object)!
      // Everything after the wordmark is the footer.
      const from = log.findIndex((l) => l.startsWith('fillText("Everybird"'))
      expect(from).toBeGreaterThan(0)
      const texts = log.slice(from).flatMap((l) => {
        const t = /^fillText\("(.*)", ([\d.]+), ([\d.]+)\)$/.exec(l)
        return t ? [{ text: t[1], x: Number(t[2]), y: Number(t[3]) }] : []
      })
      expect(texts.map((t) => t.text)).toEqual(['Everybird', FOOTER_LINE, '21 Nov 2026'])
      expect(new Set(texts.map((t) => t.y)).size).toBe(1)
      expect(texts[0].x).toBeLessThan(texts[1].x)
      expect(log.slice(from)).toContain('textAlign = "right"')
    })
  }
})

describe('the collage takes back the old footer\'s second line', () => {
  // The collage's height before round 6's one-line footer (two lines under the wordmark on the 1080-wide cards, AD7:
  // 2 × (22 + 10) kept under the collage), with and without the latest lifer row and the title; the 5:4, the desktop
  // and the posters already had one line.
  const BEFORE: Record<string, number[]> = {
    story: [1248, 1372, 1320, 1444], post: [910, 1010, 966, 1066], square: [616, 724, 680, 788],
    desktop: [674, 774, 748, 848], wide: [704, 804, 760, 860],
    print: [1163.3694819592824, 1263.3694819592824, 1219.3694819592824, 1319.3694819592824], printLandscape: [716, 816, 772, 872],
  }
  const GAIN: Record<string, number> = { story: 64, post: 64, square: 64, desktop: 0, wide: 0, print: 0, printLandscape: 0 }
  for (const format of Object.keys(BEFORE) as CardFormat[]) {
    it(`${format}: ${GAIN[format]} units more`, () => {
      const dims = format.startsWith('print') ? printDesign('A2', format === 'printLandscape') : undefined
      const h = [[true, true], [true, false], [false, true], [false, false]].map(([latest, name]) => cardLayout(format, { name, filter: false, latest, count: 197 }, dims).collage.h)
      expect(h).toEqual(BEFORE[format].map((b) => b + GAIN[format]))
    })
  }
})
