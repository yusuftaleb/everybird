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
  const ix = (n: number) => Array.from({ length: n }, (_, i) => i)
  it('takes whole ops up to the budget, and at least one', () => {
    const ops = [op(2), op(2), op(1), op(2)]
    expect(takeChunk(ops, 0, 4)).toEqual(ix(2))
    expect(takeChunk(ops, 0, 5)).toEqual(ix(3))
    expect(takeChunk(ops, 2, 1)).toEqual([2])
    expect(takeChunk(ops, 1, 0)).toEqual([1]) // progress even with no budget
    expect(takeChunk(ops, 4, 10)).toEqual([])
  })
  it('forces seen travels and arrivals due by `due` past the budget, never exits, and skips done ops', () => {
    const exit = (seen = true): BirdOp => ({ ...op(1, 0, seen), exit: true })
    const ops = [exit(), exit(), exit(), op(2, 10), op(2, 30), op(2, 0, false)]
    expect(takeChunk(ops, 0, 1, 20)).toEqual([0, 3]) // the travel due at 10 jumps the queued exits
    expect(takeChunk(ops, 0, 1, -Infinity)).toEqual([0]) // nothing due: exits are not forced
    const done = [true, false, false, true]
    expect(takeChunk(ops, 1, 2, 40, done)).toEqual([1, 2, 4])
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

const op2 = op

/**
 * A real collage of `n` birds on a 25-column grid (stage 100 wide, 4 x 5 tiles; the viewport shows y 0..50, so
 * the first 10 rows are in view), first placed, then changed to `next` and written with runChunked on fake
 * frames `period` ms apart (the change planned at 0, the first frame at `period`). Records for every bird in
 * view when its write landed and what it asked for.
 */
function grid(n: number, next: (i: number) => Box | undefined, extra: Record<string, Box> = {}) {
  const codes = [...Array.from({ length: n }, (_, i) => `b${i}`), ...Object.keys(extra)]
  const box = (i: number): Box => [(i % 25) * 4, Math.floor(i / 25) * 5, 4, 5]
  const full = Object.fromEntries(Array.from({ length: n }, (_, i) => [`b${i}`, box(i)]))
  const after: Record<string, Box> = { ...extra }
  for (let i = 0; i < n; i++) { const b = next(i); if (b) after[`b${i}`] = b }
  return { codes, full, after }
}
type Rec = { t: number; md?: string; anim?: KeyframeAnimationOptions; off: boolean }
function run(g: ReturnType<typeof grid>, period: number) {
  const L = (boxes: Record<string, Box>): StateLayout =>
    ({ key: 'x', layout: 'narrow', mode: 'even', W: 100, H: 200, boxes: new Map(Object.entries(boxes)), scale: 1, base: 1 })
  let t = 0
  const anims = new Map<string, KeyframeAnimationOptions>()
  const els = new Map(g.codes.map((c) => {
    const el = document.createElement('button')
    el.animate = ((_k: Keyframe[], o: KeyframeAnimationOptions) => { anims.set(c, o); return { cancel() {}, onfinish: null } as unknown as Animation }) as HTMLElement['animate']
    return [c, el as HTMLElement]
  }))
  const m = newMotion()
  writeBirds(m, { codes: g.codes, els, layout: L(g.full), visible: new Set(Object.keys(g.full)), stagePx: 100, style: 'jump' })
  const { ops, on } = planBirds(m, { codes: g.codes, els, layout: L(g.after), visible: new Set(Object.keys(g.after)), stagePx: 100, style: 'travel', view: { top: 0, bottom: 50 } })
  m.on = on
  const recs = new Map<string, Rec>()
  const wrapped = ops.map((o) => ({ ...o, run: (late?: number) => {
    o.run(late)
    const el = els.get(o.code!)!
    recs.set(o.code!, { t, md: el.style.getPropertyValue('--md'), anim: anims.get(o.code!), off: el.hasAttribute('data-off') })
  } }))
  let queued: ((t: number) => void) | null = null
  let frames = 0
  runChunked(wrapped, 0, (cb) => { queued = cb; return 1 }, () => {}, () => {})
  t = period
  while (queued) { const cb: (t: number) => void = queued; queued = null; frames++; cb(t); t += period }
  return { ops, recs, m, frames }
}
/** Lateness of every seen travel / arrival start, and every seen exit's end (or its hiding) against its schedule. */
function check(r: ReturnType<typeof run>, period: number) {
  let travel = 0, exits = 0
  for (const o of r.ops) {
    if (!o.seen) continue
    const rec = r.recs.get(o.code!)!
    if (o.exit) {
      exits++
      if (rec.anim) expect(Math.abs(rec.t + (rec.anim.delay as number) + (rec.anim.duration as number) - EXIT_MS)).toBeLessThanOrEqual(period)
      else { expect(rec.off).toBe(true); expect(rec.t).toBeGreaterThanOrEqual(EXIT_MS - period) } // already past: hidden
    } else {
      travel++
      const start = rec.anim?.fill === 'backwards' ? rec.t + (rec.anim.delay as number) : rec.t + parseFloat(rec.md || '0')
      expect(start - o.at).toBeLessThanOrEqual(MAX_LATE)
    }
  }
  return { travel, exits }
}

describe('runChunked on a real 1,000-bird collage', () => {
  // The e2e order step on a phone: every bird leaves except 16 that move (10 of them in view), and 8 arrive in view.
  const orderStep = () => grid(1000, (i) => (i < 400 && i % 25 === 0 ? [(i % 25) * 4 + 2, Math.floor(i / 25) * 5 + 1, 4, 5] : undefined),
    Object.fromEntries(Array.from({ length: 8 }, (_, k) => [`new${k}`, [k * 10, 20, 4, 5] as Box])))
  // Everything moves (the True size switch): 250 travelling birds in view, 750 out of view.
  const allMove = () => grid(1000, (i) => [(i % 25) * 4 + 1, Math.floor(i / 25) * 5 + 1, 4, 5])

  for (const [name, hz] of [['60 Hz', 60], ['30 Hz', 30], ['20 Hz (50 ms frames)', 20]] as const) {
    const period = 1000 / hz
    it(`order step at ${name}: travel and arrivals start within MAX_LATE, exits end on schedule or are hidden`, () => {
      const r = run(orderStep(), period)
      const n = check(r, period)
      expect(n.exits).toBeGreaterThan(200)
      expect(n.travel).toBe(18) // 10 kept birds in view + 8 arrivals
    })
    it(`all moving at ${name}: every travel in view starts within MAX_LATE`, () => {
      const n = check(run(allMove(), period), period)
      expect(n.travel).toBe(250)
    })
  }

  it('exits follow the budget, not a deadline: at 30 Hz the order step spreads them over several frames', () => {
    const r = run(orderStep(), 1000 / 30)
    const times = new Set(r.ops.filter((o) => o.seen && o.exit).map((o) => r.recs.get(o.code!)!.t))
    expect(times.size).toBeGreaterThan(1)
  })

  it('writes nothing before the next frame and counts lateness from the change', () => {
    const log: number[] = []
    const ops = Array.from({ length: 300 }, () => op2(1, 50, true, log))
    let cb: ((t: number) => void) | null = null
    const ids: number[] = []
    const onDone = vi.fn()
    runChunked(ops, 1000, (f) => { cb = f; return 7 }, (id) => ids.push(id), onDone)
    expect(log.length).toBe(0)
    expect(ids).toEqual([7])
    cb!(1016.7)
    expect(log.length).toBe(WRITE_START)
    expect(log[0]).toBeCloseTo(16.7)
    cb!(1033.4)
    expect(log.length).toBe(WRITE_START + 150)
    cb!(1050.1)
    expect(log.length).toBe(300)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(ids.at(-1)).toBe(0)
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
