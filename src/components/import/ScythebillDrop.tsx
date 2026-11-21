'use client'
import { useId, useRef } from 'react'
import { fileMessage, type FileJob } from '@/components/app/use-import-jobs'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { countParts, type RowCount } from '@/lib/list/source-counts'
import type { Saved, ScythebillDetails } from '@/lib/list/storage'
import { FileDropzone, useFileDrop } from './FileDropzone'
import { useAddPanel } from './add-panel'
import { notCounted } from './NotCounted'
import { HowTo, scythebillLine, SourceRow } from './SourceLine'

type Props = {
  job: FileJob
  onFile: (file: File) => void
  disabled?: boolean
  connected?: boolean
  details?: ScythebillDetails
  onRemove?: () => void
  saved?: Saved
  counts?: RowCount
}

export function ScythebillDrop({
  job,
  onFile,
  disabled,
  connected = false,
  details,
  onRemove,
  saved,
  counts,
}: Props) {
  const id = useId()
  const { t } = useI18n()
  const sb = t.import.scythebill
  // The open Add panel, shared by every source (one at a time; ImportPanel folds it when a file lands).
  const [panel, setPanel] = useAddPanel()
  const open = panel === 'scythebill'
  const input = useRef<HTMLInputElement>(null)
  const { busy, error } = job

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }
  const { over, handlers } = useFileDrop(read, disabled)
  const off = disabled || busy
  const pick = () => input.current?.click()
  const line = connected ? scythebillLine(details, t) : null
  // A read in progress keeps the panel open; so does its error, until another source's panel is opened.
  const showPanel = open || busy || (!!error && panel === null)

  return (
    <div className="eb-filedrop" data-testid="scythebill-drop" data-over={over || undefined} data-busy={busy || undefined} {...handlers}>
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".csv,.txt,text/csv,text/plain"
        aria-label={sb.input}
        data-testid="scythebill-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      <SourceRow
        testId={connected ? 'source-scythebill' : undefined}
        title={sb.title}
        name={line?.name}
        parts={line ? line.parts : [t.import.notAdded]}
        counts={connected && counts ? countParts(counts, t) : undefined}
        skipped={connected && saved ? notCounted(saved, ['scythebill'], t) ?? undefined : undefined}
        what={connected ? sb.what : undefined}
        disabled={off}
        onRemove={onRemove}
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
              aria-label={fmt(t.import.addLabel, { title: sb.title })}
              onClick={() => setPanel('scythebill', !open)}
            >
              {t.import.add}
            </button>
          )
        }
      >
        {!connected && (
          <div id={`${id}-panel`} className="eb-src-panel" hidden={!showPanel} role="group" aria-label={fmt(t.import.addLabel, { title: sb.title })}>
            <p className="eb-note">{sb.guide}</p>
            <FileDropzone label={sb.choose} disabled={off} onPick={pick} />
            <HowTo label={sb.howTo}><p>{sb.help}</p></HowTo>
          </div>
        )}
      </SourceRow>
      {/* A read's progress is the import toast's (ImportToast), never in the grid. */}
      {error && <p className="eb-error eb-src-status" role="alert">{fileMessage(error, t)}</p>}
    </div>
  )
}
