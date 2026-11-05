'use client'
import { X } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { formatDate, formatMass } from '@/lib/format'
import { formatPlace } from '@/lib/import/places'
import type { ListEntry } from '@/lib/list/model'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
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
}

const SHEET_BELOW = 600
const MARGIN = 8
const GAP = 10
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** Pointer devices ≥ 600px get a popover; narrower screens a bottom sheet. */
function useIsSheet(): boolean {
  const query = () => (typeof window.matchMedia === 'function' ? window.matchMedia(`(max-width: ${SHEET_BELOW - 1}px)`) : null)
  // Read synchronously so the card never remounts (and loses its focus) between variants. It only mounts on click.
  const [sheet, setSheet] = useState(() => (typeof window === 'undefined' ? false : (query()?.matches ?? window.innerWidth < SHEET_BELOW)))
  useLayoutEffect(() => {
    const mq = query()
    const read = () => setSheet(mq ? mq.matches : window.innerWidth < SHEET_BELOW)
    mq?.addEventListener?.('change', read)
    return () => mq?.removeEventListener?.('change', read)
  }, [])
  return sheet
}

function rectOf(a: CardAnchor): DOMRect | null {
  if (!a) return null
  return 'getBoundingClientRect' in a ? a.getBoundingClientRect() : a
}

export function massLine(row: SpeciesRow): string {
  const base = `Average body mass: ${row.gSrc === 'family' || row.gSrc === 'order' ? '~' : ''}${formatMass(row.g)}`
  if (row.gSrc === 'family') return `${base} (estimated from its family)`
  if (row.gSrc === 'order') return `${base} (estimated from its order)`
  return base
}

export function BirdCard({ entry, species, regions, anchor = null, onClose, actions, returnFocus }: Props) {
  const row = species.byCode.get(entry.code)
  const sheet = useIsSheet()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const [pos, setPos] = useState<CSSProperties>({ left: MARGIN, top: MARGIN, visibility: 'hidden' })
  const onCloseRef = useRef(onClose)
  const anchorRef = useRef(anchor)
  const returnRef = useRef(returnFocus)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
    anchorRef.current = anchor
    returnRef.current = returnFocus
  })

  // Popover: below the anchor (above when there is no room), clamped inside the viewport.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || sheet) return
    const a = rectOf(anchor)
    const w = el.offsetWidth, h = el.offsetHeight
    const vw = window.innerWidth, vh = window.innerHeight
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)))
    if (!a) {
      setPos({ left: clamp((vw - w) / 2, MARGIN, vw - w - MARGIN), top: clamp((vh - h) / 2, MARGIN, vh - h - MARGIN) })
      return
    }
    const below = a.bottom + GAP
    const top = below + h <= vh - MARGIN ? below : a.top - GAP - h >= MARGIN ? a.top - GAP - h : below
    setPos({ left: clamp(a.left + a.width / 2 - w / 2, MARGIN, vw - w - MARGIN), top: clamp(top, MARGIN, vh - h - MARGIN) })
  }, [anchor, sheet, entry.code])

  // Focus in on open, back on close.
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus({ preventScroll: true })
    return () => {
      const a = anchorRef.current
      const target = returnRef.current ?? (a && 'focus' in a ? (a as HTMLElement) : null) ?? prev
      if (target?.isConnected) target.focus({ preventScroll: true })
    }
  }, [])

  // Esc closes; a press outside closes the popover.
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
      }
    }
    const down = (e: PointerEvent) => {
      const t = e.target as Node
      if (sheet || ref.current?.contains(t)) return
      const a = anchorRef.current
      if (a && 'contains' in a && a.contains(t)) return
      onCloseRef.current()
    }
    document.addEventListener('keydown', key)
    document.addEventListener('pointerdown', down)
    return () => {
      document.removeEventListener('keydown', key)
      document.removeEventListener('pointerdown', down)
    }
  }, [sheet])

  // The sheet is modal: keep Tab inside it.
  const trap = (e: KeyboardEvent) => {
    if (!sheet || e.key !== 'Tab' || !ref.current) return
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE))
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  if (!row) return null
  const place = formatPlace(entry.place, regions)
  const date = formatDate(entry.date)
  const marks = [
    entry.heard && '* heard only',
    entry.dead && '† found dead',
    entry.media && '◦ photo or recording',
  ].filter(Boolean) as string[]

  const card = (
    <div
      ref={ref}
      className="eb-card"
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-labelledby={titleId}
      data-variant={sheet ? 'sheet' : 'popover'}
      tabIndex={-1}
      style={sheet ? undefined : pos}
      onKeyDown={trap}
    >
      <div className="eb-card-head">
        <div className="eb-card-names">
          <h2 id={titleId} className="eb-card-name">{row.com}</h2>
          <p className="eb-card-sci"><i>{row.sci}</i></p>
        </div>
        <button type="button" className="eb-card-close" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" focusable="false" weight="bold" />
        </button>
      </div>
      {(date || place) && (
        <div className="eb-card-when">
          {date && <p className="eb-mono"><time dateTime={entry.date}>{date}</time></p>}
          {place && <p className="eb-card-place">{place}</p>}
        </div>
      )}
      {marks.length > 0 && (
        <ul className="eb-card-marks eb-mono">
          {marks.map((m) => <li key={m}>{m}</li>)}
        </ul>
      )}
      <p className="eb-card-mass">{massLine(row)}</p>
      {actions && <div className="eb-card-actions">{actions}</div>}
    </div>
  )

  return sheet ? (
    <div className="eb-card-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{card}</div>
  ) : card
}
