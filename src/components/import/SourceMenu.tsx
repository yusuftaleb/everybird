'use client'
import { DotsThree } from '@phosphor-icons/react'
import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'

export type MenuItem = {
  label: string
  /** Remove: Accent text. */
  danger?: boolean
  /** Runs after the menu closes (focus is back on the ⋯ button unless `keepFocus`). */
  onSelect: () => void
  /** The action moves focus itself (a confirm, a field): don't put it back on the ⋯ button. */
  keepFocus?: boolean
}

export type SourceMenuHandle = { focus: () => void }

/**
 * A source row's ⋯ menu (Settings > Your list): a real menu button. Enter, Space or ArrowDown opens it on the first
 * item, ArrowUp on the last; the arrows move (wrapping), Home and End jump, Escape closes it and focus returns to the
 * button; Tab or a press outside closes it. Picking an item closes it, then runs the item (focus back on the button
 * unless the item moves focus itself).
 */
export const SourceMenu = forwardRef<SourceMenuHandle, { label: string; items: MenuItem[]; disabled?: boolean }>(function SourceMenu({ label, items, disabled }, ref) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const startAt = useRef(0)
  useImperativeHandle(ref, () => ({ focus: () => btn.current?.focus() }), [])

  const itemEls = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])]
  useEffect(() => {
    if (!open) return
    const els = itemEls()
    els[(startAt.current + els.length) % els.length]?.focus()
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])

  const show = (at: number) => { startAt.current = at; setOpen(true) }
  const close = (refocus: boolean) => { setOpen(false); if (refocus) btn.current?.focus() }

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); show(0) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); show(-1) }
  }
  const onMenuKey = (e: KeyboardEvent) => {
    const els = itemEls()
    const at = els.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => { e.preventDefault(); els[(i + els.length) % els.length]?.focus() }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(els.length - 1)
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true) }
    else if (e.key === 'Tab') setOpen(false)
  }
  const pick = (item: MenuItem) => {
    close(!item.keepFocus)
    item.onSelect()
  }

  return (
    <div className="eb-menuwrap">
      <button
        ref={btn}
        type="button"
        className="eb-btn eb-btn-quiet eb-btn-sm eb-menubtn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(false) : show(0))}
        onKeyDown={onButtonKey}
      >
        <DotsThree aria-hidden="true" focusable="false" weight="bold" />
      </button>
      {open && (
        <div ref={menu} id={`${id}-menu`} className="eb-menu" role="menu" aria-label={label} onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" tabIndex={-1} className="eb-menuitem" data-danger={item.danger || undefined} onClick={() => pick(item)}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
})
