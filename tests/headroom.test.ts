import { describe, expect, it } from 'vitest'
import { HEADROOM_DELTA, nextHeadroom } from '@/lib/headroom'

const o = { barH: 61, maxY: 2000, held: false }
const run = (ys: number[], opts = o, start = { hidden: false, lastY: 0, acc: 0 }) =>
  ys.reduce((s, y) => nextHeadroom(s, y, opts), start)

describe('nextHeadroom', () => {
  it('stays shown near the top, however far it scrolls there', () => {
    expect(run([10, 30, 61]).hidden).toBe(false)
  })
  it('hides once the downward scroll past the bar adds up to the threshold', () => {
    const s = run([100])
    expect(s.hidden).toBe(true)
    expect(run([100, 100 - HEADROOM_DELTA + 1], o, { hidden: true, lastY: 100, acc: 0 }).hidden).toBe(true)
  })
  it('ignores a scroll smaller than the threshold, also summed over frames in alternating directions', () => {
    const from = { hidden: false, lastY: 500, acc: 0 }
    expect(run([503, 506], o, from).hidden).toBe(false) // 6px down
    expect(run([505, 500, 505, 500, 505, 499], o, from).hidden).toBe(false) // jitter: direction changes reset the sum
  })
  it('sums small downward steps', () => {
    expect(run([502, 504, 506, 508], o, { hidden: false, lastY: 500, acc: 0 }).hidden).toBe(true)
  })
  it('shows on an upward scroll of the threshold', () => {
    const from = { hidden: true, lastY: 800, acc: 0 }
    expect(run([795], o, from).hidden).toBe(true)
    expect(run([795, 792], o, from).hidden).toBe(false)
  })
  it('treats rubber-banding past either end as the edge', () => {
    // Past the bottom and back: no upward delta.
    expect(run([2040, 2000], o, { hidden: true, lastY: 2000, acc: 0 }).hidden).toBe(true)
    // Above the top: shown.
    expect(run([-30, 0], o, { hidden: true, lastY: 500, acc: 0 }).hidden).toBe(false)
  })
  it('stays shown while held', () => {
    expect(run([600, 900], { ...o, held: true }, { hidden: false, lastY: 500, acc: 0 }).hidden).toBe(false)
  })
})
