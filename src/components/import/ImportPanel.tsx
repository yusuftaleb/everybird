'use client'
import { Binoculars, CheckSquareOffset, FileCsv, LockSimple, type Icon } from '@phosphor-icons/react'
import { memo, type ReactNode } from 'react'
import { track } from '@/lib/analytics'
import type { ImportResult, Source } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { AddBirds } from './AddBirds'
import { EbirdDrop } from './EbirdDrop'
import { InatForm } from './InatForm'
import './import.css'

type Props = {
  saved: Saved
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** The birder already has a list: the heading reads "Add another source". */
  hasList: boolean
  disabled?: boolean
  /** Extra content under the three ways in (memory-only notice, restore from backup). */
  footer?: ReactNode
}

function Way({ icon: Glyph, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <div className="eb-way">
      <h3 className="eb-way-title"><Glyph aria-hidden="true" focusable="false" weight="regular" />{title}</h3>
      {children}
    </div>
  )
}

/** The three ways in, given equal weight. They combine into one list; each import replaces only its own source. */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, hasList, disabled, footer }: Props) {
  const onImport = (source: Source) => (result: ImportResult) => {
    dispatch({ type: 'import', source, result })
    track('collage_made', { source })
  }
  return (
    <section id="make-yours" className="eb-block eb-import" aria-labelledby="eb-import-h" tabIndex={-1}>
      <h2 id="eb-import-h" className="eb-h2">{hasList ? 'Add another source' : 'Make yours'}</h2>
      <p className="eb-lede-sm">
        {hasList ? 'Bring in another record. Each bird keeps its earliest date.' : 'Start from any of these, and combine them if you keep more than one record.'}
      </p>
      <div className="eb-ways">
        <Way icon={FileCsv} title="eBird file">
          <EbirdDrop onImport={onImport('ebird')} disabled={disabled} replaces={saved.records.ebird.length > 0} />
        </Way>
        <Way icon={Binoculars} title="iNaturalist">
          <InatForm onImport={onImport('inat')} disabled={disabled} replaces={saved.records.inat.length > 0} />
        </Way>
        <Way icon={CheckSquareOffset} title="Tick by hand">
          <AddBirds species={species} regions={regions} edits={saved.edits} dispatch={dispatch} disabled={disabled} />
        </Way>
      </div>
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />Your list never leaves your browser. We count visits anonymously.</p>
      {footer}
    </section>
  )
})
