// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeToggle } from '@/components/app/ThemeToggle'
import { THEME_KEY, THEME_SCRIPT } from '@/lib/theme'

const html = document.documentElement
const run = () => new Function(THEME_SCRIPT)()

// Node 25 ships its own (unconfigured) localStorage global, which shadows jsdom's: use a plain in-memory one.
class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
let store: MemoryStorage
beforeEach(() => {
  html.removeAttribute('data-theme')
  store = new MemoryStorage()
  vi.stubGlobal('localStorage', store)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('theme before paint (the inline script)', () => {
  it('is light by default, even when the system prefers dark', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('dark'), media: q, addEventListener() {}, removeEventListener() {} }))
    run()
    expect(html.dataset.theme).toBe('light')
  })
  it('applies a stored dark choice', () => {
    store.setItem(THEME_KEY, 'dark')
    run()
    expect(html.dataset.theme).toBe('dark')
  })
  it('falls back to light when storage throws', () => {
    vi.spyOn(store, 'getItem').mockImplementation(() => { throw new Error('SecurityError') })
    run()
    expect(html.dataset.theme).toBe('light')
  })
})

describe('ThemeToggle', () => {
  it('switches the page to dark and back, and remembers the choice on this device', async () => {
    run()
    render(<ThemeToggle />)
    const sw = screen.getByRole('switch', { name: 'Dark mode' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    await act(async () => { fireEvent.click(sw) })
    expect(html.dataset.theme).toBe('dark')
    expect(store.getItem(THEME_KEY)).toBe('dark')
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await act(async () => { fireEvent.click(sw) })
    expect(html.dataset.theme).toBe('light')
    expect(store.getItem(THEME_KEY)).toBe('light')
  })
  it('still switches when storage refuses the write', async () => {
    run()
    vi.spyOn(store, 'setItem').mockImplementation(() => { throw new Error('QuotaExceededError') })
    render(<ThemeToggle />)
    await act(async () => { fireEvent.click(screen.getByRole('switch', { name: 'Dark mode' })) })
    expect(html.dataset.theme).toBe('dark')
  })
})
