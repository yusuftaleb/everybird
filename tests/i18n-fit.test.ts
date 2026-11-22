// Fixed rows must not outgrow their room in es, pt and nl. The top bar's fit is measured from the real fonts in
// topbar-fit.test.ts; this covers the other rows that can't wrap: the controls bar, the Places and Time buttons,
// the source rows' buttons, the share dialog's segments and actions, and the count label. "No English left" is
// in i18n.test.ts (ALLOW_SAME).
import { describe, expect, it } from 'vitest'
import { LANGS } from '@/i18n/langs'
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
import { COUNT_LABEL_CHARS, labelCells, WIDE_CHAR } from '@/lib/layout/count-box'
import { readFileSync } from 'node:fs'
import glyphs from './fixtures/glyph-advances.json'

// pl is left out until its maintainer decides on two labels over budget: trueSize, shareImage.
const OTHERS = { es, pt, nl, fr, de, it: italian, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const

/** Resting labels in fixed rows (dotted paths into `ui`). */
const TIGHT = [
  'collage.controls.collage', 'collage.controls.list', 'collage.controls.tree', 'collage.controls.heaviestFirst', 'collage.controls.lightestFirst',
  'collage.controls.heaviest', 'collage.controls.lightest', 'collage.controls.family', 'collage.controls.newestFirst', 'collage.controls.oldestFirst',
  'collage.controls.newest', 'collage.controls.oldest', 'collage.controls.trueSize', 'collage.controls.sci',
  'filters.label', 'filters.clear', 'filters.timeline.sumFrom', 'filters.timeline.sumTo',
  'import.add', 'import.replace', 'import.remove', 'import.inat.refresh', 'import.inat.cancel', 'tick.button',
  'share.format.story', 'share.format.post', 'share.format.square', 'share.shareImage', 'share.download', 'share.copyLink',
  'share.showLatest', 'count.label', 'collage.print',
]

/** Settings' source-row buttons wrap under the row's text when they don't fit (SourceRow), so a whole word beats a
 *  clipped one: these get at least 12 characters. */
const ROOMY: Record<string, number> = { 'import.add': 12, 'import.remove': 12 }

/** A label's length in Latin characters: a kana or Han character is one em, about 1 / 0.58 of a Satoshi letter (the
 *  width model of topbar-fit.test.ts; Latin and Cyrillic letters count one each). */
const width = (s: string) => [...s].reduce((n, c) => n + (WIDE_CHAR.test(c) ? 1 / 0.58 : 1), 0)
/** Short forms: at most the English short form + 2. */
const SHORT = ['collage.controls.sciShort']

function get(m: unknown, path: string): string {
  const v = path.split('.').reduce<unknown>((n, k) => (n as Record<string, unknown>)[k], (m as { ui: unknown }).ui)
  if (typeof v !== 'string') throw new Error(`${path} is not a string`)
  return v
}

describe('tight labels', () => {
  it('stay within their budget', () => {
    const over: string[] = []
    for (const [lang, m] of Object.entries(OTHERS)) {
      for (const path of TIGHT) {
        const e = get(en, path)
        const v = get(m, path)
        const max = Math.max(e.length + 4, Math.ceil(e.length * 1.3), ROOMY[path] ?? 0)
        if (width(v) > max) over.push(`${lang} ${path} "${v}" (en "${e}", max ${max})`)
      }
      for (const path of SHORT) {
        const e = get(en, path)
        const v = get(m, path)
        if (width(v) > e.length + 2) over.push(`${lang} ${path} "${v}" (en "${e}", max ${e.length + 2})`)
      }
    }
    expect(over).toEqual([])
  })

  it('the count label fits the hole', () => {
    for (const m of [en, es, pt, nl, pl, fr, de, italian, sv, da, ru, ja, zhHans, zhHant]) for (const w of [m.ui.count.label, ...Object.values(m.ui.count.word)]) expect(labelCells(w)).toBeLessThanOrEqual(COUNT_LABEL_CHARS)
  })

  it('language codes are two letters, or Chinese by script', () => {
    for (const l of LANGS) expect(l).toMatch(/^(?:[a-z]{2}|zh-Han[st])$/)
  })
})

describe('the iNaturalist note (import.inat.guide)', () => {
  // One line in the desktop Add birds dialog: .eb-add is 760px (1px border, 20px padding), the panel in it 1px border and
  // 14px padding (688px), and the note's max-width 62ch caps it: 62 × Satoshi's "0" at 14px. Phones may wrap.
  const css = readFileSync('src/components/import/import.css', 'utf8')
  const adv = (font: keyof typeof glyphs.fonts, c: string) => (glyphs.fonts[font].advances as Record<string, number>)[c]
  // Satoshi 500, a little wider than the note's 400; Cyrillic in Noto Sans; kana and Han one em; ’ and NBSP as ' and space.
  const px = (s: string) => [...s.replace(/’/g, "'").replace(/\u00a0/g, ' ')].reduce((n, c) => {
    const a = adv('satoshi-500', c) ?? adv('noto-sans-500', c) ?? (WIDE_CHAR.test(c) ? 1 : undefined)
    if (a === undefined) throw new Error(`no advance for ${JSON.stringify(c)}`)
    return n + a
  }, glyphs.fonts['satoshi-500'].kernWidenEm) * 14

  it('the CSS still says what this models', () => {
    expect(css).toMatch(/\.eb-add \{\s*width: min\(760px, 100%\)/)
    expect(css).toMatch(/\.eb-src-panel > \.eb-note \{[^}]*max-width: 62ch/)
    expect(css).toMatch(/\.eb-add \.eb-src-panel \{[^}]*padding: 12px 14px/)
  })

  it('fits one line in every language', () => {
    const room = Math.min(760 - 2 - 40 - 2 - 28, 62 * adv('satoshi-500', '0') * 14) - 4 // 4px for kerning and rounding
    const over = Object.entries({ en, pl, ...OTHERS }).map(([l, m]) => [l, m.ui.import.inat.guide, px(m.ui.import.inat.guide)] as const).filter(([, , w]) => w > room)
    expect(over).toEqual([])
  })
})
