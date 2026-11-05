'use client'
import { FileArrowUp } from '@phosphor-icons/react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { detectFile } from '@/lib/import/detect'
import { parseInWorker } from '@/lib/import/parse-client'
import type { ImportResult } from '@/lib/list/model'

type Props = { onImport: (r: ImportResult) => void; disabled?: boolean; replaces?: boolean }

const HEAD_BYTES = 64 * 1024

/** The header line of a file (only the first 64 KB are read here; the worker reads the rest). */
async function headerLine(file: File): Promise<string> {
  const blob = file.slice(0, HEAD_BYTES)
  const text = typeof blob.text === 'function'
    ? await blob.text()
    : await new Promise<string>((done, fail) => {
        const r = new FileReader()
        r.onload = () => done(String(r.result))
        r.onerror = () => fail(r.error)
        r.readAsText(blob)
      })
  return text.split(/\r?\n/, 1)[0] ?? ''
}

/** eBird file: a drop zone plus a file picker. The kind is detected from the header; parsing runs in a worker. */
export function EbirdDrop({ onImport, disabled, replaces }: Props) {
  const id = useId()
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const read = async (file: File | undefined) => {
    if (!file || busy) return
    setError(null)
    setRows(0)
    let kind
    try {
      kind = detectFile(await headerLine(file))
    } catch {
      kind = 'unknown' as const
    }
    if (kind === 'unknown') {
      setError("Couldn't read this file. Use eBird's life list download or MyEBirdData.csv.")
      return
    }
    setBusy(true)
    try {
      onImport(await parseInWorker(kind, file, setRows))
    } catch {
      setError("Couldn't read this file. It may be damaged or not an eBird export.")
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    if (!disabled) void read(e.dataTransfer?.files?.[0])
  }

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
          onChange={(e) => void read(e.target.files?.[0])}
        />
      </div>
      <p className="eb-status" role="status">
        {busy ? (rows ? `Reading your file… ${rows.toLocaleString('en-US')} rows` : 'Reading your file…') : ''}
      </p>
      {error && <p className="eb-error" role="alert">{error}</p>}
      <ol className="eb-howto">
        <li><span className="eb-mono">Quick:</span> My eBird → click your World life list total → Download</li>
        <li><span className="eb-mono">Full (adds regions and photo marks):</span> eBird → Download My Data (eBird emails it)</li>
      </ol>
      {replaces && <p className="eb-note">A new eBird file replaces the last one. Your edits stay.</p>}
    </div>
  )
}
