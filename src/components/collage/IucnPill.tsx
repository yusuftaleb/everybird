'use client'
// A global IUCN Red List category as a small pill in the Red List chart's colours (IUCN_COLORS): the fill and the
// text are fixed and the same in both themes; only the 1px Line ring follows the theme (card-list.css .eb-iucn).
// The span form is decoration beside words that name the category (the Status panel's rows) or inside the aria-hidden
// hover tooltip, so it is hidden from assistive tech. The card's pill (IucnBadge, `tip`) is a button: a toggletip whose
// label (the full name) shows on a press, on keyboard focus and on a fine pointer's hover; the button's name says it.
// No `title`: the browser's own tooltip would show beside the site's.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { fmt } from '@/i18n/core'
import type { IucnCat } from '@/lib/species/iucn'
import { statusColor, type StatusFilterCat } from '@/lib/species/status-filter'
import './card-list.css'

const pillStyle = (cat: StatusFilterCat) => ({ '--iucn-fill': statusColor(cat).fill, '--iucn-text': statusColor(cat).text }) as CSSProperties

export function IucnPill({ cat }: { cat: StatusFilterCat }) {
  const style = pillStyle(cat)
  return (
    <span className="eb-iucn" data-cat={cat} style={style} aria-hidden="true">
      {cat}
    </span>
  )
}

/**
 * The pill of the bird card and the hover tooltip, under the body mass in the head's right column, the pill alone (no
 * name). In the card (`tip`) it is a button named "Red List: Least Concern" whose tip shows the full name; in the
 * tooltip (no pointer events, aria-hidden) it is the plain span. Never on search, share images or link previews.
 */
export function IucnBadge({ cat, tip = false }: { cat: IucnCat; tip?: boolean }) {
  return (
    <div className="eb-iucn-badge" data-testid="iucn-badge">
      {tip ? <IucnToggletip cat={cat} /> : <IucnPill cat={cat} />}
    </div>
  )
}

function IucnToggletip({ cat }: { cat: IucnCat }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const tipId = useId()
  const ref = useRef<HTMLSpanElement>(null)
  // An open tip closes on a press anywhere else or when focus leaves the pill (Esc stays the card's: it closes the card).
  useEffect(() => {
    if (!open) return
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [open])
  const name = fmt(t.iucn.pillName, { name: t.iucn.names[cat] })
  return (
    <span ref={ref} className="eb-iucn-wrap" data-open={open || undefined} data-testid="iucn-wrap">
      <button
        type="button"
        className="eb-iucn"
        data-cat={cat}
        style={pillStyle(cat)}
        aria-label={name}
        aria-expanded={open}
        aria-controls={tipId}
        data-testid="iucn-pill"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        {cat}
      </button>
      <span id={tipId} className="eb-iucn-tip" aria-hidden="true">{t.iucn.names[cat]}</span>
    </span>
  )
}
