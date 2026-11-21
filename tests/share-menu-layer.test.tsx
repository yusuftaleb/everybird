// @vitest-environment jsdom
// The share dialog's round 6, item 9: its dropdowns open in a layer over everything, fixed to their button, upward when
// there is no room below (menuPlace). (Item 7's closed-height measure is gone: the dialog's size is the window's.)
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef, useRef } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { MenuSelect, menuPlace } from '@/components/share/MenuSelect'

afterEach(cleanup)

describe('menuPlace: a menu fixed to its button', () => {
  const vw = 1440, vh = 830
  it('opens under the button, right-aligned to it, when its list fits there', () => {
    const p = menuPlace({ top: 200, bottom: 236, right: 1300 }, 240, 200, vw, vh)
    expect(p).toEqual({ up: false, y: 242, maxH: vh - 236 - 6 - 8, right: 140 })
  })
  it('opens upward when the list does not fit below and there is more room above', () => {
    const p = menuPlace({ top: 700, bottom: 736, right: 1300 }, 240, 200, vw, vh)
    expect(p.up).toBe(true)
    // Its bottom 6px over the button's top; at most the room above it.
    expect(p.y).toBe(vh - 700 + 6)
    expect(p.maxH).toBe(700 - 6 - 8)
  })
  it('stays under the button when there is less room above (it scrolls in what there is)', () => {
    const p = menuPlace({ top: 100, bottom: 136, right: 1300 }, 900, 200, vw, vh)
    expect(p.up).toBe(false)
    expect(p.maxH).toBe(vh - 136 - 14)
  })
  it('never past the window: its left edge kept 8px inside', () => {
    expect(menuPlace({ top: 100, bottom: 136, right: 150 }, 100, 200, vw, vh).right).toBe(vw - 8 - 200)
    expect(menuPlace({ top: 100, bottom: 136, right: 1439 }, 100, 200, vw, vh).right).toBe(8)
  })
})

describe('MenuSelect in a layer', () => {
  function Dialog() {
    const layer = useRef<HTMLDivElement>(null)
    return (
      <div ref={layer} role="dialog" aria-label="Share">
        <div className="eb-share-scroll" data-testid="scroll">
          <span id="lbl">Split by</span>
          <MenuSelect labelledBy="lbl" menuLabel="Split by" escapeRef={createRef()} layer={layer} value="a" onChange={() => {}}
            options={[{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }]} />
        </div>
      </div>
    )
  }
  it('renders the open menu in the dialog, outside the scrolling column, fixed to its button', () => {
    render(<Dialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Split by Alpha' }))
    const menu = screen.getByRole('menu', { name: 'Split by' })
    expect(screen.getByRole('dialog')).toContainElement(menu)
    expect(screen.getByTestId('scroll')).not.toContainElement(menu)
    expect(menu.style.position).toBe('fixed')
    expect(menu).toHaveAttribute('data-layer')
    expect(screen.getByRole('menuitemradio', { name: 'Alpha' })).toHaveFocus()
  })
})
