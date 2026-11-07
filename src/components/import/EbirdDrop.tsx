'use client'
import { useRef, useState, type DragEvent } from 'react'
import type { EbirdJob } from '@/components/app/use-import-jobs'
import type { Saved, EbirdDetails } from '@/lib/list/storage'
import { NotCounted } from './NotCounted'
import { ebirdLine, sourceMeta, SourceRow } from './SourceLine'

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
  /** The eBird files on the list, each with Replace and Remove. */
  connected?: EbirdConnected[]
  onRemove?: (slot: EbirdConnected['slot']) => void
  /** For each row's not-counted entries. */
  saved?: Saved
}

/** The one thing worth saying about the eBird files in: the life list download stops at the province, and an old
 *  full-export slot without counties should be imported again. */
function detailNote({ full, quick, fullCounty = true }: Props['loaded']): string | null {
  // A list saved before the two eBird slots may hold the life list download in the full export's place.
  if (full && !fullCounty) return 'No regions (counties) in your eBird file yet: import “Download My Data” again to add them.'
  if (quick && !full) return 'Your life list download gives each bird’s state or province. Add the full “Download My Data” export to place them down to the region (county).'
  return null
}

const ROWS = [
  {
    slot: 'ebird-list' as const,
    kind: 'life-list' as const,
    title: 'eBird life list',
    blurb: 'instant, to the province',
    what: 'your eBird life list download',
    help: (
      <p>
        On eBird: My eBird, then your World life list total, then Download. It&apos;s instant, and places go down to the
        state or province.
      </p>
    ),
  },
  {
    slot: 'ebird' as const,
    kind: 'full-export' as const,
    title: 'MyEBirdData',
    blurb: 'full export, adds counties',
    what: 'your eBird full export',
    help: (
      <p>
        On eBird: Download My Data (under My eBird). eBird emails you MyEBirdData.csv; it places birds down to the
        region (county).
      </p>
    ),
  },
]

/**
 * The two eBird files, one row each (Settings > Your list): the file's name, rows and date, or "Not added", with Add
 * (or Replace) and Remove inline. Every Add and Replace opens the same picker, and the file lands in the row of its
 * kind (read from its header); the rows take a dropped file too (they highlight while one is dragged over). The
 * import itself runs above the routes, so it survives navigation.
 */
export function EbirdDrop({ job, onFile, disabled, loaded, connected = [], onRemove, saved }: Props) {
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { busy, rows, error } = job

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
  const note = detailNote(loaded)
  const off = disabled || busy
  const pick = () => input.current?.click()

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
        const on = connected.find((c) => c.slot === r.slot)
        const line = on ? ebirdLine(r.kind, on.details) : null
        return (
          <SourceRow
            key={r.slot}
            testId={on ? `source-${r.slot}` : undefined}
            title={r.title}
            kind={r.blurb}
            meta={line ? sourceMeta(line) : 'Not added'}
            help={{ label: 'How do I get this file?', body: r.help }}
            what={on ? r.what : undefined}
            disabled={off}
            onRemove={() => onRemove?.(r.slot)}
            extra={saved && <NotCounted saved={saved} slots={[r.slot]} />}
            actions={
              on ? (
                <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={pick} aria-label={`Replace ${line!.name}`}>
                  Replace
                </button>
              ) : (
                <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={pick} aria-label={`Add ${r.title}`}>
                  Add
                </button>
              )
            }
          />
        )
      })}
      <p className="eb-status eb-src-status" role="status">
        {busy ? (rows ? `Reading your file… ${rows.toLocaleString('en-US')} rows` : 'Reading your file…') : ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{error}</p>}
      {note && <p className="eb-note eb-src-status" data-testid="ebird-detail">{note}</p>}
    </div>
  )
}
