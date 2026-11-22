// The Count menu's "Beside title" (the count on the title's line in the big count's type, no hole in the middle) and the
// poster's quiet head and foot (the title alone in Accent; one line under the hairline, the wordmark and the credit; the
// latest lifer the images' one-line row above it, round 6, item 24).
// Drawn on the recording canvas of tests/fixtures/share-image-harness.ts, synthetic birds only.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { ja } from '@/i18n/messages/ja'
import { NO_HOLE } from '@/lib/layout/count-box'
import * as image from '@/lib/share/image'
import { PRINT_SIZES, printDesign } from '@/lib/share/print'
import { drawsOnly, entries, installStubs, NOW, pack, species } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

const C = image.SHARE_COLORS.light

async function draw(opts: Partial<image.ShareImageOpts>): Promise<string[]> {
  const logs = installStubs()
  image.clearStickerCache()
  const canvas = await image.drawShareImage({ format: 'story', entries, species, pack, now: NOW, theme: 'light', strings: en.ui, ...opts } as image.ShareImageOpts)
  return drawsOnly(logs.get(canvas as unknown as object)!)
}
const texts = (log: string[]) => log.filter((l) => l.startsWith('fillText('))

describe('the count beside the title', () => {
  it('keeps no hole: the birds take the whole collage', () => {
    expect(image.countLayout('story', 197, 952, undefined, 'title').hole).toEqual(NO_HOLE)
    const L = image.cardLayout('story', { name: true, filter: false, latest: true, count: 197, countSize: 'title' })
    expect(L.titleCount).toEqual(image.TITLE_COUNT)
    expect(L.count.size).toBe(0)
    expect(image.packSpec(L).hole).toEqual(NO_HOLE)
  })

  it('has the title line without a name, so the count sits alone at the top left', () => {
    const plain = image.cardLayout('post', { name: false, filter: false, latest: true, count: 50 })
    const L = image.cardLayout('post', { name: false, filter: false, latest: true, count: 50, countSize: 'title' })
    expect(plain.name).toBeUndefined()
    expect(L.name).toEqual({ y: 64, size: 60 })
    expect(L.collage.y).toBeGreaterThan(plain.collage.y)
  })

  it('draws the number in the count\'s type and its label in the count label\'s, on the name\'s baseline ending at the right margin; nothing in the middle', async () => {
    const log = await draw({ name: 'Ada’s birds', countSize: 'title' })
    const at = (l: string) => /, ([\d.]+), ([\d.]+)\) \{/.exec(l)!.slice(1).map(Number)
    // 14 drawn birds (one unknown code is left out). The number: Cabinet 700 at the title's 60px, -0.02em, Ink.
    const num = texts(log).find((l) => l.startsWith('fillText("14",'))!
    expect(num).toMatch(/\{fillStyle: "#1e1e24", font: "700 60px .*", textAlign: "left", textBaseline: "alphabetic", letterSpacing: "-1\.20px"\}$/)
    // The label: Geist Mono 500 22px, upper case, tracked 0.06em, Muted, 12px after the number.
    const label = texts(log).find((l) => l.startsWith('fillText("SPECIES",'))!
    expect(label).toMatch(new RegExp(`\\{fillStyle: "${C.muted}", font: "500 22px .*", textAlign: "left", textBaseline: "alphabetic", letterSpacing: "1\\.32px"\\}$`))
    // The harness measures 0.5em a character (mono 0.6) plus the tracking: "14" is 57.6 wide, "SPECIES" 101.64.
    const [nx, ny] = at(num), [lx, ly] = at(label)
    expect(lx).toBeCloseTo(nx + 57.6 + image.TITLE_COUNT.gap, 6)
    expect(lx + 101.64).toBeCloseTo(64 + 952, 6)
    // On the name's baseline (184 + 0.8 · 60).
    expect([ny, ly]).toEqual([232, 232])
    expect(texts(log).filter((l) => l.startsWith('fillText("14",'))).toHaveLength(1) // no number in the middle
    // The name keeps its place at the left, in Ink.
    expect(texts(log).find((l) => l.startsWith('fillText("Ada’s birds"'))).toMatch(/, 64, 184\) \{fillStyle: "#1e1e24"/)
  })

  it('says "species" in the language, a goal as under the big count ("/ 150 SPECIES")', async () => {
    const log = await draw({ name: 'Ada’s birds', countSize: 'title', strings: ja.ui })
    expect(texts(log).some((l) => l.startsWith('fillText("14",'))).toBe(true)
    expect(texts(log).some((l) => l.startsWith('fillText("種",'))).toBe(true)
  })

  it('without a name, draws the count at the left margin; with a goal, says it', async () => {
    const log = await draw({ countSize: 'title', goal: { target: 150, basis: 'seen' } })
    expect(texts(log).find((l) => l.startsWith('fillText("14",'))).toMatch(/^fillText\("14", 64, 232\) .*textAlign: "left"/)
    expect(texts(log).find((l) => l.includes("/ 150 SPECIES"))).toMatch(/^fillText\("\/ 150 SPECIES", 133\.6, 232\) /)
  })
})

