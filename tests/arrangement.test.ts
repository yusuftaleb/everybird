import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { colourKey } from '../scripts/build-data/colour-key'
import { NEUTRAL_KEY, colourPack, layRows, rowsLayout, type RowBird } from '@/lib/layout/arrange'
import { EXP, LAYOUTS, MAXUP } from '@/lib/layout/constants'
import { collageHole, touchesHole, type Hole } from '@/lib/layout/count-box'
import { createLayoutClient } from '@/lib/layout/layout-client'
import { createLayoutHandler, type MaskLoader, type WorkerReply, type WorkerRequest } from '@/lib/layout/layout.worker'
import { decodeMask } from '@/lib/layout/mask'
import { packBest, relSizes, type Box, type PackBird } from '@/lib/layout/pack'
import type { ListEntry } from '@/lib/list/model'
import { planCaptions } from '@/lib/share/captions'
import * as image from '@/lib/share/image'
import { printDesign, type PrintSize } from '@/lib/share/print'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// The real species file, masks and colour keys (public data, no personal data).
const data = (f: string) => JSON.parse(readFileSync(join(__dirname, '..', 'public', 'data', f), 'utf8'))
const rows = (data('species.v1.json') as { species: SpeciesRow[] }).species
const masks = data('masks.v2.json') as Record<string, Record<string, [number, number, string]>>
const colours = (data('colours.v1.json') as { c: Record<string, number> }).c
const species = buildSpeciesIndex(rows)
const drawn = rows.filter((r) => r.st && masks[r.ord]?.[r.code] && colours[r.code] !== undefined)
const loadMasks: MaskLoader = async (order) => masks[order] ?? {}
const loadColours = async () => colours

/** A deterministic pick of `n` drawn species (an LCG), in taxon order, as lifers. */
function pick(n: number, seed: number): SpeciesRow[] {
  let s = seed >>> 0
  const chosen = new Set<SpeciesRow>()
  while (chosen.size < n) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    chosen.add(drawn[s % drawn.length])
  }
  return [...chosen].sort((a, b) => a.to - b.to)
}
const lifer = (r: SpeciesRow): ListEntry => ({ code: r.code, date: '2024-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })

const overlap = (a: Box, b: Box) => a[0] < b[0] + b[2] - 1e-6 && b[0] < a[0] + a[2] - 1e-6 && a[1] < b[1] + b[3] - 1e-6 && b[1] < a[1] + a[3] - 1e-6
const inHole = (b: Box, W: number, H: number, hole: Hole) => touchesHole([b[0] - W / 2, b[1] - H / 2, b[0] + b[2] - W / 2, b[1] + b[3] - H / 2], hole)

/** Spearman's rank correlation. */
function spearman(xs: number[], ys: number[]): number {
  const rank = (v: number[]) => { const o = v.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]); const r = new Array<number>(v.length); o.forEach(([, i], k) => { r[i] = k }); return r }
  const a = rank(xs), b = rank(ys), n = xs.length
  let d = 0
  for (let i = 0; i < n; i++) d += (a[i] - b[i]) ** 2
  return 1 - (6 * d) / (n * (n * n - 1))
}

