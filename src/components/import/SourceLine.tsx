'use client'
import { CaretDown } from '@phosphor-icons/react'
import { useId, useRef, useState, type ReactNode } from 'react'
import type { EbirdDetails, InatDetails } from '@/lib/list/storage'

/** "6 Nov 2026" (day, short month, year), or null for a missing or unreadable time. */
export function shortDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const n = (x: number) => x.toLocaleString('en-US')
const FALLBACK: Record<EbirdDetails['kind'], string> = { 'full-export': 'eBird full export', 'life-list': 'eBird life list download' }

/** One eBird file's state: its name, then "4,212 rows · imported 6 Nov 2026" (shown as one line). Unknown details say so. */
export function ebirdLine(kind: EbirdDetails['kind'], d: EbirdDetails | undefined): { name: string; meta: string } {
  if (!d) return { name: FALLBACK[kind], meta: 'details unknown' }
  const date = shortDate(d.at)
  const name = d.file || FALLBACK[kind]
  const parts = [d.rows !== undefined ? `${n(d.rows)} ${d.rows === 1 ? 'row' : 'rows'}` : null, date ? `imported ${date}` : null]
  return { name, meta: parts.filter(Boolean).join(' · ') }
}

/** The iNaturalist account's state: the username, then "576 observations · updated 6 Nov 2026". */
export function inatLine(d: InatDetails | undefined): { name: string; meta: string } {
  if (!d?.user) return { name: 'iNaturalist account', meta: 'username unknown: enter it again to refresh' }
  const date = shortDate(d.at)
  const parts = [d.observations !== undefined ? `${n(d.observations)} ${d.observations === 1 ? 'observation' : 'observations'}` : null, date ? `updated ${date}` : null]
  return { name: d.user, meta: parts.filter(Boolean).join(' · ') || 'connected' }
}

type Props = {
  title: string
  /** A few muted words after the title: what this source is ("full export, adds counties"). */
  kind?: string
  /** The state line: what is connected, or "Not added". */
  meta: ReactNode
  /** The source's actions (Add, Replace, Refresh, Change, Cancel), before Remove. */
  actions?: ReactNode
  /** Connected: what Remove takes away, for its one question ("your eBird full export"). No Remove without it. */
  what?: string
  onRemove?: () => void
  disabled?: boolean
  /** The how-to behind a small disclosure ("How do I get this file?"). */
  help?: { label: string; body: ReactNode }
  /** Under the row: a form, a status line, a panel. */
  children?: ReactNode
  /** Extra lines in the text column, under the state line (NotCounted). */
  extra?: ReactNode
  testId?: string
}

/**
 * One source on Settings > Your list, one line: its title and state on the left, its actions inline on the right
 * (under it on phones). The how-to folds behind a small disclosure; Remove asks once, inline, before taking the
 * source's birds away. Edits always stay.
 */
/** The state line of a connected source: the file or username as written, then the mono details. */
export function sourceMeta({ name, meta }: { name: string; meta: string }): ReactNode {
  return <><span className="eb-src-id">{name}</span>{meta ? ` · ${meta}` : ''}</>
}

export function SourceRow({ title, kind, meta, actions, what, onRemove, disabled, help, children, extra, testId }: Props) {
  const id = useId()
  const [asking, setAsking] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const removeBtn = useRef<HTMLButtonElement>(null)
  return (
    <div className="eb-src" data-testid={testId}>
      <div className="eb-src-main">
        <div className="eb-src-text">
          <h3 className="eb-src-title">
            {title}
            {kind && <span className="eb-src-kind">{kind}</span>}
          </h3>
          <p className="eb-mono eb-src-meta">{meta}</p>
          {extra}
        </div>
        <div className="eb-src-acts">
          {help && (
            <button type="button" className="eb-textbtn eb-src-how" aria-expanded={helpOpen} aria-controls={`${id}-help`} onClick={() => setHelpOpen((o) => !o)}>
              {help.label}
              <CaretDown aria-hidden="true" focusable="false" weight="bold" />
            </button>
          )}
          {actions}
          {what && (
            <button ref={removeBtn} type="button" className="eb-btn eb-btn-quiet eb-btn-danger eb-btn-sm" disabled={disabled} aria-expanded={asking} onClick={() => setAsking((a) => !a)}>
              Remove
            </button>
          )}
        </div>
      </div>
      {help && (
        <div id={`${id}-help`} className="eb-src-help eb-note" hidden={!helpOpen}>
          {help.body}
        </div>
      )}
      {what && asking && (
        <div className="eb-confirm eb-src-confirm" role="group" aria-label={`Remove ${what}`}>
          <p>Remove {what}? Its birds leave your collage unless another source has them. Your edits stay.</p>
          <div className="eb-row">
            <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setAsking(false); onRemove?.() }}>Yes, remove it</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={() => { setAsking(false); removeBtn.current?.focus() }}>Keep it</button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
