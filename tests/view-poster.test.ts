// Print follows the view (2026-11-20): the Tree's and the Map's posters are their own drawing at the paper's size
// (makeViewPoster: laid out once at printScale, painted into each strip), and the dialog shows only the options that drawing reads (dialogRows).
import { describe, expect, it, vi } from 'vitest'
import { BULK_SPLITS, dialogRows, dialogTitle, optionRows, subjectOf, toggleTotal, treeOrientation, treeTotals } from '@/components/share/dialog-options'
import { en } from '@/i18n/messages/en'
import { makeViewPoster, posterRows, type EncoderPort } from '@/lib/share/poster'
import { PRINT_PT, PRINT_SIZES, STRIP_AREA, printPx, printScale, stripRanges } from '@/lib/share/print'

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
    expect(share).toMatchObject({ orientation: true, arrangement: true, count: true, goal: true, latest: true, names: false, lifersOnly: false, totals: [], bulk: true, batchSize: true })
    const print = dialogRows('collage', true)
    expect(print).toMatchObject({ orientation: true, arrangement: true, count: true, goal: false, names: true, bulk: true, batchSize: true })
    for (const rows of [share, print]) {
      expect(rows.splits).toEqual(BULK_SPLITS)
      expect(rows.splits[0]).toBe('batches')
    }
  })
  it('the Tree: its Arrangement, Show oldest lineage, Lifers only, Time scale and Totals (species, genera, families, orders), the same in Print (round 6, item 22: no rank of its own; item 23: no orientation switch, its arrangement picks it); the Map: Totals (species, countries) and the orientation switch; neither has sticker options or Export in batches, in Share or Print', () => {
    for (const print of [false, true]) {
      expect(dialogRows('tree', print)).toEqual({ what: false, orientation: false, arrangement: false, count: false, goal: false, latest: false, treeLayout: true, oldest: true, timeScale: true, sci: true, trueSize: false, names: false, lifersOnly: true, totals: ['species', 'genera', 'families', 'orders'], bulk: false, batchSize: false, splits: [] })
      expect(dialogRows('map', print)).toEqual({ what: false, orientation: true, arrangement: false, count: false, goal: false, latest: false, treeLayout: false, oldest: false, timeScale: false, sci: false, trueSize: false, names: false, lifersOnly: false, totals: ['species', 'countries'], bulk: false, batchSize: false, splits: [] })
    }
  })
  it('Compare: What, and only the rows a comparison draws (no sticker options, Goal, Count, latest lifer, totals or batches)', () => {
    expect(dialogRows('compare', false)).toEqual({ what: true, orientation: false, arrangement: false, count: false, goal: false, latest: false, treeLayout: false, oldest: false, timeScale: false, sci: false, trueSize: false, names: false, lifersOnly: false, totals: [], bulk: false, batchSize: false, splits: [] })
    expect(optionRows(dialogRows('compare', false), false)).toEqual(['what', 'colours', 'transparent'])
  })
})

describe('dialogTitle: the title names what is shared (round 6)', () => {
  it('the collage from Collage and List, the map, the tree; Print the same way; Compare keeps its own', () => {
    const s = en.ui.share
    expect(dialogTitle(subjectOf('collage'), false, s, 'Share')).toBe('Share your collage')
    expect(dialogTitle(subjectOf('list'), false, s, 'Share')).toBe('Share your collage')
    expect(dialogTitle('map', false, s, 'Share')).toBe('Share your map')
    expect(dialogTitle('tree', false, s, 'Share')).toBe('Share your tree')
    expect(dialogTitle('collage', true, s, 'Share')).toBe('Print your collage')
    expect(dialogTitle('map', true, s, 'Share')).toBe('Print your map')
    expect(dialogTitle('tree', true, s, 'Share')).toBe('Print your tree')
    expect(dialogTitle('compare', false, s, en.ui.collage.share)).toBe(en.ui.collage.share)
  })
})

