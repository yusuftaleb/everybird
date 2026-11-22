'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { fileMessage, type FileJob, type SheetReview } from '@/components/app/use-import-jobs'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { countParts, type RowCount } from '@/lib/list/source-counts'
import type { Saved, SheetDetails } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { FileDropzone, useFileDrop } from './FileDropzone'
import { useAddPanel } from './add-panel'
import { notCounted } from './NotCounted'
import { sheetLine, SourceRow } from './SourceLine'

type Props = {
  job: FileJob
  onFile: (file: File) => void
  onPaste: (text: string) => void
  review: SheetReview | null
  onConfirm: () => void
  onCancel: () => void
  species: SpeciesIndex
  disabled?: boolean
  connected?: boolean
  details?: SheetDetails
  onRemove?: () => void
  saved?: Saved
  counts?: RowCount
  landedAt?: number
}

const REVIEW_CAP = 12

export function SheetDrop({
  job,
  onFile,
  onPaste,
  review,
  onConfirm,
  onCancel,
  species,
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
  const s = t.import.sheet
  // The open Add panel, shared by every source (one at a time; ImportPanel folds it when a file lands).
  const [panel, setPanel] = useAddPanel()
  const open = panel === 'sheet'
  const setOpen = (on: boolean) => setPanel('sheet', on)
  const [paste, setPaste] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const reviewBox = useRef<HTMLDivElement>(null)
  const pasteBox = useRef<HTMLTextAreaElement>(null)
  // The review replaces the panel the birder was in (its paste button or picker is gone): focus moves to the review,
  // named by its summary, so it is announced; Cancel brings them back to the paste box.
  useEffect(() => {
    if (review) reviewBox.current?.focus()
  }, [review])
  const { busy, error } = job

  const marker = `${connected ? '1' : '0'}|${landedAt ?? ''}`
  const [lastMarker, setLastMarker] = useState(marker)
  if (lastMarker !== marker) {
    setLastMarker(marker)
    setPaste('')
  }

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }
  const { over, handlers } = useFileDrop(read, disabled)
  const off = disabled || busy
  const pick = () => input.current?.click()
  const line = connected ? sheetLine(details, t) : null
  // A read or a review in progress keeps the panel open; so does its error, until another source's panel is opened.
  const showPanel = open || !!review || busy || (!!error && panel === null)

  const unmatchedRows = review ? review.result.unmatched.filter((u) => u.reason === 'no-match') : []
  const shownUnmatched = unmatchedRows.slice(0, REVIEW_CAP)
  const hiddenUnmatched = unmatchedRows.length - shownUnmatched.length

  const summaryParts = review
    ? [
        plural(s.review.matched, review.matched, { n: formatInt(review.matched, t.num) }),
        ...(review.duplicates > 0 ? [plural(s.review.duplicates, review.duplicates, { n: formatInt(review.duplicates, t.num) })] : []),
        ...(review.notSpeciesCount > 0 ? [plural(s.review.notSpecies, review.notSpeciesCount, { n: formatInt(review.notSpeciesCount, t.num) })] : []),
        ...(review.unmatchedCount > 0 ? [plural(s.review.unmatched, review.unmatchedCount, { n: formatInt(review.unmatchedCount, t.num) })] : []),
        ...(review.noDate > 0 ? [plural(s.review.noDate, review.noDate, { n: formatInt(review.noDate, t.num) })] : []),
      ]
    : []

  const confirmLabel = review
    ? review.matched > 0
      ? plural(connected ? s.review.replace : s.review.add, review.matched, { n: formatInt(review.matched, t.num) })
      : s.review.addEmpty
    : ''

  return (
    <div className="eb-filedrop" data-testid="sheet-drop" data-over={over || undefined} data-busy={busy || undefined} {...handlers}>
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".xlsx,.csv,.tsv,.txt,.xls,.numbers,.ods,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        aria-label={s.input}
        data-testid="sheet-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      <SourceRow
        testId={connected ? 'source-sheet' : undefined}
        title={s.title}
        name={line?.name}
        parts={line ? line.parts : [t.import.notAdded]}
        counts={connected && counts ? countParts(counts, t) : undefined}
        skipped={connected && saved ? notCounted(saved, ['sheet'], t) ?? undefined : undefined}
        what={connected ? s.what : undefined}
        disabled={off}
        onRemove={onRemove}
        primary={
          connected ? (
            <button
              type="button"
              className="eb-btn eb-btn-quiet eb-btn-sm"
              disabled={off}
              aria-expanded={showPanel}
              aria-controls={`${id}-panel`}
              aria-label={fmt(t.import.replaceLabel, { name: line!.name })}
              onClick={() => setOpen(!open)}
            >
              {t.import.replace}
            </button>
          ) : (
            <button
              type="button"
              className="eb-btn eb-btn-quiet eb-btn-sm"
              disabled={off}
              aria-expanded={showPanel}
              aria-controls={`${id}-panel`}
              aria-label={fmt(t.import.addLabel, { title: s.title })}
              onClick={() => setOpen(!open)}
            >
              {t.import.add}
            </button>
          )
        }
      >
        <div id={`${id}-panel`} className="eb-src-panel" hidden={!showPanel} role="group" aria-label={fmt(t.import.addLabel, { title: s.title })}>
          {review ? (
            <div ref={reviewBox} className="eb-sheet-review" data-testid="sheet-review" role="group" tabIndex={-1} aria-labelledby={`${id}-summary`}>
              <p id={`${id}-summary`} className="eb-sheet-summary">{summaryParts.join(' · ')}</p>
              {shownUnmatched.length > 0 && (
                <>
                  <ul className="eb-note eb-sheet-unmatched">
                    {shownUnmatched.map((u, idx) => {
                      const raw = u.com ?? u.sci ?? ''
                      const sug = u.suggestion ? species.byCode.get(u.suggestion) : undefined
                      return (
                        <li key={`${u.row}-${idx}`}>
                          {sug ? fmt(s.review.suggestion, { name: raw, suggestion: displayName(sug) }) : raw}
                        </li>
                      )
                    })}
                    {hiddenUnmatched > 0 && <li>{fmt(s.review.more, { n: formatInt(hiddenUnmatched, t.num) })}</li>}
                  </ul>
                  <p className="eb-note">{s.review.note}</p>
                </>
              )}
              <div className="eb-row">
                <button type="button" className="eb-btn eb-btn-sm" data-testid="sheet-confirm" onClick={onConfirm}>
                  {confirmLabel}
                </button>
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet eb-btn-sm"
                  data-testid="sheet-cancel"
                  onClick={() => {
                    onCancel()
                    setOpen(true)
                    requestAnimationFrame(() => pasteBox.current?.focus())
                  }}
                >
                  {s.review.cancel}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="eb-note">{s.guide}</p>
              <FileDropzone label={s.choose} disabled={off} onPick={pick} />
              <div className="eb-sheet-pastebox">
                <label htmlFor={`${id}-paste`} className="eb-sr">{s.pasteLabel}</label>
                <textarea
                  ref={pasteBox}
                  id={`${id}-paste`}
                  className="eb-input eb-sheet-paste"
                  rows={4}
                  placeholder={s.pastePlaceholder}
                  disabled={off}
                  value={paste}
                  onChange={(e) => setPaste(e.target.value)}
                  data-testid="sheet-paste"
                />
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet eb-btn-sm"
                  disabled={off || !paste.trim()}
                  onClick={() => onPaste(paste)}
                  data-testid="sheet-paste-submit"
                >
                  {s.checkPaste}
                </button>
              </div>
            </>
          )}
        </div>
      </SourceRow>
      {/* A read's progress is the import toast's (ImportToast), never in the grid. */}
      {error && <p className="eb-error eb-src-status" role="alert" data-testid="sheet-error">{fileMessage(error, t)}</p>}
    </div>
  )
}
