'use client'
import { DownloadSimple, Trash } from '@phosphor-icons/react'
import { useCallback, useState } from 'react'
import { EditBird } from '@/components/edit/EditBird'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import type { ListEntry } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import type { Action, AppState } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { CountryDots, Regions } from '@/lib/species/types'
import { CollageView } from './CollageView'
import { RestoreBackup } from './RestoreBackup'

type Props = { state: AppState; dispatch: (a: Action) => void; species: SpeciesIndex; regions: Regions; dots?: CountryDots }

/** The birder's own collage, with downloads, restore, forget, the match report and rules (Home adds the import panel). */
export function CollagePage({ state, dispatch, species, regions, dots }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState<Saved | null>(null)
  const { saved } = state
  const actions = useCallback(
    (entry: ListEntry, close: () => void) => <EditBird entry={entry} edits={saved.edits} dispatch={dispatch} onRemoved={close} />,
    [saved.edits, dispatch],
  )
  return (
    <>
      {state.persistence === 'memory-only' && <MemoryNotice />}
      <CollageView state={state} dispatch={dispatch} species={species} regions={regions} dots={dots} label="Your collage" cardActions={actions} />

      <section className="eb-block" aria-labelledby="eb-keep-h">
        <h2 id="eb-keep-h" className="eb-h2">Keep your list</h2>
        <p className="eb-note">Your list lives on this device. Download it any time, or move it to another device with the backup.</p>
        <div className="eb-tools">
          <button type="button" className="eb-btn eb-btn-quiet" onClick={() => downloadText(toCsv(state.list, species, regions), `everybird-${today()}.csv`, 'text/csv')}>
            <DownloadSimple aria-hidden="true" focusable="false" />
            Download CSV
          </button>
          <button type="button" className="eb-btn eb-btn-quiet" onClick={() => downloadText(toJson(saved), `everybird-backup-${today()}.json`, 'application/json')}>
            <DownloadSimple aria-hidden="true" focusable="false" />
            Download JSON backup
          </button>
          <RestoreBackup onRestore={(s) => { setConfirming(false); setRestoring(s) }} />
          {!confirming && (
            <button type="button" className="eb-btn eb-btn-quiet eb-btn-danger" onClick={() => { setRestoring(null); setConfirming(true) }}>
              <Trash aria-hidden="true" focusable="false" />
              Forget my list
            </button>
          )}
        </div>
        {restoring && (
          <div className="eb-confirm" role="group" aria-label="Restore from backup">
            <p>Replace your list with this backup? Download your current list first if you want to keep it.</p>
            <div className="eb-row">
              <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { dispatch({ type: 'restore', saved: restoring }); setRestoring(null) }}>Yes, replace it</button>
              <button type="button" className="eb-btn eb-btn-quiet" onClick={() => setRestoring(null)}>Keep my list</button>
            </div>
          </div>
        )}
        {confirming && (
          <div className="eb-confirm" role="group" aria-label="Forget my list">
            <p>Forget this list on this device? Download a backup first if you want to keep it.</p>
            <div className="eb-row">
              <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setConfirming(false); dispatch({ type: 'forget' }) }}>Yes, forget it</button>
              <button type="button" className="eb-btn eb-btn-quiet" onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          </div>
        )}
      </section>

      <MatchReport open={state.openUnmatched} saved={saved} species={species} dispatch={dispatch} />
      <RulesSwitches rules={saved.rules} dispatch={dispatch} />
    </>
  )
}

export function MemoryNotice() {
  return (
    <p className="eb-notice" role="status">
      This list won&apos;t be saved on this device. Your browser is blocking storage (private browsing does this), so download a backup before you leave.
    </p>
  )
}