describe('optionRows: the options list\'s order (round 6)', () => {
  it('Share\'s collage: the choices, the switches, then the Goal; Print\'s: the size first and the names switch, no Goal', () => {
    // Scientific names under the row it changes (the dialog shows it only while that row is on); True size is in Arrangement's row.
    expect(optionRows(dialogRows('collage', false), false)).toEqual(['arrangement', 'colours', 'count', 'latest', 'sci', 'transparent', 'goal'])
    expect(optionRows(dialogRows('collage', true), true)).toEqual(['size', 'arrangement', 'colours', 'count', 'latest', 'names', 'sci', 'transparent'])
    expect(dialogRows('collage', false).trueSize).toBe(true)
    expect(dialogRows('collage', true).trueSize).toBe(true)
  })
  it('the Tree: its Arrangement, Appearance, Totals, then Lifers only, Time scale, Scientific names (round 6, the Tree brief item 12), Show oldest lineage and Transparent background (in Print, the size first and no rank row: item 22); the Map: Appearance, Totals, Transparent background', () => {
    expect(optionRows(dialogRows('tree', false), false)).toEqual(['treeLayout', 'colours', 'totals', 'lifersOnly', 'timeScale', 'sci', 'oldest', 'transparent'])
    expect(optionRows(dialogRows('tree', true), true)).toEqual(['size', 'treeLayout', 'colours', 'totals', 'lifersOnly', 'timeScale', 'sci', 'oldest', 'transparent'])
    expect(optionRows(dialogRows('map', false), false)).toEqual(['colours', 'totals', 'transparent'])
    expect(optionRows(dialogRows('map', true), true)).toEqual(['size', 'colours', 'totals', 'transparent'])
  })
  it('the Tree offers only the totals at and below its level (round 6)', () => {
    expect(treeTotals(undefined)).toEqual(['species', 'genera', 'families', 'orders'])
    expect(treeTotals({})).toEqual(['species', 'genera', 'families', 'orders'])
    expect(treeTotals({ ord: 'Passeriformes' })).toEqual(['species', 'genera', 'families'])
    expect(treeTotals({ ord: 'Passeriformes', fam: 'Parulidae' })).toEqual(['species', 'genera'])
    expect(treeTotals({ ord: 'Passeriformes', fam: 'Parulidae', genus: 'Setophaga' })).toEqual(['species'])
  })
  it('a Totals chip turns its total on or off on its own, kept in the image\'s order; every combination, none included', () => {
    const all = dialogRows('tree', false).totals
    expect(toggleTotal(all, all, 'genera')).toEqual(['species', 'families', 'orders'])
    expect(toggleTotal(all, ['orders'], 'species')).toEqual(['species', 'orders'])
    expect(toggleTotal(all, ['orders'], 'orders')).toEqual([])
    expect(toggleTotal(all, [], 'families')).toEqual(['families'])
  })
  it('a tree\'s orientation is its arrangement\'s: a Fan horizontal, Rectangular and Radial vertical', () => {
    expect(treeOrientation('fan')).toBe('horizontal')
    expect(treeOrientation('rows')).toBe('vertical')
    expect(treeOrientation('circle')).toBe('vertical')
  })
})

