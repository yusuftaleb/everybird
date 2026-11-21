// @vitest-environment jsdom
// The share dialog's round 6, items 7, 9, 18 and 19: opening Export in batches or a goal leaves the dialog's size to the
// card and the closed column (closedHeight), and its dropdowns open at their own button, upward when there is no room
// below (menuPlace), in the top layer (a popover) so nothing in the dialog contains or clips them; the dialog keeps no
// containing block for fixed descendants once open (share.css).
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef, useRef } from 'react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { closedHeight } from '@/components/share/ShareDialog'
import { MenuSelect, menuPlace } from '@/components/share/MenuSelect'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

describe('closedHeight: the column as if nothing were opened', () => {
  const sized = (el: HTMLElement, h: number) => Object.defineProperty(el, 'offsetHeight', { configurable: true, value: h })
  it('leaves out what Export in batches and a goal open', () => {
    const col = document.createElement('div')
    const body = document.createElement('section')
    body.dataset.opened = ''
    const goal = document.createElement('div')
    goal.dataset.opened = 'grow'
    goal.style.minHeight = '36px'
    col.append(body, goal)
    sized(col, 900)
    sized(body, 180)
    sized(goal, 80) // the open goal wrapped to two lines: 44px more than its closed row
    expect(closedHeight(col)).toBe(900 - 180 - 44)
    sized(goal, 36)
    expect(closedHeight(col)).toBe(900 - 180)
  })
})

describe('menuPlace: a menu fixed to its button', () => {
  const vw = 1440, vh = 830
  it('depends on the button and the window only: right-aligned at the button, past the dialog\'s edges where it needs', () => {
    // Split by in a centred Story dialog (x 230 to 1210, bottom edge 815): its button near the dialog's foot. The menu
    // ends at the button's right edge (1210 − 20 from the window's right) and takes the room under it to the window's
    // edge, whatever the dialog's box.
    const b = { top: 740, bottom: 776, right: 1190 }
    const down = menuPlace(b, 40, 220, vw, vh)
    expect(down).toEqual({ up: false, y: 782, maxH: vh - 776 - 6 - 8, right: vw - 1190 })
    // A list too long for that room opens upward over the dialog, its bottom 6px over the button.
    const up = menuPlace(b, 300, 220, vw, vh)
    expect(up).toMatchObject({ up: true, y: vh - 740 + 6, maxH: 740 - 6 - 8, right: vw - 1190 })
    // A menu wider than the room left of its button still keeps its left edge 8px inside the window (not the dialog).
    expect(menuPlace({ top: 100, bottom: 136, right: 180 }, 40, 220, vw, vh).right).toBe(vw - 8 - 220)
  })
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
  it('shows the menu in the top layer (a manual popover) where the browser has it, placed from its button\'s box', () => {
    const shown: Element[] = []
    const show = vi.fn(function (this: HTMLElement) { shown.push(this) })
    const hide = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: show })
    Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: hide })
    try {
      render(<Dialog />)
      const btn = screen.getByRole('button', { name: 'Split by Alpha' })
      vi.spyOn(btn, 'getBoundingClientRect').mockReturnValue({ top: 300, bottom: 336, right: 900, left: 760, width: 140, height: 36, x: 760, y: 300, toJSON: () => ({}) } as DOMRect)
      fireEvent.click(btn)
      // jsdom can't put the stub's popover in its open state, so it counts it as hidden (and gives it no accessible
      // name): `hidden: true` finds it, its name checked as its attribute.
      const menu = screen.getByRole('menu', { hidden: true })
      expect(menu).toHaveAttribute('aria-label', 'Split by')
      expect(menu).toHaveAttribute('popover', 'manual')
      expect(shown).toContain(menu)
      // Still in the modal dialog's DOM (keyboard, assistive technology), out of the scrolling column.
      expect(screen.getByRole('dialog')).toContainElement(menu)
      expect(menu.style.position).toBe('fixed')
      expect(menu.style.top).toBe('342px')
      expect(menu.style.right).toBe(`${(document.documentElement.clientWidth || window.innerWidth) - 900}px`)
      const [alpha, beta] = screen.getAllByRole('menuitemradio', { hidden: true })
      expect(alpha).toHaveTextContent('Alpha')
      expect(alpha).toHaveFocus()
      // Escape is the dialog's to hand over; a pick closes it and leaves the top layer.
      fireEvent.click(beta)
      expect(screen.queryByRole('menu', { hidden: true })).toBeNull()
      expect(hide).toHaveBeenCalled()
    } finally {
      delete (HTMLElement.prototype as Partial<HTMLElement>).showPopover
      delete (HTMLElement.prototype as Partial<HTMLElement>).hidePopover
    }
  })
  it('without the popover API (the fallback), renders the open menu in the dialog, outside the scrolling column, fixed to its button', () => {
    render(<Dialog />)
    fireEvent.click(screen.getByRole('button', { name: 'Split by Alpha' }))
    const menu = screen.getByRole('menu', { name: 'Split by' })
    expect(screen.getByRole('dialog')).toContainElement(menu)
    expect(screen.getByTestId('scroll')).not.toContainElement(menu)
    expect(menu.style.position).toBe('fixed')
    expect(menu).toHaveAttribute('data-layer')
    expect(menu).not.toHaveAttribute('popover')
    expect(screen.getByRole('menuitemradio', { name: 'Alpha' })).toHaveFocus()
  })
})

// A fixed element is placed against the window only while no ancestor is its containing block: a transform, filter,
// contain, will-change or container-type in effect makes one (and its overflow then clips it). The menu is in the top
// layer where it can be; for the fallback the dialog keeps none once its entry has played.
describe('the dialog keeps no containing block for its menus once open (round 6, item 19)', () => {
  // Comments left out (the dialog's says why its fill mode is backwards).
  const css = readFileSync('src/components/share/share.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const rules = (sel: string) => [...css.matchAll(new RegExp(`(^|[\\s},])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g'))].map((m) => m[2])
  it('the dialog\'s entry transform does not fill forwards, and the dialog has no transform, filter, contain or will-change', () => {
    const dialog = rules('.eb-share').join(';')
    expect(dialog).toMatch(/animation:\s*eb-share-in [^;]*\bbackwards\b/)
    expect(dialog).not.toMatch(/\b(both|forwards)\b/)
    for (const sel of ['.eb-share', '.eb-share-scrim', '.eb-share-scrim .eb-share']) {
      for (const r of rules(sel)) expect(r, sel).not.toMatch(/(^|[;\s])(transform|filter|contain|will-change|perspective|backdrop-filter):/)
    }
  })
  it('the scrim\'s container-type (item 18\'s card size) is allowed only because the menu is in the top layer, and the scrim is the window\'s own box', () => {
    expect(rules('.eb-share-scrim').join(';')).toMatch(/container-type:\s*size/)
    expect(rules('.eb-share-scrim')[0]).toMatch(/position:\s*fixed;\s*inset:\s*0/)
    // The shared top-layer placement (menu-layer.ts; site-wide in tests/menu-layer.test.tsx).
    expect(readFileSync('src/components/share/MenuSelect.tsx', 'utf8')).toContain('useMenuLayer(menu, btn, { on: !!into })')
    expect(readFileSync('src/components/menu-layer.ts', 'utf8')).toContain('el.showPopover()')
    expect(readFileSync('src/components/app/app.css', 'utf8')).toMatch(/\.eb-menu\[popover\] \{ margin: 0; color: var\(--ink\); \}/)
  })
})
