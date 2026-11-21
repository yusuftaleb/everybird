'use client'
import { CaretDown } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type KeyboardEvent, type ReactNode, type RefObject } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt, shortDay } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import type { EbirdDetails, IgoterraDetails, InatDetails, ObsOrgDetails, ScythebillDetails, SheetDetails } from '@/lib/list/storage'
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

export function igoterraLine(d: IgoterraDetails | undefined, t: Ui, now?: Date): SourceState {
  if (!d) return { name: t.import.igoterra.fallback, parts: [t.import.detailsUnknown] }
  const date = d.at ? shortDay(d.at, t.date.months, now) : ''
  return { name: d.file || t.import.igoterra.fallback, parts: date ? [fmt(t.import.imported, { date })] : [] }
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
 * entries that weren't counted in a small popover beside it (WhyPopover). `.eb-src-main` is the source's cell in the
 * list's grid; everything after it (the Remove question, `children`) spans the grid under the cell's row, the Add
 * panels under the whole grid (import.css).
 */
export function SourceRow({ title, name, parts, counts, skipped, primary, menu, what, onRemove, disabled, children, testId }: Props) {
  const id = useId()
  const { t } = useI18n()
  const [asking, setAsking] = useState(false)
  const [why, setWhy] = useState(false)
  const whyBtn = useRef<HTMLButtonElement>(null)
  const whyPop = useRef<HTMLDivElement>(null)
  const whyKeys = useWhyPopover(why, () => setWhy(false), whyBtn, whyPop)
  // The popover under the link, its left edge on the link's, kept 8px inside the window.
  useLayoutEffect(() => {
    const b = whyBtn.current
    const el = whyPop.current
    const cell = el?.offsetParent
    if (!why || !b || !el || !cell) return
    const at = b.getBoundingClientRect()
    const box = cell.getBoundingClientRect()
    el.style.top = `${at.bottom - box.top + 6}px`
    const left = Math.max(8, Math.min(at.left, document.documentElement.clientWidth - 8 - el.offsetWidth))
    el.style.left = `${left - box.left}px`
  }, [why])
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
            {why0 && skipped && (
              <>
                {' · '}
                <span className="eb-nowrap">
                  {why0.label}{' '}
                  <button
                    ref={whyBtn} type="button" className="eb-whybtn" aria-expanded={why} aria-controls={`${id}-why`} aria-label={why0.ask}
                    onClick={() => setWhy((w) => !w)} {...whyKeys}
                  >
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
        {why0 && skipped && (
          // What "why?" explains, in a small popover under it (useWhyPopover places it), over the grid.
          <div ref={whyPop} id={`${id}-why`} className="eb-whypop" hidden={!why} data-testid="not-counted" {...whyKeys}>
            {skipped.body}
          </div>
        )}
      </div>
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

/**
 * "why?"'s popover (placed by SourceRow under the link, inside the cell, `.eb-src-main`): it closes on a press outside, Esc (focus back on "why?"), focus leaving
 * the link and the popover, or "why?" again (SourceRow's button).
 */
function useWhyPopover(open: boolean, close: () => void, btn: RefObject<HTMLButtonElement | null>, pop: RefObject<HTMLDivElement | null>) {
  const inside = (n: Node | null) => !!n && (!!btn.current?.contains(n) || !!pop.current?.contains(n))
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => { if (!inside(e.target as Node)) close() }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  })
  return {
    onKeyDown: (e: KeyboardEvent) => {
      // Esc closes the popover only (the Add birds dialog checks defaultPrevented before closing itself).
      if (e.key !== 'Escape' || !open) return
      e.preventDefault()
      e.stopPropagation()
      close()
      btn.current?.focus()
    },
    onBlur: (e: FocusEvent) => { if (open && !inside(e.relatedTarget as Node | null)) close() },
  }
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
