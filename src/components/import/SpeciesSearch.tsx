'use client'
import { SearchIcon } from '@/components/collage/icons'
import { useId, useMemo, useState } from 'react'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
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

/** Long enough to search: two characters, or one Han or kana character (鹰 and 鹤 are whole names). */
export const searchable = (q: string) => {
  const s = q.trim()
  return s.length >= 2 || /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]$/u.test(s)
}

/** Type-ahead over eBird common and scientific names; each result is a button. */
export function SpeciesSearch({ species, label, showLabel = true, onPick, limit = 8, autoFocus }: Props) {
  const id = useId()
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const names = useNames()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `names` is read through the module, not a prop
  const hits = useMemo(() => (searchable(q) ? species.search(q, limit) : []), [q, species, limit, names])
  return (
    <div className="eb-search">
      <label htmlFor={id} className={showLabel ? 'eb-label' : 'eb-sr'}>{label}</label>
      <div className="eb-input-wrap">
        <SearchIcon className="eb-input-icon" />
        <input
          id={id}
          className="eb-input eb-input-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          placeholder={t.import.search.placeholder}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {hits.length > 0 && (
        <ul className="eb-hits" aria-label={plural(t.collage.search.matches, hits.length, { n: formatInt(hits.length, t.num) })}>
          {hits.map((r) => (
            <li key={r.code}>
              <button type="button" className="eb-hit" onClick={() => { onPick(r); setQ('') }}>
                <span className="eb-hit-com">{displayName(r)}</span> <i className="eb-hit-sci">{r.sci}</i>
              </button>
            </li>
          ))}
        </ul>
      )}
      {searchable(q) && hits.length === 0 && <p className="eb-note">{t.import.search.none}</p>}
    </div>
  )
}
