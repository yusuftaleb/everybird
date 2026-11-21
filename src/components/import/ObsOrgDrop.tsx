'use client'
import { useId, useRef } from 'react'
import { fileMessage, type FileJob } from '@/components/app/use-import-jobs'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { OBSORG_PLACES } from '@/lib/list/filter-summary'
import { countParts, type SourceCounts } from '@/lib/list/source-counts'
import type { ObsOrgDetails, Saved } from '@/lib/list/storage'
import { FileDropzone, useFileDrop } from './FileDropzone'
import { notCounted } from './NotCounted'
import { HowTo, obsorgLine, SourceRow } from './SourceLine'
import { useAnchorTarget } from './use-anchor-target'
import { useAddPanel } from './add-panel'

/** An observation.org file already on the list: its slot ('obsorg-list' Observed species, 'obsorg' the observations). */
export type ObsOrgConnected = { slot: 'obsorg' | 'obsorg-list'; details?: ObsOrgDetails }

type Props = {
  job: FileJob
  /** Reads the file (use-import-jobs.ts: kind detected from the header, parsed in a worker, imported into its slot). */
  onFile: (file: File) => void
  disabled?: boolean
  /** The observation.org files on the list, each with Replace and, in its ⋯ menu, Remove. */
  connected?: ObsOrgConnected[]
  onRemove?: (slot: ObsOrgConnected['slot']) => void
  /** For each row's skipped entries. */
  saved?: Saved
  /** Each row's species and "only here" (source-counts.ts). */
  counts?: SourceCounts
}

type Row = { slot: ObsOrgConnected['slot']; kind: ObsOrgDetails['kind'] }

const ROWS: Row[] = [
  { slot: 'obsorg-list', kind: 'species-list' },
  { slot: 'obsorg', kind: 'observations' },
]

/**
 * observation.org's two exports, one quiet row each (Settings > Your list), built as EbirdDrop's rows: the life list
 * (Observed species: first dates, no places), then the observations (every bird observation, placed by country and
 * province). Not added: "Add" opens the row's panel (what the file brings, the drop zone, "How do I get this file?").
 * Added: the file's name, its species and "only here", skipped entries and date, with Replace and a ⋯ menu (Replace,
 * Remove). Any picker or drop reads any supported file, and it lands in the row of its kind. With only the life list,
 * a note under the rows says Places can't filter those birds; its inline link and arrival at /settings#add-obsorg
 * (the Places panel's line) open the observations' Add panel and focus its picker (observations on the list: its
 * Replace).
 */
export function ObsOrgDrop({ job, onFile, disabled, connected = [], onRemove, saved, counts }: Props) {
  const id = useId()
  const { t } = useI18n()
  const o = t.import.obsorg
  // The open Add panel, shared by every source (one at a time; ImportPanel folds it when a file lands).
  const [adding, setPanel] = useAddPanel()
  const input = useRef<HTMLInputElement>(null)
  const chooseObs = useRef<HTMLButtonElement>(null)
  const replaceObs = useRef<HTMLButtonElement>(null)
  const { busy, rows, error } = job

  const read = (file: File | undefined) => {
    if (!file || busy) return
    onFile(file)
    if (input.current) input.current.value = ''
  }
  const { over, handlers } = useFileDrop(read, disabled)
  const off = disabled || busy
  const pick = () => input.current?.click()
  const listOn = connected.some((c) => c.slot === 'obsorg-list')
  const obsOn = connected.some((c) => c.slot === 'obsorg')
  const P = OBSORG_PLACES
  // The observations' Add panel, opened and its picker focused; with the observations on the list, their Replace.
  const toObs = useAnchorTarget({ anchor: P.anchor, off, connected: obsOn, open: () => setPanel('obsorg', true), picker: chooseObs, replace: replaceObs })

  return (
    <div className="eb-filedrop" data-testid="obsorg-drop" data-over={over || undefined} data-busy={busy || undefined} {...handlers}>
      <input
        ref={input}
        className="eb-sr"
        type="file"
        accept=".csv,text/csv"
        aria-label={o.input}
        data-testid="obsorg-input"
        tabIndex={-1}
        disabled={off}
        onChange={(e) => read(e.target.files?.[0])}
      />
      {ROWS.map((r) => {
        const copy = o.rows[r.slot]
        const c = connected.find((x) => x.slot === r.slot)
        const line = c ? obsorgLine(r.kind, c.details, t) : null
        const open = adding === r.slot
        return (
          <SourceRow
            key={r.slot}
            testId={c ? `source-${r.slot}` : undefined}
            title={copy.title}
            name={line?.name}
            parts={line ? line.parts : [t.import.notAdded]}
            counts={c && counts ? countParts(counts.rows[r.slot], t) : undefined}
            skipped={c && saved ? notCounted(saved, [r.slot], t) ?? undefined : undefined}
            what={c ? copy.what : undefined}
            disabled={off}
            onRemove={() => onRemove?.(r.slot)}
            menu={c ? [{ label: t.import.replace, onSelect: pick }] : undefined}
            primary={
              c ? (
                <button ref={r.slot === 'obsorg' ? replaceObs : undefined} type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={pick} aria-label={fmt(t.import.replaceLabel, { name: line!.name })}>
                  {t.import.replace}
                </button>
              ) : (
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet eb-btn-sm"
                  disabled={off}
                  aria-expanded={open}
                  aria-controls={`${id}-${r.slot}`}
                  aria-label={fmt(t.import.addLabel, { title: copy.title })}
                  onClick={() => setPanel(r.slot, !open)}
                >
                  {t.import.add}
                </button>
              )
            }
          >
            {!c && (
              <div id={`${id}-${r.slot}`} className="eb-src-panel" hidden={!open} role="group" aria-label={fmt(t.import.addLabel, { title: copy.title })}>
                <p className="eb-note">{copy.guide}</p>
                <FileDropzone label={o.choose} disabled={off} onPick={pick} buttonRef={r.slot === 'obsorg' ? chooseObs : undefined} />
                <HowTo label={o.howTo}><p>{copy.help}</p></HowTo>
              </div>
            )}
          </SourceRow>
        )
      })}
      {listOn && !obsOn && (
        <p className="eb-note eb-src-status eb-lifer-note" data-testid="places-obsorg-note">
          {rich(o.note, {
            link: (chunk) => (
              <a
                href={`#${P.anchor}`}
                data-testid="places-obsorg-add"
                aria-controls={`${id}-obsorg`}
                onClick={(e) => {
                  e.preventDefault()
                  // During a read the request is held until it ends, and taken up only while the address names it.
                  if (off) history.replaceState(history.state, '', `#${P.anchor}`)
                  toObs(false)
                }}
              >
                {chunk}
              </a>
            ),
          })}
        </p>
      )}
      <p className="eb-status eb-src-status" role="status">
        {busy ? (rows ? plural(t.import.ebird.readingRows, rows, { n: formatInt(rows, t.num) }) : t.import.ebird.reading) : ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{fileMessage(error, t)}</p>}
    </div>
  )
}
