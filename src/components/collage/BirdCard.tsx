'use client'
import { useEffect, useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { trapTab, useEscapeCapture, useIsSheet } from '@/components/dialog-utils'
import { formatDate, formatMass } from '@/lib/format'
import { formatPlace } from '@/lib/import/places'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { CloseIcon } from './icons'
import { Marks, marksOf } from './Marks'
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
export function massLabel(row: SpeciesRow): string {
  if (row.gSrc === 'family') return 'Average body mass, estimated from its family'
  if (row.gSrc === 'order') return 'Average body mass, estimated from its order'
  return 'Average body mass'
}
const massValue = (row: SpeciesRow) => `${row.gSrc === 'family' || row.gSrc === 'order' ? '~' : ''}${formatMass(row.g)}`

export function BirdCard({ entry, species, regions, anchor = null, onClose, actions, returnFocus, sci = false, follow }: Props) {
  const row = species.byCode.get(entry.code)
  const sheet = useIsSheet()
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
  // Small print: the sticker is a split sibling's (build-species standIn); iNaturalist's lumped name was placed by region.
  const standIn = row.standIn ? species.byCode.get(row.standIn)?.com : undefined
  const notes = [
    standIn && `Illustration: ${standIn} (stand-in)`,
    entry.assigned === 'region' ? 'Assigned by region' : entry.assigned === 'default' ? 'Assigned by default (no place)' : '',
  ].filter((n): n is string => !!n)

  // LifeList's card (layout C), with a close button and the edit actions under it.
  const card = (
    <div
      ref={ref}
      className="eb-card"
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={row.com}
      data-variant={sheet ? 'sheet' : 'popover'}
      tabIndex={-1}
      onKeyDown={trap}
    >
      <BirdFacts entry={entry} row={row} regions={regions} sci={sci}>
        <button type="button" className="eb-card-close" aria-label="Close" onClick={onClose}>
          <CloseIcon />
        </button>
      </BirdFacts>
      {notes.length > 0 && <p className="eb-card-note">{notes.join(' · ')}</p>}
      {actions && <div className="eb-card-actions">{actions}</div>}
    </div>
  )

  return sheet ? (
    <div className="eb-card-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{card}</div>
  ) : card
}

/**
 * What the card and the hover tooltip say (LifeList's card, layout C): the name with its marks, the other name under
 * it, the body mass top-right (then `children`, the card's close button); then the date line (with the marks in
 * words) and the place, both mono. `heading` names the bird with an h2 (the card) or a plain paragraph (the tooltip).
 */
export function BirdFacts({ entry, row, regions, sci = false, heading = true, children }: {
  entry: ListEntry; row: SpeciesRow; regions: Regions; sci?: boolean; heading?: boolean; children?: ReactNode
}) {
  const place = formatPlace(entry.place, regions)
  const date = formatDate(entry.date)
  const marks = marksOf(entry).map((m) => m.label)
  const when = [date, ...marks].filter(Boolean)
  const Name = heading ? 'h2' : 'p'
  return (
    <>
      <div className="eb-card-head">
        <div className="eb-card-names">
          <Name className="eb-card-name" lang={sci ? 'la' : undefined}>{sci ? row.sci : row.com}<Marks entry={entry} /></Name>
          <p className="eb-card-other" lang={sci ? undefined : 'la'}>{sci ? row.com : row.sci}</p>
        </div>
        <span className="eb-card-mass" title={massLabel(row)}><span className="eb-sr">{massLabel(row)} </span>{massValue(row)}</span>
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
