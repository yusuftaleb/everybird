'use client'
import { memo, useMemo } from 'react'
import { formatDate, formatMass } from '@/lib/format'
import { formatPlace } from '@/lib/import/places'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { Sticker } from './Sticker'
import './card-list.css'

export type ListOrder = 'heaviest' | 'lightest'

type Props = {
  entries: ListEntry[]
  species: SpeciesIndex
  regions: Regions
  order: ListOrder
  onToggle: () => void
  /** Opens the bird's card; `el` is the row's button, for popover anchoring and focus return. */
  onPick: (code: string, el: HTMLElement) => void
}

const THUMB = 40

type RowProps = { entry: ListEntry; row: SpeciesRow; place: string; onPick: Props['onPick'] }

const Row = memo(function Row({ entry, row, place, onPick }: RowProps) {
  const date = formatDate(entry.date)
  return (
    <li className="eb-row">
      <button type="button" className="eb-row-btn" onClick={(e) => onPick(entry.code, e.currentTarget)}>
        <span className="eb-row-thumb"><Sticker code={entry.code} st={row.st} ar={row.ar} w={THUMB} h={THUMB} /></span>
        <span className="eb-row-name">
          <span className="eb-row-com">{row.com}</span>
          <i className="eb-row-sci">{row.sci}</i>
        </span>
        <span className="eb-mono eb-row-mass"><span className="eb-sr">Average body mass </span>{row.gSrc === 'family' || row.gSrc === 'order' ? '~' : ''}{formatMass(row.g)}</span>
        <span className="eb-row-place">{place}</span>
        <span className="eb-mono eb-row-date">{date && <time dateTime={entry.date}>{date}</time>}</span>
      </button>
    </li>
  )
})

/** One row per bird, by body mass. Rows use content-visibility: auto, so 5,000 of them stay cheap. */
export function ListView({ entries, species, regions, order, onToggle, onPick }: Props) {
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
    <section className="eb-list" aria-label="Life list">
      <div className="eb-list-bar">
        <button type="button" className="eb-chip" aria-pressed={order === 'lightest'} onClick={onToggle}>Lightest first</button>
      </div>
      <ul className="eb-list-rows">
        {rows.map((r) => <Row key={r.entry.code} entry={r.entry} row={r.row} place={r.place} onPick={onPick} />)}
      </ul>
    </section>
  )
}
