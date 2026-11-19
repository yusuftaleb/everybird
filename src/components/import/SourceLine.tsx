'use client'
import { CaretDown } from '@phosphor-icons/react'
import { useId, useRef, useState, type ReactNode } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt, shortDay } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import type { EbirdDetails, InatDetails, ObsOrgDetails, ScythebillDetails, SheetDetails } from '@/lib/list/storage'
import { obsorgNotCounted } from './obsorg-copy'
import { SourceMenu, type MenuItem, type SourceMenuHandle } from './SourceMenu'

/** A file's name when it wasn't kept ("eBird full export"). */
const fallback = (kind: EbirdDetails['kind'], t: Ui) => (kind === 'full-export' ? t.import.ebird.fullFile : t.import.ebird.listFile)

/** A connected source's file or username (after the title) and the status parts after its counts and skipped entries
 *  ("Imported 6 Nov"). The counts ("185 species · 12 only here", source-counts.ts) lead the line (SourceRow). */
export type SourceState = { name: string; parts: string[] }

/** One eBird file: its name, then "Imported 6 Nov" (shortDay: no year this year). Unknown details say so. */
export function ebirdLine(kind: EbirdDetails['kind'], d: EbirdDetails | undefined, t: Ui, now?: Date): SourceState {
  if (!d) return { name: fallback(kind, t), parts: [t.import.detailsUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  return { name: d.file || fallback(kind, t), parts: date ? [fmt(t.import.imported, { date })] : [] }
}

/** One observation.org file (the Observed species life list, or the observations): its name, then "Imported 6 Nov". */
export function obsorgLine(kind: ObsOrgDetails['kind'], d: ObsOrgDetails | undefined, t: Ui, now?: Date): SourceState {
  const fallbackName = t.import.obsorg.fallback[kind]
  if (!d) return { name: fallbackName, parts: [t.import.detailsUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  return { name: d.file || fallbackName, parts: date ? [fmt(t.import.imported, { date })] : [] }
}

/** The iNaturalist account: the username, then "Updated 6 Nov". */
export function inatLine(d: InatDetails | undefined, t: Ui, now?: Date): SourceState {
  if (!d?.user) return { name: '', parts: [t.import.usernameUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  return { name: d.user, parts: date ? [fmt(t.import.updated, { date })] : [] }
}

export function sheetLine(d: SheetDetails | undefined, t: Ui, now?: Date): SourceState {
  if (!d) return { name: t.import.sheet.fallback.file, parts: [t.import.detailsUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  const name = d.file || t.import.sheet.fallback[d.kind]
  return { name, parts: date ? [fmt(t.import.imported, { date })] : [] }
}

export function scythebillLine(d: ScythebillDetails | undefined, t: Ui, now?: Date): SourceState {
  if (!d) return { name: t.import.scythebill.fallback.csv, parts: [t.import.detailsUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  const name = d.file || t.import.scythebill.fallback[d.kind]
  return { name, parts: date ? [fmt(t.import.imported, { date })] : [] }
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
   *  opening `body`. With no skipped entries but `excluded` observations (observation.org's escapes and uncertain
   *  records), "· 12 observations not counted" carries the "why?" instead. */
  skipped?: { n: number; excluded?: number; body: ReactNode }
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
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState(false)
  const menuBtn = useRef<SourceMenuHandle>(null)
  const items: MenuItem[] = [...(menu ?? []), ...(what ? [{ label: t.import.remove, danger: true, keepFocus: true, onSelect: () => setAsking(true) }] : [])]
  const skippedN = { n: formatInt(skipped?.n ?? 0, t.num) }
  const lead = counts ?? parts.slice(0, 1)
  // The part "why?" follows: the skipped entries, else (nothing skipped) the observations left out.
  const why0 = !skipped
    ? null
    : skipped.n > 0
      ? { label: plural(t.import.skipped, skipped.n, skippedN), ask: plural(t.import.whyLabel, skipped.n, skippedN) }
      : skipped.excluded
        ? obsorgNotCounted(skipped.excluded, t)
        : null
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
            {why0 && (
              <>
                {' · '}
                <span className="eb-nowrap">
                  {why0.label}{' '}
                  <button type="button" className="eb-whybtn" aria-expanded={why} aria-controls={`${id}-why`} aria-label={why0.ask} onClick={() => setWhy((w) => !w)}>
                    {t.import.why}
                  </button>
                </span>
              </>
            )}
            {rest.map((p) => <span key={p}>{' · '}<span className="eb-nowrap">{p}</span></span>)}
          </p>
        </div>
        <div className="eb-src-acts">
          {primary}
          {items.length > 0 && <SourceMenu ref={menuBtn} label={fmt(t.import.more, { title })} items={items} disabled={disabled} />}
        </div>
      </div>
      {why0 && skipped && (
        <div id={`${id}-why`} className="eb-src-why" hidden={!why} data-testid="not-counted">
          {skipped.body}
        </div>
      )}
      {what && asking && (
        <div className="eb-confirm eb-src-confirm" role="group" aria-label={fmt(t.import.removeLabel, { what })}>
          <p>{fmt(t.import.removeAsk, { what })}</p>
          <div className="eb-row">
            <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setAsking(false); onRemove?.() }}>{t.import.removeYes}</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={() => { setAsking(false); menuBtn.current?.focus() }}>{t.import.keep}</button>
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
