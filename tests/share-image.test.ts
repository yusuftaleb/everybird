import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NAME_MAX } from '@/lib/share/link'
import { FOOT_TWO, GROUP_SIDE, GROUP_TILE, IMAGE_SIZE, NAME_MAX_LEN, SHARE_COLORS, cardLayout, countLayout, drawShareImage, filterLabel, fitPack, latestText, maxTileFrac, maxTileSide, OG_COUNT_MAX, ogCountHole, packSpec, placeCredit, fitBox, FOOTER_LINE, SHARE_CREDIT, SITE_LABEL } from '@/lib/share/image'
import { SMALL_GROUP } from '../src/lib/layout/pack'
import { SMALL_INLINE } from '@/lib/share/image'
import { MONO_CAP, MONO_CAP_ACCENT, countText, holeExtent, numberEm } from '@/lib/layout/count-box'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { stampDate, stampStrings, withStamp } from '@/lib/share/stamp'
import type { SpeciesIndex } from '@/lib/species/load'
import { orderLabel } from '@/lib/species/orders'

const row = (code: string, ord: string, fam: string, famCom: string) => ({ code, com: code, sci: code, ord, fam, famCom, to: 1 }) as never
const rows = [row('grbher3', 'Pelecaniformes', 'Ardeidae', 'Herons, Egrets, and Bitterns'), row('houspa', 'Passeriformes', 'Passeridae', 'Old World Sparrows')]
const species: SpeciesIndex = { rows, byCode: new Map(rows.map((r) => [(r as { code: string }).code, r])), search: () => [] }
const countryName = (iso: string) => ({ EG: 'Egypt', CA: 'Canada' })[iso] ?? iso
const ctx = { species, countryName }

describe('latestText', () => {
  it('gives the latest lifer row: a label with the month, and the name', () => {
    expect(latestText({ com: 'Western Grebe', date: '2026-09-30' }, en.ui)).toEqual({ label: 'Latest lifer · Sep 2026', name: 'Western Grebe' })
  })
  it('drops a missing date and keeps a year-only one', () => {
    expect(latestText({ com: 'Mallard' }, en.ui)).toEqual({ label: 'Latest lifer', name: 'Mallard' })
    expect(latestText({ com: 'Mallard', date: '2024' }, en.ui).label).toBe('Latest lifer · 2024')
  })
})

