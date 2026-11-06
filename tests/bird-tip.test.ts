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

  it('a tip wider than the wrapper starts at its left edge', () => {
    expect(tipPosition({ left: 150, top: 500, width: 20, height: 20 }, { left: 100, top: 200, width: 200 }, tip).left).toBe(4)
  })
})
