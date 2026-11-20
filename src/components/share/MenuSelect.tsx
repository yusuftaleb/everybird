'use client'
// The share dialog's dropdowns (Count, the goal's year, Split by), in the top bar's language-menu style (LanguageMenu:
// .eb-menu, .eb-menuitem, role="menuitemradio", the current choice in Accent with a check). The button shows the current
// choice and is named by its row's label and that choice. Its keyboard is the language menu's: ArrowDown or ArrowUp opens
// it, the arrows move (wrapping), Home and End jump, Escape closes it and focus returns to the button, Tab or a press
// outside closes it. The dialog catches Escape on the window before any element sees it, so an open menu hands the dialog
// its close through `escapeRef` (ShareDialog checks it first). The Tree's Level and Layout menus in the controls bar use
// it too; an option with `off` stays listed, aria-disabled, with that reason under its label (the Tree's levels over the
// tip limit).
import { CaretDown, Check } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'

/** The menu's side margin from the window's edges (as the language menu's). */
const EDGE = 8

export type MenuOption<T extends string | number> = { value: T; label: string; /** Listed but not choosable: why. */ off?: string }

type Props<T extends string | number> = {
  /** The id of the row's visible label: the button's name is that label then the current choice. */
  labelledBy: string
  /** The menu's name (the row's label in words). */
  menuLabel: string
  options: readonly MenuOption<T>[]
  value: T
  onChange: (v: T) => void
  disabled?: boolean
  testId?: string
  /** Set to this menu's close while it is open, so the dialog's Escape closes the menu instead of the dialog. */
  escapeRef: MutableRefObject<(() => void) | null>
}

export function MenuSelect<T extends string | number>({ labelledBy, menuLabel, options, value, onChange, disabled, testId, escapeRef }: Props<T>) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus()
  }
  const current = options.find((o) => o.value === value)
  return (
    <div className="eb-share-ddwrap">
      <button
        ref={btn}
        id={`${id}-btn`}
        type="button"
        className="eb-share-dd"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        aria-labelledby={`${labelledBy} ${id}-btn`}
        disabled={disabled}
        data-testid={testId}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span>{current?.label ?? ''}</span>
        <CaretDown aria-hidden="true" focusable="false" weight="bold" />
      </button>
      {open && (
        <MenuList
          id={`${id}-menu`} label={menuLabel} options={options} value={value} btn={btn} escapeRef={escapeRef}
          onPick={(v) => { close(true); if (v !== value) onChange(v) }}
          onClose={close}
        />
      )}
    </div>
  )
}

/** The open menu: mounted only while open. */
function MenuList<T extends string | number>({ id, label, options, value, btn, escapeRef, onPick, onClose }: {
  id: string
  label: string
  options: readonly MenuOption<T>[]
  value: T
  btn: MutableRefObject<HTMLButtonElement | null>
  escapeRef: MutableRefObject<(() => void) | null>
  onPick: (v: T) => void
  onClose: (refocus: boolean) => void
}) {
  const menu = useRef<HTMLDivElement>(null)
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]

  // Right-aligned under the button (share.css), then clamped to the window, as the language menu.
  useLayoutEffect(() => {
    const el = menu.current
    if (!el) return
    const clamp = () => {
      el.style.right = ''
      const left = el.getBoundingClientRect().left
      if (left < EDGE) el.style.right = `${left - EDGE}px`
    }
    clamp()
    window.addEventListener('resize', clamp)
    return () => window.removeEventListener('resize', clamp)
  }, [])

  useEffect(() => {
    const at = Math.max(0, options.findIndex((o) => o.value === value))
    items()[at]?.focus()
    escapeRef.current = () => onClose(true)
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !btn.current?.contains(target)) onClose(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => {
      escapeRef.current = null
      document.removeEventListener('pointerdown', away, true)
    }
    // On open only: the handlers it uses don't change while it is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onKey = (e: KeyboardEvent) => {
    const els = items()
    const at = els.indexOf(document.activeElement as HTMLButtonElement)
    const go = (i: number) => {
      e.preventDefault()
      els[(i + els.length) % els.length]?.focus()
    }
    if (e.key === 'ArrowDown') go(at + 1)
    else if (e.key === 'ArrowUp') go(at - 1)
    else if (e.key === 'Home') go(0)
    else if (e.key === 'End') go(els.length - 1)
    else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose(true)
    } else if (e.key === 'Tab') onClose(false)
  }

  return (
    <div ref={menu} id={id} className="eb-menu eb-langmenu eb-share-menu" role="menu" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button
          key={o.value} type="button" role="menuitemradio" aria-checked={o.value === value} aria-disabled={o.off ? true : undefined} tabIndex={-1} className="eb-menuitem"
          onClick={() => { if (!o.off) onPick(o.value) }}
        >
          {o.off
            ? <span className="eb-menu-off"><span className="eb-langname">{o.label}</span><span className="eb-menu-why">{o.off}</span></span>
            : <span className="eb-langname" data-current={o.value === value ? '' : undefined}>{o.label}</span>}
          {o.value === value && <Check aria-hidden="true" focusable="false" weight="bold" />}
        </button>
      ))}
    </div>
  )
}
