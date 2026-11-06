'use client'
import type { ReactNode } from 'react'
import type { ChipOption, FilterLevel } from '@/lib/list/filters'
import { Chip } from './Chip'
import { RANK, SheetPicker } from './SheetPicker'

type Props = {
  level: FilterLevel
  options: ChipOption[]
  label: (level: FilterLevel, o: ChipOption) => ReactNode
  latin: boolean
  /** The chosen value and its name. */
  value?: string
  chosenName?: string
  /** Phones: one button that opens the chips in a sheet. */
  sheet: boolean
  onPick: (v: string) => void
}

/** One level of a filter: a mono rank label and its chips (the choice in Accent), or the phone's sheet button. */
export function LevelRow({ level, options, label, latin, value, chosenName, sheet, onPick }: Props) {
  if (!options.length) return null
  if (sheet)
    return <SheetPicker key={level} level={level} options={options} label={label} latin={latin} chosen={chosenName} value={value} onPick={onPick} />
  return (
    <div className="eb-level" role="group" aria-label={RANK[level]} data-chosen={value ? '' : undefined} data-testid={`level-${level}`}>
      <span className="eb-mono eb-level-label" aria-hidden="true">{RANK[level]}</span>
      {options.map((o) => (
        <Chip key={o.value} label={label(level, o)} latin={latin} count={o.count} selected={value === o.value} onClick={() => onPick(o.value)} />
      ))}
    </div>
  )
}