describe('makeViewPoster', () => {
  function setup() {
    const ops: string[] = []
    const ctx = {
      canvas: { width: 0, height: 0 }, fillStyle: '',
      setTransform: (...m: number[]) => ops.push(`setTransform(${m.join(',')})`), save: () => ops.push('save'), restore: () => ops.push('restore'),
      clearRect: (_x: number, _y: number, _w: number, h: number) => ops.push(`clear ${h}`), fillRect: (_x: number, _y: number, _w: number, h: number) => ops.push(`fill ${h}`),
    } as unknown as CanvasRenderingContext2D
    const rows: number[] = []
    const enc = {
      begin: vi.fn(), dispose: vi.fn(),
      strip: vi.fn(async (_rgba: Uint8ClampedArray, n: number) => { rows.push(n) }),
      end: vi.fn(async () => 99),
      file: vi.fn(async (kind: 'png' | 'pdf') => new Blob([kind], { type: kind === 'png' ? 'image/png' : 'application/pdf' })),
    } satisfies EncoderPort
    const canvases: [number, number][] = []
    const deps = { strip: (w: number, n: number) => { canvases.push([w, n]); ctx.canvas.width = w; return { ctx, read: (r: number) => new Uint8ClampedArray(w * r * 4) } }, encoder: () => enc, frame: async () => {} }
    const paints: number[] = []
    const painter = (paper: string | null) => ({ paper, paint: vi.fn(() => { paints.push(paints.length) }) })
    return { ops, rows, enc, deps, canvases, paints, painter }
  }

  it('lays the view out once at the poster scale, then paints the whole drawing into each strip under its transform', async () => {
    const { ops, rows, enc, deps, canvases, painter } = setup()
    const view = painter('#fff')
    const render = vi.fn(async (_scale: number, give: (p: typeof view) => void) => { give(view); return new Blob([]) })
    const progress: [number, number][] = []
    const p = await makeViewPoster({ size: 'A2', render }, (d, t) => progress.push([d, t]), deps)
    expect(render).toHaveBeenCalledTimes(1)
    const k = printScale('A2')
    expect(render.mock.calls[0][0]).toBe(k)
    const [w, h] = printPx('A2')
    const strips = stripRanges(w, h, posterRows(w, k))
    expect(enc.begin).toHaveBeenCalledWith(w, h)
    expect(rows).toEqual(strips.map((s) => s.rows))
    expect(view.paint).toHaveBeenCalledTimes(strips.length)
    // Each strip: Paper over it in device px, then the drawing at the poster's scale moved up by the strip's top.
    expect(ops).toEqual(strips.flatMap((s) => ['setTransform(1,0,0,1,0,0)', `fill ${s.rows}`, 'save', `setTransform(${k},0,0,${k},0,${-s.y})`, 'restore']))
    expect(canvases).toEqual([[w, strips[0].rows]])
    expect(progress.at(0)).toEqual([1, strips.length + 2])
    expect(progress.at(-1)).toEqual([strips.length + 2, strips.length + 2])
    expect(p).toMatchObject({ size: 'A2', landscape: false, bytes: 99, soft: 0, missing: 0, namesDropped: false })
    await p.file('pdf')
    expect(enc.file).toHaveBeenCalledWith('pdf', PRINT_PT.A2)
  })

  it('landscape A1: the poster scale (no cap), the turned paper, cleared strips and an RGBA PNG when transparent', async () => {
    const { ops, enc, deps, painter } = setup()
    const render = vi.fn(async (_scale: number, give: (p: ReturnType<typeof painter>) => void) => { give(painter(null)); return new Blob([]) })
    const p = await makeViewPoster({ size: 'A1', landscape: true, transparent: true, render }, () => {}, deps)
    expect(render.mock.calls[0][0]).toBe(printScale('A1'))
    expect(enc.begin).toHaveBeenCalledWith(...printPx('A1', true), true)
    expect(ops.some((o) => o.startsWith('fill'))).toBe(false)
    await p.file('png')
    expect(enc.file).toHaveBeenCalledWith('png', [PRINT_PT.A1[1], PRINT_PT.A1[0]])
  })

  it('never makes a canvas over STRIP_AREA, at any size or orientation', async () => {
    for (const size of PRINT_SIZES) for (const landscape of [false, true]) {
      const { deps, canvases, painter } = setup()
      await makeViewPoster({ size, landscape, render: async (_s, give) => { give(painter('#fff')); return new Blob([]) } }, () => {}, deps)
      for (const [w, n] of canvases) expect(w * n, `${size} ${landscape}`).toBeLessThanOrEqual(STRIP_AREA)
      const [w] = printPx(size, landscape)
      expect(w * posterRows(w, printScale(size))).toBeLessThanOrEqual(STRIP_AREA)
    }
  })

  it('an abort rejects with AbortError and disposes the encoder; a view that gives no painter fails', async () => {
    const a = setup()
    const ctl = new AbortController()
    let n = 0
    const aborting = { ...a.deps, frame: async () => { if (++n === 2) ctl.abort() } }
    await expect(makeViewPoster({ size: 'A4', signal: ctl.signal, render: async (_s, give) => { give(a.painter('#fff')); return new Blob([]) } }, () => {}, aborting)).rejects.toMatchObject({ name: 'AbortError' })
    expect(a.enc.dispose).toHaveBeenCalled()
    const b = setup()
    await expect(makeViewPoster({ size: 'A4', render: async () => new Blob(['png']) }, () => {}, b.deps)).rejects.toThrow('no painter')
    const c = setup()
    await expect(makeViewPoster({ size: 'A4', render: async () => { throw new Error('Canvas is not available') } }, () => {}, c.deps)).rejects.toThrow('poster-memory')
  })
})