describe('filterLabel', () => {
  it('is undefined with no filter', () => {
    expect(filterLabel({}, ctx, en.ui)).toBeUndefined()
  })
  it('reads the filter in words: birds, then place, then time', () => {
    expect(filterLabel({ countries: ['EG'], year: '2026' }, ctx, en.ui)).toBe('Egypt · 2026')
    expect(filterLabel({ order: 'Pelecaniformes', family: 'Ardeidae', countries: ['EG'] }, ctx, en.ui)).toBe('Herons, Egrets, and Bitterns · Egypt')
    expect(filterLabel({ order: 'Passeriformes' }, ctx, en.ui)).toBe('Perching birds')
    expect(filterLabel({ year: '2025' }, ctx, en.ui)).toBe('2025')
    // With Scientific on (round 6): the family and the order by their scientific names, on every view's image.
    expect(filterLabel({ order: 'Pelecaniformes', family: 'Ardeidae', countries: ['EG'] }, { ...ctx, sci: true }, en.ui)).toBe('Ardeidae · Egypt')
    expect(filterLabel({ order: 'Passeriformes' }, { ...ctx, sci: true }, en.ui)).toBe('Passeriformes')
    expect(filterLabel({ countries: ['EG'], from: '2026-01', to: '2026-12' }, ctx, en.ui)).toBe('Egypt · 2026')
    expect(filterLabel({ from: '2025-03', to: '2026-06' }, ctx, en.ui)).toBe('Mar 2025 to Jun 2026')
    expect(filterLabel({ countries: ['EG'], from: '2026-09', to: '2026-09' }, ctx, en.ui)).toBe('Egypt · Sep 2026')
    expect(filterLabel({ order: 'Pelecaniformes', countries: ['EG'], from: '2026-09', to: '2026-09' }, ctx, en.ui)).toBe(`${orderLabel('Pelecaniformes', en.ui)} · Egypt · Sep 2026`)
  })
  it('names a Status filter in words after the birds and before the places', () => {
    expect(filterLabel({ order: 'Pelecaniformes', family: 'Ardeidae', statuses: ['VU', 'EN', 'CR'], countries: ['EG'] }, ctx, en.ui)).toBe('Herons, Egrets, and Bitterns · Threatened · Egypt')
    expect(filterLabel({ statuses: ['EN'] }, ctx, en.ui)).toBe('Endangered')
    expect(filterLabel({ statuses: ['NE'] }, ctx, en.ui)).toBe('Not evaluated')
    expect(filterLabel({ statuses: ['VU', 'EN'], from: '2025-03', to: '2026-06' }, ctx, en.ui)).toBe('Vulnerable + Endangered · Mar 2025 to Jun 2026')
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
  it('without the latest lifer row, the collage reaches down to the hairline gap (the row\'s room goes to the birds)', () => {
    for (const format of ['story', 'post', 'square'] as const) {
      const on = cardLayout(format, { name: true, filter: false, latest: true, count: 197 })
      const off = cardLayout(format, { name: true, filter: false, latest: false, count: 197 })
      expect(off.collage.y).toBe(on.collage.y)
      expect(off.rule.y).toBe(on.rule.y)
      expect(off.collage.h).toBeGreaterThan(on.collage.h) // the row's icon, its gap to the rule and its gap from the collage
      // Round 6, item 17: the row is the Tree's oldest lineage row, its gap from the collage the row's own (GAPS' latest),
      // plus the footer's two lines placeFooter lifts it by on these 1080-wide cards (AD7, FOOT_TWO).
      expect(on.latest!.y - (on.collage.y + on.collage.h)).toBe((format === 'square' ? 32 : 24) + 2 * (FOOT_TWO.size + FOOT_TWO.gap))
      expect(packSpec(off).aspect).toBeLessThan(packSpec(on).aspect) // the taller area: the pack is NOT remade for it (imagePackSpec)
    }
  })

  const SAFE = { story: { top: 160, bottom: 156 }, post: { top: 64, bottom: 64 }, square: { top: 64, bottom: 64 } } as const
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
          expect(head[0].y).toBe(L.name && format === 'story' ? 184 : top) // the story's title starts lower, under the story profile row
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
        // AD7: the footer's two lines take 32 more under the collage than its one line did.
        expect(L.collage.h).toBeGreaterThan(format === 'story' ? 1118 : format === 'post' ? 838 : 528)
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
    expect(L.name!.y).toBe(184) // the title has air under the story profile row
    expect(L.footer.y + L.footer.size).toBe(1920 - 156 - 4) // the descenders clear the safe line too
    expect(L.collage.h).toBeGreaterThanOrEqual(1230)
    expect(L.collage.h / L.collage.w).toBeGreaterThan(1.25)
    expect(packSpec(L).aspect).toBeCloseTo(L.collage.w / L.collage.h)
  })
  it('post: taller than before (914px with a name and the latest lifer; 930 since the row keeps the head\'s gap above it, 898 since the footer takes two lines), still inside 64px margins', () => {
    const L = cardLayout('post', { name: true, filter: false, latest: true, count: 197 })
    expect(L.name!.y).toBe(64)
    expect(L.footer.y + L.footer.size).toBe(1350 - 64)
    expect(L.collage.h).toBeGreaterThanOrEqual(898)
    expect(L.collage.h).toBeGreaterThan(L.collage.w * 0.94)
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
    expect(L.latest!.icon).toBe(SMALL_INLINE.icon) // round 6, item 17: the one-line row's sticker
    // A small group (round 6, item 12): its largest sticker up to GROUP_TILE of the collage's shorter side.
    const short = cardLayout('square', { name: false, filter: false, latest: true, count: 12 })
    expect(short.maxTile * short.collage.w).toBeCloseTo(GROUP_TILE * short.collage.h)
    expect(short.maxSide).toBe(GROUP_SIDE)
    expect(packSpec(short).aspect).toBeCloseTo(short.collage.w / short.collage.h)
  })
})

