// @vitest-environment jsdom
// The collage's chunked writer: op order and costs (planBirds), late ops keeping the ripple's timing, the chunk
// budget (takeChunk / adaptBudget / runChunked) and the batched clean-up of finished exits (finishLater).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENTER_AT, FINISH_CHUNK, RIPPLE_MS, WRITE_MAX, WRITE_MIN, WRITE_START, adaptBudget, cancelFinishes, finishLater, fromCount,
  newMotion, planBirds, runChunked, takeChunk, writeBirds, type BirdOp,
} from '@/components/collage/collage-motion'
import type { StateLayout } from '@/lib/layout/layout-client'
import type { Box } from '@/lib/layout/pack'

const layoutOf = (boxes: Record<string, Box>): StateLayout =>
  ({ key: 'x', layout: 'narrow', mode: 'even', W: 100, H: 100, boxes: new Map(Object.entries(boxes)), scale: 1, base: 1 })
const md = (b: Box) => Math.round(fromCount(b, 100, 100) * RIPPLE_MS)

// Stage 100 x 100 (layout units = % of the width), the count at its centre; the viewport shows y 0..50.
const FULL: Record<string, Box> = {
  near: [45, 45, 10, 10], // kept, moves a little
  far: [0, 0, 10, 10], // kept, moves
  gone: [30, 10, 10, 10], // leaves, in view
  below: [10, 90, 5, 5], // leaves, out of view
}
const NEXT: Record<string, Box> = { near: [40, 40, 10, 10], far: [5, 2, 10, 10], back: [20, 20, 10, 10] }
const VIEW = { top: 0, bottom: 50 }

function setup() {
  const codes = ['near', 'far', 'gone', 'below', 'back']
  const els = new Map(codes.map((c) => {
    const el = document.createElement('button')
    el.dataset.code = c
    return [c, el as HTMLElement]
  }))
  const m = newMotion()
  // First placement: `back` is not in the full collage, so it starts hidden.
  writeBirds(m, { codes, els, layout: layoutOf(FULL), visible: new Set(Object.keys(FULL)), stagePx: 100, style: 'jump' })
  return { codes, els, m }
}

afterEach(() => vi.restoreAllMocks())

