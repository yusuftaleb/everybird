'use client'
import { useId, useRef, type ReactNode } from 'react'
import { fileMessage, type EbirdJob } from '@/components/app/use-import-jobs'
import { fmt, rich } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { MYEBIRDDATA_PLACES } from '@/lib/list/filter-summary'
import { countParts, type SourceCounts } from '@/lib/list/source-counts'
import type { Saved, EbirdDetails } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import { nameOfCode } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import { FileDropzone, useFileDrop } from './FileDropzone'
import { notCounted } from './NotCounted'
import { ebirdLine, HowTo, SourceRow } from './SourceLine'
import { useAnchorTarget } from './use-anchor-target'
import { useAddPanel } from './add-panel'

/** An eBird file already on the list: its slot ('ebird' full export, 'ebird-list' life list) and what is known of it. */
export type EbirdConnected = { slot: 'ebird' | 'ebird-list'; details?: EbirdDetails }

type Props = {
  job: EbirdJob
  /** Reads the file (use-import-jobs.ts: kind detected from the header, parsed in a worker, imported into its slot). */
  onFile: (file: File) => void
  disabled?: boolean
  /** Species already imported from each eBird file (the full MyEBirdData export and the quick life list download). */
  loaded: { full: number; quick: number }
  /** The Places panel's lifer-only note (placesNoteFor): 'reimport' adds the same import-again line here. */
  placesNote?: 'add' | 'reimport'
  /** The eBird files on the list, each with Replace and, in its ⋯ menu, Remove. */
  connected?: EbirdConnected[]
  onRemove?: (slot: EbirdConnected['slot']) => void
  /** For each row's skipped entries. */
  saved?: Saved
  /** Names the species the life list marks not countable, in the bird-name language. */
  species?: SpeciesIndex
  /** Each row's species and "only here" (source-counts.ts). */
  counts?: SourceCounts
}

type Row = {
  slot: EbirdConnected['slot']
  kind: EbirdDetails['kind']
  title: string
  what: string
  /** The Add panel's guidance: what this file is and what it brings. */
  guide: string
  help: ReactNode
}

/** The two rows in `t`'s language: the life list download, then MyEBirdData (a name, the same in every language). */
const rowsIn = (t: Ui): Row[] => {
  const e = t.import.ebird
  return [
    { slot: 'ebird-list', kind: 'life-list', title: e.listTitle, what: e.listWhat, guide: e.listGuide, help: <p>{e.listHelp}</p> },
    { slot: 'ebird', kind: 'full-export', title: 'MyEBirdData', what: e.fullWhat, guide: e.fullGuide, help: <p>{e.fullHelp}</p> },
  ]
}

/**
 * The two eBird files, one quiet row each (Settings > Your list). Not added: "Add" opens the row's panel (what the file
 * brings, the drop zone with "Choose your eBird file", and "How do I get this file?"). Added: the file's name, its species
 * and "only here" (source-counts.ts), skipped entries and date, with Replace (the same picker) and a ⋯ menu (Remove; no item repeats a visible button). Every picker and drop reads
 * the file the same way, and it lands in the row of its kind (read from its header); both rows and the open panels
 * take a dropped file (they highlight while one is dragged over). The import itself runs above the routes, so it
 * survives navigation. With only the life list download, a note under the rows says Places knows only each bird's first
 * place, its "Add MyEBirdData" an inline link (each row keeps its one button); that link and arrival at
 * /settings#add-mydata (the Places panel's note) open MyEBirdData's Add panel and focus its picker (MyEBirdData already
 * on the list: its Replace).
 */
