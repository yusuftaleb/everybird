import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAME_MAX } from '@/lib/share/link'
import { IMAGE_SIZE, NAME_MAX_LEN, SHARE_COLORS, cardLayout, countLayout, filterLabel, fitPack, latestText, maxTileFrac, maxTileSide, OG_COUNT_MAX, packSpec, placeCredit, SPREAD, spreadY, STICKER_CREDIT } from '@/lib/share/image'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'

const row = (code: string, ord: string, fam: string, famCom: string) => ({ code, com: code, sci: code, ord, fam, famCom, to: 1 }) as never
const rows = [row('grbher3', 'Pelecaniformes', 'Ardeidae', 'Herons, Egrets, and Bitterns'), row('houspa', 'Passeriformes', 'Passeridae', 'Old World Sparrows')]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const countryName = (iso: string) => ({ EG: 'Egypt', CA: 'Canada' })[iso] ?? iso
const ctx = { species, countryName }

describe('latestText', () => {
  it('gives the latest lifer row: a label with the month, and the name', () => {
    expect(latestText({ com: 'Western Grebe', date: '2026-09-30' })).toEqual({ label: 'Latest lifer · Sep 2026', name: 'Western Grebe' })
  })
  it('drops a missing date and keeps a year-only one', () => {
    expect(latestText({ com: 'Mallard' })).toEqual({ label: 'Latest lifer', name: 'Mallard' })
    expect(latestText({ com: 'Mallard', date: '2024' }).label).toBe('Latest lifer · 2024')
  })
})

describe('filterLabel', () => {
  it('is undefined with no filter', () => {
    expect(filterLabel({}, ctx)).toBeUndefined()
  })
  it('reads the filter in words: birds, then place, then time', () => {
    expect(filterLabel({ countries: ['EG'], year: '2026' }, ctx)).toBe('Egypt · 2026')
    expect(filterLabel({ order: 'Pelecaniformes', family: 'Ardeidae', countries: ['EG'] }, ctx)).toBe('Herons, Egrets, and Bitterns · Egypt')
    expect(filterLabel({ order: 'Passeriformes' }, ctx)).toBe('Perching birds')
    expect(filterLabel({ year: '2025' }, ctx)).toBe('2025')
    expect(filterLabel({ countries: ['EG'], from: '2026-01', to: '2026-12' }, ctx)).toBe('Egypt · 2026')
    expect(filterLabel({ from: '2025-03', to: '2026-06' }, ctx)).toBe('Mar 2025 to Jun 2026')
    expect(filterLabel({ countries: ['EG'], from: '2026-09', to: '2026-09' }, ctx)).toBe('Egypt · Sep 2026')
    expect(filterLabel({ order: 'Pelecaniformes', countries: ['EG'], from: '2026-09', to: '2026-09' }, ctx)).toBe(`${orderLabel('Pelecaniformes')} · Egypt · Sep 2026`)
  })
})

describe('share image constants', () => {
  it('story is 1080×1920, post is 1080×1350 and square is 1080×1080', () => {
    expect(IMAGE_SIZE.story).toEqual([1080, 1920])
    expect(IMAGE_SIZE.post).toEqual([1080, 1350])
    expect(IMAGE_SIZE.square).toEqual([1080, 1080])
  })
  it('the name field allows what a share link carries', () => {
    expect(NAME_MAX_LEN).toBe(NAME_MAX)
  })
  it('colours equal tokens.css (light and dark)', () => {
    const css = readFileSync(resolve(__dirname, '../src/styles/tokens.css'), 'utf8')
    const block = (sel: string) => {
      const i = css.indexOf(sel)
      return css.slice(css.indexOf('{', i), css.indexOf('}', i))
    }
    const light = block(':root[data-theme=light]'), dark = block(':root[data-theme=dark]')
    for (const [theme, body] of [['light', light], ['dark', dark]] as const) {
      const map = SHARE_COLORS[theme] as Record<string, string>
      const names = ['ink', 'paper', 'accent', 'muted', 'line', 'hairline', 'surface']
      expect(Object.keys(map).sort()).toEqual([...names].sort())
      for (const n of names) expect(body).toMatch(new RegExp(`--${n}:\\s*${map[n]}\\s*;`, 'i'))
    }
  })
})

