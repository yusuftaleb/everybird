'use client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { trapTab, useEscapeCapture, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { formatMass, formatMonth } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { regionsIn } from '@/lib/i18n-places'
import { formatPlace } from '@/lib/import/places'
import type { Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { SeenIndex } from '@/lib/list/seen'
import { entryInFilter } from '@/lib/list/sighting'
import type { SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { albumSlug, albumUrl, loadAlbumSlugs } from '@/lib/bird-album'
import { CloseIcon } from './icons'
import { IucnBadge } from './IucnPill'
import { markLabel, Marks, marksOf } from './Marks'
import './card-list.css'

export type CardAnchor = Element | DOMRect | null

type Props = {
  entry: ListEntry
  species: SpeciesIndex
  regions: Regions
  /** The picked bird's element or rect; the popover sits next to it. Ignored for the phone sheet. */
  anchor?: CardAnchor
  onClose: () => void
  /** Extra actions in the footer (Task 20 puts "Edit" here). */
  actions?: ReactNode
  /** Where focus goes on close; defaults to the anchor when it is an element. */
  returnFocus?: HTMLElement | null
  /** Scientific names lead (the Scientific switch). */
  sci?: boolean
  /**
   * The collage's filter and seen-here index: with a Places or Time filter on, the date and place lines show the first
   * sighting inside the filter (month precision, sighting.ts), else the lifer's.
   */
  filter?: Filter
  seen?: SeenIndex
  /** For this many ms the popover re-places itself every frame (its bird is still travelling to its spot). */
  follow?: number
}

const MARGIN = 8
const GAP = 10

function rectOf(a: CardAnchor): DOMRect | null {
  if (!a) return null
  return 'getBoundingClientRect' in a ? a.getBoundingClientRect() : a
}

/** The mass label (a tooltip and screen-reader text: the card shows only the value, as on LifeList). */
export function massLabel(row: SpeciesRow, t: Ui): string {
  if (row.gSrc === 'genus') return t.card.massGenus
  if (row.gSrc === 'family') return t.card.massFamily
  if (row.gSrc === 'order') return t.card.massOrder
  return t.card.mass
}
/** Estimates (genus, family, order) are the ones the card marks with "~". */
const isEstimate = (row: SpeciesRow) => row.gSrc === 'genus' || row.gSrc === 'family' || row.gSrc === 'order'
/** The mass as the card and the list show it: "~4.3 g" for an estimate ("~4,3 g" in es). */
export const massValue = (row: SpeciesRow, t: Ui) => `${isEstimate(row) ? '~' : ''}${formatMass(row.g, t.num)}`

export function BirdCard({ entry, species, regions, anchor = null, onClose, actions, returnFocus, sci = false, follow, filter, seen }: Props) {
  const row = species.byCode.get(entry.code)
  const { t } = useI18n()
  useNames() // the card's name follows the names file and the English switch
  const sheet = useIsSheet()
  const shown = useMemo(() => entryInFilter(entry, filter, seen), [entry, filter, seen])
  const ref = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const anchorRef = useRef(anchor)
  const returnRef = useRef(returnFocus)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
    anchorRef.current = anchor
    returnRef.current = returnFocus
  })

  // Popover: below the anchor (above when there is no room), clamped inside the viewport. Written straight
  // to the element's style, in a layout effect, so it is placed before paint and before focus moves in
  // (browsers ignore focus() on hidden elements, so we never hide it).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || sheet) return
    const place = () => {
      const a = rectOf(anchorRef.current)
      const w = el.offsetWidth, h = el.offsetHeight
      const vw = window.innerWidth, vh = window.innerHeight
      const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
      let left: number, top: number
      if (!a) {
        left = clamp((vw - w) / 2, MARGIN, vw - w - MARGIN)
        top = clamp((vh - h) / 2, MARGIN, vh - h - MARGIN)
      } else {
        const below = a.bottom + GAP
        const t = below + h <= vh - MARGIN ? below : a.top - GAP - h >= MARGIN ? a.top - GAP - h : below
        left = clamp(a.left + a.width / 2 - w / 2, MARGIN, vw - w - MARGIN)
        top = clamp(t, MARGIN, vh - h - MARGIN)
      }
      el.style.left = `${left}px`
      el.style.top = `${top}px`
    }
    place()
    let raf = 0
    // Following a travelling bird: re-place every frame until `follow` ms have passed.
    let trail = 0
    if (follow && typeof requestAnimationFrame === 'function') {
      const until = performance.now() + follow
      const step = () => {
        place()
        trail = performance.now() < until ? requestAnimationFrame(step) : 0
      }
      trail = requestAnimationFrame(step)
    }
    const again = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        place()
      })
    }
    window.addEventListener('resize', again, { passive: true })
    window.addEventListener('scroll', again, { passive: true, capture: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      if (trail) cancelAnimationFrame(trail)
      window.removeEventListener('resize', again)
      window.removeEventListener('scroll', again, { capture: true })
    }
  }, [anchor, sheet, entry.code, follow])

  // Focus in on open (after placement, above), back on close.
  useLayoutEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    return () => {
      const a = anchorRef.current
      const target = returnRef.current ?? (a && 'focus' in a ? (a as HTMLElement) : null) ?? prev
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

  // Esc closes (shared capture helper); a press outside closes the popover.
  useEscapeCapture(onClose)
  useHoldTopBar()
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (sheet || ref.current?.contains(t)) return
      const a = anchorRef.current
      if (a && 'contains' in a && a.contains(t)) return
      onCloseRef.current()
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [sheet])

  // The sheet is modal: keep Tab inside it.
  const trap = (e: KeyboardEvent) => {
    if (sheet) trapTab(e, ref.current)
  }

  if (!row) return null
  // Small print: iNaturalist's lumped name was placed by region (or by default).
  const notes = [
    entry.assigned === 'region' ? t.card.assignedRegion : entry.assigned === 'default' ? t.card.assignedDefault : '',
  ].filter((n): n is string => !!n)

  // LifeList's card (layout C), with a close button and the edit actions under it.
  const card = (
    <div
      ref={ref}
      className="eb-card"
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={displayName(row)}
      data-variant={sheet ? 'sheet' : 'popover'}
      tabIndex={-1}
      onKeyDown={trap}
    >
      <BirdFacts entry={shown} row={row} regions={regions} sci={sci} statusTip>
        <button type="button" className="eb-card-close" aria-label={t.card.close} onClick={onClose}>
          <CloseIcon />
        </button>
      </BirdFacts>
      {!row.st && <p className="eb-card-note" data-testid="no-drawing">{t.card.noDrawing}</p>}
      {row.st && <AlbumLink row={row} />}
      {notes.length > 0 && <p className="eb-card-note">{notes.join(' · ')}</p>}
      {actions && <div className="eb-card-actions">{actions}</div>}
    </div>
  )

  return sheet ? (
    <div className="eb-card-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{card}</div>
  ) : card
}

