// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Welcome } from '@/components/app/Welcome'
import { resetWelcomedForTests, WELCOME_KEY } from '@/lib/welcome'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const dialog = () => screen.queryByRole('dialog', { name: "A lifetime of birds, as a sticker collage." })

// Node 25 ships its own (unconfigured) localStorage global, which shadows jsdom's: use a plain in-memory one.
class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  resetWelcomedForTests()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the first-visit welcome', () => {
  it('opens as a modal labelled by its line, with focus on "Make mine" (to the ways in on Settings)', () => {
    render(<Welcome />)
    const d = dialog()!
    expect(d).toHaveAttribute('aria-modal', 'true')
    const make = screen.getByRole('link', { name: /Make mine/ })
    expect(make).toHaveAttribute('href', '/settings#sources')
    expect(document.activeElement).toBe(make)
    expect(screen.getByRole('button', { name: 'Explore the sample' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it.each([
    ['Explore the sample', () => fireEvent.click(screen.getByRole('button', { name: 'Explore the sample' }))],
    ['✕', () => fireEvent.click(screen.getByRole('button', { name: 'Close' }))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['a press outside', (d: HTMLElement) => fireEvent.click(d.parentElement!)],
    ['Make mine', () => fireEvent.click(screen.getByRole('link', { name: /Make mine/ }))],
  ])('%s closes it for good on this device', (_name, act_) => {
    render(<Welcome />)
    act(() => act_(dialog()!))
    if (_name !== 'Make mine') expect(dialog()).toBeNull()
    expect(localStorage.getItem(WELCOME_KEY)).toBe('1')
    cleanup()
    resetWelcomedForTests()
    render(<Welcome />)
    expect(dialog()).toBeNull()
  })

  // Tab staying inside is checked in a real browser (e2e/welcome.spec.ts): jsdom's querySelectorAll lists a selector
  // group's matches by selector, not in document order.

  it('without storage it still opens, closes, and stays closed for the rest of the page load', () => {
    const blocked = () => { throw new DOMException('blocked', 'SecurityError') }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
    render(<Welcome />)
    expect(dialog()).not.toBeNull()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(dialog()).toBeNull()
    cleanup()
    render(<Welcome />)
    expect(dialog()).toBeNull()
  })
})
