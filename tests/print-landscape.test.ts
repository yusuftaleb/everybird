// The landscape poster: its pixel size, PDF page and card (print.ts's landscape helpers), and makePoster with the
// landscape flag, through the same fakes as poster.test.ts (no canvas, worker or network). Portrait is unchanged.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { prepareCard, type ImagePack } from '@/lib/share/image'
import {
  PRINT_CM, PRINT_IN, PRINT_PT, PRINT_PX, isUsSize, printCm, printDesign, printDesignH, printFileStem, printIn, printPt, printPx, printScale, stripRanges, type PrintSize,
} from '@/lib/share/print'
import { makePoster, posterRows, type EncoderPort, type PosterDeps } from '@/lib/share/poster'
import type { PrintStickers } from '@/lib/share/print-stickers'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { ListEntry } from '@/lib/list/model'

afterEach(() => vi.unstubAllGlobals())

const SIZES: PrintSize[] = ['A4', 'A3', 'A2', 'A1', 'US12x18', 'US18x24', 'US24x36']

describe('the landscape sizes', () => {
  it('swaps width and height: A4 landscape is 1754 × 1240 px, the same ISO or US size turned', () => {
    for (const s of SIZES) {
      expect(printPx(s, true)).toEqual([PRINT_PX[s][1], PRINT_PX[s][0]])
      expect(printPt(s, true)).toEqual([PRINT_PT[s][1], PRINT_PT[s][0]])
      expect(printCm(s, true)).toEqual([PRINT_CM[s][1], PRINT_CM[s][0]])
      if (isUsSize(s)) expect(printIn(s, true)).toEqual([PRINT_IN[s][1], PRINT_IN[s][0]])
      expect(printPx(s, false)).toEqual(PRINT_PX[s])
      expect(printPt(s, false)).toEqual(PRINT_PT[s])
    }
    expect(printPx('A4', true)).toEqual([1754, 1240])
    expect(printPx('US24x36', true)).toEqual([5400, 3600])
    expect(printIn('US24x36', true)).toEqual([36, 24])
    expect(printPt('A4', true)[0]).toBeCloseTo(841.89, 2)
    expect(printPt('A4', true)[1]).toBeCloseTo(595.28, 2)
    expect(printCm('A2', true)).toEqual([59.4, 42])
  })

  it('keeps the short side at 1080 design units, so the type and the stickers scale as the portrait does', () => {
    for (const s of SIZES) {
      const [w, h] = printDesign(s, true)
      expect(h).toBe(1080)
      expect(w).toBeCloseTo(printDesignH(s), 6)
      // The same pixels per design unit: the landscape's width is the portrait's height over that scale.
      expect(printPx(s, true)[0] / w).toBeCloseTo(printScale(s), 6)
      expect(printPx(s, true)[1] / h).toBeCloseTo(printScale(s), 6)
      expect(printDesign(s, false)[0]).toBe(1080)
    }
  })

  it('names the files: everybird-a2.png, everybird-24x36in.png, and -landscape beside them', () => {
    expect(printFileStem('A2')).toBe('everybird-a2')
    expect(printFileStem('A2', true)).toBe('everybird-a2-landscape')
    expect(printFileStem('A4', true)).toBe('everybird-a4-landscape')
    expect(printFileStem('US12x18')).toBe('everybird-12x18in')
    expect(printFileStem('US18x24', true)).toBe('everybird-18x24in-landscape')
    expect(printFileStem('US24x36')).toBe('everybird-24x36in')
    expect(printFileStem('US24x36', true)).toBe('everybird-24x36in-landscape')
  })

  it('lays a landscape card out at its own width and the same 1080 height, with the latest row stacked', async () => {
    const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
    const codes = ['synl0', 'synl1', 'synl2']
    const sp = buildSpeciesIndex(codes.map((c, i) => row(c, i + 1)))
    const es: ListEntry[] = codes.map((code, i) => ({ code, date: i === 0 ? '2024-05' : '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))
    const pack: ImagePack = { W: 1000, H: 800, boxes: new Map(codes.map((c, i) => [c, [200 + i * 250, 300, 160, 120]])) }
    const card = await prepareCard({ format: 'printLandscape', printSize: 'A2', theme: 'light', entries: es, species: sp, pack, now: new Date(2026, 10, 15), strings: en.ui }, printScale('A2'))
    expect([card.L.W, card.L.H]).toEqual([printDesign('A2', true)[0], 1080])
    // The landscape poster keeps the row stacked above the hairline (a long name won't fit beside the credit).
    expect(card.L.latest?.oneLine).toBe(false)
    expect(card.L.footer.y).toBe(1080 - 64 - 30)
  })
})

// A poster from the fakes: a canvas that draws nothing, an encoder that records its calls, stickers that load nothing.
function fakeDeps(): { deps: Partial<PosterDeps>; enc: { begin: ReturnType<typeof vi.fn>; strip: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn>; file: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }; strips: number[] } {
  const strips: number[] = []
  const enc = {
    begin: vi.fn(), strip: vi.fn<(rgba: Uint8ClampedArray, rows: number) => Promise<void>>(async () => {}), end: vi.fn(async () => 4096),
    file: vi.fn(async () => new Blob(['x'])), dispose: vi.fn(),
  }
  const port: EncoderPort = {
    begin: enc.begin, strip: async (rgba: Uint8ClampedArray, rows: number) => { strips.push(rows); await enc.strip(rgba, rows) },
    end: enc.end, file: enc.file as unknown as EncoderPort['file'], dispose: enc.dispose,
  }
  const stickers: PrintStickers = { get: async () => null, release: () => {}, stats: () => ({ soft: 0, missing: 0 }), dispose: () => {} }
  const ctx = new Proxy({ canvas: { width: 0, height: 0 }, measureText: (t: string) => ({ width: t.length * 10, actualBoundingBoxAscent: 10 }), letterSpacing: '0px' } as Record<string, unknown>, {
    get: (t, p: string) => (p in t ? t[p] : () => {}),
    set: (t, p: string, v) => { t[p] = v; return true },
  }) as unknown as CanvasRenderingContext2D
  const deps: Partial<PosterDeps> = {
    strip: (width: number) => ({ ctx, read: (n: number) => new Uint8ClampedArray(width * n * 4) }),
    encoder: () => port,
    stickers,
    frame: async () => {},
    rows: undefined,
  }
  return { deps, enc, strips }
}

const CODES = Array.from({ length: 4 }, (_, i) => `synp${i}`)
const psp = buildSpeciesIndex(CODES.map((c, i) => ({ code: c, com: c, sci: c, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to: i + 1, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow))
const pentries: ListEntry[] = CODES.map((code, i) => ({ code, date: i === 0 ? '2024-05' : '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))
const ppack: ImagePack = { W: 1000, H: 1000, boxes: new Map(CODES.map((c, i) => [c, [100 + i * 200, 300, 150, 100]])) }

class FakePath2D { constructor(public d: string) {} }

describe('makePoster, landscape', () => {
  beforeEach(() => { vi.stubGlobal('Path2D', FakePath2D) })
  for (const size of ['A4', 'A1', 'US18x24', 'US24x36'] as PrintSize[]) {
    it(`${size} landscape: the encoder gets the landscape pixels, its rows add up to them, and the PDF page is the swapped A size`, async () => {
      const { deps, enc, strips } = fakeDeps()
      const [w, h] = printPx(size, true)
      const poster = await makePoster(
        { size, landscape: true, theme: 'light', entries: pentries, species: psp, pack: ppack, now: new Date(2026, 10, 15), strings: en.ui },
        () => {}, deps,
      )
      expect(poster.landscape).toBe(true)
      expect(enc.begin).toHaveBeenCalledWith(w, h)
      expect(strips.reduce((a, b) => a + b, 0)).toBe(h)
      expect(strips.length).toBe(stripRanges(w, h, posterRows(w, printScale(size))).length)
      await poster.file('pdf')
      expect(enc.file).toHaveBeenCalledWith('pdf', printPt(size, true))
      await poster.file('png')
      expect(enc.file).toHaveBeenCalledWith('png', printPt(size, true))
      poster.dispose()
    })
  }

  it('portrait is unchanged: A4 is 1240 × 1754 with the portrait page', async () => {
    const { deps, enc } = fakeDeps()
    const poster = await makePoster({ size: 'A4', theme: 'light', entries: pentries, species: psp, pack: ppack, now: new Date(2026, 10, 15), strings: en.ui }, () => {}, deps)
    expect(poster.landscape).toBe(false)
    expect(enc.begin).toHaveBeenCalledWith(1240, 1754)
    await poster.file('pdf')
    expect(enc.file).toHaveBeenCalledWith('pdf', PRINT_PT.A4)
    poster.dispose()
  })
})
