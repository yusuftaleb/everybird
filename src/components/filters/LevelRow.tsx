'use client'
import type { ReactNode } from 'react'
import type { ChipOption, FilterLevel } from '@/lib/list/filters'
import { useI18n } from '@/i18n/I18nProvider'
import { Chip } from './Chip'

type Props = {
  level: FilterLevel
  options: ChipOption[]
  label: (level: FilterLevel, o: ChipOption) => ReactNode
  latin: boolean
  /** The chosen value. */
  value?: string
  onPick: (v: string) => void
}

/** One level of a filter: a mono rank label and its chips (the choice in Accent), wrapping onto as many rows as they
 *  need (the Taxa panel's popover and sheet alike). */
export function LevelRow({ level, options, label, latin, value, onPick }: Props) {
  const { t } = useI18n()
  if (!options.length) return null
  return (
    <div className="eb-level" role="group" aria-label={t.filters.rank[level]} data-chosen={value ? '' : undefined} data-testid={`level-${level}`}>
      <span className="eb-mono eb-level-label" aria-hidden="true">{t.filters.rank[level]}</span>
      {options.map((o) => (
        <Chip key={o.value} label={label(level, o)} latin={latin} count={o.count} selected={value === o.value} onClick={() => onPick(o.value)} />
      ))}
    </div>
  )
}
