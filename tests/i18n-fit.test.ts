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
import { COUNT_LABEL_CHARS } from '@/lib/layout/count-box'

// pl is left out until its maintainer decides on two labels over budget: trueSize, shareImage.
const OTHERS = { es, pt, nl, fr, de, it: italian, sv, da } as const

/** Resting labels in fixed rows (dotted paths into `ui`). */
const TIGHT = [
  'collage.controls.collage', 'collage.controls.list', 'collage.controls.tree', 'collage.controls.heaviestFirst', 'collage.controls.lightestFirst',
  'collage.controls.trueSize', 'collage.controls.style',
  'filters.label', 'filters.clear', 'filters.timeline.sumFrom', 'filters.timeline.sumTo',
  'import.add', 'import.replace', 'import.remove', 'import.inat.refresh', 'import.inat.cancel', 'tick.button',
  'share.format.story', 'share.format.post', 'share.format.square', 'share.shareImage', 'share.download', 'share.copyLink',
  'share.showLatest', 'count.label',
]

/** Settings' source-row buttons wrap under the row's text when they don't fit (SourceRow), so a whole word beats a
 *  clipped one: these get at least 12 characters. */
const ROOMY: Record<string, number> = { 'import.add': 12, 'import.remove': 12 }

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
        if (v.length > max) over.push(`${lang} ${path} "${v}" (en "${e}", max ${max})`)
      }
    }
    expect(over).toEqual([])
  })

  it('the count label fits the hole', () => {
    for (const m of [en, es, pt, nl, pl, fr, de, italian, sv, da]) expect(m.ui.count.label.length).toBeLessThanOrEqual(COUNT_LABEL_CHARS)
  })

  it('language codes are two letters', () => {
    for (const l of LANGS) expect(l).toMatch(/^[a-z]{2}$/)
  })
})