describe('colour key', () => {
  // A disc of one colour with a 1px white die-cut border, on transparency.
  function disc(r: number, g: number, b: number, size = 40): Uint8Array {
    const px = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2), i = (y * size + x) * 4
      if (d > size / 2 - 1) continue
      const edge = d > size / 2 - 2
      px.set(edge ? [255, 255, 255, 255] : [r, g, b, 255], i)
    }
    return px
  }
  it('sorts colours like a rainbow and puts neutrals after them, dark to light', () => {
    const red = colourKey(disc(220, 30, 30), 40, 40)!, yellow = colourKey(disc(230, 210, 30), 40, 40)!
    const green = colourKey(disc(40, 170, 60), 40, 40)!, blue = colourKey(disc(40, 80, 220), 40, 40)!
    expect(red).toBeLessThan(yellow)
    expect(yellow).toBeLessThan(green)
    expect(green).toBeLessThan(blue)
    expect(blue).toBeLessThan(180)
    const black = colourKey(disc(20, 20, 20), 40, 40)!, grey = colourKey(disc(128, 128, 128), 40, 40)!, white = colourKey(disc(245, 245, 245), 40, 40)!
    const brown = colourKey(disc(110, 75, 40), 40, 40)!
    for (const k of [black, grey, white, brown]) expect(k).toBeGreaterThanOrEqual(180)
    expect(black).toBeLessThan(grey)
    expect(grey).toBeLessThan(white)
    expect(colourKey(new Uint8Array(16), 2, 2)).toBeNull()
  })
  it('the white border alone never makes a grey bird light', () => {
    expect(colourKey(disc(128, 128, 128, 16), 16, 16)).toBe(colourKey(disc(128, 128, 128, 40), 40, 40))
  })
  it('uses only hues in the named range and keeps the pixel rule for unnamed stickers', () => {
    const pixels = disc(220, 30, 30)
    pixels.set([30, 220, 30, 255], 4 * (20 * 40 + 20))
    expect(colourKey(pixels, 40, 40, 'green')).toBe(68)
    expect(colourKey(pixels, 40, 40, 'blue')).toBe(116)
    expect(colourKey(pixels, 40, 40, 'grey')).toBeGreaterThanOrEqual(180)
    expect(colourKey(pixels, 40, 40)).toBe(8)
  })
  it('the committed keys read as their birds', () => {
    // Northern Cardinal and Scarlet Macaw red, Blue Jay blue, American Goldfinch yellow, American Crow dark, Mute Swan light.
    const red = (k: number) => k < 15 || k > 170
    expect(red(colours.norcar) && red(colours.scamac1)).toBe(true)
    expect(colours.blujay).toBeGreaterThan(100)
    expect(colours.blujay).toBeLessThan(130)
    expect(colours.amegfi).toBeGreaterThan(25)
    expect(colours.amegfi).toBeLessThan(45)
    expect(colours.grnjay).toBeGreaterThanOrEqual(44)
    expect(colours.grnjay).toBeLessThan(94)
    expect(colours.rosspo1).toBeGreaterThanOrEqual(160)
    expect(colours.rosspo1).toBeLessThan(180)
    expect(colours.houspa).toBeGreaterThanOrEqual(180)
    expect(colours.amecro).toBeGreaterThanOrEqual(180)
    expect(colours.amecro).toBeLessThan(colours.mutswa)
  })
})

describe('By family rows', () => {
  const birds: RowBird[] = Array.from({ length: 90 }, (_, i) => ({ id: i, aspect: 0.55 + ((i * 37) % 100) / 60 }))
  const layout = LAYOUTS[1]
  const hole = collageHole(birds.length, layout)

  it('reads like a book, keeps each tile its aspect and the row its height, and leaves the count clear', () => {
    const r = layRows(birds, layout.W, 40, hole)!
    expect(r.boxes.size).toBe(birds.length)
    const bs = birds.map((b) => r.boxes.get(b.id)!)
    bs.forEach((b, i) => {
      expect(b[3]).toBeCloseTo(40)
      expect(b[2] / b[3]).toBeCloseTo(birds[i].aspect)
      expect(b[0]).toBeGreaterThanOrEqual(-1e-6)
      expect(b[0] + b[2]).toBeLessThanOrEqual(layout.W + 1e-6)
      expect(b[1] + b[3]).toBeLessThanOrEqual(r.H + 1e-6)
      expect(inHole(b, layout.W, r.H, hole)).toBe(false)
      if (i) expect(b[1] > bs[i - 1][1] || (b[1] === bs[i - 1][1] && b[0] > bs[i - 1][0])).toBe(true)
      for (let j = 0; j < i; j++) expect(overlap(b, bs[j])).toBe(false)
    })
  })

  it('a full collage fills its stage; a filtered one grows its rows up to MAXUP inside the full stage', () => {
    const full = rowsLayout(birds, layout, hole)
    expect(full.W).toBe(layout.W)
    expect(full.H).toBeLessThanOrEqual(layout.H)
    const some = birds.filter((b) => b.id % 5 === 0)
    const sub = rowsLayout(some, layout, collageHole(some.length, layout), { refBase: full.base, fixedStage: [full.W, full.H] })
    expect(sub.base).toBeGreaterThanOrEqual(full.base)
    expect(sub.base).toBeLessThanOrEqual(MAXUP * full.base + 1e-9)
    expect(sub.H).toBeLessThanOrEqual(full.H)
  })

  it('a big list grows the stage taller, never wider', () => {
    const many: RowBird[] = Array.from({ length: 3000 }, (_, i) => ({ id: i, aspect: 0.6 + ((i * 53) % 100) / 80 }))
    const r = rowsLayout(many, LAYOUTS[0], collageHole(many.length, LAYOUTS[0]))
    expect(r.W).toBe(LAYOUTS[0].W)
    expect(r.H).toBeGreaterThan(LAYOUTS[0].H)
    expect(r.boxes.size).toBe(many.length)
  })

  it('the worker sorts by taxon order and lays every bird out', async () => {
    const list = pick(30, 3)
    const handle = createLayoutHandler(loadMasks, loadColours)
    // Sent in reverse, with each entry's taxon order: the rows still run in taxon order.
    await handle({ type: 'setList', id: 1, entries: [...list].reverse().map((r) => ({ code: r.code, mass: r.g, ord: r.ord, to: r.to })) })
    const reply = await handle({ type: 'layout', id: 2, key: 'k', codes: list.map((r) => r.code).reverse(), layout: 'medium', mode: 'even', arrangement: 'family' }) as Extract<WorkerReply, { type: 'result' }>
    expect(reply.type).toBe('result')
    const at = (c: string) => { const i = reply.codes.indexOf(c); return [reply.boxes[4 * i], reply.boxes[4 * i + 1]] }
    for (let i = 1; i < list.length; i++) {
      const [x0, y0] = at(list[i - 1].code), [x1, y1] = at(list[i].code)
      expect(y1 > y0 || (y1 === y0 && x1 > x0)).toBe(true)
    }
  })
})

