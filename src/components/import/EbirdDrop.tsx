'use client'
import { FileCsv } from '@phosphor-icons/react'
import { useId, useRef, useState, type DragEvent, type ReactNode } from 'react'
import type { EbirdJob } from '@/components/app/use-import-jobs'
import { countParts, type SourceCounts } from '@/lib/list/source-counts'
import type { Saved, EbirdDetails } from '@/lib/list/storage'
import { notCounted } from './NotCounted'
import { ebirdLine, HowTo, SourceRow } from './SourceLine'

/** An eBird file already on the list: its slot ('ebird' full export, 'ebird-list' life list) and what is known of it. */
export type EbirdConnected = { slot: 'ebird' | 'ebird-list'; details?: EbirdDetails }

type Props = {
  job: EbirdJob
  /** Reads the file (use-import-jobs.ts: kind detected from the header, parsed in a worker, imported into its slot). */
  onFile: (file: File) => void
  disabled?: boolean
  /** Species already imported from each eBird file (the full MyEBirdData export and the quick life list download),
   *  and whether any full-export record names a region (county). */
  loaded: { full: number; quick: number; fullCounty?: boolean }
  /** The eBird files on the list, each with Replace and, in its ⋯ menu, Remove. */
  connected?: EbirdConnected[]
  onRemove?: (slot: EbirdConnected['slot']) => void
  /** For each row's skipped entries. */
  saved?: Saved
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

const ROWS: Row[] = [
  {
    slot: 'ebird-list',
    kind: 'life-list',
    title: 'eBird life list',
    what: 'your eBird life list download',
    guide: 'Your World life list from eBird. It downloads at once, and places each bird to the state or province.',
    help: <p>On eBird: My eBird, then your World life list total, then Download. It&apos;s instant, and places go down to the state or province.</p>,
  },
  {
    slot: 'ebird',
    kind: 'full-export',
    title: 'MyEBirdData',
    what: 'your eBird full export',
    guide: 'eBird’s full export of every checklist. It places birds down to the region (county), and joins your life list if you add both.',
    help: <p>On eBird: Download My Data (under My eBird). eBird emails you MyEBirdData.csv; it places birds down to the region (county).</p>,
  },
]

/**
 * The two eBird files, one quiet row each (Settings > Your list). Not added: "Add" opens the row's panel (what the file
 * brings, the drop zone with "Choose your eBird file", and "How do I get this file?"). Added: the file's name, its species
 * and "only here" (source-counts.ts), skipped entries and date, with Replace (the same picker) and a ⋯ menu (Replace, Remove). Every picker and drop reads
 * the file the same way, and it lands in the row of its kind (read from its header); both rows and the open panels
 * take a dropped file (they highlight while one is dragged over). The import itself runs above the routes, so it
 * survives navigation.
 */
export function EbirdDrop({ job, onFile, disabled, loaded, connected = [], onRemove, saved, counts }: Props) {
  const id = useId()
  const [over, setOver] = useState(false)
  const [adding, setAdding] = useState<EbirdConnected['slot'] | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const { busy, rows, error } = job
  // A file landed (a row connected or went): fold the Add panels away.
  const on = connected.map((c) => c.slot).join()
  const [lastOn, setLastOn] = useState(on)
  if (lastOn !== on) {
    setLastOn(on)
    setAdding(null)
  }

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!disabled) read(e.dataTransfer?.files?.[0])
  }
  const off = disabled || busy
  const pick = () => input.current?.click()
  // Only the life list download: the full export would add counties. An old full-export slot without counties
  // (saved before the two eBird slots) should be imported again.
  const quickOnly = !!loaded.quick && !loaded.full
  const reimport = !!loaded.full && loaded.fullCounty === false

  return (
    <div
      className="eb-filedrop"
      data-testid="ebird-drop"
      data-over={over || undefined}
      data-busy={busy || undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={onDrop}
    >
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".csv,text/csv"
        aria-label="eBird file"
        data-testid="ebird-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      {ROWS.map((r) => {
        const c = connected.find((x) => x.slot === r.slot)
        const line = c ? ebirdLine(r.kind, c.details) : null
        const open = adding === r.slot
        return (
          <SourceRow
            key={r.slot}
            testId={c ? `source-${r.slot}` : undefined}
            title={r.title}
            name={line?.name}
            parts={line ? line.parts : ['Not added']}
            counts={c && counts ? countParts(counts.rows[r.slot]) : undefined}
            skipped={c && saved ? notCounted(saved, [r.slot]) ?? undefined : undefined}
            what={c ? r.what : undefined}
            disabled={off}
            onRemove={() => onRemove?.(r.slot)}
            menu={c ? [{ label: 'Replace', onSelect: pick }] : undefined}
            primary={
              c ? (
                <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={pick} aria-label={`Replace ${line!.name}`}>
                  Replace
                </button>
              ) : (
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet eb-btn-sm"
                  disabled={off}
                  aria-expanded={open}
                  aria-controls={`${id}-${r.slot}`}
                  aria-label={`Add ${r.title}`}
                  onClick={() => setAdding(open ? null : r.slot)}
                >
                  Add
                </button>
              )
            }
          >
            {!c && (
              <div id={`${id}-${r.slot}`} className="eb-src-panel" hidden={!open} role="group" aria-label={`Add ${r.title}`}>
                <p className="eb-note">{r.guide}</p>
                {r.slot === 'ebird' && quickOnly && (
                  <p className="eb-note" data-testid="ebird-detail">
                    Your life list download gives each bird’s state or province. Add the full “Download My Data” export to place them down to the region (county).
                  </p>
                )}
                <div className="eb-dropzone">
                  <button type="button" className="eb-btn" disabled={off} onClick={pick}>
                    <FileCsv aria-hidden="true" focusable="false" />
                    Choose your eBird file
                  </button>
                  <span className="eb-note eb-drop-hint">or drop it here</span>
                </div>
                <HowTo label="How do I get this file?">{r.help}</HowTo>
              </div>
            )}
          </SourceRow>
        )
      })}
      <p className="eb-status eb-src-status" role="status">
        {busy ? (rows ? `Reading your file… ${rows.toLocaleString('en-US')} rows` : 'Reading your file…') : ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{error}</p>}
      {reimport && <p className="eb-note eb-src-status" data-testid="ebird-detail">No regions (counties) in your eBird file yet: import “Download My Data” again to add them.</p>}
    </div>
  )
}
