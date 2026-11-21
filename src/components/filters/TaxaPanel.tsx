'use client'
// The controls bar's Taxa panel (Yusuf, 2026-11-20, round 6): the taxonomy chips (orders; in an order its families; in a
// family its genera, each with its count, as FilterBar's levels work) in the Filters panel's frame (DockPanel), as wide
// as the page's content, with the path ("All birds / Waterfowl / …") at its top to go back and a mono head with the
// level's coverage ("18 of 45 orders": the groups with a bird under the other filters, of the taxonomy's in the parent).
// Picking a chip filters every view, and in the Tree opens it; the panel stays open for the next level. Under 600px it
// is the sheet, its chips wrapping in it, with "Show N species" at its foot.
import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { useIsSheet } from '@/components/dialog-utils'
import { showLabel } from '@/lib/list/filter-summary'
import { genusOf } from '@/lib/list/filters'
import { loadSpecies } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { DockPanel } from './Filters'
import { TaxaLevel, TaxaPath, useTaxa, type TaxonLevel } from './FilterBar'
import type { AppState, Action } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { TreePath } from './FilterBar'

/** How many groups of `level` the taxonomy `rows` hold inside `parent` (an order's families, a family's genera). */
function taxaTotal(rows: readonly SpeciesRow[], level: TaxonLevel, parent: Partial<Record<TaxonLevel, string>>): number {
  const keys = new Set<string>()
  for (const r of rows) {
    if (level === 'order') keys.add(r.ord)
    else if (level === 'family') { if (r.ord === parent.order) keys.add(r.fam) }
    else if (r.fam === parent.family) keys.add(genusOf(r.sci))
  }
  return keys.size
}

type Props = {
  state: AppState
  dispatch: (a: Action) => void
  species: SpeciesIndex
  tree?: TreePath
  id: string
  buttonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  /** Species under the whole filter: the sheet's "Show N species". */
  shown: number
}

export function TaxaPanel({ state, dispatch, species, tree, id, buttonRef, onClose, shown }: Props): ReactNode {
  const { t } = useI18n()
  const sheet = useIsSheet()
  const taxa = useTaxa({ state, dispatch, species, tree })
  // The taxonomy's totals come from the full species file (the landing sample's index holds only its birds).
  const [all, setAll] = useState<readonly SpeciesRow[] | null>(null)
  useEffect(() => {
    let live = true
    loadSpecies().then((s) => { if (live) setAll(s.rows) }, () => {})
    return () => { live = false }
  }, [])
  const row = taxa.row
  const total = row && all ? taxaTotal(all, row.level, taxa.parent) : 0
  const head = row && total ? plural(t.collage.controls.taxaHead[row.level], total, { n: formatInt(row.opts.length, t.num), total: formatInt(total, t.num) }) : ''
  return (
    <DockPanel
      id={id} label={t.collage.controls.taxaPanel} kind="taxa" testId="taxa-panel" buttonRef={buttonRef} onClose={onClose}
      sheetHead={<span className="eb-mono" role="status">{head}</span>}
      foot={<button type="button" className="eb-btn" onClick={onClose}>{showLabel(shown, t)}</button>}
    >
      <div className="eb-taxa">
        {!sheet && <p className="eb-mono eb-taxa-head" data-testid="taxa-head">{head}</p>}
        <TaxaPath crumbs={taxa.crumbs} go={taxa.go} />
        <TaxaLevel taxa={taxa} />
      </div>
    </DockPanel>
  )
}
