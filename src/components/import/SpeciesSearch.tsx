'use client'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useId, useMemo, useState } from 'react'
import type { SpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

type Props = {
  species: SpeciesIndex
  label: string
  /** Show the label visually (otherwise it is for screen readers only). */
  showLabel?: boolean
  onPick: (row: SpeciesRow) => void
  limit?: number
  autoFocus?: boolean
}

/** Type-ahead over eBird common and scientific names; each result is a button. */
export function SpeciesSearch({ species, label, showLabel = true, onPick, limit = 8, autoFocus }: Props) {
  const id = useId()
  const [q, setQ] = useState('')
  const hits = useMemo(() => (q.trim().length >= 2 ? species.search(q, limit) : []), [q, species, limit])
  return (
    <div className="eb-search">
      <label htmlFor={id} className={showLabel ? 'eb-label' : 'eb-sr'}>{label}</label>
      <div className="eb-input-wrap">
        <MagnifyingGlass aria-hidden="true" focusable="false" className="eb-input-icon" />
        <input
          id={id}
          className="eb-input eb-input-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder="Common or scientific name"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {hits.length > 0 && (
        <ul className="eb-hits" aria-label={`${hits.length} matches`}>
          {hits.map((r) => (
            <li key={r.code}>
              <button type="button" className="eb-hit" onClick={() => { onPick(r); setQ('') }}>
                <span className="eb-hit-com">{r.com}</span> <i className="eb-hit-sci">{r.sci}</i>
              </button>
            </li>
          ))}
        </ul>
      )}
      {q.trim().length >= 2 && hits.length === 0 && <p className="eb-note">No bird by that name in eBird&apos;s taxonomy.</p>}
    </div>
  )
}
