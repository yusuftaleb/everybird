// The share images' draw calls, pinned: story, post and square, with and without a name, a filter label and the latest
// lifer, light and dark, and a wide footer that takes its own line. Every call and property set on the returned
// canvas is recorded in order (tests/fixtures/share-image-harness.ts) and snapshotted. On 2026-11-15 these logs were
// checked against the renderer from before the prepareCard / paintCard split (4c1dce0^): every draw, with the state it
// is drawn in, was identical; the only difference was that the footer is now measured on a scratch canvas, so the old
// log's measureText calls (and their font and textBaseline sets) between the filter line and the latest lifer are gone.
// Retaken 2026-11-20 for round 6, item 17: the latest lifer row is the Tree's oldest lineage row (one line, name first,
// on the post and the square; the smaller stacked row on the story); the only other change is the collage taking the room
// it frees (the count and the tiles lower); every case without the row is byte-identical.
// Then the cases with the row on the story, post and square again: the collage ends a credit line higher, the room the
// footer lifts the row by when its credit takes its own line (only the tiles and the count move).
import { en } from '@/i18n/messages/en'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as image from '@/lib/share/image'
import { CASES, caseName, entries, installStubs, NOW, pack, renderLog, species } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

describe('share image draw calls', () => {
  for (const c of CASES) {
    it(caseName(c), async () => {
      const logs = installStubs()
      const log = await renderLog(image, logs, c)
      expect(log.filter((l) => l.startsWith('fillText')).length).toBeGreaterThan(3)
      expect(log).toMatchSnapshot()
    })
  }
  // Mono at 0.85 em: the stamped footer line (59 characters) no longer fits beside the wordmark and takes two lines
  // under it at 22 (AD7): the site and the date, then the credit; the rows above move up.
  for (const c of CASES.filter((x) => x.name && x.latest)) {
    it(`${caseName(c)}, footer on its own line`, async () => {
      const logs = installStubs({ monoEm: 0.85 })
      const log = await renderLog(image, logs, c)
      const texts = log.filter((l) => l.startsWith('fillText'))
      const brand = texts.find((l) => l.startsWith('fillText("Everybird"'))!
      const [site, line] = texts.slice(-2)
      expect(site).toMatch(/^fillText\("everybird\.yusuftaleb\.com · 15 Nov 2026", 64, /) // under the wordmark, at the margin
      expect(line).toMatch(/^fillText\("Stickers: huashu-bird-sticker, CC BY 4\.0", 64, /)
      const y = (l: string) => Number(/, ([\d.]+)\)$/.exec(l)![1])
      expect(y(brand)).toBeLessThan(y(site))
      expect(y(line) - y(site)).toBe(image.FOOT_TWO.size + image.FOOT_TWO.gap)
      expect(log).toContain(`font = ${JSON.stringify(`400 ${image.FOOT_TWO.size}px "Geist Mono", ui-monospace, Menlo, monospace`)}`)
      expect(log).toMatchSnapshot()
    })
  }
  it('story year list progress card', async () => {
    const logs = installStubs()
    image.clearStickerCache()
    const canvas = await image.drawShareImage({
      format: 'story', entries, species, pack, now: NOW, theme: 'light',
      goal: { year: 2027, target: 300, basis: 'seen' }, strings: en.ui,
    })
    const log = logs.get(canvas as unknown as object)!
    // The goal is in the label under the count; the number is the count alone, at its no-goal size.
    expect(log.some((l) => l.startsWith('fillText("14",'))).toBe(true)
    expect(log.some((l) => l.startsWith('fillText("/ 300 SPECIES",'))).toBe(true)
    expect(log.some((l) => l.includes(' / 300'))).toBe(false)
    expect(log).toContain('fillText("2027 year list", 64, 160)')
    expect(log).toMatchSnapshot()
  })
})

// Speed audit finding 8: the dialog paints its preview at the box's size and encodes the full PNG only for Share or
// Download. The PNG it encodes is drawShareImage's canvas, call for call; the preview is the same draws at its own scale.
describe('the preview and the exported image', () => {
  for (const c of CASES) {
    it(`${caseName(c)}: the exported PNG draws exactly what drawShareImage draws`, async () => {
      const logs = installStubs()
      const before = await renderLog(image, logs, c)
      image.clearStickerCache()
      logs.clear()
      const ready = await image.readyShareImage({ ...c, entries, species, pack, now: NOW, strings: en.ui })
      expect(ready.scale).toBe(2)
      expect(ready.missing).toBe(1) // bird4fail, drawn as its outline
      const preview = ready.paint(0.5)
      const shown = logs.get(preview as unknown as object)!
      const blob = await ready.blob()
      expect(blob.type).toBe('image/png')
      expect(await ready.blob()).toBe(blob) // encoded once
      const exported = [...logs].find(([k]) => k !== preview && logs.get(k)!.includes('toBlob("image/png")'))![1]
      expect(exported.slice(0, -1)).toEqual(before)
      expect(exported.at(-1)).toBe('toBlob("image/png")')
      // The preview: the same draws, on a canvas a quarter the size, under its own transform.
      expect(shown.slice(0, 2)).toEqual([`canvas.width = ${Math.round(ready.W / 2)}`, `canvas.height = ${Math.round(ready.H / 2)}`])
      expect(shown.filter((l) => !l.startsWith('canvas.') && !l.startsWith('setTransform'))).toEqual(before.filter((l) => !l.startsWith('canvas.') && !l.startsWith('setTransform')))
    })
  }
})

// H6: nothing on the card is cut before it must be. The harness measures each character as 0.5 em (mono 0.6).
describe('titles and filter labels', () => {
  const texts = (log: string[]) => log.filter((l) => l.startsWith('fillText('))
  it('a long filter label breaks at its " · " onto two lines, and the birds move down clear of the second', async () => {
    const logs = installStubs()
    const short = await renderLog(image, logs, { format: 'story', latest: true, theme: 'light', filterLabel: 'Perching birds' })
    // 80 characters at 34px: 1,360 px, past the story's 952; each half fits.
    const label = 'Perching birds and their many relatives · Canada + Egypt + Kenya + Tanzania + Peru'
    const long = await renderLog(image, logs, { format: 'story', latest: true, theme: 'light', filterLabel: label })
    const lines = texts(long).filter((l) => l.includes('Perching birds and') || l.includes('Canada + Egypt'))
    expect(lines).toEqual(['fillText("Perching birds and their many relatives", 64, 160)', 'fillText("Canada + Egypt + Kenya + Tanzania + Peru", 64, 202)'])
    expect(long.some((l) => l.includes('…'))).toBe(false)
    // Every sticker (and outline) stays below the second line and the head's gap: here the fitted birds already were,
    // so nothing moved; a pack reaching the top moves down (clearHead).
    const tops = (log: string[]) => log.filter((l) => l.startsWith('drawImage(')).map((l) => Number(l.split(', ')[2]))
    expect(Math.min(...tops(long))).toBeGreaterThanOrEqual(202 + 34)
    expect(tops(long)).toEqual(tops(short))
  })
  it('birds reaching the top move down, and shrink about the count, by the second line', async () => {
    const logs = installStubs()
    // A tall pack, its top and bottom birds at the frame's edges: the fit fills the collage's height.
    const tall = { W: 1000, H: 1600, boxes: new Map<string, [number, number, number, number]>([['bird0', [450, 0, 100, 100]], ['bird1', [450, 1500, 100, 100]]]) }
    const draw = async (filterLabel: string) => {
      image.clearStickerCache(); logs.clear()
      const canvas = await image.drawShareImage({ format: 'story', entries, species, pack: tall, now: NOW, theme: 'light', latest: false, filterLabel, strings: en.ui })
      return logs.get(canvas as unknown as object)!
    }
    const tops = (log: string[]) => log.filter((l) => l.startsWith('drawImage(')).map((l) => Number(l.split(', ')[2]))
    const one = await draw('Perching birds')
    const two = await draw('Perching birds and their many relatives · Canada + Egypt + Kenya + Tanzania + Peru')
    expect(Math.min(...tops(one))).toBeLessThan(202 + 34)
    expect(Math.min(...tops(two))).toBeGreaterThanOrEqual(202 + 34 - 0.5)
    // The lowest bird's bottom stays where it was (the collage's foot is unchanged).
    const bottom = (log: string[]) => Math.max(...log.filter((l) => l.startsWith('drawImage(')).map((l) => { const p = l.split(', '); return Number(p[2]) + Number(p[4].replace(')', '')) }))
    expect(bottom(two)).toBeLessThanOrEqual(bottom(one) + 0.5)
  })

  it('a title shrinks to 24px before any ellipsis', async () => {
    const logs = installStubs()
    const name = 'Ada Lovelace and Charles Babbage, 2026 birds' // 44 characters: 1,320 px at 60, 528 at 24
    const log = await renderLog(image, logs, { format: 'story', latest: true, theme: 'light', name })
    expect(texts(log)).toContain(`fillText(${JSON.stringify(name)}, 64, 184)`)
  })
  it('an ellipsis never splits a character in two (code points, not UTF-16 units)', async () => {
    const logs = installStubs()
    const log = await renderLog(image, logs, { format: 'story', latest: true, theme: 'light', name: '𠀋'.repeat(40) })
    const drawn = texts(log).find((l) => l.includes('𠀋'))!
    expect(drawn).toContain('…')
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(JSON.parse(/^fillText\((".*?"),/.exec(drawn)![1]))).toBe(false)
  })
})

describe('the footer is measured once the stickers and the fonts have both settled', () => {
  it('no measuring canvas exists until the last sticker and the fonts are in', async () => {
    const logs = installStubs()
    let releaseFonts = () => {}
    const fonts = new Promise<never[]>((r) => { releaseFonts = () => r([]) })
    const doc = globalThis.document as unknown as { fonts: { load: () => Promise<never[]> } }
    doc.fonts.load = () => fonts
    // The stand-in images load through queueMicrotask: hold those calls to hold the stickers.
    const pending: (() => void)[] = []
    vi.stubGlobal('queueMicrotask', (f: () => void) => { pending.push(f) })
    image.clearStickerCache()
    const p = image.drawShareImage({ format: 'story', entries, species, pack, now: NOW, theme: 'light', name: 'A list', strings: en.ui })
    const flush = () => new Promise((r) => setTimeout(r, 0))
    await flush()
    expect(pending.length).toBeGreaterThan(0)
    expect(logs.size).toBe(0) // nothing measured yet
    releaseFonts()
    await flush()
    expect(logs.size).toBe(0) // the fonts are in, the stickers are not
    while (pending.length) { pending.splice(0).forEach((f) => f()); await flush() }
    const canvas = await p
    // Two canvases: the scratch one the footer was measured on, then the card's own.
    const made = [...logs.keys()]
    expect(made).toHaveLength(2)
    expect(made[1]).toBe(canvas)
    expect(logs.get(made[0])!.filter((l) => l.startsWith('measureText')).length).toBeGreaterThan(1)
  })

  it('a DOM without a 2D canvas throws, as drawing would', async () => {
    installStubs()
    const doc = globalThis.document as unknown as { createElement: () => unknown }
    doc.createElement = () => ({ getContext: () => null })
    image.clearStickerCache()
    await expect(image.prepareCard({ format: 'post', entries, species, pack, now: NOW, theme: 'light', strings: en.ui })).rejects.toThrow('Canvas is not available')
  })
})

describe('the count size', () => {
  it('draws no count text when countSize is hide', async () => {
    const logs = installStubs()
    image.clearStickerCache()
    const canvas = await image.drawShareImage({
      format: 'story', entries, species, pack, now: NOW, theme: 'light', countSize: 'hide', strings: en.ui,
    })
    const log = logs.get(canvas as unknown as object)!
    expect(log.some((l) => l.startsWith('fillText("14",'))).toBe(false)
    expect(log.some((l) => l.startsWith('fillText("SPECIES",'))).toBe(false)
    expect(log.some((l) => l.startsWith('fillText("Everybird",'))).toBe(true)
  })
})

describe('print captions golden compatibility', () => {
  it('keeps print draw calls identical when showNames is false or omitted', async () => {
    const logs = installStubs()
    const base = await renderLog(image, logs, { format: 'print', latest: true, theme: 'light' } as never)
    const off = await renderLog(image, logs, { format: 'print', latest: true, theme: 'light', showNames: false } as never)
    expect(off).toEqual(base)
  })
})

describe('a transparent background', () => {
  it('paints no Paper: the same draws as the default image without its one background fill', async () => {
    const c = CASES.find((x) => x.format === 'story' && x.name && x.latest && x.theme === 'light')!
    const logs = installStubs()
    const opaque = await renderLog(image, logs, c)
    const clear = await renderLog(image, logs, { ...c, transparent: true } as typeof c)
    const fill = opaque.findIndex((l) => l.startsWith('fillRect(0, 0,'))
    expect(fill).toBeGreaterThan(-1)
    expect(clear.some((l) => l.startsWith('fillRect(0, 0,'))).toBe(false)
    // The background is the fillStyle set and the fillRect just before it; everything else is the same, in order.
    expect(clear).toEqual([...opaque.slice(0, fill - 1), ...opaque.slice(fill + 1)])
  })
})
