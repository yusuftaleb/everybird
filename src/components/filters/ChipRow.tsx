'use client'
// The chip row under the dock: one removable chip per active value (the Filters panel's places, time and
// statuses; item 9's "Understood as" row passes its own). A single chip is one button, pressed anywhere to remove
// its value. A collapsed chip ("5 places", token ALL) given `onOpen` is a pair of buttons: the label opens the panel,
// the × clears every value of its kind. Always mounted, it renders nothing without chips, so `onEmpty` can fire after
// the last one goes. After a press on a chip's own remove, focus moves to the chip now at that index (else the one
// before it); chips that change any other way move no focus.
import { useLayoutEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from '@/components/collage/icons'
import { ALL, type Chip as ChipData } from '@/lib/list/chips'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { Chip } from './Chip'
import './filters.css'

type Props<C extends ChipData> = {
  chips: readonly C[]
  /** The row's group name (`t.filters.panel.chips` for the filter row; item 9 passes its own). */
  label: string
  onRemove: (chip: C) => void
  /** Given: a collapsed chip (token ALL) is a label button that calls it, and a ×. Not given: every chip is a single remove button. */
  onOpen?: (chip: C, el: HTMLElement) => void
  /** After the last chip is removed (focus goes elsewhere: the Filters button). */
  onEmpty?: () => void
  /** Given: a "Clear all" text button ends the row once two or more chips show; it clears every chip's value at once. */
  onClearAll?: () => void
  /** Active filters in all (the chips plus a taxonomy choice the breadcrumb holds); Clear all shows from 2. Defaults to the chips. */
  active?: number
  testId?: string
}

export function ChipRow<C extends ChipData>({ chips, label, onRemove, onOpen, onEmpty, onClearAll, active, testId }: Props<C>): ReactNode | null {
  const { t } = useI18n()
  const rowRef = useRef<HTMLDivElement>(null)
  // The index of the chip a press just removed; read once by the effect below.
  const removed = useRef<number | null>(null)

  useLayoutEffect(() => {
    const at = removed.current
    if (at === null) return
    removed.current = null
    if (!chips.length) {
      onEmpty?.()
      return
    }
    const el = rowRef.current?.children[Math.min(at, chips.length - 1)]
    const target = el?.matches('.eb-chip-pair') ? el.querySelector<HTMLElement>('.eb-chip-x') : (el as HTMLElement | undefined)
    target?.focus({ preventScroll: true })
  }, [chips, onEmpty])

  if (!chips.length) return null
  const remove = (chip: C, i: number) => {
    removed.current = i
    onRemove(chip)
  }
  const clearAll = () => {
    removed.current = 0
    onClearAll?.()
  }
  return (
    <div role="group" aria-label={label} className="eb-chiprow" data-testid={testId} ref={rowRef}>
      {chips.map((chip, i) => {
        const key = `${chip.kind}:${chip.token}`
        const spoken = chip.spoken ?? chip.label
        if (onOpen && chip.token === ALL) {
          return (
            <span key={key} className="eb-chip eb-chip-pair">
              <button
                type="button"
                className="eb-chip-open"
                aria-haspopup="dialog"
                aria-label={fmt(t.filters.panel.openChip, { label: chip.label })}
                data-testid={`chip-${chip.kind}-open`}
                onClick={(e) => onOpen(chip, e.currentTarget)}
              >
                <span className="eb-chip-label">{chip.label}</span>
              </button>
              <button
                type="button"
                className="eb-chip-x"
                aria-label={fmt(t.filters.panel.clearChip, { label: chip.label })}
                data-testid={`chip-${chip.kind}-clear`}
                onClick={() => remove(chip, i)}
              >
                <CloseIcon className="eb-chip-x-icon" />
              </button>
            </span>
          )
        }
        return (
          <Chip
            key={key}
            label={<span className="eb-chip-label">{chip.label}</span>}
            removeLabel={spoken}
            testId={`chip-${chip.kind}-${chip.token}`}
            onClick={() => remove(chip, i)}
          >
            <CloseIcon className="eb-chip-x-icon" />
          </Chip>
        )
      })}
      {onClearAll && (active ?? chips.length) >= 2 && (
        <button type="button" className="eb-textbtn" aria-label={t.filters.panel.clearAllLabel} data-testid="chips-clear-all" onClick={clearAll}>
          {t.filters.panel.clearAll}
        </button>
      )}
    </div>
  )
}
