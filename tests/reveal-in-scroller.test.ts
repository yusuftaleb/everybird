// @vitest-environment jsdom
// revealInScroller (dialog-utils.ts): a panel's list scrolls to show a row; the page never does (round 6 polish: nothing
// chosen in a panel scrolls the page). jsdom has no layout, so the boxes are stubbed.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { keyboardInset, revealInScroller } from '@/components/dialog-utils'

const rect = (top: number, h: number) => ({ top, bottom: top + h, left: 0, right: 100, width: 100, height: h, x: 0, y: top, toJSON: () => ({}) }) as DOMRect

function setup(rowTop: number) {
  document.body.innerHTML = '<div id="list" style="overflow-y: auto"><ul><li id="row">Canada</li></ul></div>'
  const list = document.getElementById('list')!, row = document.getElementById('row')!
  Object.defineProperty(list, 'scrollHeight', { value: 800 })
  Object.defineProperty(list, 'clientHeight', { value: 200 })
  list.getBoundingClientRect = () => rect(100, 200)
  row.getBoundingClientRect = () => rect(rowTop, 30)
  return { list, row }
}
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

describe('revealInScroller', () => {
  it('scrolls the list just enough for a row below it, and never the window', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    const { list, row } = setup(400)
    revealInScroller(row)
    expect(list.scrollTop).toBe(130) // the row's bottom (430) to the list's (300)
    expect(scroll).not.toHaveBeenCalled()
  })

  it('scrolls up for a row above the list; leaves a row in view alone', () => {
    const { list, row } = setup(60)
    list.scrollTop = 100
    revealInScroller(row)
    expect(list.scrollTop).toBe(60)
    const again = setup(150)
    again.list.scrollTop = 20
    revealInScroller(again.row)
    expect(again.list.scrollTop).toBe(20)
  })

  it('does nothing without a scrolling ancestor (it would be the page)', () => {
    document.body.innerHTML = '<p id="row">Canada</p>'
    const row = document.getElementById('row')!
    expect(() => revealInScroller(row)).not.toThrow()
    expect(document.documentElement.scrollTop).toBe(0)
  })
})

describe('keyboardInset (the Add birds sheet above the on-screen keyboard)', () => {
  it('is the layout viewport under the visual one, never negative, 0 without a visual viewport', () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336)
    expect(keyboardInset(844, { height: 508, offsetTop: 40 })).toBe(296) // the page panned up under the keys
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0)
    expect(keyboardInset(844, { height: 900, offsetTop: 0 })).toBe(0)
    expect(keyboardInset(844, null)).toBe(0)
  })
})