describe('the poster\'s head and foot', () => {
  const poster = (opts: Partial<image.ShareImageOpts>) => draw({ format: 'print', printSize: 'A4', ...opts })

  it('heads the poster with its title alone, in Accent: the name, else the filter in words', async () => {
    const named = texts(await poster({ name: 'Ada’s birds', filterLabel: 'Perching birds' }))
    expect(named.find((l) => l.startsWith('fillText("Ada’s birds"'))).toContain(`fillStyle: "${C.accent}"`)
    expect(named.some((l) => l.startsWith('fillText("Perching birds"'))).toBe(false)
    const filtered = texts(await poster({ filterLabel: 'Perching birds' }))
    expect(filtered.find((l) => l.startsWith('fillText("Perching birds"'))).toMatch(/, 64, 64\) \{fillStyle: "#92140c", font: "700 60px/)
  })

  it('ends with one quiet line, the wordmark then the credits link and the date at the right; the latest lifer is the images\' row above the hairline (round 6, item 24)', async () => {
    for (const format of ['print', 'printLandscape'] as const) {
      const log = await poster({ name: 'Ada’s birds', format })
      const foot = texts(log).find((l) => l.startsWith(`fillText(${JSON.stringify(image.FOOTER_LINE)}, `))!
      const date = texts(log).find((l) => l.startsWith('fillText("15 Nov 2026", '))!
      expect(foot).toContain(`fillStyle: "${C.muted}"`)
      expect(date).toContain(`fillStyle: "${C.muted}"`)
      const brand = texts(log).find((l) => l.startsWith('fillText("Everybird"'))!
      expect(brand).toContain(`font: "700 ${image.POSTER_FOOT.brand}px`)
      const y = (l: string) => Number(/, ([\d.]+)\) \{/.exec(l)![1])
      expect([y(foot), y(date)]).toEqual([y(brand), y(brand)])
      // Nothing of the lifer in the foot any more.
      expect(texts(log).some((l) => l.includes('Latest lifer:'))).toBe(false)
      // The row: the sticker in its 40-unit square at the left margin, the name right after it in the row's face, then
      // the detail in small mono Muted, all above the hairline (its gap, GAPS.latest, kept) and inside the content's width.
      const L = image.cardLayout(format, { name: true, filter: false, latest: true, count: 14 }, printDesign('A4', format === 'printLandscape'))
      const R = L.latest!
      expect(R).toMatchObject({ x: 64, icon: image.SMALL_INLINE.icon, name: image.SMALL_INLINE.name, label: image.SMALL_INLINE.label, inline: true })
      expect(R.y + R.icon + image.GAPS[format].latest).toBe(L.rule.y)
      const name = texts(log).find((l) => l.startsWith('fillText("Synthetic Bird 13"'))!
      expect(name).toMatch(/, 120, [\d.]+\) .*font: "600 26px/)
      // One baseline for the name and the detail, the name's capitals centred on the sticker (0.35 em under its middle).
      expect(y(name)).toBeCloseTo(R.y + R.icon / 2 + 0.35 * image.SMALL_INLINE.name, 6)
      const detail = texts(log).find((l) => l.startsWith('fillText("Latest lifer · May 2023"'))!
      expect(y(detail)).toBe(y(name))
      expect(detail).toContain(`fillStyle: "${C.muted}"`)
      expect(detail).toContain('font: "500 18px')
      const sticker = log.filter((l) => l.startsWith('drawImage(')).at(-1)!
      const [sx, sy, w, h] = /, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(sticker)!.slice(1).map(Number)
      expect(Math.max(w, h)).toBeCloseTo(R.icon, 6)
      expect(sx).toBe(64)
      expect(sy + h / 2).toBeCloseTo(R.y + R.icon / 2, 6)
      const rule = log.find((l) => l.startsWith('fillRect(64, ') && l.includes(C.hairline))!
      expect(sy + h).toBeLessThan(Number(/fillRect\(64, ([\d.]+),/.exec(rule)![1]))
    }
  })

  // Round 6, item 24: the row's room comes out of the collage's area; off, the collage takes it.
  it('leaves the latest lifer\'s row out with "Show latest lifer" off, the collage taking its room', async () => {
    const log = await poster({ name: 'Ada’s birds', latest: false })
    expect(texts(log).find((l) => l.includes('Stickers: huashu-bird-sticker'))).toMatch(/^fillText\("everybird\.yusuftaleb\.com · Stickers: huashu-bird-sticker, CC BY 4\.0 · 15 Nov 2026"/)
    const on = image.cardLayout('print', { name: true, filter: false, latest: true, count: 14 }, printDesign('A4'))
    const off = image.cardLayout('print', { name: true, filter: false, latest: false, count: 14 }, printDesign('A4'))
    expect({ ...off.collage, h: 0 }).toEqual({ ...on.collage, h: 0 })
    expect(off.collage.h).toBeCloseTo(on.collage.h + image.SMALL_INLINE.icon + 2 * image.GAPS.print.latest - image.GAPS.print.collage, 6)
    expect(off.latest).toBeUndefined()
    expect(texts(log).some((l) => l.startsWith('fillText("Synthetic Bird 13"'))).toBe(false)
  })

  it('puts the count on the title\'s line with "Beside title"', async () => {
    const log = await poster({ name: 'Ada’s birds', countSize: 'title' })
    // The title's baseline is 64 + 0.8 · 60; the label ends at the right margin.
    expect(texts(log).find((l) => l.startsWith('fillText("14",'))).toMatch(/, [\d.]+, 112\) \{fillStyle: "#1e1e24", font: "700 60px/)
    const label = texts(log).find((l) => l.startsWith('fillText("SPECIES",'))!
    expect(Number(/, ([\d.]+), 112\)/.exec(label)![1]) + 101.64).toBeCloseTo(1016, 6)
  })

  it('lays the foot out under a hairline, inside the bottom margin, the collage above it', () => {
    for (const landscape of [false, true]) {
      const L = image.cardLayout(landscape ? 'printLandscape' : 'print', { name: true, filter: true, latest: true, count: 300 }, printDesign('A2', landscape))
      expect(L.filter).toBeUndefined()
      expect(L.footer.y + L.footer.size).toBeCloseTo(L.H - 64, 6)
      expect(L.rule.y).toBeLessThan(L.footer.y)
      expect(L.collage.y + L.collage.h).toBeLessThan(L.rule.y)
    }
  })

  it('puts the row above the hairline inside the content box on every size and orientation, the collage above it', () => {
    for (const size of PRINT_SIZES) for (const landscape of [false, true]) {
      const format = landscape ? 'printLandscape' : 'print'
      const L = image.cardLayout(format, { name: true, filter: false, latest: true, count: 300 }, printDesign(size, landscape))
      const R = L.latest!
      expect(R.x).toBe(L.collage.x)
      expect(R.x + R.icon + 20 + R.tw).toBeCloseTo(L.collage.x + L.collage.w, 6)
      expect(R.y + R.icon + image.GAPS[format].latest).toBe(L.rule.y)
      expect(L.collage.y + L.collage.h + image.GAPS[format].latest).toBe(R.y)
    }
  })

  it('draws a long latest lifer\'s name whole on its row; the foot stays one line', async () => {
    const nameOf = (r: { com: string }) => (r.com === 'Synthetic Bird 13' ? 'A Very Long Synthetic Bird Name For The Foot' : r.com)
    const log = await poster({ name: 'Ada’s birds', nameOf })
    const y = (l: string) => Number(/, ([\d.]+)\) \{/.exec(l)![1])
    expect(texts(log).find((l) => l.startsWith('fillText("A Very Long Synthetic Bird Name For The Foot"'))).toMatch(/, 120, /)
    const foot = texts(log).find((l) => l.includes('Stickers: huashu-bird-sticker'))!
    const brand = texts(log).find((l) => l.startsWith('fillText("Everybird"'))!
    expect(y(foot)).toBe(y(brand))
  })
})
