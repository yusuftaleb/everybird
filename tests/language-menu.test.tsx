// @vitest-environment jsdom
// The top bar's language button (LanguageMenu, preview variant lang:a): a menu button with four menuitemradio items in
// their own languages, SourceMenu's keyboard, the top bar held shown while it is open, and the choice written to the
// cookie before a reload.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  delete document.documentElement.dataset.topbar
  sessionStorage.clear() // rememberVariants keeps a ?v= for the tab
})

/** TopBar under `?v=lang:<letter>`. */
function renderTopBar(variant: string) {
  history.replaceState(null, '', `/?v=lang:${variant}`)
  vi.stubGlobal('location', { host: realLocation.host, search: `?v=lang:${variant}`, protocol: realLocation.protocol, reload })
  let out!: ReturnType<typeof render>
  act(() => { out = render(<TopBar />, { wrapper: withI18n('es') }) })
  return out
}

const open = () => fireEvent.click(screen.getByRole('button', { name: /^Idioma/ }))

describe('LanguageMenu', () => {
  it('shows the current code and names the language for screen readers', () => {
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    const btn = screen.getByRole('button', { name: 'Idioma: Español' })
    expect(btn).toHaveTextContent('ES')
    expect(btn).toHaveAttribute('aria-haspopup', 'menu')
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    cleanup()
    render(<LanguageMenu />, { wrapper: withI18n('nl') })
    expect(screen.getByRole('button', { name: 'Taal: Nederlands' })).toHaveTextContent('NL')
    cleanup()
    render(<LanguageMenu />, { wrapper: withI18n('en') })
    expect(screen.getByRole('button', { name: 'Language: English' })).toHaveTextContent('EN')
  })

  it('is clamped to the window when it opens and again when the window is resized while it is open', () => {
    // jsdom has no layout: the menu's left edge is whatever the stand-in says. -20 leaves it 28px past EDGE (8px).
    let left = -20
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ left, right: left + 200, top: 0, bottom: 0, width: 200, height: 0, x: left, y: 0, toJSON: () => ({}) }))
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    open()
    const menu = screen.getByRole('menu')
    expect(menu.style.right).toBe('-28px')
    left = 40 // the window grew: nothing to shift any more
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(menu.style.right).toBe('')
    left = -4 // and shrank again
    act(() => { window.dispatchEvent(new Event('resize')) })
    expect(menu.style.right).toBe('-12px')
  })

  it('opens a menu of the four languages in their own names, current one checked', () => {
    render(<LanguageMenu />, { wrapper: withI18n('es') })
    expect(screen.queryByRole('menu')).toBeNull()
    open()
    expect(screen.getByRole('button', { name: /^Idioma/ })).toHaveAttribute('aria-expanded', 'true')
    const menu = screen.getByRole('menu', { name: 'Idioma' })
    const items = screen.getAllByRole('menuitemradio')
    expect(menu).toContainElement(items[0])
    const names = items.map((i) => i.querySelector('[lang]')!)
    expect(names.map((n) => n.textContent)).toEqual(['English', 'Español', 'Português', 'Nederlands', 'Polski'])
    expect(names.map((n) => n.getAttribute('lang'))).toEqual(['en', 'es', 'pt-BR', 'nl', 'pl'])
    // Each row's code sits on the right, aria-hidden; the current one shows a check instead, and only its name is marked.
    expect(items.map((i) => i.querySelector('.eb-langcode')?.textContent ?? null)).toEqual(['EN', null, 'PT', 'NL', 'PL'])
    expect(items.map((i) => i.querySelector('.eb-langcode')?.getAttribute('aria-hidden') ?? null)).toEqual(['true', null, 'true', 'true', 'true'])
    expect(items.map((i) => i.querySelector('svg') !== null)).toEqual([false, true, false, false, false])
    expect(items[1].querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    expect(names.map((n) => n.hasAttribute('data-current'))).toEqual([false, true, false, false, false])
    expect(items.map((i) => i.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false', 'false', 'false'])
    // Opening focuses the checked item.
    expect(items[1]).toHaveFocus()
  })

  it('arrows wrap, Home and End jump, Esc closes and focuses the button', () => {
    render(<LanguageMenu />, { wrapper: withI18n('pl') })
    fireEvent.click(screen.getByRole('button', { name: 'Język: Polski' }))
    const items = screen.getAllByRole('menuitemradio')
    expect(items[4]).toHaveFocus()
    const key = (k: string) => fireEvent.keyDown(document.activeElement!, { key: k })
    key('ArrowDown')
    expect(items[0]).toHaveFocus()
    key('ArrowUp')
    expect(items[4]).toHaveFocus()
    key('ArrowUp')
    expect(items[3]).toHaveFocus()
    key('Home')
    expect(items[0]).toHaveFocus()
    key('End')
    expect(items[4]).toHaveFocus()
    key('Escape')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Język: Polski' })).toHaveFocus()
    // ArrowDown on the button opens it too, on the checked item.
    fireEvent.keyDown(screen.getByRole('button', { name: 'Język: Polski' }), { key: 'ArrowDown' })
    expect(screen.getAllByRole('menuitemradio')[4]).toHaveFocus()
  })

  it('Tab and a press outside close it', () => {
    render(<><LanguageMenu /><p>outside</p></>, { wrapper: withI18n('en') })
    fireEvent.click(screen.getByRole('button', { name: /^Language/ }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /^Language/ }))
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
    expect(screen.getByRole('button', { name: 'Idioma: Español' })).toHaveFocus()

    open()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Nederlands' }))
    expect(set).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0][0]).toMatch(/^everybird-lang=nl; Max-Age=31536000; Path=\/; SameSite=Lax/)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('holds the top bar shown while open', () => {
    render(<LanguageMenu />, { wrapper: withI18n('pt') })
    expect(holds.live).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Idioma: Português' }))
    expect(holds.live).toBe(1)
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(holds.live).toBe(0)
  })

  it('variant b renders no top-bar control', () => {
    // Variant a (no ?v=): the language button sits right before the theme switch, in DOM and reading order.
    const { unmount } = render(<TopBar />, { wrapper: withI18n('es') })
    const lang = screen.getByRole('button', { name: 'Idioma: Español' })
    const theme = screen.getByRole('switch', { name: 'Modo oscuro' })
    expect(lang.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const controls = [...screen.getByTestId('topbar').querySelectorAll('a, button')]
    expect(controls.indexOf(theme) - controls.indexOf(lang)).toBe(1)
    unmount()

    renderTopBar('b')
    expect(screen.queryByRole('button', { name: /^Idioma/ })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Modo oscuro' })).toBeInTheDocument()
    expect(document.documentElement.dataset.topbar).toBe('b')
  })

  it('mirrors the variant on <html data-topbar>, the one selector app.css and --topbar-h key on', () => {
    // Default: a (the CSS reads no attribute as a too, which is what the server sends).
    const { unmount } = render(<TopBar />, { wrapper: withI18n('es') })
    expect(document.documentElement.dataset.topbar).toBe('a')
    unmount()
    // Unmounting takes it off, so a page without the bar never keeps a stale one.
    expect(document.documentElement.dataset.topbar).toBeUndefined()
  })

  it('variant c renders the button beside the theme switch, and marks Collage for the phones\' rule that hides it', () => {
    renderTopBar('c')
    expect(document.documentElement.dataset.topbar).toBe('c')
    const lang = screen.getByRole('button', { name: 'Idioma: Español' })
    const theme = screen.getByRole('switch', { name: 'Modo oscuro' })
    expect(lang.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // jsdom has no media queries: app.css hides [data-nav="collage"] under 480px in c; the wordmark still goes home.
    const collage = screen.getByRole('link', { name: 'Collage' })
    expect(collage.closest('li')).toHaveAttribute('data-nav', 'collage')
    expect(screen.getByRole('link', { name: 'Ajustes' }).closest('li')).toHaveAttribute('data-nav', 'settings')
    expect(screen.getByRole('link', { name: 'Everybird' })).toHaveAttribute('href', '/')
  })

  it('variant c: on the Collage page the wordmark is the current page too (Collage is hidden on phones); never in a or b', () => {
    nav.path = '/'
    try {
      renderTopBar('c')
      expect(screen.getByRole('link', { name: 'Everybird' })).toHaveAttribute('aria-current', 'page')
      expect(screen.getByRole('link', { name: 'Collage' })).toHaveAttribute('aria-current', 'page')
      cleanup()
      for (const v of ['a', 'b']) {
        renderTopBar(v)
        expect(screen.getByRole('link', { name: 'Everybird' })).not.toHaveAttribute('aria-current')
        cleanup()
      }
      nav.path = '/settings'
      renderTopBar('c')
      expect(screen.getByRole('link', { name: 'Everybird' })).not.toHaveAttribute('aria-current')
    } finally {
      nav.path = '/settings'
    }
  })
})
