// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { BirdWindow, FRAME_BUDGET, KEEP_MARGIN, SHOW_MARGIN, buildIndex, query } from '@/components/collage/collage-window'
import { MAX_LOADS, STARTS_PER_FRAME, loadDeferred, unloadSticker } from '@/components/collage/Sticker'
import type { Box } from '@/lib/layout/pack'

/** A column of n birds, each 10 units tall at y = 10·i, on a stage 100 units wide (so % units = layout units). */
function column(n: number) {
  const boxes = new Map<string, Box>()
  for (let i = 0; i < n; i++) boxes.set(`b${i}`, [0, i * 10, 10, 10] as Box)
  return { W: 100, boxes }
}
function birds(n: number) {
  const els = new Map<string, HTMLElement>()
  for (let i = 0; i < n; i++) {
    const el = document.createElement('button')
    el.dataset.code = `b${i}`
    el.setAttribute('data-far', '')
    const img = document.createElement('img')
    img.dataset.src = `https://x.test/${i}.webp`
    el.append(img)
    document.body.append(el)
    els.set(`b${i}`, el)
  }
  return els
}

describe('buildIndex / query', () => {
  it('finds exactly the boxes overlapping a span, with their distance from the view', () => {
    const ix = buildIndex(column(100), [...column(100).boxes.keys()].reverse())
    const hits: [string, number][] = []
    query(ix, 95, 130, (c, d) => hits.push([c, d]), 100, 120)
    expect(hits.map((h) => h[0])).toEqual(['b9', 'b10', 'b11', 'b12'])
    expect(hits.map((h) => h[1])).toEqual([0, 0, 0, 0])
    const far: [string, number][] = []
    query(ix, 0, 300, (c, d) => far.push([c, d]), 100, 120)
    expect(far.find((h) => h[0] === 'b0')![1]).toBe(90) // bottom 10, view top 100
    expect(far.find((h) => h[0] === 'b20')![1]).toBe(80) // top 200, view bottom 120
  })
  it('leaves out codes the layout has no box for', () => {
    expect(buildIndex(column(3), ['b0', 'nope', 'b2']).codes).toEqual(['b0', 'b2'])
  })
})

describe('BirdWindow', () => {
  const setup = (n: number, view: { top: number; bottom: number }) => {
    const els = birds(n)
    let v = { ...view, screen: view.bottom - view.top }
    const frames: (() => void)[] = []
    const w = new BirdWindow({
      els,
      view: () => v,
      pinned: () => ['b0'],
      frame: (cb) => { frames.push(cb); return frames.length },
      cancel: () => {},
    })
    w.setIndex(buildIndex(column(n), els.keys()))
    return { els, w, frames, move: (top: number) => { v = { top, bottom: top + v.screen, screen: v.screen } } }
  }

  it('shows the birds near the viewport (and the pinned ones), and starts their stickers', () => {
    document.body.innerHTML = ''
    const { els, w } = setup(1000, { top: 5000, bottom: 5100 })
    w.sync({ all: true })
    const lo = 5000 - SHOW_MARGIN * 100, hi = 5100 + SHOW_MARGIN * 100
    for (const [c, el] of els) {
      const y = Number(c.slice(1)) * 10
      const near = (y + 10 > lo && y < hi) || c === 'b0'
      expect(el.hasAttribute('data-far'), c).toBe(!near)
    }
    expect(els.get('b500')!.querySelector('img')!.getAttribute('src')).toContain('/500.webp')
  })

  it('shows birds in budgeted frames, nearest the middle of the viewport first', () => {
    document.body.innerHTML = ''
    const { els, w, frames } = setup(4000, { top: 20000, bottom: 20100 })
    w.sync()
    expect(els.get('b2005')!.hasAttribute('data-far')).toBe(false) // the middle of the view
    const shown = () => [...els.values()].filter((e) => !e.hasAttribute('data-far')).length
    expect(shown()).toBeLessThanOrEqual(FRAME_BUDGET + 1)
    while (frames.length) frames.shift()!()
    expect(els.get('b1993')!.hasAttribute('data-far')).toBe(false) // the margin's edge, after a few frames
    expect(els.get('b1990')!.hasAttribute('data-far')).toBe(true) // beyond it
  })

  it('hides birds only beyond the keep margin, never pinned ones, and nothing while held', () => {
    document.body.innerHTML = ''
    const { els, w, move } = setup(1000, { top: 5000, bottom: 5100 })
    w.sync({ all: true })
    move(5000 + (KEEP_MARGIN - SHOW_MARGIN) * 100 / 2) // a small scroll: within the keep margin
    w.sync({ all: true })
    expect(els.get('b493')!.hasAttribute('data-far')).toBe(false)
    w.hold(10_000)
    move(8000)
    w.sync({ all: true })
    expect(els.get('b500')!.hasAttribute('data-far')).toBe(false) // held
    w.dispose()
    const w2 = setup(1000, { top: 8000, bottom: 8100 })
    w2.w.sync({ all: true })
    w2.move(2000)
    w2.w.sync({ all: true })
    expect(w2.els.get('b800')!.hasAttribute('data-far')).toBe(true)
    expect(w2.els.get('b800')!.querySelector('img')!.getAttribute('src')).toBeNull() // its sticker (still waiting) let go
    expect(w2.els.get('b0')!.hasAttribute('data-far')).toBe(false) // pinned
  })
})

