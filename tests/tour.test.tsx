// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tour } from '@/components/app/Tour'
import { resetTouredForTests, TOUR_KEY, toured } from '@/lib/tour'
import { withI18n } from './i18n-render'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}

/** The sample's bar and stage, as the tour finds them (synthetic: no real collage). */
function landing() {
  const main = document.createElement('main')
  main.className = 'eb-page-landing'
  main.innerHTML = `<section class="eb-view">
    <div data-tour="view"><button>Collage</button></div>
    <button data-tour="filter">Filters</button>
    <div class="eb-stagewrap"><button class="eb-bird" data-code="a">A</button></div>
  </section>`
  document.body.append(main)
  for (const el of main.querySelectorAll<HTMLElement>('button, div')) {
    el.getBoundingClientRect = () => ({ x: 20, y: 100, left: 20, top: 100, right: 120, bottom: 144, width: 100, height: 44, toJSON: () => ({}) })
  }
  return main
}

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('requestAnimationFrame', (f: FrameRequestCallback) => setTimeout(() => f(0), 0) as unknown as number)
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  resetTouredForTests()
})
afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.unstubAllGlobals() })

const note = () => screen.queryByTestId('tour')

describe('the sample tour', () => {
  it('walks Filter, View and a bird, each note announced by its step and ringing its target', async () => {
    const main = landing()
    render(<Tour onOwn={() => {}} onEnd={() => {}} />, { wrapper: withI18n('en') })
    const steps: string[] = []
    for (let i = 0; i < 3; i++) {
      await act(async () => { await new Promise((r) => setTimeout(r, 5)) })
      const d = screen.getByRole('dialog')
      steps.push(d.getAttribute('data-step')!)
      expect(d).toHaveFocus()
      expect(d).toHaveAccessibleName(`${i + 1} of 3`)
      expect(main.querySelectorAll('[data-tour-on]')).toHaveLength(1)
      if (i < 2) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    expect(steps).toEqual(['filter', 'view', 'bird'])
    expect(main.querySelector('[data-tour-on]')).toHaveClass('eb-bird')
    expect(screen.getByRole('button', { name: 'Use your own list' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Next' })).toBeNull()
  })

  it('every step can be skipped, for good on this device', async () => {
    landing()
    const onEnd = vi.fn()
    render(<Tour onOwn={() => {}} onEnd={onEnd} />, { wrapper: withI18n('en') })
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(onEnd).toHaveBeenCalledOnce()
    expect(localStorage.getItem(TOUR_KEY)).toBe('1')
    expect(toured()).toBe(true)
  })

  it('Escape ends it, unless a dialog opened over it takes that Escape', () => {
    landing()
    const onEnd = vi.fn()
    render(<Tour onOwn={() => {}} onEnd={onEnd} />, { wrapper: withI18n('en') })
    const taken = (e: KeyboardEvent) => { if (e.key === 'Escape') e.stopImmediatePropagation() }
    window.addEventListener('keydown', taken, true) // as useEscapeCapture does
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEnd).not.toHaveBeenCalled()
    window.removeEventListener('keydown', taken, true)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onEnd).toHaveBeenCalledOnce()
    expect(toured()).toBe(true)
  })

  it('"Use your own list" ends the tour and opens what Make yours opens', async () => {
    landing()
    const onOwn = vi.fn(), onEnd = vi.fn()
    render(<Tour onOwn={onOwn} onEnd={onEnd} />, { wrapper: withI18n('en') })
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(screen.getByRole('button', { name: 'Use your own list' }))
    expect(onEnd).toHaveBeenCalledOnce()
    expect(onOwn).toHaveBeenCalledOnce()
    expect(toured()).toBe(true)
    expect(note()).toBeInTheDocument() // the parent unmounts it (onEnd)
  })

  it('without storage it is remembered for the page load', () => {
    const blocked = () => { throw new DOMException('blocked', 'SecurityError') }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked })
    expect(toured()).toBe(false)
    landing()
    render(<Tour onOwn={() => {}} onEnd={() => {}} />, { wrapper: withI18n('en') })
    fireEvent.click(screen.getByRole('button', { name: 'Skip tour' }))
    expect(toured()).toBe(true)
  })
})
