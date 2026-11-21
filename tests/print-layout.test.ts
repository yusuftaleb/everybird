import { en } from '@/i18n/messages/en'
import { describe, expect, it } from 'vitest'
import {
  IOS_CANVAS_AREA, PRINT_CM, PRINT_DESIGN_H, PRINT_IN, PRINT_PT, PRINT_PX, PRINT_SIZES, STRIP_AREA,
  isUsSize, printDesignH, printPackH, printScale, stripRanges,
} from '@/lib/share/print'
import { GROUP_SIDE, POSTER_FOOT, SAFE, posterIcon, SHARE_COLORS, TITLE_TOP, cardDims, cardLayout, imagePackSpec, prepareCard, type ImagePack } from '@/lib/share/image'
import { PRINT_FROM } from '@/lib/sticker-url'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// Synthetic birds only.
const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([row('ostric2', 1), row('emu1', 2)])
const entry = (code: string): ListEntry => ({ code, date: '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })
const entries = [entry('ostric2'), entry('emu1')]
// A hand-made pack, so no layout worker is needed: two birds either side of the centre, the same size.
const pack: ImagePack = { W: 1000, H: 1000, boxes: new Map([['ostric2', [395, 450, 100, 100]], ['emu1', [505, 450, 100, 100]]]) }

describe('print sizes and strips', () => {
  it('the ISO and US sizes at 150 dpi, in px, points and inches', () => {
    expect(PRINT_PX).toEqual({
      A4: [1240, 1754], A3: [1754, 2480], A2: [2480, 3508], A1: [3508, 4967],
      US12x18: [1800, 2700], US18x24: [2700, 3600], US24x36: [3600, 5400],
    })
    for (const s of PRINT_SIZES) {
      expect(PRINT_PT[s][0]).toBeCloseTo((PRINT_CM[s][0] / 2.54) * 72, 1)
      expect(PRINT_PT[s][1]).toBeCloseTo((PRINT_CM[s][1] / 2.54) * 72, 1)
      if (isUsSize(s)) {
        expect(PRINT_PT[s]).toEqual([PRINT_IN[s][0] * 72, PRINT_IN[s][1] * 72])
        expect(printDesignH(s)).toBe(printPackH(s))
      } else {
        expect(Math.abs(printDesignH(s) - PRINT_DESIGN_H)).toBeLessThan(3)
      }
    }
    expect(printPackH('US12x18')).toBe(1620)
    expect(printPackH('US24x36')).toBe(1620)
    expect(printPackH('US18x24')).toBe(1440)
    expect(printScale('A1')).toBeCloseTo(3.248, 3)
    expect(printScale('A4')).toBeCloseTo(1.148, 3)
    expect(printScale('US24x36')).toBeCloseTo(3.333, 3)
  })

  it('US shapes get their own pack frame so birds fill the frame', () => {
    for (const [size, packH] of [['A2', 1527], ['US12x18', 1620], ['US24x36', 1620], ['US18x24', 1440]] as const) {
      expect(cardDims('print', size)).toEqual([1080, packH])
      expect(cardDims('printLandscape', size)).toEqual([packH, 1080])
      const L = cardLayout('print', { name: false, filter: false, latest: true, count: 197 }, cardDims('print', size))
      expect(imagePackSpec('print', { name: false, filter: false, latest: true, count: 197 }, size).aspect)
        .toBeCloseTo(L.collage.w / L.collage.h, 6)
    }
  })

  it('strips: about 1 MP each, cover the poster once, never past the iOS canvas cap', () => {
    for (const s of PRINT_SIZES) {
      const [w, h] = PRINT_PX[s], st = stripRanges(w, h)
      expect(st.reduce((n, r) => n + r.rows, 0)).toBe(h)
      st.forEach((r, i) => {
        expect(r.y).toBe(i ? st[i - 1].y + st[i - 1].rows : 0)
        expect(w * r.rows).toBeLessThanOrEqual(STRIP_AREA)
      })
    }
    expect(stripRanges(3508, 4967)).toHaveLength(17)
    expect(stripRanges(1240, 1754)).toHaveLength(3)
    expect(stripRanges(3508, 4967, 4967)).toEqual([{ y: 0, rows: 4967 }]) // a rows override (one strip)
    expect(3508 * 4967).toBeGreaterThan(IOS_CANVAS_AREA) // why strips exist
  })
})

describe('the print card', () => {
  it('lays out 1080 wide at PRINT_DESIGN_H by default, with 64 margins, no latest lifer row and the quiet one-line foot', () => {
    expect(SAFE.print).toEqual({ top: 64, bottom: 64 })
    expect(TITLE_TOP.print).toBe(64)
    const L = cardLayout('print', { name: true, filter: false, latest: true, count: 197 })
    expect([L.W, L.H]).toEqual([1080, PRINT_DESIGN_H])
    expect(L.name!.y).toBe(64)
    expect(L.latest).toBeUndefined()
    expect(L.footer).toEqual({ y: PRINT_DESIGN_H - 64 - POSTER_FOOT.brand, size: POSTER_FOOT.brand, credit: POSTER_FOOT.line })
    expect(L.rule.y).toBe(L.footer.y - 24)
    expect(L.count.size).toBeLessThanOrEqual(112)
    expect(cardLayout('print', { name: true, filter: false, latest: true, count: 197 }, 1600).H).toBe(1600)
    expect(imagePackSpec('print', { name: false, filter: false, latest: true, count: 197 }).aspect)
      .toBeCloseTo(952 / cardLayout('print', { name: false, filter: false, latest: true, count: 197 }).collage.h, 6)
  })

  it('M margins, the credit and the stamp in its footer, the theme\'s colours', async () => {
    const card = await prepareCard({ format: 'print', printSize: 'A2', theme: 'dark', entries, species, pack, now: new Date(2026, 10, 15), strings: en.ui }, printScale('A2'))
    expect(card.L.collage.x).toBe(64)
    expect(card.L.W - card.L.collage.x - card.L.collage.w).toBe(64)
    expect(card.L.H).toBeCloseTo(printDesignH('A2'), 6)
    expect(card.footerLine).toContain('Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(card.footerLine).toMatch(/ · 15 Nov 2026$/)
    expect(card.colors).toEqual(SHARE_COLORS.dark)
    expect(card.colors.paper).toBe('#1e1e24')
    const light = await prepareCard({ format: 'print', printSize: 'A2', theme: 'light', entries, species, pack, now: new Date(2026, 10, 15), strings: en.ui }, printScale('A2'))
    expect(light.colors).toEqual(SHARE_COLORS.light)
    expect(light.colors.paper).toBe('#f6f4ef')
    // The foot: the site, the credit and the date beside the wordmark, the latest lifer at the right end, at 16px down to POSTER_FOOT.min.
    expect(card.footerLine).toMatch(/^everybird\.yusuftaleb\.com · /)
    expect(card.posterLatest).toMatch(/^Latest lifer: /)
    expect(card.credit.size).toBeGreaterThanOrEqual(POSTER_FOOT.min)
    expect(card.credit.size).toBeLessThanOrEqual(POSTER_FOOT.line)
  })

  it('print tiles pick the tier by device px: a two-bird group\'s tile at A1 is 1024 with the 384 fallback', async () => {
    const opts = { format: 'print' as const, printSize: 'A1' as const, theme: 'light' as const, entries, species, pack, strings: en.ui }
    const a1 = await prepareCard(opts, printScale('A1'))
    expect(a1.tiles).toHaveLength(2)
    for (const t of a1.tiles) {
      expect(Math.max(t.w, t.h)).toBeGreaterThan(PRINT_FROM) // a small group's (round 6, item 12: GROUP_TILE)
      expect(Math.max(t.w, t.h)).toBeLessThanOrEqual(GROUP_SIDE + 1e-6)
      expect(t.url).toMatch(/\/v1\/1024\/(ostric2|emu1)\.webp$/)
      expect(t.fallback).toBe(t.url!.replace('/1024/', '/384/'))
    }
    // The latest lifer's sticker sits before its words in the foot, sized to the line (round 6; posterIcon).
    expect(Math.max(a1.lifer!.w, a1.lifer!.h)).toBe(posterIcon(POSTER_FOOT.line))
    // The preview (scale 1): the same layout; its tiles are past the 384 file's sharp size, so the 1024 file too.
    const preview = await prepareCard(opts)
    expect(preview.tiles.map((t) => [t.x, t.y, t.w, t.h])).toEqual(a1.tiles.map((t) => [t.x, t.y, t.w, t.h]))
    expect(preview.tiles.every((t) => /\/v1\/1024\//.test(t.url!) && t.fallback === t.url!.replace('/1024/', '/384/'))).toBe(true)
  })

  it('share images keep their 128/384 URLs and no fallback up to the 384 file\'s sharp size, the 1024 file past it', async () => {
    const card = await prepareCard({ format: 'post', theme: 'dark', entries, species, pack, strings: en.ui })
    expect(card.colors).toEqual(SHARE_COLORS.dark)
    // Two birds: a small group, drawn past PRINT_FROM (round 6, item 12), so from the 1024 file with the 384 fallback.
    for (const t of card.tiles) {
      if (Math.max(t.w, t.h) <= PRINT_FROM) expect(/\/v1\/384\//.test(t.url!) && t.fallback === undefined).toBe(true)
      else expect(t.fallback).toBe(t.url!.replace('/1024/', '/384/'))
    }
    expect(card.tiles.some((t) => Math.max(t.w, t.h) > PRINT_FROM)).toBe(true)
  })
})
