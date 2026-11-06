'use client'
import { Binoculars, CaretDown, CheckSquareOffset, FileCsv, LockSimple, type Icon } from '@phosphor-icons/react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { EbirdDrop, type EbirdConnected } from './EbirdDrop'
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

/**
 * One way in, one full-width row: icon, title and a sentence on the left (above, on phones), its controls on the
 * right; `after` spans the row underneath (the tick list).
 */
function Way({ id, icon: Glyph, title, blurb, children, after }: { id: string; icon: Icon; title: string; blurb: ReactNode; children: ReactNode; after?: ReactNode }) {
  return (
    <div className="eb-way" id={id} tabIndex={-1} aria-labelledby={`${id}-h`} role="group">
      <div className="eb-way-head">
        <h3 id={`${id}-h`} className="eb-way-title"><Glyph aria-hidden="true" focusable="false" weight="regular" />{title}</h3>
        <p className="eb-way-blurb">{blurb}</p>
      </div>
      {children}
      {after}
    </div>
  )
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Tick by hand's disclosure: the list mounts on first open and grows into place (its height animates from 0; with
 * reduced motion it appears at once). While it animates the panel clips; once open it doesn't, so the list's sticky
 * "Add N" bar can stick to the screen. Closed, it is `hidden` (out of the tab order and the accessibility tree).
 */
function useDisclosure() {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  // 'idle' (settled open or closed), 'opening', 'closing'
  const [phase, setPhase] = useState<'idle' | 'opening' | 'closing'>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  const settle = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; setPhase('idle') }
  const toggle = () => {
    const next = !open
    setMounted(true)
    setOpen(next)
    if (reducedMotion()) return settle()
    setPhase(next ? 'opening' : 'closing')
    // transitionend can be missed (tab hidden, nothing to animate): settle anyway.
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(settle, 450)
  }
  return { open, mounted, phase, toggle, settle }
}

const speciesIn = (records: { code: string }[]) => new Set(records.map((r) => r.code)).size

/**
 * "Your sources": the three ways in, one roomy row each. They combine into one list; each import replaces only its own
 * slot. A connected source shows what it is and when it came in, with Replace or Refresh and Remove.
 */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, jobs, disabled, children, onList }: Props) {
  const tick = useDisclosure()
  const ebirdConnected: EbirdConnected[] = (['ebird', 'ebird-list'] as const)
    .filter((slot) => (saved.records[slot]?.length ?? 0) > 0 || saved.unmatched.some((u) => (u.slot ?? u.source) === slot))
    .map((slot) => ({ slot, details: saved.sources?.[slot] }))
  const inatOn = saved.records.inat.length > 0 || saved.unmatched.some((u) => u.source === 'inat')
  const focusWay = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }))
  const remove = (slot: 'ebird' | 'ebird-list' | 'inat') => {
    dispatch({ type: 'remove-source', source: slot })
    focusWay(slot === 'inat' ? 'way-inat' : 'way-ebird')
  }
  const listEmpty = Object.values(saved.records).every((r) => r.length === 0) && saved.edits.added.length === 0

  return (
    <section id="sources" className="eb-block eb-import" aria-labelledby="eb-sources-h" tabIndex={-1}>
      <h2 id="eb-sources-h" className="eb-h2">Your sources</h2>
      <div className="eb-ways">
        <Way id="way-ebird" icon={FileCsv} title="eBird files" blurb="Your life list download or your full data export from eBird. Bring either, or both.">
          <EbirdDrop
            job={jobs.ebird}
            onFile={(f) => void jobs.readEbird(f)}
            disabled={disabled}
            connected={ebirdConnected}
            onRemove={remove}
            loaded={{
              full: speciesIn(saved.records.ebird),
              quick: speciesIn(saved.records['ebird-list'] ?? []),
              fullCounty: saved.records.ebird.some((r) => !!r.place?.sub2),
            }}
          />
          <NotCounted saved={saved} slots={['ebird', 'ebird-list']} />
        </Way>
        <Way id="way-inat" icon={Binoculars} title="iNaturalist" blurb="Your public, wild bird observations, identified to species.">
          <InatForm
            job={jobs.inat}
            onFetch={(u) => void jobs.fetchInat(u)}
            onCancel={jobs.cancelInat}
            disabled={disabled}
            replaces={inatOn}
            details={saved.sources?.inat}
            onRemove={() => remove('inat')}
          />
          <NotCounted saved={saved} slots={['inat']} />
        </Way>
        <Way
          id="way-tick"
          icon={CheckSquareOffset}
          title="Tick by hand"
          blurb="Tick off as many birds as you like, with one date and place for the batch."
          after={
            tick.mounted && (
              <div
                id="tick"
                className="eb-disclose"
                data-open={tick.open || undefined}
                data-phase={tick.phase === 'idle' ? undefined : tick.phase}
                hidden={!tick.open && tick.phase === 'idle'}
                onTransitionEnd={(e) => { if (e.target === e.currentTarget) tick.settle() }}
              >
                <div className="eb-disclose-inner">
                  <TickList species={species} regions={regions} edits={saved.edits} dispatch={dispatch} onList={onList} listEmpty={listEmpty} />
                </div>
              </div>
            )
          }
        >
          <div className="eb-way-body">
            <div className="eb-way-control">
              <button
                type="button"
                className="eb-btn eb-btn-quiet eb-way-btn eb-disclose-btn"
                aria-expanded={tick.open}
                aria-controls="tick"
                disabled={disabled}
                onClick={tick.toggle}
              >
                Tick birds off a list
                <CaretDown aria-hidden="true" focusable="false" weight="bold" />
              </button>
            </div>
            <ul className="eb-way-notes">
              <li className="eb-note">Every species in eBird&apos;s taxonomy, to search or browse. No upload, no account.</li>
              <li className="eb-note">This is also where you add or remove species any time, without uploading a file again or retyping a username: tick a bird to add it, un-tick one already on your list to take it off.</li>
            </ul>
          </div>
        </Way>
      </div>
      {children}
      {/* The section's footnote, where files and usernames are handed over; the full privacy note is on About. */}
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />Your list never leaves your browser. We count visits anonymously.</p>
    </section>
  )
})