describe('countLayout (the count in the middle)', () => {
  it('reads like the Tally and /lifelist: the shown number over SPECIES, filtered or not', () => {
    expect(countLayout('story', 197, 952)).toMatchObject({ number: '197', label: 'SPECIES' })
    expect(countLayout('story', 6, 952)).toMatchObject({ number: '6', label: 'SPECIES' })
    expect(countLayout('post', 1500, 952)).toMatchObject({ number: '1,500', label: 'SPECIES' })
  })
  it('reads as a label in the ring, as /lifelist: the largest size for 197, shrinking for long numbers', () => {
    const short = countLayout('story', 12, 952), mid = countLayout('story', 197, 952), long = countLayout('story', 12345, 952)
    expect(short.size).toBe(112)
    expect(mid.size).toBe(112)
    expect(long.size).toBeLessThan(mid.size)
    expect(long.size).toBeGreaterThan(60)
    expect(countLayout('post', 197, 952).size).toBe(104)
    // The number (count-box.ts widths, the widest face) is at most 26% of the collage's width.
    for (const n of [1089, 11019, 12345]) expect(numberEm(countText(n)) * countLayout('story', n, 952).size).toBeLessThanOrEqual(0.26 * 952 + 1)
  })
  it('keeps the hole small: at most about a third of the collage wide for 197', () => {
    const [ex, ey] = holeExtent(countLayout('story', 197, 952).hole)
    expect(2 * ex).toBeLessThan(952 * 0.36)
    expect(2 * ey).toBeLessThan(260)
  })
  it('the hole holds the text as drawn (the number over the label, one centred column), with air all round', () => {
    for (const n of [1, 12, 197, 1089, 11019, 12345]) {
      const c = countLayout('story', n, 952)
      const { num, label, pad } = c.hole
      // The number's width at the widest face's advances, the label's at Geist Mono's 0.6em + 0.06em tracking.
      expect(num[2] - num[0]).toBeGreaterThanOrEqual(numberEm(c.number) * c.size - 1e-6)
      expect(label[2] - label[0]).toBeGreaterThanOrEqual(7 * 0.66 * c.labelSize - 1e-6)
      // The column: the digits' height (Satoshi's 0.745em, taller than Cabinet's 0.68), the gap, the label's caps.
      expect(label[3] - num[1]).toBeCloseTo(0.745 * c.size + c.gap + 0.73 * c.labelSize, 6)
      expect(num[1] + label[3]).toBeCloseTo(0, 6) // centred
      expect(pad).toBeGreaterThan(0.1 * c.size)
      const [ex] = holeExtent(c.hole)
      if (n >= 100) expect(ex).toBeGreaterThan(holeExtent(c.hole)[1])
      expect(ex).toBeLessThan(952 / 2)
    }
  })
  it('takes a size in px for the link preview', () => {
    const c = countLayout(OG_COUNT_MAX, 197, 640)
    expect(c.size).toBe(OG_COUNT_MAX)
    expect(OG_COUNT_MAX).toBeLessThanOrEqual(80)
    expect(c.labelSize).toBeGreaterThanOrEqual(13)
    expect(holeExtent(c.hole)[0]).toBeLessThan(640 * 0.25)
  })
  it("the link preview's hole holds satori's column (line boxes: 0.85 for the number, 1.3 for the label)", () => {
    for (const n of [197, 1089, 11019]) {
      const K = countLayout(OG_COUNT_MAX, n, 640)
      const h = ogCountHole(K)
      expect(h.label[3] - h.num[1]).toBeGreaterThanOrEqual(0.85 * K.size + 0.6 * K.gap + 1.3 * K.labelSize - 1e-6)
      expect(h.num[2] - h.num[0]).toBeGreaterThanOrEqual(numberEm(K.number) * K.size - 1e-6)
    }
  })
  it("the label's box reaches an accented capital's ink (ESPÉCIES), inside the same column", () => {
    for (const n of [197, 1089, 11019]) {
      const c = countLayout('story', n, 952)
      const { num, label } = c.hole
      expect(label[3] - label[1]).toBeCloseTo(MONO_CAP_ACCENT * c.labelSize, 6)
      // The accent rises into the gap; the column (digits, gap, caps) and so the drawn text's place are unchanged.
      expect(label[3] - num[1]).toBeCloseTo(0.745 * c.size + c.gap + MONO_CAP * c.labelSize, 6)
      // Eight characters of Geist Mono with their tracking, the longest label in any language.
      expect(label[2] - label[0]).toBeGreaterThanOrEqual(8 * 0.66 * c.labelSize - 1e-6)
    }
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
    expect(s.hole.num[0] * L.collage.w).toBeCloseTo(L.count.hole.num[0])
    expect(s.hole.label[3] * L.collage.w).toBeCloseTo(L.count.hole.label[3])
    expect(s.hole.pad * L.collage.w).toBeCloseTo(L.count.hole.pad)
  })
})

