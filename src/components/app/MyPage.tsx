'use client'
import { DownloadSimple, Plus, ShareNetwork, Trash } from '@phosphor-icons/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { EditBird } from '@/components/edit/EditBird'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import type { ListEntry } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { CollageView } from './CollageView'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

// The dialog (and its canvas code) loads on first open; the link encoder loads only on "Copy link".
const ShareDialog = lazy(() => import('@/components/share/ShareDialog'))

/**
 * `/my`: the birder's collage (count, filters, controls, search, collage or list, card and editing, legend) with
 * Share and the downloads in the page head, then restore and forget. Without a list it sends people to /make.
 */
export function MyPage() {
  const eb = useEverybirdContext()
  const { state, dispatch, data, dots, mine, meta } = eb
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState<Saved | null>(null)
  const [sharing, setSharing] = useState(false)
  const { saved } = state
  const empty = meta.ready && !mine
  useEffect(() => { if (empty) router.replace('/make') }, [empty, router])

  const actions = useCallback(
    (entry: ListEntry, close: () => void) => <EditBird entry={entry} edits={saved.edits} dispatch={dispatch} onRemoved={close} />,
    [saved.edits, dispatch],
  )
  const ready = !!data && mine
  const head = (
    <>
      <button type="button" className="eb-btn" aria-haspopup="dialog" disabled={!ready || !state.list.length} onClick={() => setSharing(true)}>
        <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
        Share
      </button>
      <button type="button" className="eb-btn eb-btn-quiet" aria-label="Download CSV" disabled={!ready} onClick={() => data && downloadText(toCsv(state.list, data.species, data.regions), `everybird-${today()}.csv`, 'text/csv')}>
        <DownloadSimple aria-hidden="true" focusable="false" />
        <span className="eb-sm-hide">Download CSV</span><span className="eb-sm-show">CSV</span>
      </button>
      <button type="button" className="eb-btn eb-btn-quiet" aria-label="Download JSON backup" disabled={!ready} onClick={() => downloadText(toJson(saved), `everybird-backup-${today()}.json`, 'application/json')}>
        <DownloadSimple aria-hidden="true" focusable="false" />
        <span className="eb-sm-hide">Download JSON backup</span><span className="eb-sm-show">Backup</span>
      </button>
      <Link href="/make" className="eb-btn eb-btn-quiet">
        <Plus aria-hidden="true" focusable="false" />
        Add another source
      </Link>
    </>
  )

  return (
    <main className="eb-page eb-page-my">
      <PageHead title="My collage" actions={head} />
      <AppNotices eb={eb} />
      {!ready ? (
        !eb.failed && <div className="eb-stage-wait" aria-hidden="true" />
      ) : (
        <>
          <CollageView state={state} dispatch={dispatch} species={data.species} regions={data.regions} dots={dots} label="Your collage" cardActions={actions} />
          {sharing && (
            <Suspense fallback={null}>
              <ShareDialog state={state} dispatch={dispatch} species={data.species} regions={data.regions} onClose={() => setSharing(false)} />
            </Suspense>
          )}
          <section className="eb-block" aria-labelledby="eb-keep-h">
            <h2 id="eb-keep-h" className="eb-h2">Keep your list</h2>
            <p className="eb-note">Your list lives on this device. Download it any time, or move it to another device with the backup.</p>
            <div className="eb-tools">
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
        </>
      )}
    </main>
  )
}
