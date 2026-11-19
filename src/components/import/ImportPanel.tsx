'use client'
import { CaretDown, LockSimple } from '@phosphor-icons/react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ImportJobs } from '@/components/app/use-import-jobs'
import { useI18n } from '@/i18n/I18nProvider'
import { countParts, type SourceCounts } from '@/lib/list/source-counts'
import type { Action } from '@/lib/list/store'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { EbirdDrop, type EbirdConnected } from './EbirdDrop'
import { InatForm } from './InatForm'
import { ObsOrgDrop, type ObsOrgConnected } from './ObsOrgDrop'
import { SheetDrop } from './SheetDrop'
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
  /** The Places panel's lifer-only note (placesNoteFor), so the eBird rows say the same. */
  placesNote?: 'add' | 'reimport'
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

/** One source's group on "Your list" (the focus target after a Remove: way-ebird, way-inat, way-obsorg, way-tick). */
function Group({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="eb-srcgroup" id={id} tabIndex={-1} role="group" aria-label={label}>{children}</div>
}

/**
 * Settings > "Your list": one quiet row per source (eBird life list, MyEBirdData, iNaturalist, the observation.org
 * life list and observations, Ticked by hand): its name and status on two lines, one button on the right, a ⋯ menu
 * once connected; adding opens the source's panel (its guidance and how-to inside) under the row. They combine into
 * one list; each import replaces only its own slot. The two file groups (eBird, observation.org) read one file at a
 * time: while either reads, both are disabled, and any file lands in the row of its kind. `children` follow the rows
 * (the match report).
 */
export const ImportPanel = memo(function ImportPanel({ saved, dispatch, species, regions, jobs, disabled, children, onList, counts, summary, placesNote }: Props) {
  const tick = useDisclosure()
  const { t } = useI18n()
  const ebirdConnected: EbirdConnected[] = (['ebird', 'ebird-list'] as const)
    .filter((slot) => (saved.records[slot]?.length ?? 0) > 0 || saved.unmatched.some((u) => (u.slot ?? u.source) === slot))
    .map((slot) => ({ slot, details: saved.sources?.[slot] }))
  const obsorgConnected: ObsOrgConnected[] = (['obsorg-list', 'obsorg'] as const)
    .filter((slot) => (saved.records[slot]?.length ?? 0) > 0 || saved.unmatched.some((u) => (u.slot ?? u.source) === slot))
    .map((slot) => ({ slot, details: saved.sources?.[slot] }))
  const inatOn = saved.records.inat.length > 0 || saved.unmatched.some((u) => u.source === 'inat')
  const sheetOn = (saved.records.sheet?.length ?? 0) > 0 || saved.unmatched.some((u) => (u.slot ?? u.source) === 'sheet')
  const focusWay = (id: string) => requestAnimationFrame(() => document.getElementById(id)?.focus({ preventScroll: true }))
  const remove = (slot: Exclude<Slot, 'manual'>) => {
    dispatch({ type: 'remove-source', source: slot })
    focusWay(
      slot === 'inat'
        ? 'way-inat'
        : slot === 'obsorg' || slot === 'obsorg-list'
          ? 'way-obsorg'
          : slot === 'sheet'
            ? 'way-sheet'
            : 'way-ebird',
    )
  }
  // One file at a time across all file groups.
  const fileBusy = jobs.ebird.busy || jobs.obsorg.busy || jobs.sheet.busy
  // When a file last landed, in either group: the file groups fold their Add panels (an iNaturalist fetch, running
  // beside them, leaves an open panel alone).
  const [fileLandedAt, setFileLandedAt] = useState<number | undefined>(undefined)
  if (jobs.landed && jobs.landed.slot !== 'inat' && jobs.landed.at !== fileLandedAt) setFileLandedAt(jobs.landed.at)
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
        <h2 id="eb-sources-h" className="eb-h2">{t.import.head}</h2>
        {summary ?? <p className="eb-note">{t.import.combine}</p>}
      </div>
      <div className="eb-srclist">
        <Group id="way-ebird" label={t.import.ebirdGroup}>
          <EbirdDrop
            job={jobs.ebird}
            onFile={(f) => void jobs.readEbird(f)}
            disabled={disabled || fileBusy}
            connected={ebirdConnected}
            onRemove={remove}
            saved={saved}
            species={species}
            counts={counts}
            landedAt={fileLandedAt}
            loaded={{ full: speciesIn(saved.records.ebird), quick: speciesIn(saved.records['ebird-list'] ?? []) }}
            placesNote={placesNote}
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
        <Group id="way-obsorg" label={t.import.obsorg.group}>
          <ObsOrgDrop
            job={jobs.obsorg}
            onFile={(f) => void jobs.readObsOrg(f)}
            disabled={disabled || fileBusy}
            landedAt={fileLandedAt}
            connected={obsorgConnected}
            onRemove={remove}
            saved={saved}
            counts={counts}
          />
        </Group>
        <Group id="way-sheet" label={t.import.sheet.title}>
          <SheetDrop
            job={jobs.sheet}
            onFile={(f) => void jobs.readSheet(f)}
            onPaste={(text) => void jobs.parsePaste(text)}
            review={jobs.sheetReview}
            onConfirm={jobs.confirmSheet}
            onCancel={jobs.cancelSheet}
            species={species}
            disabled={disabled || fileBusy}
            connected={sheetOn}
            details={saved.sources?.sheet}
            onRemove={() => remove('sheet')}
            saved={saved}
            counts={counts.rows.sheet}
            landedAt={fileLandedAt}
          />
        </Group>
        <Group id="way-tick" label={t.tick.title}>
          <SourceRow
            title={t.tick.title}
            parts={ticked.species ? [] : [t.import.noneYet]}
            counts={ticked.species ? countParts(ticked, t) : undefined}
            primary={
              <button
                type="button"
                className="eb-btn eb-btn-quiet eb-btn-sm eb-disclose-btn"
                aria-expanded={tick.open}
                aria-controls="tick"
                aria-label={t.tick.label}
                disabled={disabled}
                onClick={tick.toggle}
              >
                {t.tick.button}
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
      <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />{t.import.privacy}</p>
    </section>
  )
})
