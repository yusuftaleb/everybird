'use client'
import { ArrowRight, DownloadSimple, Trash } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useMemo, useState } from 'react'
import { ImportPanel } from '@/components/import/ImportPanel'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import { sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { NAME_MAX, type Saved } from '@/lib/list/storage'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

/** Settings > Your data > "Name your collage": saved with the list as you type (trimmed, at most NAME_MAX characters),
 *  it is the collage's title, verbatim ("Yusuf’s life list", "Birds of 2026"), and each share dialog's starting title.
 *  Empty: "My collage" on the page and no title on shares. */
function NameField({ stored, onName }: { stored: string; onName: (name: string) => void }) {
  const id = useId()
  const [name, setName] = useState(stored)
  // A restore or a forget changes the saved title underneath the field: follow it (not while the field only differs
  // by the spaces the store trims off).
  const [seen, setSeen] = useState(stored)
  if (seen !== stored) {
    setSeen(stored)
    if (name.trim() !== stored) setName(stored)
  }
  return (
    <div className="eb-namefield">
      <label htmlFor={id} className="eb-namefield-label">Name your collage</label>
      <input
        id={id}
        className="eb-input"
        type="text"
        autoComplete="off"
        maxLength={NAME_MAX}
        placeholder="e.g. Yusuf’s life list"
        aria-describedby={`${id}-n`}
        value={name}
        onChange={(e) => { setName(e.target.value); onName(e.target.value) }}
      />
      <p id={`${id}-n`} className="eb-note">Shown as your collage’s title and on shares.</p>
    </div>
  )
}

/**
 * `/settings`, three tight sections: "Your list" (one row per source, the match report), "Counting" (the rules) and
 * "Your data" (your name, downloads, restore, forget). "Your list" opens with one line on what each source brings
 * (source-counts.ts), ending, after an import, with "See my collage" back to the collage.
 */
export function SettingsPage() {
  const eb = useEverybirdContext()
  const { state, dispatch, data, mine, jobs } = eb
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState<Saved | null>(null)
  const landed = jobs.landed
  const count = state.list.length
  const { saved } = state
  const onList = useMemo(() => new Set(state.list.map((e) => e.code)), [state.list])
  const counts = useMemo(() => sourceCounts(saved, state.list), [saved, state.list])
  const line = mine ? summaryLine(counts) : null
  return (
    <main className="eb-page eb-page-settings eb-page-titled">
      <PageHead title="Settings" />
      <AppNotices eb={eb} />
      {data ? (
        <ImportPanel
          saved={saved}
          dispatch={dispatch}
          species={data.species}
          regions={data.regions}
          jobs={jobs}
          onList={onList}
          counts={counts}
          summary={line && (
            <p className="eb-summary" role="status" data-testid="see-collage">
              {line}
              {landed && count > 0 && (
                <>
                  {' '}
                  <Link href="/" className="eb-summary-link">See my collage<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
                </>
              )}
            </p>
          )}
        >
          <MatchReport open={state.openUnmatched} saved={saved} species={data.species} dispatch={dispatch} />
        </ImportPanel>
      ) : (
        !eb.failed && <div className="eb-ways-wait" aria-hidden="true" />
      )}
      <div className={mine ? 'eb-settings-pair' : 'eb-settings-one'}>
      {mine && <RulesSwitches saved={saved} dispatch={dispatch} />}
      {(mine || data) && (
        <section className="eb-block" aria-labelledby="eb-data-h">
          <div className="eb-block-head">
            <h2 id="eb-data-h" className="eb-h2">Your data</h2>
            <p className="eb-note">{mine ? 'Your list lives on this device. Download it, or move it to another device with the backup.' : 'Moving from another device? Restore the backup you downloaded there.'}</p>
          </div>
          {mine ? (
            <div className="eb-datarow">
              <NameField stored={saved.name ?? ''} onName={(name) => dispatch({ type: 'name', name })} />
              <div className="eb-tools">
                <button type="button" className="eb-btn eb-btn-quiet" disabled={!data} onClick={() => data && downloadText(toCsv(state.list, data.species, data.regions, state.seen), `everybird-${today()}.csv`, 'text/csv')}>
                  <DownloadSimple aria-hidden="true" focusable="false" />
                  Download CSV
                </button>
                <button type="button" className="eb-btn eb-btn-quiet" disabled={!data} onClick={() => downloadText(toJson(saved), `everybird-backup-${today()}.json`, 'application/json')}>
                  <DownloadSimple aria-hidden="true" focusable="false" />
                  Download JSON backup
                </button>
                <RestoreBackup onRestore={(s) => { setConfirming(false); setRestoring(s) }} disabled={!data} />
                <button type="button" className="eb-btn eb-btn-quiet eb-btn-danger" aria-expanded={confirming} onClick={() => { setRestoring(null); setConfirming((c) => !c) }}>
                  <Trash aria-hidden="true" focusable="false" />
                  Forget my list
                </button>
              </div>
            </div>
          ) : (
            <div className="eb-tools">
              <RestoreBackup onRestore={(s) => { dispatch({ type: 'restore', saved: s }); router.push('/') }} />
            </div>
          )}
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
      )}
      </div>
    </main>
  )
}
