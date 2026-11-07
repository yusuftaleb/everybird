'use client'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'

/**
 * A small "?" beside a control that explains it: the tooltip opens on hover, on keyboard focus and on a tap (a tap or
 * Escape closes it again; so does a press elsewhere). The glyph is small; its press area is 44px (app.css .eb-info).
 * The text is the button's description (aria-describedby), so a screen reader reads it with the button.
 * Placed in fixed coordinates under the button and kept 8px inside the screen.
 */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const id = useId()
  const btn = useRef<HTMLButtonElement>(null)
  const tip = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)

  useEffect(() => {
    if (!open) return
    const b = btn.current, t = tip.current
    if (b && t) {
      const r = b.getBoundingClientRect()
      const w = t.offsetWidth
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8))
      t.style.left = `${left}px`
      t.style.top = `${r.bottom + 10}px`
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { pinned.current = false; setOpen(false) } }
    const onDown = (e: PointerEvent) => { if (!btn.current?.contains(e.target as Node)) { pinned.current = false; setOpen(false) } }
    const onScroll = () => { pinned.current = false; setOpen(false) }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('scroll', onScroll)
    }
  }, [open])

  return (
    <span className="eb-info-wrap">
      <button
        ref={btn}
        type="button"
        className="eb-info"
        aria-label={label}
        aria-describedby={id}
        aria-expanded={open}
        onClick={() => { pinned.current = !open; setOpen(!open) }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => { if (!pinned.current) setOpen(false) }}
        onFocus={(e) => { if (e.currentTarget.matches(':focus-visible')) setOpen(true) }}
        onBlur={() => { pinned.current = false; setOpen(false) }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {/* Always in the DOM (hidden when closed) so aria-describedby resolves. */}
      <div ref={tip} id={id} role="tooltip" className="eb-info-tip" hidden={!open}>
        {children}
      </div>
    </span>
  )
}
