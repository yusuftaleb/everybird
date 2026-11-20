// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControlsBar } from '@/components/app/ControlsBar'
import { ARRANGEMENT_KEY, arrangement, setArrangement } from '@/lib/arrangement'
import { darkImage, resetDarkImageForTests } from '@/lib/dark-image'
import { withI18n } from './i18n-render'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
  clear() { this.m.clear() }
}
beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()) })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); resetDarkImageForTests() })

/** The bar with its Style panel open. */
function bar(props: Partial<Parameters<typeof ControlsBar>[0]> = {}) {
  const onTrueSize = vi.fn(), onChange = vi.fn(), onDirection = vi.fn(), onSci = vi.fn()
  render(
    <ControlsBar view="collage" onView={() => {}} trueSize={false} onTrueSize={onTrueSize} lightFirst={false} onDirection={onDirection} sci={false} onSci={onSci}
      arrangement={{ value: 'packed', onChange }} {...props} />,
    { wrapper: withI18n('en') },
  )
  fireEvent.click(screen.getByRole('button', { name: 'Style' }))
  return { onTrueSize, onChange, onDirection, onSci }
}

describe('the bar: views, Filters, Style, Share', () => {
  it('Compare is a link after the four views; Share is a button that opens the dialog', () => {
    const onShare = vi.fn()
    render(
      <ControlsBar view="collage" onView={() => {}} compare share={{ onShare }} trueSize={false} onTrueSize={() => {}} lightFirst={false} onDirection={() => {}} sci={false} onSci={() => {}} />,
      { wrapper: withI18n('en') },
    )
    const views = screen.getByRole('group', { name: 'View' })
    expect(within(views).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Collage', 'List', 'Map', 'Tree'])
    expect(within(views).getByRole('link', { name: 'Compare' })).toHaveAttribute('href', '/compare')
    fireEvent.click(screen.getByRole('button', { name: 'Share' }))
    expect(onShare).toHaveBeenCalledOnce()
    // The look's switches are no longer in the bar: they're in Style.
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('Style opens a dialog named Style, and Escape closes it', () => {
    bar()
    const btn = screen.getByRole('button', { name: 'Style' })
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: 'Style' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Style' })).toBeNull()
  })

  it('a control the view cannot use stays, disabled, with the reason as its description', () => {
    const { onDirection, onChange, onSci } = bar({ view: 'map' })
    const sort = screen.getByRole('group', { name: 'Sort' })
    expect(sort).toHaveAccessibleDescription('Only in the List view.')
    fireEvent.click(within(sort).getByRole('button', { name: 'Lightest first' }))
    expect(onDirection).not.toHaveBeenCalled()
    const arr = screen.getByRole('group', { name: 'Arrangement' })
    expect(arr).toHaveAccessibleDescription('Only in the Collage view.')
    fireEvent.click(within(arr).getByRole('button', { name: 'Oval' }))
    expect(onChange).not.toHaveBeenCalled()
    const sci = screen.getByRole('switch', { name: 'Scientific names' })
    expect(sci).toHaveAttribute('aria-disabled', 'true')
    expect(sci).toHaveAccessibleDescription('The map shows no bird names.')
    fireEvent.click(sci)
    expect(onSci).not.toHaveBeenCalled()
  })

  it('in list view the sort order works and the collage controls say why they are off', () => {
    const { onDirection } = bar({ view: 'list' })
    fireEvent.click(within(screen.getByRole('group', { name: 'Sort' })).getByRole('button', { name: 'Lightest first' }))
    expect(onDirection).toHaveBeenCalledOnce()
    expect(screen.getByRole('switch', { name: 'True size' })).toHaveAccessibleDescription('Only in the Collage view.')
  })

  it('Dark image is offered only where the bar has Share, and follows the theme until set', () => {
    bar()
    expect(screen.queryByRole('switch', { name: 'Dark image' })).toBeNull()
    cleanup()
    render(
      <ControlsBar view="list" onView={() => {}} share={{ onShare: () => {} }} trueSize={false} onTrueSize={() => {}} lightFirst={false} onDirection={() => {}} sci={false} onSci={() => {}} />,
      { wrapper: withI18n('en') },
    )
    fireEvent.click(screen.getByRole('button', { name: 'Style' }))
    const dark = screen.getByRole('switch', { name: 'Dark image' })
    expect(dark).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(dark)
    expect(dark).toHaveAttribute('aria-checked', 'true')
    expect(darkImage()).toBe(true)
  })
})

describe('Arrangement control', () => {
  it('is a named group of four pressed buttons, even without a dated lifer', () => {
    const { onChange } = bar()
    const group = screen.getByRole('group', { name: 'Arrangement' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['Packed', 'Oval', 'By family', 'By colour'])
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false'])
    fireEvent.click(buttons[1])
    expect(onChange).toHaveBeenCalledWith('oval')
    fireEvent.click(buttons[3])
    expect(onChange).toHaveBeenCalledWith('colour')
  })

  it('Oval keeps True size available', () => {
    bar({ arrangement: { value: 'oval', onChange: vi.fn() } })
    const sw = screen.getByRole('switch', { name: /True size/ })
    expect(sw).not.toHaveAttribute('aria-disabled')
    expect(within(screen.getByRole('group', { name: 'Arrangement' })).getByRole('button', { name: 'Oval' })).toHaveAttribute('aria-pressed', 'true')
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
    setArrangement('oval')
    expect(arrangement()).toBe('oval')
    setArrangement('packed')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBeNull()
    localStorage.setItem(ARRANGEMENT_KEY, 'spiral')
    expect(arrangement()).toBe('packed')
  })
})
