// @vitest-environment jsdom
// The top bar's language button (LanguageMenu, preview variant lang:a): a menu button with four menuitemradio items in
// their own languages, SourceMenu's keyboard, the top bar frozen while it is open, and the choice written to the
// cookie before a reload.
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageMenu } from '@/components/app/LanguageMenu'
import { TopBar } from '@/components/app/TopBar'
import { withI18n } from './i18n-render'

const nav = vi.hoisted(() => ({ path: '/settings' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.path, useRouter: () => ({ push: () => {}, prefetch: () => {} }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a> }))

/** How many holds on the top bar are live (useHoldTopBar mounted and not yet unmounted). */
const holds = vi.hoisted(() => ({ live: 0 }))
vi.mock('@/components/dialog-utils', async (orig) => ({
  ...(await orig<typeof import('@/components/dialog-utils')>()),
  useHoldTopBar: () => {
    useLayoutEffect(() => {
      holds.live++
      return () => { holds.live-- }
    }, [])
  },
}))

const reload = vi.fn()
const realLocation = window.location

beforeEach(() => {
  reload.mockReset()
  vi.stubGlobal('location', { host: realLocation.host, search: realLocation.search, protocol: realLocation.protocol, reload })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.cookie = 'everybird-lang=; Max-Age=0; Path=/'
  history.replaceState(null, '', '/')
  sessionStorage.clear() // rememberVariants keeps a ?v= for the tab
})

const open = () => fireEvent.click(screen.getByRole('button', { name: /^ES, Idioma/ }))

describe('LanguageMenu', () => {
  it('shows the current code and names the language with that code first, so the visible text is in its name', () => {
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    const btn = screen.getByRole('button', { name: 'ES, Idioma: Español' })
    expect(btn).toHaveTextContent('ES')
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    cleanup()
    render(<LanguageMenu />, { wrapper: withI18n('nl') })
    expect(screen.getByRole('button', { name: 'NL, Taal: Nederlands' })).toHaveTextContent('NL')
    cleanup()
    render(<LanguageMenu />, { wrapper: withI18n('en') })
    expect(screen.getByRole('button', { name: 'EN, Language: English' })).toHaveTextContent('EN')
  })

  it('opens on the shared floating layer: fixed to its button, its height capped at the room and 50dvh (H21)', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left: 300, right: 344, top: 8, bottom: 52, width: 44, height: 44, x: 300, y: 8, toJSON: () => ({}) }))
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    open()
    const menu = screen.getByRole('menu')
    expect(menu.style.position).toBe('fixed')
    expect(menu.style.top).toBe('58px') // 6px under the button
    expect(menu.style.maxHeight).toMatch(/50dvh/)
  })
  it('a new choice shows its code on the button at once, while the page reloads (O15)', () => {
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Nederlands/ }))
    expect(screen.getByRole('button', { name: 'NL, Idioma: Nederlands' })).toHaveTextContent('NL')
  })

  it('opens a menu of the four languages in their own names, current one checked', () => {
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    expect(screen.queryByRole('menu')).toBeNull()
    open()
    expect(screen.getByRole('button', { name: /^ES, Idioma/ })).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Idioma' })
    const items = screen.getAllByRole('menuitemradio')
    expect(menu).toContainElement(items[0])
    const names = items.map((i) => i.querySelector('[lang]')!)
    expect(names.map((n) => n.textContent)).toEqual(['English', 'Español', 'Português', 'Nederlands', 'Polski', 'Français', 'Deutsch', 'Italiano', 'Svenska', 'Dansk', 'Русский', '日本語', '简体中文', '繁體中文'])
    expect(names.map((n) => n.getAttribute('lang'))).toEqual(['en', 'es', 'pt-BR', 'nl', 'pl', 'fr', 'de', 'it', 'sv', 'da', 'ru', 'ja', 'zh-Hans', 'zh-Hant'])
    // Each row's code sits on the right, aria-hidden; the current one shows a check instead, and only its name is marked.
    expect(items.map((i) => i.querySelector('.eb-langcode')?.textContent ?? null)).toEqual(['EN', null, 'PT', 'NL', 'PL', 'FR', 'DE', 'IT', 'SV', 'DA', 'RU', 'JA', '简', '繁'])
    expect(items.map((i) => i.querySelector('.eb-langcode')?.getAttribute('aria-hidden') ?? null)).toEqual(['true', null, 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true', 'true'])
    expect(items.map((i) => i.querySelector('svg') !== null)).toEqual([false, true, false, false, false, false, false, false, false, false, false, false, false, false])
    expect(items[1].querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(names.map((n) => n.hasAttribute('data-current'))).toEqual([false, true, false, false, false, false, false, false, false, false, false, false, false, false])
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false', 'false'])
    // Opening focuses the checked item.
    expect(items[1]).toHaveFocus()
  })

  it('arrows wrap, Home and End jump, Esc closes and focuses the button', () => {
    render(<LanguageMenu />, { wrapper: withI18n('zh-Hant') })
    fireEvent.click(screen.getByRole('button', { name: '繁, 語言：繁體中文' }))
    const items = screen.getAllByRole('menuitemradio')
    expect(items[13]).toHaveFocus()
    const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k })
    key('ArrowDown')
    expect(items[0]).toHaveFocus()
    key('ArrowUp')
    expect(items[13]).toHaveFocus()
    key('ArrowUp')
    expect(items[12]).toHaveFocus()
    key('Home')
    expect(items[0]).toHaveFocus()
    key('End')
    expect(items[13]).toHaveFocus()
    key('Escape')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: '繁, 語言：繁體中文' })).toHaveFocus()
    // ArrowDown on the button opens it too, on the checked item.
    fireEvent.keyDown(screen.getByRole('button', { name: '繁, 語言：繁體中文' }), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio')[13]).toHaveFocus()
  })

  it('Tab and a press outside close it', () => {
    render(<><LanguageMenu /><p>outside</p></>, { wrapper: withI18n('en') })
    fireEvent.click(screen.getByRole('button', { name: /^EN, Language/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^EN, Language/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.pointerDown(screen.getByText('outside'))
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('picking Nederlands writes everybird-lang=nl and reloads; picking the current one only closes', () => {
    const set = vi.spyOn(Document.prototype, 'cookie', 'set')
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Español' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(set).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'ES, Idioma: Español' })).toHaveFocus()

    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Nederlands' }))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toMatch(/^everybird-lang=nl; Max-Age=31536000; Path=\/; SameSite=Lax/)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds the top bar shown while open', () => {
    render(<LanguageMenu />, { wrapper: withI18n('pt') })
    expect(holds.live).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'PT, Idioma: Português' }))
    expect(holds.live).toBe(1)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(holds.live).toBe(0)
  })

  it('the top bar: the language button right before the theme switch; the wordmark goes home and is never the current page', () => {
    nav.path = '/'
    try {
      render(<TopBar />, { wrapper: withI18n('es') })
      const lang = screen.getByRole('button', { name: 'ES, Idioma: Español' })
      const theme = screen.getByRole('switch', { name: 'Modo oscuro' })
      expect(lang.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const controls = [...screen.getByTestId('topbar').querySelectorAll('a, button')]
      expect(controls.indexOf(theme) - controls.indexOf(lang)).toBe(1)
      expect(screen.getByRole('link', { name: 'Mis aves' })).toHaveAttribute('aria-current', 'page')
      const wordmark = screen.getByRole('link', { name: 'Everybird' })
      expect(wordmark).toHaveAttribute('href', '/')
      expect(wordmark).not.toHaveAttribute('aria-current')
      expect(document.documentElement.dataset.topbar).toBeUndefined()
    } finally {
      nav.path = '/settings'
    }
  })
})
