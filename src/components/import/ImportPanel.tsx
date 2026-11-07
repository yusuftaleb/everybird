'use client'
import { CaretDown, LockSimple } from '@phosphor-icons/react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
import { countParts, type SourceCounts } from '@/lib/list/source-counts'
import type { Action } from '@/lib/list/store'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { EbirdDrop, type EbirdConnected } from './EbirdDrop'
import { InatForm } from './InatForm'
import { TickList } from './TickList'
import { SourceRow } from './SourceLine'
import './import.css'

type Props = {
  saved: Saved
  dispatch: (a: Action) => void
  species: SpeciesIndex
  regions: Regions
  /** The imports in flight, kept above the routes (EverybirdProvider). */
  jobs: ImportJobs
  disabled?: boolean
  /** After the rows, before the privacy line (the match report). */
  children?: ReactNode
  /** Codes already on the list (Tick by hand shows them ticked). */
  onList: ReadonlySet<string>
  /** What each source brings to the collage (source-counts.ts), for each row's status. */
  counts: SourceCounts
  /** Instead of the section's note, when the list has species: the summary line (Settings' see-collage line). */
  summary?: ReactNode
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

/** One source's group on "Your list" (the focus target after a Remove: way-ebird, way-inat, way-tick). */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="eb-srcgroup" id={id} tabIndex={-1} role="group" aria-label={label}>{children}</div>
}

/**
 * Settings > "Your list": one quiet row per source (eBird life list, MyEBirdData, iNaturalist, Ticked by hand): its
 * name and status on two lines, one button on the right, a ⋯ menu once connected; adding opens the source's panel
 * (its guidance and how-to inside) under the row. They combine into one list; each import replaces only its own
 * slot. `children` follow the rows (the match report).
 */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, jobs, disabled, children, onList, counts, summary }: Props) {
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
  const ticked = counts.rows.manual
  // Arriving at /settings#sources (the welcome's "Make mine"): keyboard and screen-reader focus starts at the sources,
  // not at the top of the document.
  const section = useRef<HTMLElement>(null)
  useEffect(() => {
    if (window.location.hash === '#sources') section.current?.focus({ preventScroll: true })
  }, [])

  return (
    <section ref={section} id="sources" className="eb-block eb-import" aria-labelledby="eb-sources-h" tabIndex={-1}>
      <div className="eb-block-head">
        <h2 id="eb-sources-h" className="eb-h2">Your list</h2>
        {summary ?? <p className="eb-note">Combine any of these into one list.</p>}
      </div>
      <div className="eb-srclist">
        <Group id="way-ebird" label="eBird files">
          <EbirdDrop
            job={jobs.ebird}
            onFile={(f) => void jobs.readEbird(f)}
            disabled={disabled}
            connected={ebirdConnected}
            onRemove={remove}
            saved={saved}
            counts={counts}
            loaded={{
              full: speciesIn(saved.records.ebird),
              quick: speciesIn(saved.records['ebird-list'] ?? []),
              fullCounty: saved.records.ebird.some((r) => !!r.place?.sub2),
            }}
          />
        </Group>
        <Group id="way-inat" label="iNaturalist">
          <InatForm
            job={jobs.inat}
            onFetch={(u) => void jobs.fetchInat(u)}
            onCancel={jobs.cancelInat}
            disabled={disabled}
            replaces={inatOn}
            details={saved.sources?.inat}
            onRemove={() => remove('inat')}
            saved={saved}
            counts={counts.rows.inat}
          />
        </Group>
        <Group id="way-tick" label="Ticked by hand">
          <SourceRow
            title="Ticked by hand"
            parts={ticked.species ? [] : ['None yet']}
            counts={ticked.species ? countParts(ticked) : undefined}
            primary={
              <button
                type="button"
                className="eb-btn eb-btn-quiet eb-btn-sm eb-disclose-btn"
                aria-expanded={tick.open}
                aria-controls="tick"
                aria-label="Tick birds off a list"
                disabled={disabled}
                onClick={tick.toggle}
              >
                Tick birds
                <CaretDown aria-hidden="true" focusable="false" weight="bold" />
              </button>
            }
          >
            {/* The panel is always in the DOM (hidden until opened), so aria-controls="tick" always names an element;
                the list itself mounts on first open. */}
            <div
              id="tick"
              className="eb-disclose"
              data-open={tick.open || undefined}
              data-phase={tick.phase === 'idle' ? undefined : tick.phase}
              hidden={!tick.open && tick.phase === 'idle'}
              onTransitionEnd={(e) => { if (e.target === e.currentTarget) tick.settle() }}
            >
              <div className="eb-disclose-inner">
                {tick.mounted && <TickList species={species} regions={regions} edits={saved.edits} dispatch={dispatch} onList={onList} listEmpty={listEmpty} />}
              </div>
            </div>
          </SourceRow>
        </Group>
      </div>
      {children}
      {/* The section's footnote, where files and usernames are handed over; the full privacy note is on About. */}
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />Your list never leaves your browser. We count visits anonymously.</p>
    </section>
  )
})
