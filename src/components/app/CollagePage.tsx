'use client'
import { Plus } from '@phosphor-icons/react'
import Link from '@/components/app/IntentLink'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { EditBird } from '@/components/edit/EditBird'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { pageTitle } from '@/lib/list/title'
import { placesNoteFor, placesUnplacedFor } from '@/lib/list/filter-summary'
import { undoEdit } from '@/lib/list/tick'
import { nameOfCode } from '@/lib/species/names'
import type { Edits, ListEntry } from '@/lib/list/model'
import type { ViewKind } from '@/lib/view-resume'
import type { ShareAt } from '@/lib/share/view-image'
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
 * editing, legend) under a one-row head with "Add birds" (`onAdd`, the Add birds dialog); Share is in the controls bar. Removing a bird can be undone for a few seconds.
 * Unmatched rows are mentioned under the stats, with the way to fix them on Settings.
 */
export function CollagePage({ onAdd }: { onAdd: () => void }) {
  const eb = useEverybirdContext()
  const { t } = useI18n()
  const { state, dispatch, data } = eb
  const [sharing, setSharing] = useState<{ view: ViewKind; at: ShareAt } | null>(null)
  const [removed, setRemoved] = useState<(Removal & { before: Edits }) | null>(null)
  const { saved } = state
  const ready = !!data

  // Undo: put back what the removal changed (the removed list, the hand-added record), keeping later edits.
  const undo = useCallback(() => {
    if (!removed) return
    dispatch({ type: 'edit', edits: undoEdit(state.saved.edits, removed.before, removed.codes) })
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
          setRemoved({ codes: [entry.code], text: removedText([data ? nameOfCode(data.species.byCode, entry.code) : entry.code], t), before: editsRef.current })
          close()
        }}
      />
    ),
    [saved.edits, dispatch, data, t],
  )

  const unmatched = state.openUnmatched.filter((u) => u.reason === 'no-match').length
  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      <PageHead
        title={pageTitle(saved.name, t)}
        actions={<>
          <button type="button" className="eb-btn eb-btn-quiet" aria-label={t.collage.addBirds} aria-haspopup="dialog" data-add-birds="" onClick={onAdd}>
            <Plus aria-hidden="true" focusable="false" />
            <span className="eb-sm-hide">{t.collage.addBirds}</span>
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
            placesUnplaced={placesUnplacedFor(saved)}
            label={t.collage.regionYours}
            whose="your"
            cardActions={actions}
            onShare={(view, at) => setSharing({ view, at })}
            compare
            notice={unmatched > 0 ? (
              <p className="eb-mono eb-unmatched" data-testid="unmatched-note">
                {plural(t.collage.unmatched, unmatched, { n: formatInt(unmatched, t.num) })} · <Link href="/settings#match">{plural(t.collage.fix, unmatched)}</Link>
              </p>
            ) : undefined}
          />
          {sharing && (
            <Suspense fallback={null}>
              <ShareDialog state={state} dispatch={dispatch} species={data.species} regions={data.regions} view={sharing.view} at={sharing.at} onClose={() => setSharing(null)} />
            </Suspense>
          )}
        </>
      )}
      <UndoToast removal={removed} onUndo={undo} onDone={dismiss} />
    </main>
  )
}
