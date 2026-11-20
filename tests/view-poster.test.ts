// Print follows the view (2026-11-20): the Tree's and the Map's posters are their own drawing at the paper's size
// (viewPosterScale, makeViewPoster), and the dialog shows only the options that drawing reads (dialogRows).
import { describe, expect, it, vi } from 'vitest'
import { BULK_SPLITS, dialogRows, subjectOf } from '@/components/share/dialog-options'
import { makeViewPoster, posterRows, type EncoderPort } from '@/lib/share/poster'
import { IOS_CANVAS_AREA, PRINT_PT, PRINT_SIZES, printDesign, printPx, printScale, stripRanges, viewPosterScale } from '@/lib/share/print'

describe('dialogRows: what each dialog shows', () => {
  it('Collage and List draw the collage; the Tree and the Map their own picture', () => {
    expect(subjectOf('collage')).toBe('collage')
    expect(subjectOf('list')).toBe('collage')
    expect(subjectOf(undefined)).toBe('collage')
    expect(subjectOf('tree')).toBe('tree')
    expect(subjectOf('map')).toBe('map')
  })
  it('the collage: the sticker options and Export in batches, Number of birds first in both; the Goal only in Share, names only in Print', () => {
    const share = dialogRows('collage', false)
    expect(share).toMatchObject({ arrangement: true, count: true, goal: true, latest: true, names: false, lifersOnly: false, hideTotals: false, bulk: true, batchSize: true })
    const print = dialogRows('collage', true)
    expect(print).toMatchObject({ arrangement: true, count: true, goal: false, names: true, bulk: true, batchSize: true })
    for (const rows of [share, print]) {
      expect(rows.splits).toEqual(BULK_SPLITS)
      expect(rows.splits[0]).toBe('batches')
    }
  })
  it('the Tree: its Arrangement, Show oldest lineage, Lifers only and Hide totals; the Map: Hide totals; neither has sticker options or Export in batches, in Share or Print', () => {
    for (const print of [false, true]) {
      expect(dialogRows('tree', print)).toEqual({ arrangement: false, count: false, goal: false, latest: false, treeLayout: true, oldest: true, names: false, lifersOnly: true, hideTotals: true, bulk: false, batchSize: false, splits: [] })
      expect(dialogRows('map', print)).toEqual({ arrangement: false, count: false, goal: false, latest: false, treeLayout: false, oldest: false, names: false, lifersOnly: false, hideTotals: true, bulk: false, batchSize: false, splits: [] })
    }
  })
})

describe('viewPosterScale: the Tree or Map drawn whole on one canvas', () => {
  it('is the poster scale where its canvas is under the iOS cap, and the largest scale under it where not', () => {
    for (const size of PRINT_SIZES) for (const landscape of [false, true]) {
      const s = viewPosterScale(size, landscape)
      const [w, h] = printDesign(size, landscape)
      expect(Math.round(w * s) * Math.round(h * s), `${size} ${landscape}`).toBeLessThanOrEqual(IOS_CANVAS_AREA)
      const [pw, ph] = printPx(size, landscape)
      if (pw * ph <= IOS_CANVAS_AREA) expect(s).toBe(printScale(size))
      else expect(s).toBeGreaterThan(printScale(size) * 0.92) // A1 about 2% under, 24 × 36 in about 7%
    }
  })
  it('A1 and 24 × 36 in are the two over the cap', () => {
    expect(PRINT_SIZES.filter((size) => viewPosterScale(size) < printScale(size))).toEqual(['A1', 'US24x36'])
  })
})

describe('makeViewPoster', () => {
  function setup() {
    const draws: { y: number; w: number; h: number }[] = []
    const clears: number[] = []
    const ctx = {
      canvas: { width: 0, height: 0 },
      setTransform: () => {}, clearRect: (_x: number, _y: number, _w: number, h: number) => clears.push(h),
      drawImage: (_img: unknown, _x: number, y: number, w: number, h: number) => draws.push({ y, w, h }),
    } as unknown as CanvasRenderingContext2D
    const rows: number[] = []
    const enc = {
      begin: vi.fn(), dispose: vi.fn(),
      strip: vi.fn(async (_rgba: Uint8ClampedArray, n: number) => { rows.push(n) }),
      end: vi.fn(async () => 99),
      file: vi.fn(async (kind: 'png' | 'pdf') => new Blob([kind], { type: kind === 'png' ? 'image/png' : 'application/pdf' })),
    } satisfies EncoderPort
    const closed = vi.fn()
    const decode = vi.fn(async () => ({ width: 10, height: 14, close: closed }))
    const deps = { strip: (w: number) => { ctx.canvas.width = w; return { ctx, read: (n: number) => new Uint8ClampedArray(w * n * 4) } }, encoder: () => enc, frame: async () => {}, decode }
    return { draws, clears, rows, enc, closed, decode, deps }
  }

  it('draws the view once at the poster scale, then streams it in the collage poster\'s strips, stretched to the paper\'s px', async () => {
    const { draws, rows, enc, closed, deps } = setup()
    const render = vi.fn(async () => new Blob(['png']))
    const progress: [number, number][] = []
    const p = await makeViewPoster({ size: 'A2', render }, (d, t) => progress.push([d, t]), deps)
    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith(printScale('A2'))
    const [w, h] = printPx('A2')
    const strips = stripRanges(w, h, posterRows(w, printScale('A2')))
    expect(enc.begin).toHaveBeenCalledWith(w, h)
    expect(rows).toEqual(strips.map((s) => s.rows))
    expect(draws).toEqual(strips.map((s) => ({ y: -s.y, w, h })))
    expect(progress.at(0)).toEqual([1, strips.length + 2])
    expect(progress.at(-1)).toEqual([strips.length + 2, strips.length + 2])
    expect(closed).toHaveBeenCalled()
    expect(p).toMatchObject({ size: 'A2', landscape: false, bytes: 99, soft: 0, missing: 0, namesDropped: false })
    await p.file('pdf')
    expect(enc.file).toHaveBeenCalledWith('pdf', PRINT_PT.A2)
  })

  it('landscape A1: the capped scale, the turned paper, an RGBA PNG when transparent', async () => {
    const { enc, deps } = setup()
    const render = vi.fn(async () => new Blob(['png']))
    const p = await makeViewPoster({ size: 'A1', landscape: true, transparent: true, render }, () => {}, deps)
    expect(render).toHaveBeenCalledWith(viewPosterScale('A1', true))
    expect(enc.begin).toHaveBeenCalledWith(...printPx('A1', true), true)
    await p.file('png')
    expect(enc.file).toHaveBeenCalledWith('png', [PRINT_PT.A1[1], PRINT_PT.A1[0]])
  })

  it('an abort rejects with AbortError and disposes the encoder; a drawing the browser cannot decode is poster-memory', async () => {
    const a = setup()
    const ctl = new AbortController()
    let n = 0
    const aborting = { ...a.deps, frame: async () => { if (++n === 2) ctl.abort() } }
    await expect(makeViewPoster({ size: 'A4', signal: ctl.signal, render: async () => new Blob(['png']) }, () => {}, aborting)).rejects.toMatchObject({ name: 'AbortError' })
    expect(a.enc.dispose).toHaveBeenCalled()
    const b = setup()
    const failing = { ...b.deps, decode: async () => { throw new Error('decode') } }
    await expect(makeViewPoster({ size: 'A4', render: async () => new Blob(['png']) }, () => {}, failing)).rejects.toThrow('poster-memory')
  })
})
