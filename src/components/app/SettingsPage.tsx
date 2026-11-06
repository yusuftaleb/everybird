'use client'
import { ArrowRight, DownloadSimple, Trash } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'
import { ImportPanel } from '@/components/import/ImportPanel'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

const FROM: Record<Slot, string> = { ebird: 'your eBird export', 'ebird-list': 'your eBird life list', inat: 'iNaturalist', manual: 'your list' }

/**
 * `/settings`: "Your sources" (the three ways in), the match report, "Counting rules" and "Keep your list" (downloads,
 * restore, forget). After an import, "See my collage" goes back to the collage.
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
  return (
    <main className="eb-page eb-page-settings eb-page-titled">
      <PageHead
        title="Settings"
        lede={mine ? 'Where your birds come from, how they count, and how to keep your list.' : 'Bring your list in any of three ways, and combine them if you keep more than one record.'}
      />
      <AppNotices eb={eb} />
      {mine && (landed || count > 0) && (
        <div className="eb-made" role="status" data-testid="see-collage">
          <p>
            {landed ? `Added ${landed.species.toLocaleString('en-US')} species from ${FROM[landed.slot]}. ` : ''}
            Your collage has {count.toLocaleString('en-US')} species.
          </p>
          <Link href="/" className="eb-btn">See my collage<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
        </div>
      )}
      {data ? (
        <ImportPanel saved={saved} dispatch={dispatch} species={data.species} regions={data.regions} jobs={jobs} onList={onList}>
          {!mine && (
            <div className="eb-tools">
              <span className="eb-note">Moving from another device?</span>
              <RestoreBackup onRestore={(s) => { dispatch({ type: 'restore', saved: s }); router.push('/') }} />
            </div>
          )}
        </ImportPanel>
      ) : (
        !eb.failed && <div className="eb-ways-wait" aria-hidden="true" />
      )}
      {data && <MatchReport open={state.openUnmatched} saved={saved} species={data.species} dispatch={dispatch} />}
      {mine && <RulesSwitches saved={saved} dispatch={dispatch} />}
      {mine && (
        <section className="eb-block" aria-labelledby="eb-keep-h">
          <h2 id="eb-keep-h" className="eb-h2">Keep your list</h2>
          <p className="eb-note">Your list lives on this device. Download it any time, or move it to another device with the backup.</p>
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
      )}
    </main>
  )
}