describe('cardLayout', () => {
  const SAFE = { story: { top: 160, bottom: 220 }, post: { top: 64, bottom: 64 }, square: { top: 64, bottom: 64 } } as const
  const inside = (a: { y: number }, b: { y: number; h: number }) => a.y >= b.y && a.y <= b.y + b.h
  for (const format of ['story', 'post', 'square'] as const) {
    it(`${format}: name and filter on top (or nothing), the collage, then the latest lifer and the footer, inside the safe zones`, () => {
      const [W, H] = IMAGE_SIZE[format]
      const { top, bottom } = SAFE[format]
      for (const name of [false, true]) for (const filter of [false, true]) for (const latest of [false, true]) {
        const L = cardLayout(format, { name, filter, latest, count: 197 })
        expect([L.W, L.H]).toEqual([W, H])
        expect(L.collage.x).toBe(64)
        expect(L.collage.w).toBe(W - 128)
        // Top: the name, then the filter in words; with neither, the collage takes the room from the safe line.
        expect(!!L.name).toBe(name)
        expect(!!L.filter).toBe(filter)
        const head = [L.name, L.filter].filter(Boolean) as { y: number; size: number }[]
        if (head.length) {
          expect(head[0].y).toBe(top)
          if (head.length === 2) expect(head[1].y).toBeGreaterThanOrEqual(head[0].y + head[0].size)
          const last = head[head.length - 1]
          expect(L.collage.y).toBeGreaterThan(last.y + last.size)
        } else expect(L.collage.y).toBe(top)
        // Bottom: the latest lifer row, a hairline, the footer; nothing in the bottom safe zone.
        const collageBottom = L.collage.y + L.collage.h
        if (latest) {
          expect(L.latest!.y).toBeGreaterThan(collageBottom)
          expect(L.rule.y).toBeGreaterThan(L.latest!.y + L.latest!.icon)
        } else expect(L.latest).toBeUndefined()
        expect(L.rule.y).toBeGreaterThan(collageBottom)
        expect(L.footer.y).toBeGreaterThan(L.rule.y)
        expect(L.footer.y + L.footer.size).toBeLessThanOrEqual(H - bottom)
        expect(L.footer.credit).toBeLessThan(L.footer.size)
        expect(L.collage.h).toBeGreaterThan(format === 'story' ? 1150 : format === 'post' ? 870 : 560)
        // Nothing (the name on top, the footer at the bottom) inside the platform's safe zones.
        if (L.name) expect(L.name.y).toBeGreaterThanOrEqual(top)
        expect(L.collage.y).toBeGreaterThanOrEqual(top)
      }
      const full = cardLayout(format, { name: true, filter: true, latest: true, count: 197 })
      expect(full.collage.h).toBeLessThan(cardLayout(format, { name: false, filter: false, latest: true, count: 197 }).collage.h)
      expect(inside({ y: full.collage.y + full.collage.h / 2 }, full.collage)).toBe(true)
    })
  }
  it('story: a tall collage (about 952 × 1240 with a name and the latest lifer), packed for its aspect', () => {
    const L = cardLayout('story', { name: true, filter: false, latest: true, count: 197 })
    expect(L.name!.y).toBe(160)
    expect(L.footer.y + L.footer.size).toBe(1920 - 220)
    expect(L.collage.h).toBeGreaterThanOrEqual(1230)
    expect(L.collage.h / L.collage.w).toBeGreaterThan(1.25)
    expect(packSpec(L).aspect).toBeCloseTo(L.collage.w / L.collage.h)
  })
  it('post: taller than before (914px with a name and the latest lifer), still inside 64px margins', () => {
    const L = cardLayout('post', { name: true, filter: false, latest: true, count: 197 })
    expect(L.name!.y).toBe(64)
    expect(L.footer.y + L.footer.size).toBe(1350 - 64)
    expect(L.collage.h).toBeGreaterThanOrEqual(935)
    expect(L.collage.h).toBeGreaterThan(L.collage.w * 0.98)
  })
  it('the story and the post may spread a short list vertically; the square never', () => {
    expect(SPREAD.story).toBeGreaterThan(SPREAD.post)
    expect(SPREAD.post).toBeGreaterThan(1)
    expect(SPREAD.square).toBe(1)
  })
  it('square: the same centre-count card in 1080×1080, the count a little smaller than the post\'s, its collage wider than tall', () => {
    const L = cardLayout('square', { name: true, filter: true, latest: true, count: 197 })
    expect([L.W, L.H]).toEqual([1080, 1080])
    expect(L.name!.y).toBe(64)
    expect(L.collage.w).toBeGreaterThan(L.collage.h)
    expect(L.collage.h).toBeGreaterThan(560)
    expect(L.count.size).toBeLessThanOrEqual(cardLayout('post', { name: true, filter: true, latest: true, count: 197 }).count.size)
    expect(L.count.label).toBe('SPECIES')
    expect(L.footer.y + L.footer.size).toBeLessThanOrEqual(1080 - 64)
    expect(L.latest!.icon).toBe(68)
    const short = cardLayout('square', { name: false, filter: false, latest: true, count: 12 })
    expect(short.maxTile).toBe(0.36)
    expect(packSpec(short).aspect).toBeCloseTo(short.collage.w / short.collage.h)
  })
})