/**
 * What the card and the hover tooltip say (LifeList's card, layout C): the name with its marks and the other name under
 * it on the left; on the right, in a column that never shrinks below its content (`.eb-card-side`), the body mass and,
 * under it, a species' Red List pill alone (then `children`, the card's close button); then the date line (with the
 * marks in words) and the place, both mono. `heading` names the bird with an h2 (the card) or a plain paragraph (the
 * tooltip). The date and place are the entry's: callers inside a Places or Time filter pass `entryInFilter`'s entry. The card's pill is a button whose tip names the category, the tooltip's a plain aria-hidden span.
 */
export function BirdFacts({ entry, row, regions, sci = false, heading = true, statusTip = false, children }: {
  entry: ListEntry; row: SpeciesRow; regions: Regions; sci?: boolean; heading?: boolean
  /** The pill is a toggletip button (the card); off, a plain aria-hidden span (the aria-hidden hover tooltip). */
  statusTip?: boolean
  children?: ReactNode
}) {
  const { lang, t } = useI18n()
  useNames()
  const com = displayName(row)
  const place = formatPlace(entry.place, regionsIn(regions, lang))
  const date = formatMonth(entry.date, t.date.months)
  const marks = marksOf(entry).map((m) => markLabel(m.k, t))
  const when = [date, ...marks].filter(Boolean)
  const Name = heading ? 'h2' : 'p'
  const badge = row.iu ? <IucnBadge cat={row.iu} tip={statusTip} /> : null
  return (
    <>
      <div className="eb-card-head">
        <div className="eb-card-names">
          <Name className="eb-card-name" lang={sci ? 'la' : undefined}>{sci ? row.sci : com}<Marks entry={entry} /></Name>
          <p className="eb-card-other" lang={sci ? undefined : 'la'}>{sci ? com : row.sci}</p>
        </div>
        <div className="eb-card-side">
          <span className="eb-card-mass" title={massLabel(row, t)}><span className="eb-sr">{massLabel(row, t)} </span>{massValue(row, t)}</span>
          {badge}
        </div>
        {children}
      </div>
      {(when.length > 0 || place) && (
        <div className="eb-card-when">
          {when.length > 0 && (
            <p className="eb-mono eb-card-date">
              {date && <time dateTime={entry.date}>{date}</time>}
              {marks.length > 0 && `${date ? ' · ' : ''}${marks.join(' · ')}`}
            </p>
          )}
          {place && <p className="eb-mono eb-card-place">{place}</p>}
        </div>
      )}
    </>
  )
}

/** The credit link to the bird's page on Bird Album, where its sticker comes from; shown once the slugs have loaded. */
function AlbumLink({ row }: { row: SpeciesRow }) {
  const { t, lang } = useI18n()
  const [slugs, setSlugs] = useState<Record<string, string> | null>(null)
  useEffect(() => { loadAlbumSlugs().then(setSlugs, () => {}) }, [])
  if (!slugs) return null
  return (
    <p className="eb-card-note">
      <a className="eb-card-album" href={albumUrl(slugs[row.code] ?? albumSlug(row.com), lang)} target="_blank" rel="noopener noreferrer"
        aria-label={t.card.albumSpoken}>{t.card.album}<span aria-hidden="true"> ↗</span></a>
    </p>
  )
}
