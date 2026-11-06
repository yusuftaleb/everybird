'use client'
import { Check, MagnifyingGlass } from '@phosphor-icons/react'
import { memo, useState } from 'react'
import { unmatchedKey, type Unmatched } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import { SpeciesSearch } from './SpeciesSearch'
import '@/components/filters/filters.css'
import './import.css'

type Props = { open: Unmatched[]; saved: Saved; species: SpeciesIndex; dispatch: (a: Action) => void }

const where = (u: Unmatched) =>
  u.source === 'inat' ? `iNaturalist observation ${u.row}` : u.slot === 'ebird-list' ? `eBird life list row ${u.row}` : u.source === 'ebird' ? `eBird row ${u.row}` : `Row ${u.row}`

/**
 * Rows that couldn't be matched to an eBird species (never dropped silently): each with a one-tap fix when there
 * is a likely species, and a search to fix it by hand. Fixes go to edits.fixes (unmatchedKey, "slot:row" -> code).
 * Non-species rows (sp., slashes, hybrids, domestics) are summarised in each source's card (NotCounted.tsx).
 */
export const MatchReport = memo(function MatchReport({ open, saved, species, dispatch }: Props) {
  const rows = open.filter((u) => u.reason === 'no-match')
  // Entries that aren't species (sp., slashes, hybrids) are summarised in their own source's card (NotCounted).
  if (!rows.length) return null
  const fix = (u: Unmatched, code: string) =>
    dispatch({ type: 'edit', edits: { ...saved.edits, fixes: { ...saved.edits.fixes, [unmatchedKey(u)]: code } } })
  return (
    <section id="match" className="eb-block" aria-labelledby="eb-match-h">
      {(
        <>
          <h2 id="eb-match-h" className="eb-h2">{rows.length.toLocaleString('en-US')} {rows.length === 1 ? "row couldn't" : "rows couldn't"} be matched</h2>
          <p className="eb-note">These names aren&apos;t in this year&apos;s eBird taxonomy, so they aren&apos;t counted yet. Pick the right bird for each.</p>
          <ul className="eb-match">
            {rows.map((u) => <MatchRow key={unmatchedKey(u)} u={u} species={species} onFix={(code) => fix(u, code)} />)}
          </ul>
        </>
      )}
    </section>
  )
})

function MatchRow({ u, species, onFix }: { u: Unmatched; species: SpeciesIndex; onFix: (code: string) => void }) {
  const [searching, setSearching] = useState(false)
  const name = u.com ?? u.sci ?? where(u)
  const suggestion = u.suggestion ? species.byCode.get(u.suggestion) : undefined
  return (
    <li className="eb-match-row">
      <div className="eb-match-name">
        <span className="eb-match-com">{name}</span>
        {u.com && u.sci && <i className="eb-match-sci">{u.sci}</i>}
        <span className="eb-mono">{where(u)}</span>
      </div>
      <div className="eb-match-acts">
        {suggestion && (
          <button type="button" className="eb-chip" onClick={() => onFix(suggestion.code)}>
            <Check aria-hidden="true" focusable="false" className="eb-chip-icon" />
            <span className="eb-chip-label">Use {suggestion.com}</span>
          </button>
        )}
        <button type="button" className="eb-chip" aria-expanded={searching} onClick={() => setSearching(!searching)}>
          <MagnifyingGlass aria-hidden="true" focusable="false" className="eb-chip-icon" />
          <span className="eb-chip-label">Fix by hand</span>
        </button>
      </div>
      {searching && (
        <SpeciesSearch species={species} label={`Find the right species for ${name}`} showLabel={false} autoFocus onPick={(r) => onFix(r.code)} />
      )}
    </li>
  )
}
