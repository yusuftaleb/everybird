'use client'
// The collage search: a combobox over the birds in the current list (common or scientific names, word prefixes,
// accent-insensitive). Typing narrows the view (CollageView adds the text to the filter); choosing a suggestion
// clears the narrowing and shows that bird. Arrow keys move through the suggestions, Enter picks, Esc clears.
import { useId, useState, type KeyboardEvent } from 'react'
import { CloseIcon, SearchIcon } from '@/components/collage/icons'
import type { SpeciesRow } from '@/lib/species/types'

type Props = {
  value: string
  onChange: (text: string) => void
  /** Matching birds in the current list, best first. */
  suggestions: SpeciesRow[]
  onPick: (code: string) => void
  /** Scientific names lead (the Scientific switch). */
  sci: boolean
  label?: string
}

export function CollageSearch({ value, onChange, suggestions, onPick, sci, label = 'Search your birds' }: Props) {
  const id = useId()
  const listId = `${id}-list`
  const [focused, setFocused] = useState(false)
  const [active, setActive] = useState(-1)
  const typed = value.trim().length > 0
  const open = focused && typed && suggestions.length > 0
  const none = focused && typed && !suggestions.length
  const at = active < suggestions.length ? active : -1

  const change = (text: string) => {
    setActive(-1)
    onChange(text)
  }
  const pick = (code: string) => {
    setActive(-1)
    onPick(code)
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestions.length) return
      e.preventDefault()
      const n = suggestions.length
      setActive(e.key === 'ArrowDown' ? (at + 1) % n : at <= 0 ? n - 1 : at - 1)
    } else if (e.key === 'Enter') {
      const hit = suggestions[at >= 0 ? at : 0]
      if (typed && hit) {
        e.preventDefault()
        pick(hit.code)
      }
    } else if (e.key === 'Escape') {
      if (!value) return
      e.preventDefault()
      e.stopPropagation()
      change('')
    }
  }

  return (
    <div className="eb-search-field" data-open={open || undefined}>
      <SearchIcon className="eb-search-icon" />
      <input
        className="eb-search-input"
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && at >= 0 ? `${id}-${at}` : undefined}
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder={label}
        value={value}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {value && (
        <button type="button" className="eb-search-clear" aria-label="Clear search" onClick={() => change('')}>
          <CloseIcon />
        </button>
      )}
      <ul id={listId} role="listbox" aria-label="Matching birds" className="eb-suggest" hidden={!open}>
        {open &&
          suggestions.map((r, i) => (
            <li
              key={r.code}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === at}
              className="eb-suggest-item"
              onMouseDown={(e) => e.preventDefault()} // keep focus in the field
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r.code)}
            >
              <span className="eb-suggest-primary" lang={sci ? 'la' : undefined}>{sci ? r.sci : r.com}</span>
              <span className="eb-suggest-other" lang={sci ? undefined : 'la'}>{sci ? r.com : r.sci}</span>
            </li>
          ))}
      </ul>
      {/* Always in the DOM, so screen readers announce the text when it appears. */}
      <p className={none ? 'eb-suggest eb-suggest-none' : 'eb-sr'} role="status">{none ? 'No bird on this list matches' : ''}</p>
    </div>
  )
}
