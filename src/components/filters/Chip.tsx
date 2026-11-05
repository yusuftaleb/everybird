'use client'
import { X, type Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import './filters.css'

type Props = {
  icon: Icon
  label: ReactNode
  count?: number
  selected?: boolean
  /** A removable chip (an active filter from another tab): its name is "Remove <label> filter". */
  removeLabel?: string
  onClick: () => void
  testId?: string
}

/** 8px squircle, Surface fill, Hairline border, Accent when selected. Phosphor icon plus label. */
export function Chip({ icon: Glyph, label, count, selected, removeLabel, onClick, testId }: Props) {
  return (
    <button
      type="button"
      className="eb-chip"
      data-selected={selected ? '' : undefined}
      aria-pressed={removeLabel ? undefined : !!selected}
      aria-label={removeLabel ? `Remove ${removeLabel} filter` : undefined}
      data-testid={testId}
      onClick={onClick}
    >
      <Glyph aria-hidden="true" focusable="false" weight={selected ? 'fill' : 'regular'} className="eb-chip-icon" />
      <span className="eb-chip-label">{label}</span>
      {count != null && (
        <>
          {' '}
          <span className="eb-chip-count eb-mono">{count}</span>
        </>
      )}
      {removeLabel && <X aria-hidden="true" focusable="false" weight="bold" className="eb-chip-x" />}
    </button>
  )
}
