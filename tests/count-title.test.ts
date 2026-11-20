// The Count menu's "Beside title" (the count on the title's line, no hole in the middle) and the poster's quiet head
// and foot (the title alone in Accent; one line under the hairline with the latest lifer in words, no lifer row).
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
    expect(L.titleCount).toEqual({ size: image.TITLE_COUNT })
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

  it('reads "96 species", with a goal "123 of 150 species", joined as each language joins a number to "species"', () => {
    expect(image.titleCountText(96, undefined, en.ui)).toBe('96 species')
    expect(image.titleCountText(1, undefined, en.ui)).toBe('1 species')
    expect(image.titleCountText(1089, undefined, en.ui)).toBe('1,089 species')
    expect(image.titleCountText(123, 150, en.ui)).toBe('123 of 150 species')
    expect(image.titleCountText(96, undefined, ja.ui)).toBe('96種')
    expect(image.titleCountText(123, 150, ja.ui)).toBe('123目標150種')
  })

  it('draws the count on the name\'s baseline at the right margin, in the label style, and nothing in the middle', async () => {
    const log = await draw({ name: 'Ada’s birds', countSize: 'title' })
    const count = texts(log).find((l) => l.startsWith('fillText("14 SPECIES"'))!
    // 14 drawn birds (one unknown code is left out). Right-aligned at 64 + 952, on the name's baseline (184 + 0.8 · 60).
    expect(count).toMatch(/^fillText\("14 SPECIES", 1016, 232\) \{fillStyle: "#1e1e24", font: "500 34px .*", textAlign: "right", textBaseline: "alphabetic", letterSpacing: "2\.04px"\}$/)
    expect(texts(log).some((l) => l.startsWith('fillText("14",'))).toBe(false) // no number in the middle
    expect(texts(log).some((l) => l.startsWith('fillText("SPECIES"'))).toBe(false)
    // The name keeps its place at the left, in Ink.
    expect(texts(log).find((l) => l.startsWith('fillText("Ada’s birds"'))).toMatch(/, 64, 184\) \{fillStyle: "#1e1e24"/)
  })

  it('without a name, draws the count at the left margin; with a goal, says it', async () => {
    const log = await draw({ countSize: 'title', goal: { target: 150, basis: 'seen' } })
    expect(texts(log).find((l) => l.includes('OF 150 SPECIES'))).toMatch(/^fillText\("14 OF 150 SPECIES", 64, 232\) .*textAlign: "left"/)
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

  it('ends with one quiet line: the wordmark, then the latest lifer, the site, the credit and the date; no lifer row', async () => {
    const log = await poster({ name: 'Ada’s birds' })
    const line = `Latest lifer: Synthetic Bird 13, May 2023 · ${image.FOOTER_LINE} · 15 Nov 2026`
    const foot = texts(log).find((l) => l.includes('stickers by huashu'))!
    expect(foot.startsWith(`fillText(${JSON.stringify(line)}, `)).toBe(true)
    expect(foot).toContain(`fillStyle: "${C.muted}"`)
    const brand = texts(log).find((l) => l.startsWith('fillText("Everybird"'))!
    expect(brand).toContain(`font: "700 ${image.POSTER_FOOT.brand}px`)
    // On the wordmark's baseline, beside it.
    expect(/, ([\d.]+)\) \{/.exec(foot)![1]).toBe(/, ([\d.]+)\) \{/.exec(brand)![1])
    expect(texts(log).some((l) => l.startsWith('fillText("LATEST LIFER'))).toBe(false)
    // Only the collage's stickers are drawn: no latest lifer's sticker beside the foot (13 tiles, one of them an outline).
    expect(log.filter((l) => l.startsWith('drawImage(')).length).toBe(11)
  })

  it('leaves the latest lifer out of the line with "Show latest lifer" off, and keeps the collage where it was', async () => {
    const log = await poster({ name: 'Ada’s birds', latest: false })
    expect(texts(log).find((l) => l.includes('stickers by huashu'))).toMatch(/^fillText\("everybird\.yusuftaleb\.com · stickers by huashu · 15 Nov 2026"/)
    const on = image.cardLayout('print', { name: true, filter: false, latest: true, count: 14 }, printDesign('A4'))
    const off = image.cardLayout('print', { name: true, filter: false, latest: false, count: 14 }, printDesign('A4'))
    expect(off.collage).toEqual(on.collage)
    expect(on.latest).toBeUndefined()
  })

  it('puts the count on the title\'s line with "Beside title"', async () => {
    const log = await poster({ name: 'Ada’s birds', countSize: 'title' })
    expect(texts(log).find((l) => l.startsWith('fillText("14 SPECIES"'))).toMatch(/, 1016, 112\) .*textAlign: "right"/)
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

  it('keeps the foot on one line beside the wordmark, shrinking it no smaller than POSTER_FOOT.min, else under the wordmark, never cut', () => {
    const line = (name: string) => `${image.posterLatest(name, '2026-09', en.ui)} · ${image.FOOTER_LINE} · 20 Nov 2026`
    expect(line('Hooded Crow')).toBe('Latest lifer: Hooded Crow, Sep 2026 · everybird.yusuftaleb.com · stickers by huashu · 20 Nov 2026')
    const place = (text: string) => image.placeCredit((px) => text.length * 0.6 * px, 952 - (9 * 0.55 * image.POSTER_FOOT.brand + 16), 952, image.POSTER_FOOT.line, image.POSTER_FOOT.min)
    // Geist Mono is 0.6 em a character: a typical name fits beside the wordmark at 14px.
    expect(place(line('Hooded Crow'))).toEqual({ size: 14, below: false })
    // A long one takes the line under the wordmark, whole.
    expect(place(line('Northern Rough-winged Swallow'))).toEqual({ size: 13, below: true })
  })
})