describe('countLayout (the count in the middle)', () => {
  it('reads like the Tally and /lifelist: the shown number over SPECIES, filtered or not', () => {
    expect(countLayout('story', 197, 952)).toMatchObject({ number: '197', label: 'SPECIES' })
    expect(countLayout('story', 6, 952)).toMatchObject({ number: '6', label: 'SPECIES' })
    expect(countLayout('post', 1500, 952)).toMatchObject({ number: '1,500', label: 'SPECIES' })
  })
  it('reads as a label in the ring, as /lifelist: about 12% of the collage wide for 197, shrinking for long numbers', () => {
    const short = countLayout('story', 12, 952), mid = countLayout('story', 197, 952), long = countLayout('story', 12345, 952)
    expect(short.size).toBe(112)
    expect(mid.size).toBe(112)
    // The site's medium layout: F 56 on a 700 stage, "197" 1.44em wide = 11.5% of the stage.
    expect((1.44 * mid.size) / 952).toBeGreaterThan(0.12)
    expect((1.44 * mid.size) / 952).toBeLessThan(0.2)
    expect(long.size).toBeLessThan(mid.size)
    expect(long.size).toBeGreaterThan(60)
    expect(countLayout('post', 197, 952).size).toBe(104)
    // Digits are 0.5em in Cabinet Grotesk: "12,345" is 5 digits and a comma; at most 22% of the width.
    expect((5 * 0.5 + 0.25 - 6 * 0.02) * long.size).toBeLessThanOrEqual(0.22 * 952 + 1)
  })
  it('keeps the hole small: at most about a third of the collage wide for 197', () => {
    const c = countLayout('story', 197, 952)
    expect(2 * c.hole[0]).toBeLessThan(952 * 0.36)
    expect(2 * c.hole[1]).toBeLessThan(260)
  })
  it('keeps a hole around the number and the label, wider than tall from three digits, bigger for bigger text', () => {
    for (const n of [1, 12, 197, 1500, 12345]) {
      const c = countLayout('story', n, 952)
      const [rx, ry] = c.hole
      const textW = Math.max((String(n).length * 0.5) * c.size, c.label.length * 0.66 * c.labelSize)
      expect(rx).toBeGreaterThan(textW / 2)
      expect(ry).toBeGreaterThan((0.6875 * c.size + c.gap + 0.73 * c.labelSize) / 2)
      if (n >= 100) expect(rx).toBeGreaterThan(ry)
      expect(rx).toBeLessThan(952 / 2)
    }
  })
  it('takes a size in px for the link preview', () => {
    const c = countLayout(OG_COUNT_MAX, 197, 640)
    expect(c.size).toBe(OG_COUNT_MAX)
    expect(OG_COUNT_MAX).toBeLessThanOrEqual(80)
    expect(c.labelSize).toBeGreaterThanOrEqual(13)
    expect(c.hole[0]).toBeLessThan(640 * 0.25)
  })
  it('the label is legible and smaller than the number', () => {
    const c = countLayout('post', 1500, 952)
    expect(c.labelSize).toBeGreaterThanOrEqual(18)
    expect(c.labelSize).toBeLessThan(c.size / 4)
  })
})

describe('packSpec', () => {
  it('the frame aspect and the hole as fractions of the frame width', () => {
    const L = cardLayout('story', { name: false, filter: false, latest: true, count: 197 })
    const s = packSpec(L)
    expect(s.aspect).toBeCloseTo(L.collage.w / L.collage.h)
    expect(s.hole[0] * L.collage.w).toBeCloseTo(L.count.hole[0])
    expect(s.hole[1] * L.collage.w).toBeCloseTo(L.count.hole[1])
  })
})

describe('maxTileSide', () => {
  it('no sticker is drawn wider than 30% of the collage, so a short list sits as a cluster', () => {
    expect(maxTileSide(952)).toBeCloseTo(952 * 0.3)
    expect(maxTileSide(4000)).toBe(440) // and never past the 384px files' sharp size
  })
  it('a short list (up to 24 birds) gets bigger stickers, still under the 384px files', () => {
    expect(maxTileFrac(12)).toBe(0.36)
    expect(maxTileFrac(197)).toBe(0.3)
    expect(maxTileSide(952, maxTileFrac(12))).toBeLessThan(384)
    expect(cardLayout('story', { name: false, filter: false, latest: true, count: 12 }).maxTile).toBe(0.36)
    expect(packSpec(cardLayout('post', { name: false, filter: false, latest: true, count: 197 })).maxTile).toBe(0.3)
  })
})

