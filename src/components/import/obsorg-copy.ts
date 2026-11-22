// The observation.org strings that are built rather than read (the "why?" sentences, the not-counted label), in `t`'s
// language; the rest of the words are `t.import.obsorg` in src/i18n/messages. The brand is always lower case,
// "observation.org", also at the start of a title or sentence.
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'

/** "why?" under an observation.org row: the entries that aren't species. */
export function obsorgNotSpecies(n: number, t: Ui): string {
  return plural(t.import.obsorg.notSpecies, n, { n: formatInt(n, t.num) })
}

/** "why?" under the observations row: records observation.org marks as escapes or uncertain. Null when there are none. */
export function obsorgExcluded(escape: number, uncertain: number, t: Ui): string | null {
  if (!escape && !uncertain) return null
  const o = t.import.obsorg
  const n = (x: number) => ({ n: formatInt(x, t.num) })
  if (escape && uncertain) {
    return fmt(o.both, { escape: plural(o.bothEscape, escape, n(escape)), uncertain: fmt(o.bothUncertain, n(uncertain)) })
  }
  return escape ? plural(o.escape, escape, n(escape)) : plural(o.uncertain, uncertain, n(uncertain))
}

/** The observations row's status part when escapes and uncertain records are all that was left out, and its "why?"
 *  button's name ("· 12 observations not counted why?"). They are observations, not entries: never in "N skipped". */
export function obsorgNotCounted(n: number, t: Ui): { label: string; ask: string } {
  const o = t.import.obsorg
  const a = { n: formatInt(n, t.num) }
  return { label: plural(o.notCountedLabel, n, a), ask: plural(o.notCountedAsk, n, a) }
}
