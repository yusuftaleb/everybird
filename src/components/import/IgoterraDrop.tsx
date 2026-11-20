'use client'
import { useId, useRef, useState } from 'react'
import { fileMessage, type FileJob } from '@/components/app/use-import-jobs'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { countParts, type RowCount } from '@/lib/list/source-counts'
import type { Saved, IgoterraDetails } from '@/lib/list/storage'
import { FileDropzone, useFileDrop } from './FileDropzone'
import { notCounted } from './NotCounted'
import { HowTo, igoterraLine, SourceRow } from './SourceLine'

type Props = {
  job: FileJob
  onFile: (file: File) => void
  disabled?: boolean
  connected?: boolean
  details?: IgoterraDetails
  onRemove?: () => void
  saved?: Saved
  counts?: RowCount
  landedAt?: number
}

export function IgoterraDrop({
  job,
  onFile,
  disabled,
  connected = false,
  details,
  onRemove,
  saved,
  counts,
  landedAt,
}: Props) {
  const id = useId()
  const { t } = useI18n()
  const ig = t.import.igoterra
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const { busy, rows, error } = job

  const marker = `${connected ? '1' : '0'}|${landedAt ?? ''}`
  const [lastMarker, setLastMarker] = useState(marker)
  if (lastMarker !== marker) {
    setLastMarker(marker)
    setOpen(false)
  }

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }
  const { over, handlers } = useFileDrop(read, disabled)
  const off = disabled || busy
  const pick = () => input.current?.click()
  const line = connected ? igoterraLine(details, t) : null
  const showPanel = open || busy || !!error

  return (
    <div className="eb-filedrop" data-testid="igoterra-drop" data-over={over || undefined} data-busy={busy || undefined} {...handlers}>
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        aria-label={ig.input}
        data-testid="igoterra-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      <SourceRow
        testId={connected ? 'source-igoterra' : undefined}
        title={ig.title}
        name={line?.name}
        parts={line ? line.parts : [t.import.notAdded]}
        counts={connected && counts ? countParts(counts, t) : undefined}
        skipped={connected && saved ? notCounted(saved, ['igoterra'], t) ?? undefined : undefined}
        what={connected ? ig.what : undefined}
        disabled={off}
        onRemove={onRemove}
        menu={connected ? [{ label: t.import.replace, onSelect: pick }] : undefined}
        primary={
          connected ? (
            <button
              type="button"
              className="eb-btn eb-btn-quiet eb-btn-sm"
              disabled={off}
              aria-label={fmt(t.import.replaceLabel, { name: line!.name })}
              onClick={pick}
            >
              {t.import.replace}
            </button>
          ) : (
            <button
              type="button"
              className="eb-btn eb-btn-quiet eb-btn-sm"
              disabled={off}
              aria-expanded={open}
              aria-controls={`${id}-panel`}
              aria-label={fmt(t.import.addLabel, { title: ig.title })}
              onClick={() => setOpen((v) => !v)}
            >
              {t.import.add}
            </button>
          )
        }
      >
        {!connected && (
          <div id={`${id}-panel`} className="eb-src-panel" hidden={!showPanel} role="group" aria-label={fmt(t.import.addLabel, { title: ig.title })}>
            <p className="eb-note">{ig.guide}</p>
            <FileDropzone label={ig.choose} disabled={off} onPick={pick} />
            <HowTo label={ig.howTo}><p>{ig.help}</p></HowTo>
          </div>
        )}
      </SourceRow>
      <p className="eb-status eb-src-status" role="status">
        {busy ? (rows ? plural(t.import.ebird.readingRows, rows, { n: formatInt(rows, t.num) }) : t.import.ebird.reading) : ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{fileMessage(error, t)}</p>}
    </div>
  )
}
