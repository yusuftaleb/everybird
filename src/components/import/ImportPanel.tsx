'use client'
import { Binoculars, CheckSquareOffset, FileCsv, LockSimple, type Icon } from '@phosphor-icons/react'
import { memo, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
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
  /** The imports in flight, kept above the routes (EverybirdProvider). */
  jobs: ImportJobs
  disabled?: boolean
}

function Way({ icon: Glyph, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <div className="eb-way">
      <h2 className="eb-way-title"><Glyph aria-hidden="true" focusable="false" weight="regular" />{title}</h2>
      {children}
    </div>
  )
}

const speciesIn = (records: { code: string }[]) => new Set(records.map((r) => r.code)).size

/** The three ways in, given equal weight. They combine into one list; each import replaces only its own slot. */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, jobs, disabled }: Props) {
  return (
    <section id="make-yours" className="eb-block eb-import" aria-label="Ways in" tabIndex={-1}>
      <div className="eb-ways">
        <Way icon={FileCsv} title="eBird file">
          <EbirdDrop
            job={jobs.ebird}
            onFile={(f) => void jobs.readEbird(f)}
            disabled={disabled}
            loaded={{
              full: speciesIn(saved.records.ebird),
              quick: speciesIn(saved.records['ebird-list'] ?? []),
              fullCounty: saved.records.ebird.some((r) => !!r.place?.sub2),
            }}
          />
        </Way>
        <Way icon={Binoculars} title="iNaturalist">
          <InatForm job={jobs.inat} onFetch={(u) => void jobs.fetchInat(u)} onCancel={jobs.cancelInat} disabled={disabled} replaces={saved.records.inat.length > 0} />
        </Way>
        <Way icon={CheckSquareOffset} title="Tick by hand">
          <AddBirds
            species={species}
            regions={regions}
            edits={saved.edits}
            dispatch={dispatch}
            disabled={disabled}
            listEmpty={Object.values(saved.records).every((r) => r.length === 0) && saved.edits.added.length === 0}
          />
        </Way>
      </div>
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />Your list never leaves your browser. We count visits anonymously.</p>
    </section>
  )
})