describe('fitPack', () => {
  const area = { x: 64, y: 300, w: 952, h: 1000 }
  it('puts the frame centre (the hole) on the area centre', () => {
    const pack = { W: 400, H: 420, boxes: new Map([['a', [10, 10, 40, 40]], ['b', [350, 370, 40, 40]]] as [string, [number, number, number, number]][]) }
    const f = fitPack(pack, area, 228)
    expect([f.cx, f.cy]).toEqual([64 + 476, 300 + 500])
    expect([f.ux, f.uy]).toEqual([200, 210])
  })
  it('grows a small cluster about the centre until it reaches the edge, never past the largest tile', () => {
    // Birds within ±100 units of the centre on a 400-unit frame: the edge allows 2× the width fit, the tile cap less.
    const pack = { W: 400, H: 420, boxes: new Map([['a', [100, 110, 60, 60]], ['b', [240, 250, 60, 60]]] as [string, [number, number, number, number]][]) }
    const k = 952 / 400
    expect(fitPack(pack, area, 10_000).s).toBeCloseTo(Math.min(476 / (100 * k), 500 / (100 * k)) * k)
    const capped = fitPack(pack, area, 228)
    expect(60 * capped.s).toBeCloseTo(228)
  })
  it('spreads a short list vertically to fill a tall area (story), keeping tile sizes, up to spreadMax', () => {
    // A ring ±100 units around the centre; tiles 40 units; the area is much taller than wide.
    const boxes: [string, [number, number, number, number]][] = [['t', [180, 90, 40, 40]], ['b', [180, 290, 40, 40]], ['l', [80, 190, 40, 40]], ['r', [280, 190, 40, 40]]]
    const pack = { W: 400, H: 420, boxes: new Map(boxes) }
    const tall = { x: 64, y: 250, w: 952, h: 1400 }
    const f = fitPack(pack, tall, 10_000, 2)
    expect(f.sy).toBeGreaterThan(1)
    // The top tile's top edge lands on the area's top (or the spread hit its max).
    const top = f.cy + (110 - f.uy) * f.s * f.sy - 20 * f.s
    expect(top).toBeGreaterThanOrEqual(tall.y - 1e-6)
    expect(f.sy === 2 || Math.abs(top - tall.y) < 1e-6).toBe(true)
    // Without a spread allowance it stays uniform.
    expect(fitPack(pack, tall, 10_000).sy).toBe(1)
    expect(fitPack(pack, tall, 10_000, 1.2).sy).toBeLessThanOrEqual(1.2)
  })
  it('spreads above and below separately, so a lopsided ring reaches both edges', () => {
    // One tile 60 units above the centre, one 120 below: the upper one may spread further.
    const boxes: [string, [number, number, number, number]][] = [['t', [180, 130, 40, 40]], ['b', [180, 310, 40, 40]], ['r', [300, 190, 40, 40]]]
    const pack = { W: 400, H: 420, boxes: new Map(boxes) }
    const tall = { x: 64, y: 250, w: 952, h: 1400 }
    const f = fitPack(pack, tall, 10_000, 5)
    expect(f.sy).toBeGreaterThan(f.syDown)
    expect(spreadY(f, 150) - 20 * f.s).toBeCloseTo(tall.y)
    expect(spreadY(f, 330) + 20 * f.s).toBeCloseTo(tall.y + tall.h)
    expect(spreadY(f, 210)).toBeCloseTo(f.cy) // a centred tile stays put
  })
  it('never scales a full frame below its width fit', () => {
    const pack = { W: 400, H: 420, boxes: new Map([['a', [0, 0, 30, 30]], ['b', [370, 390, 30, 30]]] as [string, [number, number, number, number]][]) }
    expect(fitPack(pack, area, 228).s).toBeCloseTo(Math.min(952 / 400, 1000 / 420))
  })
})

describe('placeCredit (the CC BY credit is never truncated)', () => {
  // Geist Mono: 0.6em per character.
  const measure = (text: string) => (px: number) => text.length * 0.6 * px
  it('sits beside the wordmark when it fits, shrinking no lower than 17px', () => {
    expect(placeCredit(measure(STICKER_CREDIT), 500, 952, 19)).toEqual({ size: 19, below: false }) // 456px
    expect(placeCredit(measure(STICKER_CREDIT), 430, 952, 19)).toEqual({ size: 17, below: false }) // 408px
  })
  it('takes its own line at full size when it does not fit at 17px', () => {
    expect(placeCredit(measure(STICKER_CREDIT), 300, 952, 19)).toEqual({ size: 19, below: true })
  })
  it('a long credit in a narrow width shrinks to fit its own line, never cut', () => {
    const long = `${STICKER_CREDIT} and a much longer attribution line that goes on`
    const r = placeCredit(measure(long), 200, 600, 19)
    expect(r.below).toBe(true)
    expect(measure(long)(r.size)).toBeLessThanOrEqual(600)
  })
})
