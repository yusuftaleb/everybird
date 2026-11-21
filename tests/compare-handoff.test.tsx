// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import type { MouseEvent, ReactNode } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HANDOFF_KEY, handOff, takeHandOff } from '@/lib/share/compare-handoff'
import { CompareWithMine } from '@/components/compare/CompareWithMine'

// next/link as a plain link whose navigation is held, so the click's own handler is what is tested.
vi.mock('next/link', () => ({
  default: ({ href, children, onClick, ...rest }: { href: string; children: ReactNode; onClick?: (e: MouseEvent) => void }) => (
    <a href={href} {...rest} onClick={(e) => { onClick?.(e); e.preventDefault() }}>{children}</a>
  ),
}))

afterEach(() => {
  cleanup()
  sessionStorage.clear()
})

describe('the Compare with mine hand-over', () => {
  it('is read once, then gone', () => {
    handOff('/s/1abc')
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBe('/s/1abc')
    expect(takeHandOff()).toBe('/s/1abc')
    expect(takeHandOff()).toBeNull()
  })
  it('gives nothing, and throws nothing, when storage is blocked', () => {
    const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => {} }
    expect(() => handOff('/s/1abc', blocked)).not.toThrow()
    expect(takeHandOff(blocked)).toBeNull()
    expect(takeHandOff(null)).toBeNull()
  })
  it('the button opens /compare with the link handed over, never in the address', () => {
    render(<CompareWithMine path="/c/cXYZ" />)
    const a = screen.getByRole('link', { name: 'Compare with mine' })
    expect(a).toHaveAttribute('href', '/compare')
    fireEvent.click(a)
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBe('/c/cXYZ')
  })
})