describe('By family in print keeps the names', () => {
  async function namesFit(list: SpeciesRow[], size: PrintSize, format: 'print' | 'printLandscape', titled: boolean, marked?: Set<string>): Promise<boolean> {
    const entries = list.map(lifer)
    const content: image.CardContent = { name: titled, filter: titled, latest: true, count: entries.length }
    const L = image.cardLayout(format, content, printDesign(size, format === 'printLandscape'))
    const plan = planCaptions(entries, species, size, L.collage.w, undefined, undefined, marked)
    if (!plan.ok) return false
    const spec = image.imagePackSpec(format, content, size, plan, 'family')
    expect(spec.arrangement).toBe('family')
    const birds = list.map((r) => ({ code: r.code, mass: r.g, ord: r.ord, to: r.to }))
    const reply = await createLayoutHandler(loadMasks, loadColours)({
      type: 'image', id: 1, entries: birds, aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile,
      captions: birds.map((b) => spec.captionBoxes![b.code]), arrangement: 'family',
    })
    return image.fitCaptionPack(image.packFromReply(reply), entries, format, content, size, plan, marked).ok
  }

  it('fits every name at each paper size’s cap, upright and landscape, with a title and the lifer rings', async () => {
    for (const [size, n] of [['A4', 40], ['A2', 160], ['A1', 320]] as const) {
      for (const format of ['print', 'printLandscape'] as const) {
        const list = pick(n, n + 7)
        const marked = new Set([list[0].code, list[n - 1].code])
        expect(await namesFit(list, size, format, true, marked), `${size} ${format}`).toBe(true)
        expect(await namesFit(pick(Math.ceil(n / 4), n), size, format, false), `${size} ${format} short`).toBe(true)
      }
    }
  }, 120_000)
})

describe('By colour', () => {
  for (const n of [200, 1000]) {
    it(`${n} birds: Packed's sizes, colours sweep left to right, neutrals last`, () => {
      const list = pick(n, n)
      const birds: PackBird[] = list.map((r, i) => ({ id: i, mass: r.g, mask: decodeMask(masks[r.ord][r.code]) }))
      const rel = relSizes(birds, EXP)
      const layout = LAYOUTS[0]
      const packed = packBest(birds, layout, 'even', { rel })
      const key = (id: number) => colours[list[id].code] ?? NEUTRAL_KEY
      const r = colourPack(birds, rel, packed.W, packed.H, packed.base, collageHole(n, layout), key)
      expect(r.base).toBe(packed.base)
      expect(r.boxes.size).toBe(n)
      for (const b of birds) {
        const [, , w, h] = r.boxes.get(b.id)!, [, , pw, ph] = packed.boxes.get(b.id)!
        expect(w).toBeCloseTo(pw)
        expect(h).toBeCloseTo(ph) // the count's hole is kept by the packer's grid, silhouette by silhouette, as Packed's
      }
      const cx = birds.map((b) => { const [x, , w] = r.boxes.get(b.id)!; return x + w / 2 })
      expect(spearman(birds.map((b) => key(b.id)), cx)).toBeGreaterThan(0.8)
      const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
      const neutral = birds.filter((b) => key(b.id) >= 180).map((b) => cx[b.id])
      const chroma = birds.filter((b) => key(b.id) < 180).map((b) => cx[b.id])
      expect(mean(neutral)).toBeGreaterThan(mean(chroma))
    }, 60_000)
  }
})

