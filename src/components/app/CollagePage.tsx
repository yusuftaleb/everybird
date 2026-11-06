'use client'
import { Plus, ShareNetwork } from '@phosphor-icons/react'
import Link from 'next/link'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { EditBird } from '@/components/edit/EditBird'
import { placesNoteFor } from '@/lib/list/filter-summary'
import { undoRemove } from '@/lib/list/tick'
import type { Edits, ListEntry } from '@/lib/list/model'
import { CollageView } from './CollageView'
import { useEverybirdContext } from './EverybirdProvider'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { removedText, UndoToast, type Removal } from './UndoToast'
import './app.css'

// The dialog (and its canvas code) loads on first open; the link encoder loads only on "Copy link".
const ShareDialog = lazy(() => import('@/components/share/ShareDialog'))

/**
 * `/` with a list: the birder's collage (count, filters, controls, search, collage or list, tooltip, card and
 * editing, legend) under a one-row head with Share and "Add birds". Removing a bird can be undone for a few seconds.
 * Unmatched rows are mentioned under the stats, with the way to fix them on Settings.
 */
export function CollagePage() {
  const eb = useEverybirdContext()
  const { state, dispatch, data } = eb
  const [sharing, setSharing] = useState(false)
  const [removed, setRemoved] = useState<(Removal & { before: Edits }) | null>(null)
  const { saved } = state
  const ready = !!data

  // Undo: put back what the removal changed (the removed list, the hand-added record), keeping later edits.
  const undo = useCallback(() => {
    if (!removed) return
    dispatch({ type: 'edit', edits: undoRemove(state.saved.edits, removed.before, removed.codes) })
    setRemoved(null)
  }, [removed, state.saved.edits, dispatch])
  const dismiss = useCallback(() => setRemoved(null), [])

  const editsRef = useRef(saved.edits)
  useEffect(() => { editsRef.current = saved.edits }, [saved.edits])
  const actions = useCallback(
    (entry: ListEntry, close: () => void) => (
      <EditBird
        entry={entry}
        edits={saved.edits}
        dispatch={dispatch}
        onRemoved={() => {
          setRemoved({ codes: [entry.code], text: removedText([data?.species.byCode.get(entry.code)?.com ?? entry.code]), before: editsRef.current })
          close()
        }}
      />
    ),
    [saved.edits, dispatch, data],
  )

  const unmatched = state.openUnmatched.filter((u) => u.reason === 'no-match').length
  const name = saved.name?.trim()
  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      <PageHead
        title={name ? `${name}'s birds` : 'My collage'}
        actions={<>
          <Link href="/settings" className="eb-btn eb-btn-quiet" aria-label="Add birds">
            <Plus aria-hidden="true" focusable="false" />
            <span className="eb-sm-hide">Add birds</span>
          </Link>
          <button type="button" className="eb-btn" aria-haspopup="dialog" disabled={!ready || !state.list.length} onClick={() => setSharing(true)}>
            <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
            Share
          </button>
        </>}
      />
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
            placesNote={placesNoteFor(saved, state.list.length, state.seen.full)}
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
      <UndoToast removal={removed} onUndo={undo} onDone={dismiss} />
    </main>
  )
}
