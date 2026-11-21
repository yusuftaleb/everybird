'use client'
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { scrollQuietly } from '@/lib/headroom'
import { familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { ChevronDownIcon } from './icons'
import './card-list.css'
import './family-accordion.css'

/** A family: its key, a bird of it (for its name) and how many birds it holds. */
type AccordionFamily = { key: string; row: SpeciesRow; n: number }

/**
 * Birds under one heading per family, one family open at a time (round 6, item 12; Compare's results, built so the
 * List view could use it). Each heading is the List view's (`.eb-lhead`: small Muted upper case, the family's name,
 * italic Latin with `sci`, its count at the right in mono, sticky under the top bar) made a button: a caret before the
 * count, turned while open, `aria-expanded` and `aria-controls`. Opening one closes the one open; pressing the open one
 * closes it, so all can be closed. The first opens on arrival and whenever `reset` changes. Only the open family's
 * body is rendered (`children(key)`). When a family above closes, the pressed heading stays where it was on screen:
 * the page is scrolled by what moved, in the same frame, the top bar left as it is (scrollQuietly).
 */
export function FamilyAccordion({ families, sci = false, reset, children }: {
  families: readonly AccordionFamily[]; sci?: boolean; reset: string; children: (key: string) => ReactNode
}) {
  const { t } = useI18n()
  useNames()
  const id = useId()
  const [pick, setPick] = useState<{ reset: string; key: string | null } | null>(null)
  const open = pick && pick.reset === reset && (pick.key === null || families.some((f) => f.key === pick.key)) ? pick.key : families[0]?.key ?? null
  // The pressed family's section and its top on screen before the press.
  const held = useRef<{ el: HTMLElement; top: number } | null>(null)
  useLayoutEffect(() => {
    const h = held.current
    if (!h) return
    held.current = null
    const dy = h.el.getBoundingClientRect().top - h.top
    if (Math.abs(dy) >= 0.5) scrollQuietly(dy)
  }, [open])
  return (
    <ul className="eb-facc" data-testid="family-accordion">
      {families.map((f, i) => {
        const isOpen = f.key === open
        const count = formatInt(f.n, t.num)
        const body = `${id}-${i}`
        return (
          <li key={f.key} className="eb-facc-fam" data-testid={`family-${f.key}`}>
            <h3 className="eb-lhead eb-facc-head">
              <button
                type="button" className="eb-facc-btn" aria-expanded={isOpen} aria-controls={isOpen ? body : undefined}
                onClick={(e) => {
                  const el = e.currentTarget.closest('li')!
                  held.current = { el, top: el.getBoundingClientRect().top }
                  setPick({ reset, key: isOpen ? null : f.key })
                }}
              >
                <span className="eb-lhead-name" lang={sci ? 'la' : undefined}>{sci ? f.row.fam : familyName(f.row)}</span>
                <span className="eb-facc-caret" aria-hidden="true"><ChevronDownIcon /></span>
                <span className="eb-mono eb-lhead-count" aria-hidden="true">{count}</span>
                <span className="eb-sr">, {plural(t.collage.stats.species, f.n, { n: count })}</span>
              </button>
            </h3>
            {isOpen && <div id={body} className="eb-facc-body">{children(f.key)}</div>}
          </li>
        )
      })}
    </ul>
  )
}
