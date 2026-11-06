// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { BirdWindow, FRAME_BUDGET, KEEP_MARGIN, SHOW_MARGIN, buildIndex, query } from '@/components/collage/collage-window'
import { MAX_LOADS, loadDeferred, unloadSticker } from '@/components/collage/Sticker'
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
    expect(els.get('b1996')!.hasAttribute('data-far')).toBe(false) // the margin's edge, after a few frames
    expect(els.get('b1993')!.hasAttribute('data-far')).toBe(true) // beyond it
  })

  it('hides birds only beyond the keep margin, never pinned ones, and nothing while held', () => {
    document.body.innerHTML = ''
    const { els, w, move } = setup(1000, { top: 5000, bottom: 5100 })
    w.sync({ all: true })
    move(5000 + (KEEP_MARGIN - SHOW_MARGIN) * 100 / 2) // a small scroll: within the keep margin
    w.sync({ all: true })
    expect(els.get('b496')!.hasAttribute('data-far')).toBe(false)
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

describe('sticker downloads in flight', () => {
  it('start at most MAX_LOADS at once; the rest wait their turn, and a let-go one leaves the queue', () => {
    document.body.innerHTML = ''
    const els = [...birds(MAX_LOADS + 5).values()]
    for (const el of els) loadDeferred(el)
    const started = () => els.filter((e) => e.querySelector('img')!.getAttribute('src')).length
    expect(started()).toBe(MAX_LOADS)
    unloadSticker(els[MAX_LOADS]) // still waiting: just leaves the queue
    els[0].querySelector('img')!.dispatchEvent(new Event('load'))
    expect(els[MAX_LOADS].querySelector('img')!.getAttribute('src')).toBeNull()
    expect(els[MAX_LOADS + 1].querySelector('img')!.getAttribute('src')).toContain('.webp')
    // Images that left the page free their slots.
    document.body.innerHTML = ''
    const more = [...birds(3).values()]
    for (const el of more) loadDeferred(el)
    expect(more.every((e) => e.querySelector('img')!.getAttribute('src'))).toBe(true)
  })
})
