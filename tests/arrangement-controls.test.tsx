// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControlsBar } from '@/components/app/ControlsBar'
import { ARRANGEMENT_KEY, arrangement, setArrangement } from '@/lib/arrangement'
import { withI18n } from './i18n-render'

afterEach(() => { cleanup(); localStorage.clear() })

function bar(props: Partial<Parameters<typeof ControlsBar>[0]> = {}) {
  const onTrueSize = vi.fn(), onChange = vi.fn()
  render(
    <ControlsBar view="collage" onView={() => {}} trueSize={false} onTrueSize={onTrueSize} lightFirst={false} onDirection={() => {}} sci={false} onSci={() => {}}
      arrangement={{ value: 'packed', onChange }} {...props} />,
    { wrapper: withI18n('en') },
  )
  return { onTrueSize, onChange }
}

describe('Arrangement control', () => {
  it('is a named group of three pressed buttons, even without a dated lifer', () => {
    const { onChange } = bar()
    const group = screen.getByRole('group', { name: 'Arrangement' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Packed', 'By family', 'By colour'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    fireEvent.click(buttons[2])
    expect(onChange).toHaveBeenCalledWith('colour')
  })

  it('is left out of list view', () => {
    bar({ view: 'list' })
    expect(screen.queryByRole('group', { name: 'Arrangement' })).toBeNull()
  })

  it('By family keeps True size focusable but off, and says why', () => {
    const { onTrueSize } = bar({ trueSize: true, trueOff: true })
    const sw = screen.getByRole('switch', { name: /True size/ })
    expect(sw).toHaveAttribute('aria-disabled', 'true')
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(sw).toHaveAccessibleDescription('Not available by family: the birds in a row share one height.')
    fireEvent.click(sw)
    expect(onTrueSize).not.toHaveBeenCalled()
  })

  it('is remembered per device, Packed by default', () => {
    expect(arrangement()).toBe('packed')
    setArrangement('family')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBe('family')
    expect(arrangement()).toBe('family')
    setArrangement('packed')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBeNull()
    localStorage.setItem(ARRANGEMENT_KEY, 'oval')
    expect(arrangement()).toBe('packed')
  })
})
