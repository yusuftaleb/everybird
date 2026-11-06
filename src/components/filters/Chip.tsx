'use client'
import type { ReactNode } from 'react'
import './filters.css'

type Props = {
  label: ReactNode
  count?: number
  selected?: boolean
  /** The label is a scientific name (italic, lang="la"). */
  latin?: boolean
  /** A removable chip (an active filter from another tab): its name is "Remove <label> filter". */
  removeLabel?: string
  onClick: () => void
  testId?: string
  /** Trailing content (the remove cross). */
  children?: ReactNode
}

/** LifeList's chip: an 8px squircle, Fill background, Border hairline, Accent border when chosen; the count in Muted. */
export function Chip({ label, count, selected, latin, removeLabel, onClick, testId, children }: Props) {
  return (
    <button
      type="button"
      className="eb-chip"
      data-selected={selected ? '' : undefined}
      aria-pressed={removeLabel ? undefined : !!selected}
      aria-label={removeLabel ? `Remove ${removeLabel} filter` : undefined}
      lang={latin ? 'la' : undefined}
      data-testid={testId}
      onClick={onClick}
    >
      {label}
      {count != null && (
        <>
          <span className="eb-count" aria-hidden="true">{count.toLocaleString('en-US')}</span>
          <span className="eb-sr">, {count.toLocaleString('en-US')} species</span>
        </>
      )}
      {children}
    </button>
  )
}
