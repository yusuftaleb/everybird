'use client'
// "Add birds": one modal for every way in, opened from the collage's head and the landing's main button on "Import a
// file" (the source rows, ImportPanel), with Add by hand (TickList) one press away in the same control; from Settings'
// "Add by hand" it is adding by hand alone, titled "Add by hand", with no switch to Import a file (Yusuf, 2026-11-21: Settings
// has its own import rows). Fits a 1440 × 830 window with any Add panel open (compact cells, import.css). Centred from 601px, a
// full-height sheet on phones. On Add by hand the dialog fits the screen: only the species list scrolls (import.css). Esc, ✕ and a press outside close it; Tab stays inside; focus goes back to the button
// that opened it (or, when that button has gone, as the landing's does once a first list is made, to the collage's
// "Add birds"). Imports run in EverybirdProvider, so closing it mid-import loses nothing.
import { ArrowRight, X } from '@phosphor-icons/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from '@/components/app/IntentLink'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import { trapTab, useFocusInAndBack, useHoldTopBar } from '@/components/dialog-utils'
import { useI18n } from '@/i18n/I18nProvider'
import { placesNoteFor } from '@/lib/list/filter-summary'
import { countParts, sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { ImportFrame, ImportPanel } from './ImportPanel'
import { TickList } from './TickList'
import '@/components/share/share.css' // .eb-seg, the share dialog's segmented control
import './import.css'

export type AddWay = 'file' | 'hand'

/** The element "Add birds" buttons carry, so focus can return to one when the opener has gone. */
const ADD_BIRDS_ATTR = 'data-add-birds'

/** `way`: 'hand' (Settings' Add by hand) is adding by hand alone; 'file' opens on Import a file with the switch. */
export function AddBirdsDialog({ onClose, way: start = 'file' }: { onClose: () => void; way?: AddWay }) {
  const eb = useEverybirdContext()
  const { state, dispatch, data, jobs, mine } = eb
  const { saved } = state
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [way, setWay] = useState<AddWay>(start)
  const handOnly = start === 'hand'
  const [opener] = useState(() => document.activeElement as HTMLElement | null)
  useFocusInAndBack(ref, () => (opener?.isConnected ? opener : document.querySelector<HTMLElement>(`[${ADD_BIRDS_ATTR}]`)))
  useHoldTopBar()
  // "Fix them" in a row's "why?" goes to Settings' match report (#match): the dialog makes way for it.
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose })
  useEffect(() => {
    const onHash = () => { if (location.hash === '#match') close.current() }
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])

  const onList = useMemo(() => new Set(state.list.map((e) => e.code)), [state.list])
  const counts = useMemo(() => sourceCounts(saved, state.list), [saved, state.list])
  const line = mine ? summaryLine(counts, t) : null
  const ticked = counts.rows.manual
  const listEmpty = Object.values(saved.records).every((r) => r.length === 0) && saved.edits.added.length === 0

  return (
    <div className="eb-add-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="eb-add"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid="add-birds"
        onKeyDown={(e) => {
          // Bubbling, so a ⋯ menu inside closes first (it stops its own Esc).
          if (e.key === 'Escape' && !e.defaultPrevented) { e.stopPropagation(); onClose() }
          else trapTab(e, ref.current)
        }}
      >
        <div className="eb-add-head">
          <h2 id={titleId} className="eb-add-title">{handOnly ? t.add.hand : t.collage.addBirds}</h2>
          <button type="button" className="eb-add-close" aria-label={t.collage.close} onClick={onClose}>
            <X aria-hidden="true" focusable="false" weight="bold" />
          </button>
        </div>
        {!handOnly && (
          <div className="eb-seg eb-add-ways" role="group" aria-label={t.add.ways}>
            {(['file', 'hand'] as const).map((w) => (
              <button key={w} type="button" className="eb-seg-btn" aria-pressed={way === w} onClick={() => setWay(w)}>{t.add[w]}</button>
            ))}
          </div>
        )}
        {line && (
          // No live region: the import toast announces each landing.
          <p className="eb-summary" data-testid="add-summary">
            {line}
            {jobs.landed && state.list.length > 0 && (
              <>
                {' '}
                <Link href="/" className="eb-summary-link" onClick={onClose}>{t.settings.seeCollage}<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
              </>
            )}
          </p>
        )}
        {!data ? (
          // The bird data failed: say so here too (Settings shows the notice). While it loads, the grid's frame.
          eb.failed ? <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
            : way === 'file' ? <ImportFrame /> : <div className="eb-ways-wait" aria-hidden="true" />
        ) : way === 'file' && data ? (
          <>
            {!line && <p className="eb-note">{t.import.combine}</p>}
            <ImportPanel
              saved={saved}
              dispatch={dispatch}
              species={data.species}
              jobs={jobs}
              counts={counts}
              placesNote={placesNoteFor(saved, state.list.length, state.seen.full)}
            />
          </>
        ) : way === 'hand' && data ? (
          <>
            {ticked.species > 0 && <p className="eb-mono eb-note">{[t.tick.title, ...countParts(ticked, t)].join(' · ')}</p>}
            <TickList species={data.species} regions={data.regions} edits={saved.edits} dispatch={dispatch} onList={onList} listEmpty={listEmpty} autoFocus view={7} />
          </>
        ) : null}
      </div>
    </div>
  )
}