describe('BirdWindow while quiet (a fade-through placing birds)', () => {
  // 250 birds rendered near the top, then the view jumps far down (a new layout): more birds leave than one frame
  // hides, so the rest are doomed, and whenShown waits for them.
  const placing = () => {
    document.body.innerHTML = ''
    const els = birds(2000)
    let v = { top: 0, bottom: 1000, screen: 1000 }
    let pins: string[] = []
    const frames: (() => void)[] = []
    const revealed: string[] = []
    const w = new BirdWindow({
      els,
      view: () => v,
      pinned: () => pins,
      onReveal: (c) => revealed.push(c),
      frame: (cb) => { frames.push(cb); return frames.length },
      cancel: () => {},
    })
    w.setIndex(buildIndex(column(2000), els.keys()))
    w.sync({ all: true })
    w.quiet = true
    v = { top: 10000, bottom: 11000, screen: 1000 }
    let ready = false
    w.whenShown(() => { ready = true })
    frames.shift()!()
    const run = () => { for (let i = 0; i < 200 && frames.length && !ready; i++) frames.shift()!() }
    return { els, w, run, isReady: () => ready, pin: (c: string) => { pins = [c] }, revealed }
  }

  it('lets the fade finish once every doomed bird is gone', () => {
    const p = placing()
    expect(p.w.doomed.size).toBeGreaterThan(0)
    p.run()
    expect(p.isReady()).toBe(true)
  })

  it('keeps a doomed bird that becomes the tab stop, catches its DOM up, and still lets the fade finish', () => {
    // The bug: the new tab stop was doomed in the sync before it became the stop; pinned, it was never hidden, so
    // it stayed doomed and whenShown never called back (the collage stayed invisible).
    const p = placing()
    const stop = [...p.w.doomed][0]
    p.pin(stop)
    p.w.reveal(stop) // as syncTabStop does
    expect(p.w.doomed.has(stop)).toBe(false)
    expect(p.revealed).toContain(stop)
    p.run()
    expect(p.isReady()).toBe(true)
    expect(p.els.get(stop)!.hasAttribute('data-far')).toBe(false)
  })

  it('a pinned doomed bird is kept by the next sync too (focus moved onto it)', () => {
    const p = placing()
    const stop = [...p.w.doomed][0]
    p.pin(stop)
    p.run()
    expect(p.isReady()).toBe(true)
    expect(p.els.get(stop)!.hasAttribute('data-far')).toBe(false)
  })

  it('forgets a doomed bird whose element went away (re-created), rather than waiting on it forever', () => {
    const p = placing()
    const gone = [...p.w.doomed][0]
    p.w.shown.delete(gone) // as the collage's register does when a bird's element is re-created
    p.run()
    expect(p.isReady()).toBe(true)
    expect(p.w.doomed.size).toBe(0)
  })
})

describe('sticker downloads in flight', () => {
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
  it('start STARTS_PER_FRAME a frame, at most MAX_LOADS at once; the rest wait their turn, and a let-go one leaves the queue', async () => {
    document.body.innerHTML = ''
    await nextFrame()
    const els = [...birds(MAX_LOADS + 5).values()]
    for (const el of els) loadDeferred(el)
    const started = () => els.filter((e) => e.querySelector('img')!.getAttribute('src')).length
    expect(started()).toBe(STARTS_PER_FRAME)
    while (started() < MAX_LOADS) await nextFrame()
    await nextFrame()
    expect(started()).toBe(MAX_LOADS) // no more while MAX_LOADS are in flight
    unloadSticker(els[MAX_LOADS]) // still waiting: just leaves the queue
    els[0].querySelector('img')!.dispatchEvent(new Event('load'))
    await nextFrame()
    expect(els[MAX_LOADS].querySelector('img')!.getAttribute('src')).toBeNull()
    expect(els[MAX_LOADS + 1].querySelector('img')!.getAttribute('src')).toContain('.webp')
    // Images that left the page free their slots.
    document.body.innerHTML = ''
    const more = [...birds(3).values()]
    for (const el of more) loadDeferred(el)
    await nextFrame()
    expect(more.every((e) => e.querySelector('img')!.getAttribute('src'))).toBe(true)
  })
})
