'use client'
import { Plus, ShareNetwork } from '@phosphor-icons/react'
import Link from 'next/link'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { EditBird } from '@/components/edit/EditBird'
import type { Edits, ListEntry } from '@/lib/list/model'
import { CollageView } from './CollageView'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import './app.css'

// The dialog (and its canvas code) loads on first open; the link encoder loads only on "Copy link".
const ShareDialog = lazy(() => import('@/components/share/ShareDialog'))

/** How long "Removed … · Undo" stays. */
const UNDO_MS = 6000

/**
 * `/` with a list: the birder's collage (count, filters, controls, search, collage or list, tooltip, card and
 * editing, legend) under a one-row head with Share and "Add birds". Removing a bird can be undone for a few seconds.
 * Unmatched rows are mentioned under the stats, with the way to fix them on Settings.
 */
export function CollagePage() {
  const eb = useEverybirdContext()
  const { state, dispatch, data, dots } = eb
  const [sharing, setSharing] = useState(false)
  const [removed, setRemoved] = useState<{ name: string; code: string; before: Edits } | null>(null)
  const { saved } = state
  const ready = !!data

  // Undo: put back what the removal changed (the removed list and any hand-added record), keeping later edits.
  const undo = useCallback(() => {
    if (!removed) return
    const now = state.saved.edits
    dispatch({
      type: 'edit',
      edits: {
        ...now,
        removed: now.removed.filter((c) => c !== removed.code),
        added: [...now.added.filter((r) => r.code !== removed.code), ...removed.before.added.filter((r) => r.code === removed.code)],
      },
    })
    setRemoved(null)
  }, [removed, state.saved.edits, dispatch])
  useEffect(() => {
    if (!removed) return
    const t = setTimeout(() => setRemoved(null), UNDO_MS)
    return () => clearTimeout(t)
  }, [removed])

  const editsRef = useRef(saved.edits)
  useEffect(() => { editsRef.current = saved.edits }, [saved.edits])
  const actions = useCallback(
    (entry: ListEntry, close: () => void) => (
      <EditBird
        entry={entry}
        edits={saved.edits}
        dispatch={dispatch}
        onRemoved={() => {
          setRemoved({ code: entry.code, name: data?.species.byCode.get(entry.code)?.com ?? entry.code, before: editsRef.current })
          close()
        }}
      />
    ),
    [saved.edits, dispatch, data],
  )

  const unmatched = state.openUnmatched.filter((u) => u.reason === 'no-match').length
  const name = saved.name?.trim()
  return (
    <main className="eb-page eb-page-collage">
      <div className="eb-collagehead">
        <h1 className="eb-collagehead-title">{name ? `${name}'s birds` : 'My collage'}</h1>
        <div className="eb-collagehead-actions">
          <Link href="/settings" className="eb-btn eb-btn-quiet" aria-label="Add birds">
            <Plus aria-hidden="true" focusable="false" />
            <span className="eb-sm-hide">Add birds</span>
          </Link>
          <button type="button" className="eb-btn" aria-haspopup="dialog" disabled={!ready || !state.list.length} onClick={() => setSharing(true)}>
            <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
            Share
          </button>
        </div>
      </div>
      <AppNotices eb={eb} />
      {!ready ? (
        !eb.failed && <div className="eb-stage-wait eb-sample-wait" aria-hidden="true" />
      ) : (
        <>
          <CollageView
            state={state}
            dispatch={dispatch}
            species={data.species}
            regions={data.regions}
            dots={dots}
            label="Your collage"
            whose="your"
            cardActions={actions}
            notice={unmatched > 0 ? (
              <p className="eb-mono eb-unmatched" data-testid="unmatched-note">
                {unmatched.toLocaleString('en-US')} {unmatched === 1 ? "row couldn't" : "rows couldn't"} be matched · <Link href="/settings#match">Fix {unmatched === 1 ? 'it' : 'them'}</Link>
              </p>
            ) : undefined}
          />
          {sharing && (
            <Suspense fallback={null}>
              <ShareDialog state={state} dispatch={dispatch} species={data.species} regions={data.regions} onClose={() => setSharing(false)} />
            </Suspense>
          )}
        </>
      )}
      <div className="eb-toast-slot" role="status">
        {removed && (
          <div className="eb-toast">
            <span>Removed {removed.name}.</span>
            <button type="button" className="eb-textbtn" onClick={undo}>Undo</button>
          </div>
        )}
      </div>
    </main>
  )
}
