'use client'
import type { ReactNode } from 'react'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'

// Already at #match the link changes nothing the match report hears: tell it again (it opens on a hashchange).
const reopen = () => requestAnimationFrame(() => window.dispatchEvent(new HashChangeEvent('hashchange')))

/**
 * A source's entries that weren't counted, for its row's status line ("· 10 skipped", SourceRow): entries that aren't
 * species (sp., slashes, hybrids, domestics: `skipped` counts and named `not-species` rows) and rows that couldn't be
 * matched to an eBird species (fixed in the match report, #match). `body` is what "why?" opens: why, in plain words,
 * the names when the import kept them, and the way to the match report. Null when nothing was left out.
 */
export function notCounted(saved: Saved, slots: Slot[]): { n: number; body: ReactNode } | null {
  const mine = saved.unmatched.filter((u) => slots.includes(u.slot ?? u.source))
  const named = mine.filter((u) => u.reason === 'not-species')
  const unmatched = mine.filter((u) => u.reason === 'no-match').length
  const groups = slots.reduce((a, s) => a + (saved.skipped?.[s] ?? 0), 0) + named.length
  const n = groups + unmatched
  if (!n) return null
  const names = named.map((u) => u.com ?? u.sci).filter((x): x is string => !!x)
  return {
    n,
    body: (
      <>
        {groups > 0 && (
          <>
            <p className="eb-note">
              {groups.toLocaleString('en-US')} {groups === 1 ? "entry isn't a species" : "entries aren't species"}: birds only identified to a group (like
              “duck sp.”), either/or IDs (like “Greater/Lesser Scaup”) and hybrids. eBird leaves these off life lists too.
            </p>
            {names.length > 0 && <ul className="eb-note">{names.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </>
        )}
        {unmatched > 0 && (
          <p className="eb-note">
            {unmatched.toLocaleString('en-US')} {unmatched === 1 ? "row couldn't" : "rows couldn't"} be matched to this year&apos;s eBird taxonomy.{' '}
            <a href="#match" onClick={reopen}>{unmatched === 1 ? 'Fix it' : 'Fix them'}</a>
          </p>
        )}
      </>
    ),
  }
}
