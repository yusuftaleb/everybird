// @vitest-environment jsdom
// "Back to top" (BackToTop): hidden near the top of the page, shown past SHOW_AFTER, and pressing it scrolls to the
// top, moves focus to <main> and sends the button away until the page has arrived.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { BackToTop, SHOW_AFTER } from '@/components/app/BackToTop'
import { MESSAGES, withI18n } from './i18n-render'

const scrollTo = (y: number) => act(() => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true })
  fireEvent.scroll(window)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

it('shows past SHOW_AFTER, goes to the top on press and stays away until it arrives', () => {
  const go = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  render(<main><BackToTop /></main>, { wrapper: withI18n('es') })
  const button = screen.getByTestId('to-top')
  expect(button).toHaveAttribute('aria-label', MESSAGES.es.ui.shell.toTop)
  expect(button).toHaveAttribute('data-hidden')
  expect(button).toHaveAttribute('tabindex', '-1')

  scrollTo(SHOW_AFTER + 500)
  expect(button).not.toHaveAttribute('data-hidden')
  expect(button).toHaveAttribute('tabindex', '0')

  fireEvent.click(button)
  expect(go).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  expect(button).toHaveAttribute('data-hidden')
  expect(button).toHaveAttribute('data-launched')
  expect(document.activeElement).toBe(document.querySelector('main'))

  // Still far down, gliding up: it stays away.
  scrollTo(SHOW_AFTER + 200)
  expect(button).toHaveAttribute('data-hidden')
  // Arrived: ready again, and hidden because the page is at the top.
  scrollTo(0)
  expect(button).not.toHaveAttribute('data-launched')
  expect(button).toHaveAttribute('data-hidden')
  scrollTo(SHOW_AFTER + 50)
  expect(button).not.toHaveAttribute('data-hidden')
})
