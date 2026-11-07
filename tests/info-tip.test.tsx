// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { InfoTip } from '@/components/app/InfoTip'

afterEach(cleanup)

describe('InfoTip (the "?" beside True size)', () => {
  it('describes its button, opens on a tap and closes on a second tap or Escape', () => {
    render(<InfoTip label="About True size">Sized by body weight.</InfoTip>)
    const btn = screen.getByRole('button', { name: 'About True size' })
    const tip = document.getElementById(btn.getAttribute('aria-describedby')!)!
    expect(tip).toHaveTextContent('Sized by body weight.')
    expect(tip).toHaveAttribute('role', 'tooltip')
    expect(tip.hidden).toBe(true)
    fireEvent.click(btn)
    expect(tip.hidden).toBe(false)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(btn)
    expect(tip.hidden).toBe(true)
    fireEvent.click(btn)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(tip.hidden).toBe(true)
  })
  it('opens on hover and closes when the pointer leaves (unless tapped open)', () => {
    render(<InfoTip label="About True size">Sized by body weight.</InfoTip>)
    const btn = screen.getByRole('button', { name: 'About True size' })
    const tip = document.getElementById(btn.getAttribute('aria-describedby')!)!
    fireEvent.mouseEnter(btn)
    expect(tip.hidden).toBe(false)
    fireEvent.mouseLeave(btn)
    expect(tip.hidden).toBe(true)
  })
})