describe('layout client and arrangements', () => {
  function setup() {
    const handle = createLayoutHandler(loadMasks, loadColours)
    const log: WorkerRequest[] = []
    const worker = {
      onmessage: null as null | ((e: { data: WorkerReply }) => void),
      onerror: null, onmessageerror: null,
      postMessage(msg: WorkerRequest) { log.push(msg); setTimeout(async () => this.onmessage?.({ data: await handle(msg) }), 0) },
    }
    const list = pick(40, 11)
    const client = createLayoutClient(worker as unknown as Worker, { resolve: (f) => list.filter((r) => !f.order || r.ord === f.order).map((r) => r.code) })
    client.setList(list.map((r) => ({ code: r.code, mass: r.g, ord: r.ord, to: r.to })))
    return { client, log, list }
  }

  it('keeps Packed\'s keys, adds the arrangement to the mode part, and By family ignores True size', async () => {
    const { client } = setup()
    expect((await client.get({}, 'medium', 'even')).key).toBe('medium|even|')
    expect((await client.get({}, 'medium', 'true', 'family')).key).toBe('medium|even:family|')
    expect((await client.get({}, 'medium', 'true', 'colour')).key).toBe('medium|true:colour|')
  }, 60_000)

  it('By colour packs in the same state\'s Packed stage at its base', async () => {
    const { client, log } = setup()
    const packed = await client.get({}, 'medium', 'even')
    const colour = await client.get({}, 'medium', 'even', 'colour')
    const msg = log.find((m) => m.type === 'layout' && m.arrangement === 'colour') as Extract<WorkerRequest, { type: 'layout' }>
    expect(msg.fixedStage).toEqual([packed.W, packed.H])
    expect(msg.refBase).toBe(packed.base)
    expect(colour.base).toBe(packed.base)
    expect([...colour.boxes.keys()].sort()).toEqual([...packed.boxes.keys()].sort())
  }, 60_000)
})

describe('share frames', () => {
  const handle = createLayoutHandler(loadMasks, loadColours)
  const msgOf = (list: SpeciesRow[], format: image.CardFormat, arrangement?: 'family' | 'colour') => {
    const spec = image.imagePackSpec(format, { name: false, filter: false, latest: true, count: list.length }, undefined, undefined, arrangement)
    return { spec, msg: { type: 'image' as const, id: 1, entries: list.map((r) => ({ code: r.code, mass: r.g, ord: r.ord, to: r.to })), aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile, ...(spec.arrangement ? { arrangement: spec.arrangement } : {}) } }
  }

  it('By family centres a short list on the count instead of filling the top rows', async () => {
    for (const n of [8, 20]) for (const format of ['story', 'post', 'square'] as const) {
      const { msg } = msgOf(pick(n, n * 3), format, 'family')
      const p = image.packFromReply(await handle(msg))
      let top = Infinity, bottom = -Infinity
      for (const [, y, , h] of p.boxes.values()) { top = Math.min(top, y); bottom = Math.max(bottom, y + h) }
      const rowH = [...p.boxes.values()][0][3]
      expect(Math.abs(top - (p.H - bottom)), `${n} ${format}`).toBeLessThan(rowH * 1.5)
    }
  })

  it('By colour still lays every bird out when the colours file does not load', async () => {
    const list = pick(40, 5)
    const offline = createLayoutHandler(loadMasks, () => Promise.reject(new Error('offline')))
    expect(image.packFromReply(await offline(msgOf(list, 'story', 'colour').msg)).boxes.size).toBe(list.length)
  })

  it('By colour re-places packFrame\'s birds at (about) its sizes', async () => {
    const list = pick(120, 5)
    const packed = image.packFromReply(await handle(msgOf(list, 'story').msg))
    const colour = image.packFromReply(await handle(msgOf(list, 'story', 'colour').msg))
    expect(colour.boxes.size).toBe(list.length)
    expect([colour.W, colour.H]).toEqual([packed.W, packed.H])
    const ratio = [...colour.boxes].map(([c, b]) => b[2] / packed.boxes.get(c)![2])
    expect(Math.min(...ratio)).toBeGreaterThan(0.8) // colourFrame shrinks the base only when the frame is too tight
  })

  it('By colour with print names: records whether the names fit (they may drop to no names, as Packed\'s can)', async () => {
    const list = pick(40, 9), entries = list.map(lifer)
    const content: image.CardContent = { name: false, filter: false, latest: true, count: entries.length }
    const L = image.cardLayout('print', content, printDesign('A4', false))
    const plan = planCaptions(entries, species, 'A4', L.collage.w)
    if (!plan.ok) throw new Error('plan')
    const spec = image.imagePackSpec('print', content, 'A4', plan, 'colour')
    const reply = await handle({ type: 'image', id: 1, entries: list.map((r) => ({ code: r.code, mass: r.g, ord: r.ord })), aspect: spec.aspect, hole: spec.hole, maxTile: spec.maxTile, captions: list.map((r) => spec.captionBoxes![r.code]), arrangement: 'colour' })
    const fit = image.fitCaptionPack(image.packFromReply(reply), entries, 'print', content, 'A4', plan)
    console.log(`[arrangement] By colour, 40 names on A4: ${fit.ok ? 'fit' : 'dropped'}`)
    expect(typeof fit.ok).toBe('boolean')
  })
})
