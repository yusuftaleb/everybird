'use client'
import { useRef, useState, type ReactNode } from 'react'
import type { EbirdDetails, InatDetails } from '@/lib/list/storage'

/** "6 Nov 2026" (day, short month, year), or null for a missing or unreadable time. */
export function shortDate(iso: string | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const n = (x: number) => x.toLocaleString('en-US')
const KIND: Record<EbirdDetails['kind'], string> = { 'full-export': 'Full export', 'life-list': 'Life list download' }

/** One eBird file's line: its name, then "Full export · 4,212 rows · imported 6 Nov 2026". Unknown details say so. */
export function ebirdLine(kind: EbirdDetails['kind'], d: EbirdDetails | undefined): { name: string; meta: string } {
  if (!d) return { name: kind === 'full-export' ? 'eBird full export' : 'eBird life list download', meta: `${KIND[kind]} · details unknown` }
  const date = shortDate(d.at)
  const parts = [KIND[kind], d.rows !== undefined ? `${n(d.rows)} ${d.rows === 1 ? 'row' : 'rows'}` : null, date ? `imported ${date}` : null]
  return { name: d.file || (kind === 'full-export' ? 'eBird full export' : 'eBird life list download'), meta: parts.filter(Boolean).join(' · ') }
}

/** The iNaturalist account's line: "sam_birds", then "576 observations · updated 6 Nov 2026". */
export function inatLine(d: InatDetails | undefined): { name: string; meta: string } {
  if (!d?.user) return { name: 'iNaturalist account', meta: 'Details unknown: enter your username to refresh' }
  const date = shortDate(d.at)
  const parts = [d.observations !== undefined ? `${n(d.observations)} ${d.observations === 1 ? 'observation' : 'observations'}` : null, date ? `updated ${date}` : null]
  return { name: d.user, meta: parts.filter(Boolean).join(' · ') || 'Connected' }
}

type Props = {
  name: string
  meta: string
  /** What Remove takes away, for its one question ("your eBird full export"). */
  what: string
  /** The source's other actions (Replace, Refresh or Cancel), before Remove. */
  actions?: ReactNode
  onRemove: () => void
  disabled?: boolean
  testId?: string
}

/**
 * A connected source on "Your sources": what it is and when it came in, its actions, and Remove, which asks once
 * (inline, like Forget my list) before taking the source's birds away. Edits always stay.
 */
export function SourceLine({ name, meta, what, actions, onRemove, disabled, testId }: Props) {
  const [asking, setAsking] = useState(false)
  const removeBtn = useRef<HTMLButtonElement>(null)
  return (
    <div className="eb-source" data-testid={testId}>
      <div className="eb-source-main">
        <div className="eb-source-text">
          <p className="eb-source-name">{name}</p>
          <p className="eb-mono eb-source-meta">{meta}</p>
        </div>
        <div className="eb-source-acts">
          {actions}
          <button ref={removeBtn} type="button" className="eb-btn eb-btn-quiet eb-btn-danger eb-btn-sm" disabled={disabled} aria-expanded={asking} onClick={() => setAsking((a) => !a)}>
            Remove
          </button>
        </div>
      </div>
      {asking && (
        <div className="eb-confirm" role="group" aria-label={`Remove ${what}`}>
          <p>Remove {what}? Its birds leave your collage unless another source has them. Your edits stay.</p>
          <div className="eb-row">
            <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setAsking(false); onRemove() }}>Yes, remove it</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={() => { setAsking(false); removeBtn.current?.focus() }}>Keep it</button>
          </div>
        </div>
      )}
    </div>
  )
}
