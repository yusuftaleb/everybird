'use client'
import { CaretDown } from '@phosphor-icons/react'
import { useId, useRef, useState, type ReactNode } from 'react'
import type { EbirdDetails, InatDetails } from '@/lib/list/storage'
import { SourceMenu, type MenuItem, type SourceMenuHandle } from './SourceMenu'

/** "6 Nov" this year, "6 Nov 2025" before it, or null for a missing or unreadable time. */
export function shortDate(iso: string | undefined, now = new Date()): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })
}

const n = (x: number) => x.toLocaleString('en-US')
const FALLBACK: Record<EbirdDetails['kind'], string> = { 'full-export': 'eBird full export', 'life-list': 'eBird life list download' }

/** A connected source's file or username (after the title) and the status parts after its counts and skipped entries
 *  ("Imported 6 Nov"). The counts ("185 species · 12 only here", source-counts.ts) lead the line (SourceRow). */
export type SourceState = { name: string; parts: string[] }

/** One eBird file: its name, then "Imported 6 Nov". Unknown details say so. */
export function ebirdLine(kind: EbirdDetails['kind'], d: EbirdDetails | undefined): SourceState {
  if (!d) return { name: FALLBACK[kind], parts: ['Details unknown'] }
  const date = shortDate(d.at)
  return { name: d.file || FALLBACK[kind], parts: date ? [`Imported ${date}`] : [] }
}

/** The iNaturalist account: the username, then "Updated 6 Nov". */
export function inatLine(d: InatDetails | undefined): SourceState {
  if (!d?.user) return { name: '', parts: ['Username unknown: enter it again to refresh'] }
  const date = shortDate(d.at)
  return { name: d.user, parts: date ? [`Updated ${date}`] : [] }
}

type Props = {
  title: string
  /** Connected: the file name or username, after the title (" · ebird_world_life_list.csv"). */
  name?: string
  /** The status line's parts, joined by " · " ("Not added", or "Updated 6 Nov"). */
  parts: string[]
  /** Connected: what the source brings, leading the line ("185 species", "12 only here"; source-counts.ts). */
  counts?: string[]
  /** Entries of this source that weren't counted: "· 10 skipped" after the counts (or the first part), with "why?"
   *  opening `body`. */
  skipped?: { n: number; body: ReactNode }
  /** The row's one button on the right (Add, Replace, Refresh, Tick birds). */
  primary: ReactNode
  /** Connected: the ⋯ menu's items before Remove. */
  menu?: MenuItem[]
  /** Connected: what Remove takes away, for its one question ("your eBird full export"). No Remove without it. */
  what?: string
  onRemove?: () => void
  disabled?: boolean
  /** Under the row: the Add panel, the tick list, a live status line. */
  children?: ReactNode
  testId?: string
}

/**
 * One source on Settings > Your list, two quiet lines and one button: the title (and, connected, its file or
 * username), a muted sentence-case status ("185 species · 12 only here · 10 skipped · Updated 6 Nov"), and the row's primary
 * button on the right; a connected source's line leads with its counts ("185 species · 12 only here") and adds a ⋯ menu (SourceMenu) holding its other actions and Remove. Remove asks
 * once, inline, before taking the source's birds away. Edits always stay. "why?" after the skipped count opens the
 * entries that weren't counted under the row.
 */
export function SourceRow({ title, name, parts, counts, skipped, primary, menu, what, onRemove, disabled, children, testId }: Props) {
  const id = useId()
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState(false)
  const menuBtn = useRef<SourceMenuHandle>(null)
  const items: MenuItem[] = [...(menu ?? []), ...(what ? [{ label: 'Remove', danger: true, keepFocus: true, onSelect: () => setAsking(true) }] : [])]
  const lead = counts ?? parts.slice(0, 1)
  const rest = counts ? parts : parts.slice(1)
  return (
    <div className="eb-src" data-testid={testId}>
      <div className="eb-src-main">
        <div className="eb-src-text">
          <h3 className="eb-src-title">
            {title}
            {name && <span className="eb-src-name"> · {name}</span>}
          </h3>
          <p className="eb-src-meta">
            {lead.map((p, i) => <span key={p}>{i > 0 && ' · '}<span className="eb-nowrap">{p}</span></span>)}
            {skipped && skipped.n > 0 && (
              <>
                {' · '}
                <span className="eb-nowrap">
                  {n(skipped.n)} skipped{' '}
                  <button type="button" className="eb-whybtn" aria-expanded={why} aria-controls={`${id}-why`} aria-label={`Why ${n(skipped.n)} skipped?`} onClick={() => setWhy((w) => !w)}>
                    why?
                  </button>
                </span>
              </>
            )}
            {rest.map((p) => <span key={p}>{' · '}<span className="eb-nowrap">{p}</span></span>)}
          </p>
        </div>
        <div className="eb-src-acts">
          {primary}
          {items.length > 0 && <SourceMenu ref={menuBtn} label={`More for ${title}`} items={items} disabled={disabled} />}
        </div>
      </div>
      {skipped && skipped.n > 0 && (
        <div id={`${id}-why`} className="eb-src-why" hidden={!why} data-testid="not-counted">
          {skipped.body}
        </div>
      )}
      {what && asking && (
        <div className="eb-confirm eb-src-confirm" role="group" aria-label={`Remove ${what}`}>
          <p>Remove {what}? Its birds leave your collage unless another source has them. Your edits stay.</p>
          <div className="eb-row">
            <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setAsking(false); onRemove?.() }}>Yes, remove it</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={() => { setAsking(false); menuBtn.current?.focus() }}>Keep it</button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}

/** Inside an Add panel: the how-to behind a small disclosure ("How do I get this file?"). */
export function HowTo({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  const [open, setOpen] = useState(false)
  return (
    <div className="eb-howto">
      <button type="button" className="eb-textbtn eb-src-how" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        {label}
        <CaretDown aria-hidden="true" focusable="false" weight="bold" />
      </button>
      <div id={id} className="eb-src-help eb-note" hidden={!open}>{children}</div>
    </div>
  )
}