describe('planBirds', () => {
  it('orders seen birds by when their motion starts, then the unseen ones; travel costs 2, exits 1', () => {
    const { codes, els, m } = setup()
    expect(els.get('back')!.hasAttribute('data-off')).toBe(true)
    const { ops, on } = planBirds(m, { codes, els, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel', view: VIEW })
    expect([...on].sort()).toEqual(['back', 'far', 'near'])
    const seen = ops.filter((o) => o.seen)
    // Seen first, by start time: the exit (0), the travels (their ripple delays), the arrival (ENTER_AT + delay).
    expect(ops.slice(0, seen.length)).toEqual(seen)
    expect(seen.map((o) => o.at)).toEqual([0, md(NEXT.near), md(NEXT.far), ENTER_AT + md(NEXT.back)])
    expect(seen.map((o) => o.cost)).toEqual([1, 2, 2, 2])
    // The bird leaving below the viewport comes last.
    expect(ops.length).toBe(5)
    expect(ops[4]).toMatchObject({ seen: false, at: 0, cost: 1 })
  })

  it('without a viewport every bird is seen', () => {
    const { codes, els, m } = setup()
    const { ops } = planBirds(m, { codes, els, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel' })
    expect(ops.every((o) => o.seen)).toBe(true)
  })

  it('a late op shortens its travel delay and its arrival delay by how late it is (never below 0)', () => {
    const { codes, els, m } = setup()
    const calls: KeyframeAnimationOptions[] = []
    for (const el of els.values()) {
      el.animate = vi.fn((_k: Keyframe[], o: KeyframeAnimationOptions) => {
        calls.push(o)
        return { cancel: vi.fn(), onfinish: null } as unknown as Animation
      }) as unknown as HTMLElement['animate']
    }
    const { ops } = planBirds(m, { codes, els, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel', view: VIEW })
    for (const op of ops) op.run(50)
    expect(els.get('far')!.style.getPropertyValue('--md')).toBe(`${Math.max(0, md(NEXT.far) - 50)}ms`)
    expect(els.get('near')!.style.getPropertyValue('--md')).toBe('0ms') // its delay had passed: it starts at once
    const enter = calls.find((o) => o.fill === 'backwards')!
    expect(enter.delay).toBe(ENTER_AT + md(NEXT.back) - 50)
    // The record of what was written keeps the nominal delay (the leaving ripple and de-duplication read it).
    expect(m.written.get('far')!.split(',')[3]).toBe(String(md(NEXT.far)))
  })

  it('an op run on time writes the full ripple delay', () => {
    const { codes, els, m } = setup()
    const { ops } = planBirds(m, { codes, els, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel', view: VIEW })
    for (const op of ops) op.run()
    expect(els.get('far')!.style.getPropertyValue('--md')).toBe(`${md(NEXT.far)}ms`)
    expect(els.get('gone')!.getAttribute('aria-hidden')).toBe('true')
    expect(els.get('below')!.hasAttribute('data-off')).toBe(true) // out of view: hidden at once, no exit
  })
})

const op = (cost: number, at = 0, seen = true, log?: number[]): BirdOp => ({ at, seen, cost, run: (late = 0) => { log?.push(late) } })

describe('takeChunk', () => {
  it('takes whole ops up to the budget, and at least one', () => {
    const ops = [op(2), op(2), op(1), op(2)]
    expect(takeChunk(ops, 0, 4)).toBe(2)
    expect(takeChunk(ops, 0, 5)).toBe(3)
    expect(takeChunk(ops, 2, 1)).toBe(3)
    expect(takeChunk(ops, 1, 0)).toBe(2) // progress even with no budget
    expect(takeChunk(ops, 4, 10)).toBe(4)
  })
})

describe('adaptBudget', () => {
  it('grows on 60 Hz frames, holds at one dropped frame, shrinks beyond, within its bounds', () => {
    expect(adaptBudget(100, 16.7)).toBe(150)
    expect(adaptBudget(100, 33.3)).toBe(100)
    expect(adaptBudget(100, 50)).toBe(60)
    expect(adaptBudget(WRITE_MAX, 16.7)).toBe(WRITE_MAX)
    expect(adaptBudget(WRITE_MIN, 100)).toBe(WRITE_MIN)
  })
})

/** Drive runChunked with fake frames `period` ms apart; returns each op's lateness past its start and the frame count. */
function simulate(ops: BirdOp[], period: number) {
  let queued: ((t: number) => void) | null = null
  let t = 0, frames = 0, done = false
  runChunked(ops, (cb) => { queued = cb; return 1 }, () => {}, () => { done = true })
  while (queued && !done) {
    const cb: (t: number) => void = queued
    queued = null
    frames++
    cb(t)
    t += period
  }
  return frames
}

describe('runChunked', () => {
  it('writes nothing until the next frame, the first chunk WRITE_START units, and calls onDone once at the end', () => {
    const log: number[] = []
    const ops = Array.from({ length: 300 }, () => op(1, 0, true, log))
    let cb: ((t: number) => void) | null = null
    const ids: number[] = []
    const onDone = vi.fn()
    runChunked(ops, (f) => { cb = f; return 7 }, (id) => ids.push(id), onDone)
    expect(log.length).toBe(0)
    expect(ids).toEqual([7])
    cb!(1000)
    expect(log.length).toBe(WRITE_START)
    cb!(1016.7)
    expect(log.length).toBe(WRITE_START + 150)
    expect(log.slice(-1)[0]).toBeCloseTo(16.7)
    cb!(1033.4)
    expect(log.length).toBe(300)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(ids.at(-1)).toBe(0)
  })

  // A phone filtering 1,000 birds down to a few: ~300 in view (travel/arrival ripple, cost 2) and ~700 out of view.
  const phone = (log: { at: number; late: number }[]) => [
    ...Array.from({ length: 300 }, (_, i) => {
      const at = Math.round(RIPPLE_MS * Math.sqrt(i / 300))
      return { at, seen: true, cost: 2, run: (late = 0) => { log.push({ at, late }) } }
    }),
    ...Array.from({ length: 700 }, () => op(1, 0, false)),
  ]

  it('keeps the ripple on schedule for birds in view at 60 Hz', () => {
    const log: { at: number; late: number }[] = []
    const frames = simulate(phone(log), 1000 / 60)
    expect(Math.max(...log.map((l) => l.late - l.at))).toBeLessThanOrEqual(0)
    expect(frames).toBeLessThanOrEqual(6)
  })

  it('stretches the ripple in view by at most 64 ms when every frame drops one (30 Hz)', () => {
    const log: { at: number; late: number }[] = []
    simulate(phone(log), 1000 / 30)
    expect(Math.max(...log.map((l) => l.late - l.at))).toBeLessThanOrEqual(64)
  })
})

describe('finishLater', () => {
  it('runs finished exits FINISH_CHUNK per frame; cancelFinishes drops the rest', () => {
    const frames: (() => void)[] = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length })
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const m = newMotion()
    const ran = vi.fn()
    for (let i = 0; i < FINISH_CHUNK * 2 + 5; i++) finishLater(m, ran)
    expect(ran).not.toHaveBeenCalled()
    expect(frames.length).toBe(1)
    frames.shift()!()
    expect(ran).toHaveBeenCalledTimes(FINISH_CHUNK)
    frames.shift()!()
    expect(ran).toHaveBeenCalledTimes(FINISH_CHUNK * 2)
    cancelFinishes(m)
    expect(m.done.length).toBe(0)
    expect(m.doneFrame).toBe(0)
    vi.unstubAllGlobals()
  })
})
