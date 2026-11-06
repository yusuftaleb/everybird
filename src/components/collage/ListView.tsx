'use client'
import { memo, useMemo } from 'react'
import { formatDate, formatMass } from '@/lib/format'
import { formatPlace } from '@/lib/import/places'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { Marks } from './Marks'
import { Sticker } from './Sticker'
import './card-list.css'

export type ListOrder = 'heaviest' | 'lightest'

type Props = {
  entries: ListEntry[]
  species: SpeciesIndex
  regions: Regions
  /** By body mass (the direction lives in the controls bar). */
  order: ListOrder
  /** Scientific names lead (the Scientific switch). */
  sci?: boolean
  /** Opens the bird's card; `el` is the row's button, for popover anchoring and focus return. */
  onPick: (code: string, el: HTMLElement) => void
}

const THUMB_W = 56
const THUMB_H = 40

type RowProps = { entry: ListEntry; row: SpeciesRow; place: string; sci: boolean; onPick: Props['onPick'] }

/** LifeList's row: thumb | name | mass, then place and date at the far right (date rightmost). */
const Row = memo(function Row({ entry, row, place, sci, onPick }: RowProps) {
  const date = formatDate(entry.date)
  const fit = Math.min(THUMB_W / Math.max(row.ar, 0.01), THUMB_H) // sticker fitted in 56 x 40 without stretching
  return (
    <li className="eb-lrow">
      <button type="button" className="eb-row-btn" data-code={entry.code} onClick={(e) => onPick(entry.code, e.currentTarget)}>
        <span className="eb-row-thumb" aria-hidden="true">
          <span style={{ width: Math.round(fit * row.ar), height: Math.round(fit) }}><Sticker code={entry.code} st={row.st} ar={row.ar} sv={row.sv} w={fit * row.ar} h={fit} /></span>
        </span>
        <span className="eb-row-name">
          <span><span className="eb-row-primary" lang={sci ? 'la' : undefined}>{sci ? row.sci : row.com}</span><Marks entry={entry} /></span>
          <span className="eb-row-other" lang={sci ? undefined : 'la'}>{sci ? row.com : row.sci}</span>
        </span>
        <span className="eb-row-meta">
          <span className="eb-mono eb-row-mass" title="Average body mass"><span className="eb-sr">Average body mass </span>{row.gSrc === 'family' || row.gSrc === 'order' ? '~' : ''}{formatMass(row.g)}</span>
          <span className="eb-mono eb-row-date">{date && <time dateTime={entry.date}>{date}</time>}</span>
        </span>
        <span className="eb-row-place">{place}</span>
      </button>
    </li>
  )
})

/** One row per bird, by body mass. Rows use content-visibility: auto, so 5,000 of them stay cheap. */
export function ListView({ entries, species, regions, order, sci = false, onPick }: Props) {
  const rows = useMemo(() => {
    const out: { entry: ListEntry; row: SpeciesRow; place: string }[] = []
    for (const entry of entries) {
      const row = species.byCode.get(entry.code)
      if (row) out.push({ entry, row, place: formatPlace(entry.place, regions) })
    }
    const dir = order === 'heaviest' ? -1 : 1
    out.sort((a, b) => dir * (a.row.g - b.row.g) || a.row.to - b.row.to)
    return out
  }, [entries, species, regions, order])

  return (
    <ul className="eb-list" aria-label="Life list">
      {rows.map((r) => <Row key={r.entry.code} entry={r.entry} row={r.row} place={r.place} sci={sci} onPick={onPick} />)}
    </ul>
  )
}
