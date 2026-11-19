// The share images' draw calls, pinned: story, post and square, with and without a name, a filter label and the latest
// lifer, light and dark, and a wide footer that takes its own line. Every call and property set on the returned
// canvas is recorded in order (tests/fixtures/share-image-harness.ts) and snapshotted. On 2026-11-15 these logs were
// checked against the renderer from before the prepareCard / paintCard split (4c1dce0^): every draw, with the state it
// is drawn in, was identical; the only difference was that the footer is now measured on a scratch canvas, so the old
// log's measureText calls (and their font and textBaseline sets) between the filter line and the latest lifer are gone.
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
  // Mono at 0.85 em: the stamped footer line (59 characters) no longer fits beside the wordmark and takes its own
  // line; the rows above move up.
  for (const c of CASES.filter((x) => x.name && x.latest)) {
    it(`${caseName(c)}, footer on its own line`, async () => {
      const logs = installStubs({ monoEm: 0.85 })
      const log = await renderLog(image, logs, c)
      const texts = log.filter((l) => l.startsWith('fillText'))
      const brand = texts.find((l) => l.startsWith('fillText("Everybird"'))!
      const line = texts.at(-1)!
      expect(line).toMatch(/^fillText\("everybird\.yusuftaleb\.com.*", 64, /) // under the wordmark, at the margin
      expect(Number(/, ([\d.]+)\)$/.exec(brand)![1])).toBeLessThan(Number(/, ([\d.]+)\)$/.exec(line)![1]))
      expect(log).toMatchSnapshot()
    })
  }
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

describe('marked lifer rings on share and print images', () => {
  it('draws Accent and Ink rings around the newest and first lifers on share and print cards without changing unmarked cards', async () => {
    for (const [format, theme, accent, ink] of [
      ['story', 'light', '#92140c', '#1e1e24'],
      ['story', 'dark', '#f06a5f', '#ffffff'],
      ['print', 'light', '#92140c', '#1e1e24'],
    ] as const) {
      const logs = installStubs()
      const base = await renderLog(image, logs, { format, latest: true, theme } as never)
      const marked = await renderLog(image, logs, { format, latest: true, theme, markNewest: true, markFirst: true } as never)
      const added = marked.filter((l, i) => base[i] !== l)
      expect(added.length).toBeGreaterThan(0)
      expect(marked).toContain(`strokeStyle = "${accent}"`)
      expect(marked).toContain(`strokeStyle = "${ink}"`)
      expect(marked).toContain('lineWidth = 3')
      expect(marked.filter((l) => l.startsWith('roundRect('))).toHaveLength(2)
    }
  })

  it('marks the same newest bird that appears in the share card latest lifer row', async () => {
    installStubs()
    image.clearStickerCache()
    const tiedEntries = [
      { code: 'bird0', date: '2025-05', heard: false, dead: false, media: false, sources: ['ebird'] },
      { code: 'bird13', date: '2025-05', heard: false, dead: false, media: false, sources: ['ebird'] },
    ] satisfies Parameters<typeof image.prepareCard>[0]['entries']
    const card = await image.prepareCard({ format: 'post', entries: tiedEntries, species, pack, now: NOW, theme: 'light', strings: en.ui, markNewest: true })
    expect(card.latest?.name).toBe('Synthetic Bird 13')
    const markedTiles = card.tiles.filter((t) => t.mark)
    expect(markedTiles).toHaveLength(1)
    expect(markedTiles[0].mark).toBe('newest')
  })

  it('paintTiles draws the ring overhang when a marked tile is within 7 units outside a strip range', () => {
    const logs = installStubs()
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')!
    const tiles: image.Tile[] = [
      { x: 10, y: 103, w: 40, h: 40, url: null, mark: 'newest' },
      { x: 10, y: 108, w: 40, h: 40, url: null, mark: 'first' },
    ]
    const imgs = new Map<string, CanvasImageSource | null>()
    image.paintTiles(ctx, tiles, imgs, '#857f74', { y0: 0, y1: 100 })
    const log = logs.get(canvas)!
    expect(log.filter((l) => l.startsWith('roundRect('))).toHaveLength(1)
    expect(log).toContain('roundRect(5, 98, 50, 50, 10)')
  })
})