export function EbirdDrop({ job, onFile, disabled, loaded, placesNote, connected = [], onRemove, saved, species, counts }: Props) {
  const id = useId()
  const { t } = useI18n()
  useNames()
  const nameOf = species ? (code: string) => nameOfCode(species.byCode, code) : undefined
  // The open Add panel, shared by every source (one at a time; ImportPanel folds it when a file lands).
  const [adding, setPanel] = useAddPanel()
  const input = useRef<HTMLInputElement>(null)
  const chooseFull = useRef<HTMLButtonElement>(null)
  const replaceFull = useRef<HTMLButtonElement>(null)
  const { busy, error } = job

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }

  const { over, handlers } = useFileDrop(read, disabled)
  const off = disabled || busy
  const pick = () => input.current?.click()
  // Only the life list download: the full export would add every place, down to the county. A MyEBirdData import saved
  // before seen-here should be imported again: the same case, and words, as the Places panel's note.
  const quickOnly = !!loaded.quick && !loaded.full
  const reimport = placesNote === 'reimport'
  const fullOn = connected.some((c) => c.slot === 'ebird')
  const P = MYEBIRDDATA_PLACES
  // MyEBirdData's Add panel, opened and its picker focused; with MyEBirdData on the list, its Replace focused.
  const toFull = useAnchorTarget({ anchor: P.anchor, off, connected: fullOn, open: () => setPanel('ebird', true), picker: chooseFull, replace: replaceFull })

  return (
    <div
      className="eb-filedrop"
      data-testid="ebird-drop"
      data-over={over || undefined}
      data-busy={busy || undefined}
      {...handlers}
    >
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".csv,text/csv"
        aria-label={t.import.ebird.input}
        data-testid="ebird-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      {rowsIn(t).map((r) => {
        const c = connected.find((x) => x.slot === r.slot)
        const line = c ? ebirdLine(r.kind, c.details, t) : null
        const open = adding === r.slot
        return (
          <SourceRow
            key={r.slot}
            testId={c ? `source-${r.slot}` : undefined}
            title={r.title}
            name={line?.name}
            parts={line ? line.parts : [t.import.notAdded]}
            counts={c && counts ? countParts(counts.rows[r.slot], t) : undefined}
            skipped={c && saved ? notCounted(saved, [r.slot], t, nameOf) ?? undefined : undefined}
            what={c ? r.what : undefined}
            disabled={off}
            onRemove={() => onRemove?.(r.slot)}
            primary={
              c ? (
                <button ref={r.slot === 'ebird' ? replaceFull : undefined} type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={pick} aria-label={fmt(t.import.replaceLabel, { name: line!.name })}>
                  {t.import.replace}
                </button>
              ) : (
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet eb-btn-sm"
                  disabled={off}
                  aria-expanded={open}
                  aria-controls={`${id}-${r.slot}`}
                  aria-label={fmt(t.import.addLabel, { title: r.title })}
                  onClick={() => setPanel(r.slot, !open)}
                >
                  {t.import.add}
                </button>
              )
            }
          >
            {!c && (
              <div id={`${id}-${r.slot}`} className="eb-src-panel" hidden={!open} role="group" aria-label={fmt(t.import.addLabel, { title: r.title })}>
                <p className="eb-note">{r.guide}</p>
                <FileDropzone label={t.import.ebird.choose} disabled={off} onPick={pick} buttonRef={r.slot === 'ebird' ? chooseFull : undefined} />
                <HowTo label={t.import.ebird.howTo}>{r.help}</HowTo>
              </div>
            )}
          </SourceRow>
        )
      })}
      {quickOnly && (
        <p className="eb-note eb-src-status eb-lifer-note" data-testid="places-lifer-note">
          {rich(t.import.ebird.liferNote, {
            link: (chunk) => (
              <a
                href={`#${P.anchor}`}
                data-testid="places-lifer-add"
                aria-label={t.import.ebird.liferLink}
                aria-controls={fullOn ? undefined : `${id}-ebird`}
                onClick={(e) => {
                  e.preventDefault()
                  // During a read the request is held until it ends, and taken up only while the address names it.
                  if (off) history.replaceState(history.state, '', `#${P.anchor}`)
                  toFull(false)
                }}
              >
                {chunk}
              </a>
            ),
          })}
        </p>
      )}
      {/* A read's progress is the import toast's (ImportToast), never in the grid. */}
      {error && <p className="eb-error eb-src-status" role="alert">{fileMessage(error, t)}</p>}
      {reimport && (
        // The Places panel's own words (one source), its link left as plain text here: Replace is right above.
        <p className="eb-note eb-src-status" data-testid="ebird-detail">
          {rich(t.places.note.reimport, {})}
        </p>
      )}
    </div>
  )
}
