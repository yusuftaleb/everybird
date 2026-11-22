// @vitest-environment jsdom
// The Display panel's segmented rows (DisplaySegments): an unavailable choice pressed says why in one status line under
// the row (touch has no tooltip), and the dock's panels and the bird card are sheets on a short window (useIsSheet).
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DisplaySegments } from '@/components/app/DisplayPanel'
import { useIsSheet } from '@/components/dialog-utils'

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('DisplaySegments (AD4)', () => {
  it('pressing an unavailable choice shows its reason under the row; another choice takes it away', () => {
    const onChange = vi.fn()
    render(
      <DisplaySegments
        label="Layout" value="rect" onChange={onChange} testId="seg"
        options={[{ value: 'fan', label: 'Fan', off: 'Too many to draw' }, { value: 'rect', label: 'Rectangular' }, { value: 'radial', label: 'Radial' }]}
      />,
    )
    const why = screen.getByTestId('seg-why')
    expect(why).toHaveAttribute('role', 'status')
    expect(why).toBeEmptyDOMElement()
    fireEvent.click(screen.getByRole('button', { name: 'Fan' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(why).toHaveTextContent('Too many to draw')
    fireEvent.click(screen.getByRole('button', { name: 'Radial' }))
    expect(onChange).toHaveBeenCalledWith('radial')
    expect(why).toBeEmptyDOMElement()
  })
})

describe('useIsSheet (AD2)', () => {
  it('a phone-wide window is a sheet; a short one only where the caller asks (the dock panels, the card)', () => {
    vi.stubGlobal('matchMedia', undefined)
    vi.stubGlobal('innerWidth', 900)
    vi.stubGlobal('innerHeight', 420)
    expect(renderHook(() => useIsSheet()).result.current).toBe(false)
    expect(renderHook(() => useIsSheet({ short: true })).result.current).toBe(true)
    vi.stubGlobal('innerHeight', 800)
    expect(renderHook(() => useIsSheet({ short: true })).result.current).toBe(false)
    vi.stubGlobal('innerWidth', 390)
    expect(renderHook(() => useIsSheet()).result.current).toBe(true)
  })
  it('reads the media query with the height when asked', () => {
    const asked: string[] = []
    vi.stubGlobal('matchMedia', (q: string) => { asked.push(q); return { matches: false, media: q, addEventListener() {}, removeEventListener() {} } })
    renderHook(() => useIsSheet({ short: true }))
    expect(asked).toContain('(max-width: 600px), (max-height: 500px)')
  })
})
