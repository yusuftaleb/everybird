// The controls bar's row (round 6, Yusuf, 2026-11-20): Taxa, Display and Filters as panel buttons, one panel open at a
// time, and which Display controls each view shows (dock-panels.ts). The old measured Tree row (dockRowWidth) went with
// the Tree's menus.
import { describe, expect, it } from 'vitest'
import { DISPLAY_CONTROLS, hasDisplay, pressPanel } from '@/lib/dock-panels'
import { dropRoom, DROP_MARGIN } from '@/components/filters/Filters'

describe('which Display controls each view shows', () => {
  it('Tree: Layout, then Lifers only, Time scale and Scientific names; no Level', () => {
    expect(DISPLAY_CONTROLS.tree).toEqual(['layout', 'mine', 'time', 'sci'])
  })
  it('Collage: Arrangement, True size (the switch it had in the bar) and Scientific names', () => {
    expect(DISPLAY_CONTROLS.collage).toEqual(['arrange', 'true', 'sci'])
  })
  it('List and Map: no Display panel (their controls stay in the bar)', () => {
    expect(hasDisplay('list')).toBe(false)
    expect(hasDisplay('map')).toBe(false)
    expect(hasDisplay('collage')).toBe(true)
    expect(hasDisplay('tree')).toBe(true)
  })
})

describe('one panel open at a time', () => {
  it('a press opens its panel, closing whichever was open; a second press on it closes it', () => {
    expect(pressPanel(null, 'taxa')).toBe('taxa')
    expect(pressPanel('taxa', 'display')).toBe('display')
    expect(pressPanel('display', 'filters')).toBe('filters')
    expect(pressPanel('filters', 'filters')).toBeNull()
    expect(pressPanel('taxa', 'taxa')).toBeNull()
  })
})

describe('a popover reaches down to the window, never past it', () => {
  it('the room from its top to the window bottom, less the margin', () => {
    expect(dropRoom(120, 800)).toBe(800 - 120 - DROP_MARGIN)
  })
  it('at least 240px when the window leaves less (the page scrolls to it)', () => {
    expect(dropRoom(700, 800)).toBe(240)
  })
})