describe('maxTileSide', () => {
  it('no sticker is drawn wider than 30% of the collage, so a short list sits as a cluster', () => {
    expect(maxTileSide(952)).toBeCloseTo(952 * 0.3)
    expect(maxTileSide(4000)).toBe(440) // and never past the 384px files' sharp size
  })
  it('a short list (up to 24 birds) gets bigger stickers, still under the 384px files', () => {
    expect(maxTileFrac(24)).toBe(0.36)
    expect(maxTileFrac(197)).toBe(0.3)
    expect(maxTileSide(952, maxTileFrac(24))).toBeLessThan(384)
    expect(packSpec(cardLayout('post', { name: false, filter: false, latest: true, count: 197 })).maxTile).toBe(0.3)
  })
  it('a small group (under SMALL_GROUP birds) is drawn as large as its frame allows: up to GROUP_TILE of the shorter side, at most GROUP_SIDE', () => {
    expect(SMALL_GROUP).toBe(40)
    const story = cardLayout('story', { name: false, filter: false, latest: true, count: 12 })
    expect(maxTileSide(story.collage.w, story.maxTile, story.maxSide)).toBe(GROUP_SIDE) // 0.7 × 952 is past the cap
    const desktop = cardLayout('desktop', { name: false, filter: false, latest: true, count: 39 })
    expect(maxTileSide(desktop.collage.w, desktop.maxTile, desktop.maxSide)).toBeCloseTo(GROUP_TILE * desktop.collage.h)
    expect(cardLayout('story', { name: false, filter: false, latest: true, count: 40 }).maxTile).toBe(0.3)
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
  it('scales both axes alike (no vertical stretch): a box keeps its shape and its place relative to the centre', () => {
    const boxes: [string, [number, number, number, number]][] = [['t', [180, 90, 40, 40]], ['b', [180, 290, 40, 40]]]
    const pack = { W: 400, H: 420, boxes: new Map(boxes) }
    const tall = { x: 64, y: 250, w: 952, h: 1400 }
    const f = fitPack(pack, tall, 10_000)
    const [x, y, w, h] = fitBox(f, [180, 90, 40, 40])
    expect(w).toBeCloseTo(h)
    expect(x + w / 2 - f.cx).toBeCloseTo((200 - f.ux) * f.s)
    expect(y + h / 2 - f.cy).toBeCloseTo((110 - f.uy) * f.s)
  })
  it('never scales a full frame below its width fit', () => {
    const pack = { W: 400, H: 420, boxes: new Map([['a', [0, 0, 30, 30]], ['b', [370, 390, 30, 30]]] as [string, [number, number, number, number]][]) }
    expect(fitPack(pack, area, 228).s).toBeCloseTo(Math.min(952 / 400, 1000 / 420))
  })
})

describe('the footer line (the site and the sticker credit, never truncated)', () => {
  // Geist Mono: 0.6em per character.
  const measure = (text: string) => (px: number) => text.length * 0.6 * px
  it('is the site and the sticker credit in its one form; the full credit with the link is the share text', () => {
    expect(FOOTER_LINE).toBe(`${SITE_LABEL} · Stickers: huashu-bird-sticker, CC BY 4.0`)
    expect(FOOTER_LINE).toBe('everybird.yusuftaleb.com · Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(SHARE_CREDIT).toBe('Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker')
  })
  it('sits beside the wordmark when it fits, shrinking no lower than 17px', () => {
    expect(placeCredit(measure(FOOTER_LINE), 810, 952, 20)).toEqual({ size: 20, below: false }) // 804px
    expect(placeCredit(measure(FOOTER_LINE), 690, 952, 20)).toEqual({ size: 17, below: false }) // 683px
  })
  it('takes its own line at full size when it does not fit at 17px, keeping the credit', () => {
    expect(placeCredit(measure(FOOTER_LINE), 300, 952, 20)).toEqual({ size: 20, below: true })
  })
  it('a line too long for even its own line shrinks to fit, never cut', () => {
    const r = placeCredit(measure(FOOTER_LINE), 200, 400, 20)
    expect(r.below).toBe(true)
    expect(measure(FOOTER_LINE)(r.size)).toBeLessThanOrEqual(400)
  })
  const stamped = withStamp(FOOTER_LINE, stampDate(new Date(2026, 8, 30))) // the longest English stamp; the line is 81 characters
  it('with the date stamp, takes its own line under the wordmark of a 1080-wide card, whole, at 19px', () => {
    for (const brandW of [140, 200, 280]) {
      const r = placeCredit(measure(stamped), 952 - brandW, 952, 20)
      expect(r).toEqual({ size: 19, below: true })
      expect(measure(stamped)(r.size)).toBeLessThanOrEqual(952)
    }
  })
  it('a longer stamp (a full month name) shrinks the line on its own line, never cut', () => {
    const long = withStamp(FOOTER_LINE, '30 septiembre 2026')
    const r = placeCredit(measure(long), 952 - 280, 952, 20)
    expect(r).toEqual({ size: 18, below: true })
    expect(measure(long)(r.size)).toBeLessThanOrEqual(952)
  })
})

describe('drawShareImage draws the count in the UI language', () => {
  // A recording canvas: every fillText is kept. No stickers (st: false draws outlines), a pack given, no fonts API.
  function stubCanvas() {
    const texts: string[] = []
    const ctx = new Proxy({ letterSpacing: '0px' } as Record<string | symbol, unknown>, {
      get(t, k) {
        if (k in t) return t[k]
        if (k === 'fillText') return (text: string) => { texts.push(text) }
        if (k === 'measureText') return (text: string) => ({ width: text.length * 10, actualBoundingBoxAscent: 0 })
        return () => {}
      },
      set(t, k, v) { t[k] = v; return true },
    })
    const canvas = { width: 0, height: 0, getContext: () => ctx }
    vi.stubGlobal('document', { createElement: () => canvas, documentElement: {} })
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }))
    vi.stubGlobal('Path2D', class {})
    return texts
  }
  afterEach(() => { vi.unstubAllGlobals() })
  const many = (n: number) => {
    const rows = Array.from({ length: n }, (_, i) => ({ code: `b${i}`, com: `Bird ${i}`, sci: `B ${i}`, ord: 'Passeriformes', fam: 'Passeridae', famCom: 'Sparrows', to: i, st: false, ar: 1 }))
    const index = { rows, byCode: new Map(rows.map((r) => [r.code, r])), search: () => [] } as unknown as SpeciesIndex
    const entries = rows.map((r) => ({ code: r.code, date: '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })) as never
    return { index, entries }
  }
  type Opts = Parameters<typeof drawShareImage>[0]
  const draw = async (n: number, strings: Opts['strings'] = en.ui, more: Partial<Opts> = {}) => {
    const texts = stubCanvas()
    const { index, entries } = many(n)
    await drawShareImage({ format: 'post', entries, species: index, theme: 'light', pack: { W: 100, H: 100, boxes: new Map() }, now: new Date(2026, 10, 14), latest: false, strings, ...more })
    return texts
  }
  it('draws the count label in the UI language, upper-cased', async () => {
    expect(await draw(1089, pt.ui)).toContain('ESPÉCIES')
    const esTexts = await draw(1089, es.ui)
    expect(esTexts).toContain('1.089')
    expect(esTexts).toContain('ESPECIES')
  })
  it('English: the count, and the footer line with the date only', async () => {
    const texts = await draw(1089)
    expect(texts).toContain('1,089')
    expect(texts).toContain('SPECIES')
    expect(texts).toContain(`${FOOTER_LINE} · 14 Nov 2026`)
  })
  it('the story, post and square draw Spanish text', async () => {
    const t = es.ui
    const label = filterLabel({ order: 'Passeriformes', from: '2020-03', to: '2021-06' }, ctx, t)
    expect(label).toBe('Paseriformes · mar 2020 a jun 2021')
    for (const format of ['story', 'post', 'square'] as const) {
      const texts = await draw(12, t, { format, latest: true, filterLabel: label })
      // The Story stacks the row (its mono label upper case); the Post and the Square draw it on one line, sentence case.
      expect(texts, format).toContain(format === 'story' ? 'ÚLTIMA ESPECIE NUEVA · MAY 2020' : 'Última especie nueva · may 2020')
      expect(texts, format).toContain(label)
      expect(texts, format).toContain('ESPECIES')
      // The credit stays English; only the date after it is Spanish, with no lead.
      expect(texts, format).toContain(`${FOOTER_LINE} · 14 nov 2026`)
      expect(texts.join('\n'), format).not.toMatch(/Latest lifer|LATEST LIFER|Al 14/)
    }
  })
  it('Portuguese and Dutch stamps: the date only', async () => {
    expect(await draw(12, pt.ui)).toContain(`${FOOTER_LINE} · 14 nov 2026`)
    expect(await draw(12, nl.ui)).toContain(`${FOOTER_LINE} · 14 nov 2026`)
    expect(await draw(12, pt.ui, { latest: true })).toContain('Última espécie nova · mai 2020')
    expect(await draw(12, nl.ui, { latest: true })).toContain('Nieuwste soort · mei 2020')
  })
  it('a long Spanish filter label with the stamp never cuts the credit', async () => {
    const t = es.ui
    const label = filterLabel({ order: 'Charadriiformes', countries: ['EG', 'CA'], from: '2020-03', to: '2021-06' }, ctx, t)!
    const long = `${label} · ${'Muy largo '.repeat(12)}`
    for (const format of ['story', 'post', 'square'] as const) {
      const texts = await draw(12, t, { format, latest: true, filterLabel: long })
      const footer = texts.filter((x) => x.includes('Stickers: huashu-bird-sticker'))
      expect(footer, format).toEqual([`${FOOTER_LINE} · 14 nov 2026`])
    }
    // placeCredit itself: the stamped Spanish line beside a 280px wordmark, else whole on its own line.
    const stamped = withStamp(FOOTER_LINE, stampDate(new Date(2026, 8, 30), stampStrings(t)))
    expect(stamped).toBe(`${FOOTER_LINE} · 30 sept 2026`)
    const m = (px: number) => stamped.length * px * 0.6
    const r = placeCredit(m, 952 - 280, 952, 20)
    expect(r.size).toBeGreaterThanOrEqual(17)
    expect(m(r.size)).toBeLessThanOrEqual(r.below ? 952 : 952 - 280)
  })
})
