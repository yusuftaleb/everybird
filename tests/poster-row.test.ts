// A Tree poster's oldest lineage row (round 6, item 24): the share images' row above the footer's hairline, inside the
// content box, its name never smaller than the tree's tip names (so it reads from the same distance). Drawn by the real
// renderer (renderTreeImage, renderViewImage, paintCard) on the recording canvas of tests/fixtures/share-image-harness.ts,
// from the shipped tree; nothing is fetched.
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import * as image from '@/lib/share/image'
import { printDesign, type PrintSize } from '@/lib/share/print'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import type { TreeLevel } from '@/lib/tree/levels'
import { oldestLineage, parseNewick } from '@/lib/tree/tree'
import { drawsOnly, installStubs } from './fixtures/share-image-harness'

const file = JSON.parse(readFileSync('public/data/tree.v1.json', 'utf8'))
const shipped = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const tree = parseNewick(file.newick, file.taxOnly)
const species = buildSpeciesIndex(shipped.species)
const codes = new Set(shipped.species.filter((_, i) => i % 3 === 0).map((r) => r.code))
const entries = [...codes].map((code) => ({ code, date: '2020-01', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] }))

vi.mock('@/lib/tree/load', () => ({ loadTree: async () => ({ tree: (globalThis as { __tree?: unknown }).__tree }) }))
vi.mock('@/lib/species/load', async (orig) => ({ ...(await orig<typeof import('@/lib/species/load')>()), loadSpecies: async () => (globalThis as { __species?: unknown }).__species }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), loadStickers: async () => new Map() }))
const { renderTreeImage } = await import('@/lib/share/tree-image')

beforeAll(() => {
  (globalThis as { __tree?: unknown }).__tree = tree;
  (globalThis as { __species?: unknown }).__species = species
})
afterEach(() => vi.unstubAllGlobals())

/** One Tree poster's draw log (the view's canvas: renderViewImage makes one). */
async function poster(level: TreeLevel, layout: 'rows' | 'fan', size: PrintSize = 'A4'): Promise<string[]> {
  const logs = installStubs()
  const make = document.createElement
  // The recording canvas, with toBlob and the path calls the tree draws with (no-ops: only text, images and rects are logged).
  const paths = ['beginPath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'stroke', 'fill', 'setLineDash', 'rect', 'clip', 'ellipse', 'rotate', 'translate', 'scale', 'save', 'restore', 'setTransform', 'resetTransform', 'strokeText']
  const canvas = (tag: string) => {
    const c = make(tag) as unknown as { getContext: (k: string) => Record<string, unknown> | null; toBlob?: unknown }
    const get = c.getContext
    c.getContext = (k: string) => { const ctx = get(k); if (ctx) for (const m of paths) if (typeof ctx[m] !== 'function') ctx[m] = () => {}; return ctx }
    c.toBlob = (cb: (b: Blob) => void) => cb(new Blob(['png']))
    return c
  }
  vi.stubGlobal('document', { ...document, createElement: canvas })
  const format = layout === 'fan' ? 'printLandscape' : 'print'
  await renderTreeImage({
    format, printSize: size, scale: 1, entries, species, theme: 'light', strings: en.ui, latest: false,
    at: { tree: level, layout, time: true }, state: { list: [], filter: {}, seen: undefined as never, sci: false }, t: en.ui, oldest: true,
  } as unknown as Parameters<typeof renderTreeImage>[0])
  return drawsOnly([...logs.values()].at(-1)!)
}
const px = (l: string) => Number(/font: "600 ([\d.]+)px/.exec(l)?.[1] ?? NaN)
const xy = (l: string) => /, ([\d.-]+), ([\d.-]+)\) \{/.exec(l)!.slice(1).map(Number)

describe('a Tree poster\'s oldest lineage row', () => {
  const oldName = species.byCode.get(oldestLineage(tree, codes)!.code)!.com
  for (const [what, level, layout] of [['5 families, Rectangular', { ord: 'Galliformes' }, 'rows'], ['141 families, Rectangular', { ord: 'Passeriformes' }, 'rows'], ['27 genera, Fan', { ord: 'Cuculiformes' }, 'fan']] as const) {
    it(`sits above the hairline, inside the content box, its name at least the tip names' size (${what})`, async () => {
      const log = await poster(level, layout)
      const format = layout === 'fan' ? 'printLandscape' : 'print'
      const L = image.cardLayout(format, { name: false, filter: false, latest: true, count: 0, countSize: 'hide' }, printDesign('A4', layout === 'fan'))
      const texts = log.filter((l) => l.startsWith('fillText('))
      const name = texts.find((l) => l.startsWith(`fillText(${JSON.stringify(oldName)}, `) && l.includes('textBaseline: "middle"'))!
      expect(name, 'the row\'s name').toBeTruthy()
      // The tip names: every other text in the row's face (600 weight, the body family).
      const tips = texts.filter((l) => l !== name && /font: "600 /.test(l)).map(px)
      expect(tips.length).toBeGreaterThan(0)
      expect(px(name)).toBeGreaterThanOrEqual(Math.max(...tips))
      expect(px(name)).toBeGreaterThanOrEqual(image.SMALL_INLINE.name)
      // Five families' names are large on a poster, so the row's name grows to theirs; 141 families' are small, so it keeps its own.
      if (level.ord === 'Galliformes') expect(px(name)).toBe(Math.max(...tips))
      if (level.ord === 'Passeriformes') expect(px(name)).toBe(image.SMALL_INLINE.name)
      // In the row: right after its sticker's square, on its middle; above the hairline, inside the content's width.
      const R = L.latest!
      const [x, y] = xy(name)
      expect(x).toBe(R.x + R.icon + image.SMALL_INLINE.gap)
      expect(y).toBeCloseTo(R.y + R.icon / 2, 6)
      const rule = log.find((l) => l.startsWith('fillRect(64, ') && l.includes(image.SHARE_COLORS.light.hairline))!
      expect(R.y + R.icon).toBeLessThan(Number(/fillRect\(64, ([\d.]+),/.exec(rule)![1]))
      expect(R.x).toBe(L.collage.x)
      expect(R.y).toBeGreaterThanOrEqual(L.collage.y + L.collage.h)
      // The detail beside it, "Oldest lineage · …", in the small mono.
      expect(texts.some((l) => l.startsWith('fillText("Oldest lineage · ') && l.includes('textBaseline: "middle"'))).toBe(true)
      // Nothing of it in the foot any more.
      expect(texts.some((l) => l.includes('Oldest lineage:'))).toBe(false)
    })
  }
})
