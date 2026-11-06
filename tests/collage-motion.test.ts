// @vitest-environment jsdom
// The collage's chunked writer: op order and costs (planBirds), late ops keeping the ripple's timing, the chunk
// budget (takeChunk / adaptBudget / runChunked) and the batched clean-up of finished exits (finishLater).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ENTER_AT, EXIT_MS, FINISH_CHUNK, MAX_LATE, RIPPLE_MS, WRITE_MAX, WRITE_MIN, WRITE_START, adaptBudget, cancelFinishes, finishLater, fromCount,
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

describe('exits written late', () => {
  it('start that far into their animation, or are hidden at once once it would have ended', () => {
    const { codes, els, m } = setup()
    const calls: KeyframeAnimationOptions[] = []
    els.get('gone')!.animate = vi.fn((_k: Keyframe[], o: KeyframeAnimationOptions) => {
      calls.push(o)
      return { cancel: vi.fn(), onfinish: null } as unknown as Animation
    }) as unknown as HTMLElement['animate']
    const plan = () => planBirds(m, { codes, els, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel', view: VIEW }).ops
    plan().find((o) => o.code === 'gone')!.run(40)
    expect(calls[0].delay).toBe(-40)
    expect(calls[0].duration).toBe(EXIT_MS)
    // A fresh collage, the same exit written when it would already have ended.
    const { codes: c2, els: e2, m: m2 } = setup()
    e2.get('gone')!.animate = els.get('gone')!.animate
    planBirds(m2, { codes: c2, els: e2, layout: layoutOf(NEXT), visible: new Set(Object.keys(NEXT)), stagePx: 100, style: 'travel', view: VIEW })
      .ops.find((o) => o.code === 'gone')!.run(EXIT_MS)
    expect(e2.get('gone')!.hasAttribute('data-off')).toBe(true)
    expect(calls.length).toBe(1)
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
    // Seen ops due by `due` are taken past the budget; the first op not yet due stops the chunk.
    const due = [op(2, 0), op(2, 10), op(2, 30), op(2, 0, false)]
    expect(takeChunk(due, 0, 2, 10)).toBe(2)
    expect(takeChunk(due, 0, 2, 40)).toBe(3)
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

/** Drive runChunked with fake frames `period` ms apart, the change planned at 0 and the first frame at `period`. */
function simulate(ops: BirdOp[], period: number) {
  let queued: ((t: number) => void) | null = null
  let t = period, frames = 0, done = false
  runChunked(ops, 0, (cb) => { queued = cb; return 1 }, () => {}, () => { done = true })
  while (queued && !done) {
    const cb: (t: number) => void = queued
    queued = null
    frames++
    cb(t)
    t += period
  }
  return frames
}

type Seen = { at: number; late: number }
const seenOp = (at: number, cost: number, log: Seen[]): BirdOp => ({ at, seen: true, cost, run: (late = 0) => { log.push({ at, late }) } })
/** The test's order step on a phone: ~284 exits in view (due at 0), a few kept or arriving birds in view, ~700 out of view. */
const orderStep = (log: Seen[]): BirdOp[] => [
  ...Array.from({ length: 284 }, () => seenOp(0, 1, log)),
  ...Array.from({ length: 16 }, (_, i) => seenOp(Math.round(RIPPLE_MS * Math.sqrt(i / 16)), 2, log)),
  ...Array.from({ length: 700 }, () => op(1, 0, false)),
]
/** A change where everything in view moves (the True size switch): ~300 travelling birds in view, ~700 out of view. */
const allMove = (log: Seen[]): BirdOp[] => [
  ...Array.from({ length: 300 }, (_, i) => seenOp(Math.round(RIPPLE_MS * Math.sqrt(i / 300)), 2, log)),
  ...Array.from({ length: 700 }, () => op(1, 0, false)),
]
const worst = (log: Seen[]) => Math.max(...log.map((l) => l.late - l.at))

describe('runChunked', () => {
  it('writes nothing until the next frame, the first chunk WRITE_START units, and calls onDone once at the end', () => {
    const log: number[] = []
    const ops = Array.from({ length: 300 }, () => op(1, 50, true, log)) // due at 50 ms: nothing forced early
    let cb: ((t: number) => void) | null = null
    const ids: number[] = []
    const onDone = vi.fn()
    runChunked(ops, 1000, (f) => { cb = f; return 7 }, (id) => ids.push(id), onDone)
    expect(log.length).toBe(0)
    expect(ids).toEqual([7])
    cb!(1016.7)
    expect(log.length).toBe(WRITE_START)
    expect(log[0]).toBeCloseTo(16.7) // lateness is measured from the change, so the first chunk is a frame late
    cb!(1033.4)
    expect(log.length).toBe(WRITE_START + 150)
    cb!(1050.1)
    expect(log.length).toBe(300)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(ids.at(-1)).toBe(0)
  })

  it('takes seen ops that would otherwise start over MAX_LATE late, whatever the budget', () => {
    const log: Seen[] = []
    const ops = Array.from({ length: 300 }, () => seenOp(0, 1, log))
    simulate(ops, 50) // first frame 50 ms after the change: the next would be 100 ms, too late for all of them
    expect(log.length).toBe(300)
    expect(worst(log)).toBe(50)
  })

  for (const [name, hz] of [['60 Hz', 60], ['30 Hz', 30], ['20 Hz (50 ms frames)', 20]] as const) {
    it(`every bird in view starts within MAX_LATE of its time, order step at ${name}`, () => {
      const log: Seen[] = []
      simulate(orderStep(log), 1000 / hz)
      expect(log.length).toBe(300)
      expect(worst(log)).toBeLessThanOrEqual(MAX_LATE)
    })
    it(`every bird in view starts within MAX_LATE of its time, all moving at ${name}`, () => {
      const log: Seen[] = []
      simulate(allMove(log), 1000 / hz)
      expect(worst(log)).toBeLessThanOrEqual(MAX_LATE)
    })
  }

  it('spreads a big change: at 60 Hz the order step takes a few frames, not one', () => {
    const frames = simulate(orderStep([]), 1000 / 60)
    expect(frames).toBeGreaterThan(2)
    expect(frames).toBeLessThanOrEqual(8)
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
