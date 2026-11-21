'use client'
// The Status panel's body (the Conservation status section of Filters.tsx), on the Places panel's structure: the head
// "N categories" with Clear, then one checklist of global IUCN Red List categories in Red List order,
// each row the box, the pill, the full name and the count (species under the OTHER filters, statusOptions). A checked
// category another filter left with no species stays, at 0, so it can be unchecked. At most nine rows (the eight Red List
// categories and NE, Not evaluated, last): no search.
import { useMemo } from 'react'
import { IucnPill } from '@/components/collage/IucnPill'
import { countHead } from '@/lib/list/filter-summary'
import { statusOptions, toggleStatus, withStatuses, type Filter } from '@/lib/list/filters'
import type { AppState } from '@/lib/list/store'
import { STATUS_FILTER_CATS, type StatusFilterCat } from '@/lib/species/status-filter'
import type { SpeciesIndex } from '@/lib/species/load'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'

type Props = {
  state: AppState
  species: SpeciesIndex
  onFilter: (f: Filter) => void
}

export function StatusList({ state, species, onFilter }: Props) {
  const { list, filter, seen } = state
  const { t } = useI18n()
  const fmt = (x: number) => formatInt(x, t.num)
  const counted = useMemo(() => statusOptions(list, filter, species, seen), [list, filter, species, seen])
  const checked = useMemo(() => new Set<StatusFilterCat>(filter.statuses ?? []), [filter.statuses])
  // The counted rows, and any checked category they lack at 0, all in Red List order.
  const rows = useMemo(() => {
    const by = new Map(counted.map((o) => [o.value, o.count]))
    return STATUS_FILTER_CATS.filter((c) => by.has(c) || checked.has(c)).map((c) => ({ cat: c, count: by.get(c) ?? 0 }))
  }, [counted, checked])

  return (
    <div className="eb-places">
      <div className="eb-places-head">
        <span className="eb-mono">{countHead(rows.length, 'status', checked.size, t)}</span>
        {checked.size > 0 && (
          <button type="button" className="eb-textbtn" data-testid="status-clear" onClick={() => onFilter(withStatuses(filter, []))}>{t.filters.clear}</button>
        )}
      </div>
      <ul className="eb-checklist" aria-label={t.status.list}>
        {rows.map(({ cat, count }) => {
          const on = checked.has(cat)
          return (
            <li key={cat} className="eb-status-row">
              <label className="eb-check" data-checked={on ? '' : undefined}>
                <input type="checkbox" checked={on} onChange={() => onFilter(toggleStatus(filter, cat))} data-testid={`status-${cat}`} />
                <IucnPill cat={cat} />
                <span className="eb-check-name">{t.iucn.names[cat]}</span>
                <span className="eb-count" aria-hidden="true">{fmt(count)}</span>
                <span className="eb-sr">, {plural(t.count.live, count, { n: fmt(count) })}</span>
              </label>
            </li>
          )
        })}
        {rows.length === 0 && <li className="eb-note eb-check-none">{t.status.none}</li>}
      </ul>
    </div>
  )
}
