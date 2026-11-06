'use client'
import { FileArrowUp } from '@phosphor-icons/react'
import { useId, useRef, useState, type DragEvent } from 'react'
import type { EbirdJob } from '@/components/app/use-import-jobs'

type Props = {
  job: EbirdJob
  /** Reads the file (use-import-jobs.ts: kind detected from the header, parsed in a worker, imported into its slot). */
  onFile: (file: File) => void
  disabled?: boolean
  /** Species already imported from each eBird file: the full MyEBirdData export and the quick life list download. */
  loaded: { full: number; quick: number }
}

/** What each eBird file brings, said plainly: the quick download stops at the province, the full export adds the county. */
function detailNote({ full, quick }: Props['loaded']): string | null {
  if (quick && !full) return 'Your life list download gives each bird’s state or province. Add the full “Download My Data” export to place them down to the region (county).'
  if (full && quick) return 'Both eBird files are in. Where they agree on the first sighting, the region (county) from the full export is kept.'
  if (full) return 'Your full eBird export places birds down to the region (county). A new export replaces it; the life list download is kept separately.'
  return null
}

/** eBird file: a drop zone plus a file picker. The import itself runs above the routes, so it survives navigation. */
export function EbirdDrop({ job, onFile, disabled, loaded }: Props) {
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

  return (
    <div className="eb-way-body">
      <div
        className="eb-drop"
        data-testid="ebird-drop"
        data-over={over || undefined}
        data-busy={busy || undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        <FileArrowUp aria-hidden="true" focusable="false" className="eb-drop-icon" weight="light" />
        <p className="eb-drop-text">Drop your eBird file here</p>
        <label htmlFor={id} className="eb-btn eb-btn-quiet" data-disabled={disabled || busy || undefined}>Choose a file</label>
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
      </div>
      <p className="eb-status" role="status">
        {busy ? (rows ? `Reading your file… ${rows.toLocaleString('en-US')} rows` : 'Reading your file…') : ''}
      </p>
      {error && <p className="eb-error" role="alert">{error}</p>}
      <ol className="eb-howto">
        <li><span className="eb-mono">Quick (state or province only):</span> My eBird → click your World life list total → Download</li>
        <li><span className="eb-mono">Full (adds the region, or county, and photo marks):</span> eBird → Download My Data (eBird emails it)</li>
      </ol>
      {note && <p className="eb-note" data-testid="ebird-detail">{note}</p>}
      {(loaded.full > 0 || loaded.quick > 0) && <p className="eb-note">A new file of the same kind replaces the last one. Your edits stay.</p>}
    </div>
  )
}
