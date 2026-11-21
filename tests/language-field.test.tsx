// @vitest-environment jsdom
// Settings > Language (only the English-names switch: the language is the top bar's menu), the
// language preference cookie (src/i18n/choose.ts) and the provider's refresh of it on every page load.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EnglishNamesSwitch, EN_NAMES_KEY } from '@/components/app/LanguageField'
import { SettingsPage } from '@/components/app/SettingsPage'
import { chooseLang, refreshLangCookie, setLangCookie } from '@/i18n/choose'
import { initialState } from '@/lib/list/store'
import { withI18n } from './i18n-render'

vi.mock('next/navigation', () => ({ usePathname: () => '/settings', useRouter: () => ({ push: () => {}, prefetch: () => {} }) }))

/** Settings' store: a device without a list, before and after the bird data loads. */
const eb = vi.hoisted(() => ({ data: null as unknown }))
vi.mock('@/components/app/EverybirdProvider', () => ({
  useEverybirdContext: () => ({
    state: initialState(),
    dispatch: () => {},
    meta: { ready: true },
    data: eb.data,
    failed: false,
    mine: false,
    mineSoon: false,
    jobs: { landed: false },
  }),
}))

// "Your list" and Add by hand need the import jobs and the taxonomy: not under test here.
vi.mock('@/components/import/ImportPanel', () => ({ ImportPanel: () => null, ImportFrame: () => null }))
vi.mock('@/components/import/TickList', () => ({ TickList: () => null }))

// Node 25 ships its own (unconfigured) localStorage global, which shadows jsdom's: use a plain in-memory one.
class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

const reload = vi.fn()
const realLocation = window.location

beforeEach(() => {
  reload.mockReset()
  vi.stubGlobal('location', { host: realLocation.host, search: realLocation.search, protocol: realLocation.protocol, reload })
  vi.stubGlobal('localStorage', new MemoryStorage())
})

/** A stand-in document recording every cookie write. */
function fakeDoc(cookie: string, protocol = 'https:') {
  const writes: string[] = []
  return { writes, location: { protocol }, get cookie() { return cookie }, set cookie(v: string) { writes.push(v) } }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.cookie = 'everybird-lang=; Max-Age=0; Path=/'
})

describe('Settings > Language', () => {
  it('has no language select (the top bar\'s menu changes the language); the English-names switch stays when the UI is not English', () => {
    // Before the bird data loads (the prerendered page) and after it, with no list on the device.
    for (const data of [null, { species: {}, regions: {} }]) {
      eb.data = data
      render(<SettingsPage />, { wrapper: withI18n('nl') })
      expect(screen.queryByRole('combobox')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Taal wijzigen' })).toBeNull()
      const section = document.querySelector<HTMLElement>('section[aria-labelledby="eb-lang-h"]')!
      expect(section.querySelector('h2')).toHaveTextContent('Taal')
      expect(section).toContainElement(screen.getByRole('switch', { name: 'Vogelnamen in het Engels tonen' }))
      cleanup()
    }
    eb.data = null
    render(<SettingsPage />, { wrapper: withI18n('en') })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(document.querySelector('section[aria-labelledby="eb-lang-h"]')).toBeNull()
    expect(screen.queryByRole('switch', { name: /English/ })).toBeNull()
  })
})

describe('EnglishNamesSwitch', () => {
  it('renders only when the UI is not English', () => {
    const { container } = render(<ul><EnglishNamesSwitch /></ul>, { wrapper: withI18n('en') })
    expect(container.querySelector('li')).toBeNull()
  })

  it('stores the choice per device and reads it back after mount', () => {
    render(<EnglishNamesSwitch />, { wrapper: withI18n('es') })
    const sw = screen.getByRole('switch', { name: 'Mostrar los nombres de las aves en inglés' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem(EN_NAMES_KEY)).toBe('1')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(localStorage.getItem(EN_NAMES_KEY)).toBeNull()
    cleanup()

    localStorage.setItem(EN_NAMES_KEY, '1')
    render(<EnglishNamesSwitch />, { wrapper: withI18n('pt') })
    expect(screen.getByRole('switch', { name: 'Mostrar os nomes das aves em inglês' })).toHaveAttribute('aria-checked', 'true')
  })

  it('without storage it still renders and toggles for this page', () => {
    const blocked = () => { throw new Error('blocked') }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
    render(<EnglishNamesSwitch />, { wrapper: withI18n('nl') })
    const sw = screen.getByRole('switch', { name: 'Vogelnamen in het Engels tonen' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    act(() => { fireEvent.click(sw) })
    expect(sw).toHaveAttribute('aria-checked', 'true')
  })
})

describe('chooseLang', () => {
  it('reloads once the cookie is stored, and not when the browser dropped it (cookies blocked)', () => {
    document.cookie = 'everybird-lang=; Max-Age=0; Path=/'
    chooseLang('nl')
    expect(reload).toHaveBeenCalledTimes(1)
    reload.mockReset()
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(() => {}) // the write goes nowhere
    chooseLang('es')
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('the language cookie', () => {
  it('re-writes a present cookie on load and never creates one', () => {
    const present = fakeDoc('theme=x; everybird-lang=es')
    refreshLangCookie(present)
    expect(present.writes).toEqual(['everybird-lang=es; Max-Age=31536000; Path=/; SameSite=Lax; Secure'])

    for (const c of ['', 'theme=x', 'everybird-lang=tr', 'everybird-lang=', 'my-everybird-lang=es']) {
      const doc = fakeDoc(c)
      refreshLangCookie(doc)
      expect(doc.writes, c).toEqual([])
    }

    // On http (local servers) there is no Secure.
    const http = fakeDoc('everybird-lang=nl', 'http:')
    setLangCookie('nl', http)
    expect(http.writes).toEqual(['everybird-lang=nl; Max-Age=31536000; Path=/; SameSite=Lax'])

    // The provider does it once on mount, with the real document.
    const set = vi.spyOn(Document.prototype, 'cookie', 'set')
    render(<p>page</p>, { wrapper: withI18n('en') })
    expect(set).not.toHaveBeenCalled()
    cleanup()
    set.mockRestore()
    document.cookie = 'everybird-lang=pt; Path=/'
    const set2 = vi.spyOn(Document.prototype, 'cookie', 'set')
    render(<p>page</p>, { wrapper: withI18n('en') })
    expect(set2).toHaveBeenCalledTimes(1)
    expect(set2.mock.calls[0][0]).toMatch(/^everybird-lang=pt; Max-Age=31536000; Path=\/; SameSite=Lax/)
  })
})
