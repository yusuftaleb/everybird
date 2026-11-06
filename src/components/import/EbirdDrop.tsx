'use client'
import { useId, useRef, useState, type DragEvent } from 'react'
import type { EbirdJob } from '@/components/app/use-import-jobs'
import type { EbirdDetails } from '@/lib/list/storage'
import { ebirdLine, SourceLine } from './SourceLine'

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
}

/** What each eBird file brings, said plainly: the life list download stops at the province, the full export adds the county. */
function detailNote({ full, quick, fullCounty = true }: Props['loaded']): string | null {
  // A list saved before the two eBird slots may hold the life list download in the full export's place.
  if (full && !fullCounty) return 'No regions (counties) in your eBird file yet: import “Download My Data” again to add them.'
  if (quick && !full) return 'Your life list download gives each bird’s state or province. Add the full “Download My Data” export to place them down to the region (county).'
  if (full && quick) return 'Both eBird files are in. Where they agree on the first sighting, the region (county) from the full export is kept.'
  if (full) return 'Your full eBird export places birds down to the region (county). A new export replaces it; the life list download is kept separately.'
  return null
}

/**
 * eBird file: the files already in (each with Replace and Remove), then the drop box, whose "Choose your eBird file"
 * button fills its width; the whole row takes a dropped file too (the box highlights while a file is dragged over).
 * Replace opens the same picker: a file lands in the slot of its kind. The two ways to get the file sit behind a
 * disclosure. The import itself runs above the routes, so it survives navigation.
 */
export function EbirdDrop({ job, onFile, disabled, loaded, connected = [], onRemove }: Props) {
  const id = useId()
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
  return (
    <div
      className="eb-way-body eb-filedrop"
      data-testid="ebird-drop"
      data-over={over || undefined}
      data-busy={busy || undefined}
      onDragOver={(e) => { e.preventDefault(); setOver(true) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) }}
      onDrop={onDrop}
    >
      {connected.length > 0 && (
        <div className="eb-sources">
          {connected.map(({ slot, details }) => {
            const kind = slot === 'ebird' ? 'full-export' : 'life-list'
            const line = ebirdLine(kind, details)
            return (
              <SourceLine
                key={slot}
                testId={`source-${slot}`}
                name={line.name}
                meta={line.meta}
                what={slot === 'ebird' ? 'your eBird full export' : 'your eBird life list download'}
                disabled={off}
                onRemove={() => onRemove?.(slot)}
                actions={
                  <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={() => input.current?.click()} aria-label={`Replace ${line.name}`}>
                    Replace
                  </button>
                }
              />
            )
          })}
        </div>
      )}
      <div className="eb-dropzone">
        <label htmlFor={id} className="eb-btn eb-btn-quiet eb-dropzone-btn" data-disabled={off || undefined}>Choose your eBird file</label>
        <input
          ref={input}
          id={id}
          className="eb-sr"
          type="file"
          accept=".csv,text/csv"
          data-testid="ebird-input"
          disabled={disabled || busy}
          onChange={(e) => read(e.target.files?.[0])}
        />
        <p className="eb-note eb-drop-hint">or drop it here</p>
      </div>
      <p className="eb-status" role="status">
        {busy ? (rows ? `Reading your file… ${rows.toLocaleString('en-US')} rows` : 'Reading your file…') : ''}
      </p>
      {error && <p className="eb-error" role="alert">{error}</p>}
      <details className="eb-filehelp">
        <summary>How to get your eBird file</summary>
        <ul>
          <li><strong>Life list download</strong> (instant): My eBird, then your World life list total, then Download. Places go down to the state or province.</li>
          <li><strong>Full data export</strong> (eBird emails it): eBird, then Download My Data. It adds counties.</li>
        </ul>
      </details>
      {note && <p className="eb-note" data-testid="ebird-detail">{note}</p>}
      {(loaded.full > 0 || loaded.quick > 0) && <p className="eb-note">A new file of the same kind replaces the last one; the other kind is kept beside it. Your edits stay.</p>}
    </div>
  )
}
