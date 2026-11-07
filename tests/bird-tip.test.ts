import { describe, expect, it } from 'vitest'
import { tipPosition } from '@/components/collage/tip-position'

// Rects in viewport coordinates: the stage wrapper at (100, 200), 800 wide; the tip is 240 x 90. 
const wrap = { left: 100, top: 200, width: 800 }
const tip = { w: 240, h: 90 }

describe('tipPosition (the hover tooltip, as on /lifelist)', () => {
  it('sits centred above the bird, 14px clear, in the wrapper\'s coordinates', () => {
    const bird = { left: 500, top: 500, width: 60, height: 40 }
    expect(tipPosition(bird, wrap, tip)).toEqual({ left: 500 + 30 - 100 - 120, top: 500 - 200 - 14 - 90, below: false })
  })

  it('drops below the bird when there is no room above it on screen', () => {
    const bird = { left: 500, top: 60, width: 60, height: 40 }
    expect(tipPosition(bird, wrap, tip)).toEqual({ left: 310, top: 60 + 40 - 200 + 14, below: true })
  })

  it('stays inside the wrapper, 4px from either edge', () => {
    expect(tipPosition({ left: 102, top: 500, width: 20, height: 20 }, wrap, tip).left).toBe(4)
    expect(tipPosition({ left: 880, top: 500, width: 20, height: 20 }, wrap, tip).left).toBe(800 - 240 - 4)
  })

  it('stays inside the stage vertically when its height is known (a bird at the bottom edge)', () => {
    const stage = { left: 100, top: 200, width: 800, height: 300 }
    // Near the top of the screen there is no room above, so it would drop below the stage's bottom: it is held inside.
    expect(tipPosition({ left: 500, top: 60, width: 60, height: 400 }, { ...stage, top: 50 }, tip).top).toBe(300 - 90 - 4)
    expect(tipPosition({ left: 500, top: 500, width: 60, height: 40 }, stage, tip).top).toBe(500 - 200 - 14 - 90) // already inside
  })

  it('a tip wider than the wrapper starts at its left edge', () => {
    expect(tipPosition({ left: 150, top: 500, width: 20, height: 20 }, { left: 100, top: 200, width: 200 }, tip).left).toBe(4)
  })
  it('treats the shown top bar as the top of the screen: no room above it puts the tip below', () => {
    const wrap = { left: 0, top: 0, width: 800 }
    const tip = { w: 200, h: 90 }
    const bird = { left: 300, top: 130, width: 60, height: 40 }
    expect(tipPosition(bird, wrap, tip).below).toBe(false) // 130 - 14 - 90 = 26 >= 4
    expect(tipPosition(bird, wrap, tip, 61).below).toBe(true) // 26 < 61 + 4: under the bar, so below
  })
})
