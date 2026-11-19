'use client'
import type { ReactNode } from 'react'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import type { Ui } from '@/i18n/messages/en'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { obsorgExcluded, obsorgNotSpecies } from './obsorg-copy'

// Already at #match the link changes nothing the match report hears: tell it again (it opens on a hashchange).
const reopen = () => requestAnimationFrame(() => window.dispatchEvent(new HashChangeEvent('hashchange')))

/**
 * A source's entries that weren't counted, for its row's status line ("· 10 skipped", SourceRow): entries that aren't
 * species (sp., slashes, hybrids, domestics: `skipped` counts and named `not-species` rows) and rows that couldn't be
 * matched to an eBird species (fixed in the match report, #match). `body` is what "why?" opens: why, in plain words,
 * the names when the import kept them, and the way to the match report. Null when nothing was left out. An
 * observation.org row names its entries by scientific name (the local name after it, muted). Its observations export
 * also leaves out the records observation.org marks as escapes or uncertain (`sources.obsorg.excluded`): those are
 * observations, not entries, so they stay out of `n` and are `excluded`; their sentence is in `body`, and SourceRow
 * shows "· N observations not counted why?" when they are all that was left out. Species the eBird life list marks not
 * countable (`notCountable`, part of its skipped count) are named on their own line, by `nameOf` when given.
 */
export function notCounted(saved: Saved, slots: Slot[], t: Ui, nameOf?: (code: string) => string): { n: number; excluded?: number; body: ReactNode } | null {
  const mine = saved.unmatched.filter((u) => slots.includes(u.slot ?? u.source))
  const named = mine.filter((u) => u.reason === 'not-species')
  const unmatched = mine.filter((u) => u.reason === 'no-match').length
  const skipped = slots.reduce((a, s) => a + (saved.skipped?.[s] ?? 0), 0)
  const offList = slots.flatMap((s) => saved.notCountable?.[s] ?? [])
  const notCountable = offList.length
  const groups = Math.max(0, skipped - notCountable) + named.length
  const obsorg = slots.some((s) => s === 'obsorg' || s === 'obsorg-list')
  const ex = slots.includes('obsorg') ? saved.sources?.obsorg?.excluded : undefined
  const excluded = (ex?.escape ?? 0) + (ex?.uncertain ?? 0)
  const n = groups + notCountable + unmatched
  if (!n && !excluded) return null
  const names: ReactNode[] = obsorg
    ? named.filter((u) => u.sci || u.com).map((u) => (u.sci && u.com ? <>{u.sci}<span className="eb-match-sci"> · {u.com}</span></> : (u.sci ?? u.com)))
    : named.map((u) => u.com ?? u.sci).filter((x): x is string => !!x)
  const excludedLine = ex ? obsorgExcluded(ex.escape, ex.uncertain, t) : null
  return {
    n,
    ...(excluded ? { excluded } : {}),
    body: (
      <>
        {groups > 0 && (
          <>
            {obsorg ? (
              <p className="eb-note">{obsorgNotSpecies(groups, t)}</p>
            ) : (
              <p className="eb-note">{plural(t.import.notCounted.groups, groups, { n: formatInt(groups, t.num) })}</p>
            )}
            {names.length > 0 && <ul className="eb-note">{names.map((x, i) => <li key={i}>{x}</li>)}</ul>}
          </>
        )}
        {notCountable > 0 && (
          <>
            <p className="eb-note">{plural(t.import.notCounted.notCountable, notCountable, { n: formatInt(notCountable, t.num) })}</p>
            <ul className="eb-note">{offList.map((code) => <li key={code}>{nameOf ? nameOf(code) : code}</li>)}</ul>
          </>
        )}
        {excludedLine && <p className="eb-note">{excludedLine}</p>}
        {unmatched > 0 && (
          <p className="eb-note">
            {plural(t.import.notCounted.unmatched, unmatched, { n: formatInt(unmatched, t.num) })}{' '}
            <a href="#match" onClick={reopen}>{plural(t.collage.fix, unmatched)}</a>
          </p>
        )}
      </>
    ),
  }
}
