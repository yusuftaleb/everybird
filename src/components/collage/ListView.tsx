'use client'
import { memo, useMemo } from 'react'
import { plural } from '@/i18n/core'
import { formatInt, formatMonth } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { regionsIn } from '@/lib/i18n-places'
import { formatPlace } from '@/lib/import/places'
import { listCompare, type ListOrder } from '@/lib/list/list-order'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { massValue } from './BirdCard'
import { markShown } from '@/lib/species/status-mark'
import { Marks } from './Marks'
import { StatusMark } from './StatusMark'
import { Sticker } from './Sticker'
import './card-list.css'


type Props = {
  entries: ListEntry[]
  species: SpeciesIndex
  regions: Regions
  /** The controls bar's Sort menu (list-order.ts). */
  order: ListOrder
  /** Scientific names lead (the Scientific switch). */
  sci?: boolean
  /** Opens the bird's card; `el` is the row's button, for popover anchoring and focus return. */
  onPick: (code: string, el: HTMLElement) => void
}

const THUMB_W = 56
const THUMB_H = 40

type RowProps = { entry: ListEntry; row: SpeciesRow; place: string; sci: boolean; onPick: Props['onPick']; t: Ui }

/** LifeList's row: thumb | name | mass | place | date, from the left (on phones the mass, date and place under the name). */
const Row = memo(function Row({ entry, row, place, sci, onPick, t }: RowProps) {
  useNames()
  const com = displayName(row)
  const date = formatMonth(entry.date, t.date.months)
  const fit = Math.min(THUMB_W / Math.max(row.ar, 0.01), THUMB_H) // sticker fitted in 56 x 40 without stretching
  return (
    <li className="eb-lrow">
      <button type="button" className="eb-row-btn" data-code={entry.code} onClick={(e) => onPick(entry.code, e.currentTarget)}>
        <span className="eb-row-thumb" aria-hidden="true">
          <span style={{ width: Math.round(fit * row.ar), height: Math.round(fit) }}><Sticker code={entry.code} st={row.st} ar={row.ar} sv={row.sv} w={fit * row.ar} h={fit} /></span>
        </span>
        <span className="eb-row-name">
          <span><span className="eb-row-primary" lang={sci ? 'la' : undefined}>{sci ? row.sci : com}</span><Marks entry={entry} />{markShown(row.iu) && (<><span className="eb-sr">, {t.iucn.names[row.iu]}</span><StatusMark cat={row.iu} /></>)}</span>
          <span className="eb-row-other" lang={sci ? undefined : 'la'}>{sci ? com : row.sci}</span>
        </span>
        <span className="eb-row-meta">
          <span className="eb-mono eb-row-mass" title={t.card.mass}><span className="eb-sr">{t.card.mass} </span>{massValue(row, t)}</span>
          <span className="eb-mono eb-row-date">{date && <time dateTime={entry.date}>{date}</time>}</span>
        </span>
        <span className="eb-row-place">{place}</span>
      </button>
    </li>
  )
})

type Item = { entry: ListEntry; row: SpeciesRow; place: string }

/** One family's heading in Family order: named as the Tree's family rows (the Scientific switch applying), its birds on
 *  the list at the right edge in the Tree's mono count; sticky under the top bar while its family scrolls (card-list.css). */
function FamilyHead({ row, n, sci, t }: { row: SpeciesRow; n: number; sci: boolean; t: Ui }) {
  useNames()
  const count = formatInt(n, t.num)
  return (
    <h2 className="eb-lhead">
      <span className="eb-lhead-name" lang={sci ? 'la' : undefined}>{sci ? row.fam : familyName(row)}</span>
      <span className="eb-mono eb-lhead-count" aria-hidden="true">{count}</span>
      <span className="eb-sr">, {plural(t.collage.stats.species, n, { n: count })}</span>
    </h2>
  )
}

/** One row per bird, in the Sort menu's order; in Family order under one heading per family (families are runs of the
 *  taxonomic order). Rows use content-visibility: auto, so 5,000 of them stay cheap. */
export function ListView({ entries, species, regions, order, sci = false, onPick }: Props) {
  const { lang, t } = useI18n()
  const rows = useMemo(() => {
    const named = regionsIn(regions, lang)
    const out: Item[] = []
    for (const entry of entries) {
      const row = species.byCode.get(entry.code)
      if (row) out.push({ entry, row, place: formatPlace(entry.place, named) })
    }
    out.sort(listCompare(order))
    return out
  }, [entries, species, regions, order, lang])
  const families = useMemo(() => {
    if (order !== 'family') return null
    const out: Item[][] = []
    for (const r of rows) {
      const last = out[out.length - 1]
      if (last && last[0].row.fam === r.row.fam) last.push(r)
      else out.push([r])
    }
    return out
  }, [rows, order])
  const row = (r: Item) => <Row key={r.entry.code} entry={r.entry} row={r.row} place={r.place} sci={sci} onPick={onPick} t={t} />

  if (families) {
    return (
      <ul className="eb-list" data-grouped="" aria-label={t.card.list}>
        {families.map((f) => (
          <li key={f[0].row.fam} className="eb-lgroup">
            <FamilyHead row={f[0].row} n={f.length} sci={sci} t={t} />
            <ul className="eb-lgroup-rows">{f.map(row)}</ul>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className="eb-list" aria-label={t.card.list}>
      {rows.map(row)}
    </ul>
  )
}
