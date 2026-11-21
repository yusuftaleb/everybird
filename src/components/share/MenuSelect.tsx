'use client'
// The share dialog's dropdowns (Poster size, the goal's year, Split by, Birds per image or per poster), in the top bar's
// language-menu style (LanguageMenu): a borderless button showing the current choice and a small chevron, Surface on
// hover and while open (share.css .eb-share-dd), and a small floating menu (.eb-menu, .eb-menuitem,
// role="menuitemradio", the current choice in Accent with a check). The button is named by its row's label and that choice. Its keyboard is the language menu's: ArrowDown or ArrowUp opens
// it, the arrows move (wrapping), Home and End jump, Escape closes it and focus returns to the button, Tab or a press
// outside closes it. The dialog catches Escape on the window before any element sees it, so an open menu hands the dialog
// its close through `escapeRef` (ShareDialog checks it first). The Tree's Level and Layout menus in the controls bar use
// it too, in the Filters button's look (app.css); an option with `off` stays listed, aria-disabled, named by its label and described by that reason under it
// (the Tree's levels over the tip limit). Add by hand's taxonomic picker (TickList) uses it as a menu of places to go:
// its current group is not among the options (`shown` gives the button its words), so the rows are plain menuitems
// with no check, each with its species count, the first stepping back a level (`back`, an arrow before the label).
// The Collage's Arrangement menu in the controls bar gives each option its glyph (`icon`), drawn before its label on
// the button and in the menu.
import { ArrowLeft, CaretDown, Check, type Icon } from '@phosphor-icons/react'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MutableRefObject } from 'react'

/** The menu's side margin from the window's edges (as the language menu's). */
const EDGE = 8

export type MenuOption<T extends string | number> = {
  value: T
  label: string
  /** Listed but not choosable: why. */
  off?: string
  /** A Muted number at the row's end (a group's species). */
  count?: string
  /** The row's accessible name when its words alone don't say it ("Back to All birds", "Waterfowl, 178 species"). */
  name?: string
  /** The row steps back a level: an arrow before its label. */
  back?: boolean
  /** The label is a scientific name (italic, Latin). */
  sci?: boolean
  /** A glyph before the label (decorative: the label names the option). */
  icon?: Icon
}

/** An option's label, a scientific name in italics, after its glyph when it has one. */
const Label = ({ o }: { o: MenuOption<string | number> }) => {
  const text = o.sci ? <i lang="la">{o.label}</i> : <>{o.label}</>
  if (!o.icon) return text
  const Glyph = o.icon
  return <span className="eb-menu-glyph"><Glyph className="eb-menu-icon" aria-hidden="true" focusable="false" /><span className="eb-menu-text">{text}</span></span>
}

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
  /** What the button shows when `value` isn't among the options (the picker's current group). */
  shown?: MenuOption<T>
}

export function MenuSelect<T extends string | number>({ labelledBy, menuLabel, options, value, onChange, disabled, testId, escapeRef, shown }: Props<T>) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const current = options.find((o) => o.value === value) ?? shown
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
        <span>{current ? <Label o={current} /> : ''}</span>
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

/** The open menu: mounted only while open (also the List view's Sort menu in the controls bar, ControlsBar.tsx). */
export function MenuList<T extends string | number>({ id, label, options, value, btn, escapeRef, onPick, onClose }: {
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
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])]
  // A choice among options (a check on the current one), or places to go when the current one isn't listed.
  const radio = options.some((o) => o.value === value)

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
    items()[at]?.focus({ preventScroll: true }) // the menu is clamped into the window; opening it never scrolls the page
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
          key={o.value} type="button" role={radio ? 'menuitemradio' : 'menuitem'} aria-checked={radio ? o.value === value : undefined}
          aria-disabled={o.off ? true : undefined} tabIndex={-1} className="eb-menuitem"
          aria-label={o.off ? undefined : o.name}
          aria-labelledby={o.off ? `${id}-${o.value}` : undefined} aria-describedby={o.off ? `${id}-${o.value}-why` : undefined}
          onClick={() => { if (!o.off) onPick(o.value) }}
        >
          {o.off
            ? <span className="eb-menu-off"><span id={`${id}-${o.value}`} className="eb-langname">{o.label}</span><span id={`${id}-${o.value}-why`} className="eb-menu-why">{o.off}</span></span>
            : o.back
              ? <span className="eb-langname eb-menu-back"><ArrowLeft aria-hidden="true" focusable="false" /><Label o={o} /></span>
              : <span className="eb-langname" data-current={o.value === value ? '' : undefined}><Label o={o} /></span>}
          {o.count && <span className="eb-mono eb-langcode">{o.count}</span>}
          {o.value === value && <Check aria-hidden="true" focusable="false" weight="bold" />}
        </button>
      ))}
    </div>
  )
}
