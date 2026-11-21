// The Count menu's "Beside title" (the count on the title's line in the big count's type, no hole in the middle) and the
// poster's quiet head and foot (the title alone in Accent; one line under the hairline, the latest lifer in words at its
// right end or on a second line, right-aligned; no lifer row).
// Drawn on the recording canvas of tests/fixtures/share-image-harness.ts, synthetic birds only.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { ja } from '@/i18n/messages/ja'
import { NO_HOLE } from '@/lib/layout/count-box'
import * as image from '@/lib/share/image'
import { printDesign } from '@/lib/share/print'
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

  it('says "species" in the language, a goal as under the big count ("OF 150 SPECIES")', async () => {
    const log = await draw({ name: 'Ada’s birds', countSize: 'title', strings: ja.ui })
    expect(texts(log).some((l) => l.startsWith('fillText("14",'))).toBe(true)
    expect(texts(log).some((l) => l.startsWith('fillText("種",'))).toBe(true)
  })

  it('without a name, draws the count at the left margin; with a goal, says it', async () => {
    const log = await draw({ countSize: 'title', goal: { target: 150, basis: 'seen' } })
    expect(texts(log).find((l) => l.startsWith('fillText("14",'))).toMatch(/^fillText\("14", 64, 232\) .*textAlign: "left"/)
    expect(texts(log).find((l) => l.includes('OF 150 SPECIES'))).toMatch(/^fillText\("OF 150 SPECIES", 133\.6, 232\) /)
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

  it('ends with one quiet line: the wordmark, the site, the credit and the date at the left, the latest lifer\'s sticker and words at the right end; no lifer row', async () => {
    // A landscape poster's line holds both (a portrait one moves this lifer to its second line, below).
    const log = await poster({ name: 'Ada’s birds', format: 'printLandscape' })
    const foot = texts(log).find((l) => l.includes('Stickers: huashu-bird-sticker'))!
    expect(foot.startsWith(`fillText(${JSON.stringify(`${image.FOOTER_LINE} · 15 Nov 2026`)}, `)).toBe(true)
    expect(foot).toContain(`fillStyle: "${C.muted}"`)
    const brand = texts(log).find((l) => l.startsWith('fillText("Everybird"'))!
    expect(brand).toContain(`font: "700 ${image.POSTER_FOOT.brand}px`)
    const lifer = texts(log).find((l) => l.startsWith('fillText("Latest lifer: Synthetic Bird 13, May 2023"'))!
    expect(Number(/, ([\d.]+), [\d.]+\) /.exec(lifer)![1])).toBeCloseTo(printDesign('A4', true)[0] - 64, 4)
    expect(lifer).toContain('textAlign: "right"')
    expect(lifer).toContain(`fillStyle: "${C.muted}"`)
    // All three on the wordmark's baseline: the line beside the wordmark, the lifer ending at the right margin.
    const y = (l: string) => /, ([\d.]+)\) \{/.exec(l)![1]
    expect(y(foot)).toBe(y(brand))
    expect(y(lifer)).toBe(y(brand))
    expect(texts(log).some((l) => l.startsWith('fillText("LATEST LIFER'))).toBe(false)
    // The collage's stickers (13 tiles, one of them an outline), then the latest lifer's before its words (round 6), a
    // square of posterIcon(16) on the foot's line: its middle on the capitals' middle, ending before the words start.
    const draws = log.filter((l) => l.startsWith('drawImage('))
    expect(draws).toHaveLength(12)
    const [sx, sy, w, h] = /, ([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/.exec(draws.at(-1)!)!.slice(1).map(Number)
    expect(Math.max(w, h)).toBeCloseTo(image.posterIcon(image.POSTER_FOOT.line), 4)
    expect(sx + w).toBeLessThan(printDesign('A4', true)[0] - 64)
    expect(sy + h / 2).toBeCloseTo(Number(y(lifer)) - 0.35 * image.POSTER_FOOT.line, 4)
  })

  it('leaves the latest lifer out of the line with "Show latest lifer" off, and keeps the collage where it was', async () => {
    const log = await poster({ name: 'Ada’s birds', latest: false })
    expect(texts(log).find((l) => l.includes('Stickers: huashu-bird-sticker'))).toMatch(/^fillText\("everybird\.yusuftaleb\.com · Stickers: huashu-bird-sticker, CC BY 4\.0 · 15 Nov 2026"/)
    const on = image.cardLayout('print', { name: true, filter: false, latest: true, count: 14 }, printDesign('A4'))
    const off = image.cardLayout('print', { name: true, filter: false, latest: false, count: 14 }, printDesign('A4'))
    expect(off.collage).toEqual(on.collage)
    expect(on.latest).toBeUndefined()
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

  it('keeps the foot on one line, the latest lifer at its right end, shrinking no smaller than POSTER_FOOT.min; else the lifer takes a second line', () => {
    const credit = `${image.FOOTER_LINE} · 20 Nov 2026`
    expect(image.posterLatest('Rock Sandpiper', '2026-10', en.ui)).toBe('Latest lifer: Rock Sandpiper, Oct 2026')
    // Geist Mono is 0.6 em a character; the wordmark about 0.55 em, 16 after it.
    const mono = (text: string) => (px: number) => text.length * 0.6 * px
    const brandW = 9 * 0.55 * image.POSTER_FOOT.brand + 16
    const place = (name: string, maxW = 952) => image.placePosterFoot(mono(credit), mono(image.posterLatest(name, '2026-10', en.ui)), maxW, brandW)
    // On a portrait poster a typical name moves to a line of its own; the site and credit keep the wordmark's line at the
    // largest size that fits.
    expect(place('Rock Sandpiper')).toEqual({ size: image.POSTER_FOOT.line, below: false, latestBelow: true })
    expect(place('Northern Rough-winged Swallow')).toEqual({ size: image.POSTER_FOOT.line, below: false, latestBelow: true })
    // A landscape poster's wider line holds both: a typical name at the full size, a long one a size smaller.
    expect(place('Rock Sandpiper', 1527 - 128)).toEqual({ size: image.POSTER_FOOT.line, below: false, latestBelow: false })
    expect(place('Northern Rough-winged Swallow', 1527 - 128)).toEqual({ size: 15, below: false, latestBelow: false })
  })

  it('draws a latest lifer that needs its own line at the bottom, right-aligned, the wordmark\'s line a line above', async () => {
    // The latest lifer is Synthetic Bird 13 (as above), here with a long name.
    const nameOf = (r: { com: string }) => (r.com === 'Synthetic Bird 13' ? 'A Very Long Synthetic Bird Name For The Foot' : r.com)
    const log = await poster({ name: 'Ada’s birds', nameOf })
    const y = (l: string) => Number(/, ([\d.]+)\) \{/.exec(l)![1])
    const lifer = texts(log).find((l) => l.startsWith('fillText("Latest lifer: A Very Long'))!
    const foot = texts(log).find((l) => l.includes('Stickers: huashu-bird-sticker'))!
    const brand = texts(log).find((l) => l.startsWith('fillText("Everybird"'))!
    expect(lifer).toMatch(/, 1016, [\d.]+\) .*textAlign: "right"/)
    expect(y(foot)).toBe(y(brand))
    expect(y(lifer) - y(foot)).toBe(image.POSTER_FOOT.line + 12)
  })
})
