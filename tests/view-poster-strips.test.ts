// The Tree's and the Map's posters painted in strips (makeViewPoster) are the same drawing as the poster painted whole
// on one canvas (renderTreeImage, renderMapImage), seen through each strip's window. Both are drawn by the real
// renderers on a recording canvas that tracks the transform, so every draw is logged in device px: a strip's log, moved
// down by the strip's top (a whole number of rows), must equal the whole canvas's. A canvas rasterises each pixel from
// that device geometry alone, so equal geometry at an integer offset gives equal pixels, and text and lines crossing a
// strip's edge join exactly. From the shipped tree and map, a synthetic list; nothing is fetched.
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { makeViewPoster, posterRows, type EncoderPort } from '@/lib/share/poster'
import { STRIP_AREA, printPx, printScale, stripRanges, type PrintSize } from '@/lib/share/print'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { parseNewick } from '@/lib/tree/tree'

const file = JSON.parse(readFileSync('public/data/tree.v1.json', 'utf8'))
const shipped = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const world = JSON.parse(readFileSync('public/data/map-countries.v1.json', 'utf8'))
const tree = parseNewick(file.newick, file.taxOnly)
const species = buildSpeciesIndex(shipped.species)
const COUNTRIES = ['CA', 'US', 'MX', 'KE', 'EG', 'GB', 'AU', 'BR']
const entries = shipped.species.filter((_, i) => i % 9 === 0).map((r, i) => ({
  code: r.code, date: `20${String(10 + (i % 15)).padStart(2, '0')}-0${(i % 9) + 1}`, place: { country: COUNTRIES[i % COUNTRIES.length] },
  heard: false, dead: false, media: false, sources: ['ebird'],
}))

vi.mock('@/lib/tree/load', () => ({ loadTree: async () => ({ tree: (globalThis as { __tree?: unknown }).__tree }) }))
vi.mock('@/lib/species/load', async (orig) => ({ ...(await orig<typeof import('@/lib/species/load')>()), loadSpecies: async () => (globalThis as { __species?: unknown }).__species }))
vi.mock('@/lib/map/shapes', async (orig) => ({ ...(await orig<typeof import('@/lib/map/shapes')>()), loadMapCountries: async () => (globalThis as { __world?: unknown }).__world }))
vi.mock('@/lib/flag', () => ({ flagSrc: () => null }))
// Every sticker "loads" as a stand-in image, so the drawings' drawImage calls are logged too.
vi.mock('@/lib/share/image', async (orig) => ({
  ...(await orig<typeof import('@/lib/share/image')>()),
  loadStickers: async (urls: string[]) => new Map(urls.map((u) => [u, { src: u, width: 384, height: 300 }])),
}))
const { renderTreeImage } = await import('@/lib/share/tree-image')
const { renderMapImage } = await import('@/lib/share/map-image')

type M = [number, number, number, number, number, number]
const I: M = [1, 0, 0, 1, 0, 0]
const mul = (m: M, n: readonly number[]): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
]
const num = (v: number) => String(Math.round(v * 1e6) / 1e6)
const show = (v: unknown): string => (typeof v === 'number' ? num(v) : v && typeof v === 'object' ? ('d' in v ? 'path' : 'src' in v ? `img(${(v as { src: string }).src})` : 'gradient') : JSON.stringify(v))

/**
 * A 2D context that logs every call (but the transform's own) with the transform it is made under, and every property
 * set. `tag(m)` writes a transform into a line: the whole canvas's as is, a strip's moved down by the strip's top.
 */
function deviceContext(log: string[], tag: { dy: number }) {
  let m: M = I
  let state: Record<string, unknown> = { font: '10px sans-serif', letterSpacing: '0px' }
  const stack: { m: M; state: Record<string, unknown> }[] = []
  const at = () => `@[${[m[0], m[1], m[2], m[3], m[4], m[5] + tag.dy].map(num).join(',')}]`
  const own: Record<string, unknown> = {
    canvas: { width: 0, height: 0 },
    save: () => { stack.push({ m, state: { ...state } }); log.push('save') },
    restore: () => { const s = stack.pop(); if (s) { m = s.m; state = s.state } log.push('restore') },
    setTransform: (...n: number[]) => { m = n.length === 6 ? (n as M) : I },
    resetTransform: () => { m = I },
    translate: (x: number, y: number) => { m = mul(m, [1, 0, 0, 1, x, y]) },
    scale: (x: number, y: number) => { m = mul(m, [x, 0, 0, y, 0, 0]) },
    rotate: (r: number) => { m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]) },
    transform: (...n: number[]) => { m = mul(m, n) },
    measureText: (text: string) => {
      const px = Number(/(\d+(?:\.\d+)?)px/.exec(String(state.font))?.[1] ?? 10)
      return { width: text.length * px * 0.55, actualBoundingBoxAscent: 0.7 * px, actualBoundingBoxDescent: 0.2 * px }
    },
    createLinearGradient: (...a: number[]) => { log.push(`gradient(${a.map(num).join(',')}) ${at()}`); return { addColorStop: (o: number, c: string) => log.push(`stop(${num(o)},${c})`) } },
  }
  return new Proxy(own, {
    get: (t, k: string) => (k in t ? t[k] : k in state ? state[k] : (...a: unknown[]) => { log.push(`${k}(${a.map(show).join(', ')}) ${at()}`) }),
    set: (_t, k: string, v) => { state[k] = v; log.push(`${k} = ${show(v)}`); return true },
  }) as unknown as CanvasRenderingContext2D
}

