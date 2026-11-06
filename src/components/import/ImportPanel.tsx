'use client'
import { Binoculars, CheckSquareOffset, FileCsv, LockSimple, type Icon } from '@phosphor-icons/react'
import { memo, useState, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { EbirdDrop } from './EbirdDrop'
import { InatForm } from './InatForm'
import { TickList } from './TickList'
import { NotCounted } from './NotCounted'
import './import.css'

type Props = {
  saved: Saved
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** The imports in flight, kept above the routes (EverybirdProvider). */
  jobs: ImportJobs
  disabled?: boolean
  /** Before the privacy line (Restore from backup, without a list). */
  children?: ReactNode
  /** Codes already on the list (Tick by hand shows them ticked). */
  onList: ReadonlySet<string>
}

/** One way in. Every card has the same anatomy: icon and title, one sentence, one control row, then a muted line. */
function Way({ icon: Glyph, title, blurb, children }: { icon: Icon; title: string; blurb: string; children: ReactNode }) {
  return (
    <div className="eb-way">
      <h3 className="eb-way-title"><Glyph aria-hidden="true" focusable="false" weight="regular" />{title}</h3>
      <p className="eb-way-blurb">{blurb}</p>
      {children}
    </div>
  )
}

const speciesIn = (records: { code: string }[]) => new Set(records.map((r) => r.code)).size

/** "Your sources": the three ways in, given equal weight. They combine into one list; each import replaces only its own slot. */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, jobs, disabled, children, onList }: Props) {
  const [ticking, setTicking] = useState(false)
  return (
    <section id="sources" className="eb-block eb-import" aria-labelledby="eb-sources-h" tabIndex={-1}>
      <h2 id="eb-sources-h" className="eb-h2">Your sources</h2>
      <div className="eb-ways">
        <Way icon={FileCsv} title="eBird file" blurb="Your life list download or your full data export from eBird.">
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
          <NotCounted saved={saved} slots={['ebird', 'ebird-list']} />
        </Way>
        <Way icon={Binoculars} title="iNaturalist" blurb="Your public, wild bird observations, identified to species.">
          <InatForm job={jobs.inat} onFetch={(u) => void jobs.fetchInat(u)} onCancel={jobs.cancelInat} disabled={disabled} replaces={saved.records.inat.length > 0} />
          <NotCounted saved={saved} slots={['inat']} />
        </Way>
        <Way icon={CheckSquareOffset} title="Tick by hand" blurb="Tick off as many birds as you like, with one date and place for the batch.">
          <div className="eb-way-body">
            <div className="eb-way-control">
              <button type="button" className="eb-btn eb-btn-quiet eb-way-btn" aria-expanded={ticking} aria-controls="tick" disabled={disabled} onClick={() => setTicking((t) => !t)}>
                {ticking ? 'Close the list' : 'Tick birds off a list'}
              </button>
            </div>
            <p className="eb-note">Every species in eBird&apos;s taxonomy, to search or browse. No upload, no account.</p>
          </div>
        </Way>
      </div>
      {ticking && (
        <TickList
          species={species}
          regions={regions}
          edits={saved.edits}
          dispatch={dispatch}
          onList={onList}
          listEmpty={Object.values(saved.records).every((r) => r.length === 0) && saved.edits.added.length === 0}
        />
      )}
      {children}
      {/* The section's footnote, where files and usernames are handed over; the full privacy note is on About. */}
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />Your list never leaves your browser. We count visits anonymously.</p>
    </section>
  )
})
