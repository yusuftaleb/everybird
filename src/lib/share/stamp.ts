// The date stamp at the end of the share images' footer line: "… · Stickers: huashu-bird-sticker, CC BY 4.0 · 14 Nov 2026", the date the
// image was made, with no prefix. Imports only @/lib/format, so e2e specs and the About demo can import it without the
// canvas code in image.ts.
import { dayText } from '@/i18n/format'

/** The words of a stamp: the 12 short month names, January first. A language is one of these. */
type StampStrings = { months: readonly string[] }

/** English, with the short months the rest of the site uses ("Sep 2026"): en-ui's `date.months` (tests/share-stamp.test.ts),
 *  written out so the English dictionary stays out of the client bundle. */
export const STAMP_EN: StampStrings = { months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] }

/** "14 Nov 2026" ("2026年11月14日") from `d`'s local date (no leading zero); '' for an invalid date. */
export function stampDate(d: Date, s: StampStrings = STAMP_EN): string {
  if (Number.isNaN(d.getTime())) return ''
  return dayText(d, s.months, true)
}

/** `line` ending with the stamp after a middle dot; `line` alone when there is no stamp. */
export function withStamp(line: string, stamp: string): string {
  return stamp ? `${line} · ${stamp}` : line
}

/** A language's stamp from its UI strings (`ui.date.months`): the stamp has no lead in any language. */
export function stampStrings(t: { date: { months: readonly string[] } }): StampStrings {
  return { months: t.date.months }
}