/** Canvases made through document.createElement: their logs and their sizes. */
function stubDocument() {
  const made: { log: string[]; w: number; h: number }[] = []
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`)
      const rec = { log: [] as string[], w: 300, h: 150 }
      made.push(rec)
      const ctx = deviceContext(rec.log, { dy: 0 })
      return {
        get width() { return rec.w }, set width(v: number) { rec.w = v },
        get height() { return rec.h }, set height(v: number) { rec.h = v },
        getContext: (k: string) => (k === '2d' ? ctx : null),
        toBlob: (cb: (b: Blob) => void) => cb(new Blob(['png'])),
      }
    },
    documentElement: {},
    fonts: { load: () => Promise.resolve([]), ready: Promise.resolve() },
  })
  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
  vi.stubGlobal('Path2D', class { constructor(public d: string) {} })
  return made
}

beforeAll(() => {
  const g = globalThis as { __tree?: unknown; __species?: unknown; __world?: unknown }
  g.__tree = tree
  g.__species = species
  g.__world = world
})
afterEach(() => vi.unstubAllGlobals())

type View = 'tree' | 'map'
const optsFor = (view: View, size: PrintSize, landscape: boolean, scale: number) => ({
  format: landscape ? 'printLandscape' : 'print', printSize: size, scale, entries, species, theme: 'light', strings: en.ui, latest: false,
  at: view === 'tree' ? { tree: { ord: 'Passeriformes' }, layout: landscape ? 'fan' : 'rows', time: true } : {},
  state: { list: entries, filter: {}, seen: undefined, sci: false }, t: en.ui, oldest: view === 'tree',
}) as unknown as Parameters<typeof renderTreeImage>[0]
const renderOf = (view: View) => (view === 'tree' ? renderTreeImage : renderMapImage)

/** The poster drawn whole on one canvas at its poster scale: the draws after its scale is set. */
async function whole(view: View, size: PrintSize, landscape: boolean): Promise<string[]> {
  const made = stubDocument()
  await renderOf(view)(optsFor(view, size, landscape, printScale(size)))
  const log = made.at(-1)!.log
  return log
}

/** The poster made in strips: each strip's draws, moved down by its top; the canvases the make asked for. */
async function strips(view: View, size: PrintSize, landscape: boolean, rows: number) {
  const made = stubDocument()
  const k = printScale(size)
  const [w, h] = printPx(size, landscape)
  const ranges = stripRanges(w, h, posterRows(w, k, rows))
  const tag = { dy: 0 }
  let cur: string[] = []
  const logs: string[][] = []
  const ctx = deviceContext({ push: (...l: string[]) => cur.push(...l) } as unknown as string[], tag)
  const asked: [number, number][] = []
  let i = 0
  const enc: EncoderPort = { begin() {}, dispose() {}, strip: async () => {}, end: async () => 1, file: async () => new Blob([]) }
  await makeViewPoster({ size, landscape, render: (scale, onPainter) => renderOf(view)({ ...optsFor(view, size, landscape, scale), onPainter }) }, () => {}, {
    rows, encoder: () => enc, frame: async () => {},
    strip: (sw, sr) => {
      asked.push([sw, sr])
      return {
        ctx,
        read: (n) => {
          logs.push(cur)
          cur = []
          tag.dy = ranges[++i]?.y ?? 0
          return new Uint8ClampedArray(sw * n * 4)
        },
      }
    },
  })
  return { ranges, logs, asked, made }
}

/** A strip's draws: after its Paper and its `save`, up to its last `restore` (makeViewPoster's own calls are not the view's). */
const viewPart = (log: string[]) => log.slice(log.indexOf('save') + 1, log.lastIndexOf('restore'))
/** The whole canvas's draws: after its own Paper (when its height is fractional). */
const afterPaper = (log: string[]) => (log[0]?.startsWith('fillStyle') && log[1]?.startsWith('fillRect') ? log.slice(2) : log)

describe('the Tree\'s and the Map\'s posters in strips are the poster painted whole', () => {
  for (const [view, landscape] of [['tree', false], ['tree', true], ['map', false], ['map', true]] as const) {
    it(`${view} ${landscape ? (view === 'tree' ? 'landscape (Fan)' : 'landscape') : 'portrait'}, A4: every strip draws the whole drawing, at a whole-row offset`, async () => {
      const ref = afterPaper(await whole(view, 'A4', landscape))
      expect(ref.filter((l) => /^(fillText|stroke|fill|drawImage)\(/.test(l)).length).toBeGreaterThan(20)
      // Small strips (250 rows), so the drawing's text and lines cross several strip edges.
      const { ranges, logs, asked, made } = await strips(view, 'A4', landscape, 250)
      expect(ranges.length).toBeGreaterThanOrEqual(5)
      expect(logs).toHaveLength(ranges.length)
      for (const [i, log] of logs.entries()) {
        expect(Number.isInteger(ranges[i].y)).toBe(true)
        expect(viewPart(log), `strip ${i}`).toEqual(ref)
      }
      // One strip canvas, and no other canvas of the poster's size (only the card's measuring ones, if any).
      expect(asked).toHaveLength(1)
      for (const [w, n] of asked) expect(w * n).toBeLessThanOrEqual(STRIP_AREA)
      for (const c of made) expect(c.w * c.h).toBeLessThanOrEqual(STRIP_AREA)
    })
  }
})
