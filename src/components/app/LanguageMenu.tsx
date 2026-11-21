'use client'
// The top bar's language button: ThemeToggle's size and look, showing the
// current language's code ("EN", "ES", "PT", "NL"; 简 and 繁 for Chinese, langBadge), named with that code first and
// then in full ("ES, Idioma: Español"), so the visible text is in its name. It opens a menu of the 14 languages, each in
// its own language, the current one checked, on the shared floating layer (menu-layer.ts: fixed to the button, capped at
// the room and 50dvh, scrolling inside). Its keyboard copies SourceMenu (src/components/import/SourceMenu.tsx). A new
// choice shows its code on the button at once, then sets the cookie and reloads (chooseLang); the current one only
// closes the menu.
import { Check } from '@/components/phosphor-icons'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { useHoldTopBar } from '@/components/dialog-utils'
import { useMenuLayer } from '@/components/menu-layer'
import { chooseLang } from '@/i18n/choose'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { HTML_LANG, LANG_NAMES, LANGS, langBadge, type Lang } from '@/i18n/langs'

export function LanguageMenu() {
  const { lang: current, t } = useI18n()
  const id = useId()
  const [open, setOpen] = useState(false)
  // The language just picked, shown on the button while the page reloads into it.
  const [picked, setPicked] = useState<Lang | null>(null)
  const lang = picked ?? current
  const btn = useRef<HTMLButtonElement>(null)
  const close = (refocus: boolean) => {
    setOpen(false)
    if (refocus) btn.current?.focus({ preventScroll: true })
  }
  const pick = (l: Lang) => {
    close(l === current)
    if (l !== current) {
      setPicked(l)
      chooseLang(l)
    }
  }
  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
    }
  }
  return (
    <div className="eb-langwrap">
      <button
        ref={btn}
        type="button"
        className="eb-theme eb-lang"
        aria-label={`${langBadge(lang)}, ${fmt(t.shell.language.button, { name: LANG_NAMES[lang] })}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => (open ? close(false) : setOpen(true))}
        onKeyDown={onButtonKey}
      >
        <span className="eb-mono" aria-hidden="true">{langBadge(lang)}</span>
      </button>
      {open && <LangList id={`${id}-menu`} label={t.shell.language.menu} current={current} btn={btn} onPick={pick} onClose={close} />}
    </div>
  )
}

/** The open menu. Mounted only while open, so the top bar is frozen exactly that long. */
function LangList({ id, label, current, btn, onPick, onClose }: {
  id: string
  label: string
  current: Lang
  btn: RefObject<HTMLButtonElement | null>
  onPick: (l: Lang) => void
  onClose: (refocus: boolean) => void
}) {
  useHoldTopBar()
  const menu = useRef<HTMLDivElement>(null)
  const items = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])]

  // Right-aligned under the button, kept 8px inside the window, its height capped at the room below (or above) and
  // 50dvh, scrolling inside: on a short or landscape phone the last languages stay reachable. 14 rows are about 600px.
  useMenuLayer(menu, btn, { cap: 640 })

  useEffect(() => {
    items()[LANGS.indexOf(current)]?.focus({ preventScroll: true }) // opening never scrolls the page
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (!menu.current?.contains(target) && !btn.current?.contains(target)) onClose(false)
    }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
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
    <div ref={menu} id={id} className="eb-menu eb-langmenu" role="menu" aria-label={label} onKeyDown={onKey}>
      {LANGS.map((l) => (
        <button key={l} type="button" role="menuitemradio" aria-checked={l === current} tabIndex={-1} className="eb-menuitem" onClick={() => onPick(l)}>
          <span className="eb-langname" lang={HTML_LANG[l]} data-current={l === current ? '' : undefined}>{LANG_NAMES[l]}</span>
          {l === current ? <Check aria-hidden="true" focusable="false" weight="bold" /> : <span className="eb-mono eb-langcode" aria-hidden="true">{langBadge(l)}</span>}
        </button>
      ))}
    </div>
  )
}
