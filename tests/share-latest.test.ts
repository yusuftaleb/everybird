// Round 6's latest lifer on the images and posters: where it was seen (the province or state and the country, or the
// country alone; never a county), its row the Tree's oldest lineage row (item 17: one line, name first, on Desktop, Post
// and Square; stacked on the Story; the place dropped before the name is ever cut), and the poster foot's sticker before
// its words (the collage's latest lifer and the Tree's oldest lineage alike). Synthetic list only.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { ja } from '@/i18n/messages/ja'
import type { ListEntry } from '@/lib/list/model'
import * as image from '@/lib/share/image'
import { printDesign, printScale } from '@/lib/share/print'
import type { Regions } from '@/lib/species/types'
import { drawsOnly, entries, installStubs, NOW, pack, species } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

const regions: Regions = { v: 1, countries: { CA: 'Canada', KE: 'Kenya' }, sub1: { 'CA-BC': 'British Columbia', 'CA-NL': 'Newfoundland and Labrador' } }
/** The harness's list with the latest lifer (Synthetic Bird 13) seen at `place`. */
const seenAt = (place: ListEntry['place']): ListEntry[] => entries.map((e) => (e.code === 'bird13' ? { ...e, place } : e))

describe('where the latest lifer was seen', () => {
  it('names the province or state and the country, the country alone without one, nothing without a place; never a county', () => {
    expect(image.liferPlace({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' }, regions)).toBe('British Columbia, Canada')
    expect(image.liferPlace({ country: 'KE' }, regions)).toBe('Kenya')
    expect(image.liferPlace(undefined, regions)).toBe('')
  })
  it('follows the date on the row\'s label and in the poster\'s words', () => {
    expect(image.latestText({ com: 'Rock Sandpiper', date: '2026-10', place: 'British Columbia, Canada' }, en.ui))
      .toEqual({ label: 'Latest lifer · Oct 2026 · British Columbia, Canada', name: 'Rock Sandpiper', head: 'Latest lifer · Oct 2026', place: 'British Columbia, Canada' })
    expect(image.latestText({ com: 'Rock Sandpiper', date: '2026-10' }, en.ui)).toEqual({ label: 'Latest lifer · Oct 2026', name: 'Rock Sandpiper' })
    expect(image.posterLatest('Rock Sandpiper', '2026-10', en.ui, 'British Columbia, Canada')).toBe('Latest lifer: Rock Sandpiper, Oct 2026, British Columbia, Canada')
    expect(image.posterLatest('Rock Sandpiper', '2026-10', en.ui)).toBe('Latest lifer: Rock Sandpiper, Oct 2026')
    expect(image.posterLatest('イワトウネン', '2026-10', ja.ui, 'カナダ')).toBe(`${ja.ui.share.latestLifer}：イワトウネン、2026年10月、カナダ`)
  })
  it('is drawn on the share image and named on the poster only when the dialog gives the places\' names', async () => {
    const logs = installStubs()
    image.clearStickerCache()
    const canvas = await image.drawShareImage({ format: 'story', entries: seenAt({ country: 'CA', sub1: 'CA-BC' }), species, pack, now: NOW, theme: 'light', strings: en.ui, regions })
    const texts = drawsOnly(logs.get(canvas as unknown as object)!).filter((l) => l.startsWith('fillText('))
    expect(texts.some((l) => l.startsWith('fillText("LATEST LIFER · ') && l.includes(' · BRITISH COLUMBIA, CANADA"'))).toBe(true)
    const card = await image.prepareCard({ format: 'print', printSize: 'A2', entries: seenAt({ country: 'KE' }), species, pack, now: NOW, theme: 'light', strings: en.ui, regions })
    expect(card.posterLatest).toMatch(/^Latest lifer: Synthetic Bird 13, .*, Kenya$/)
    const none = await image.prepareCard({ format: 'print', printSize: 'A2', entries: seenAt({ country: 'KE' }), species, pack, now: NOW, theme: 'light', strings: en.ui })
    expect(none.posterLatest).not.toContain('Kenya')
  })
  it('on one line (Post): the name, then the detail; a place too long for the line beside the name is dropped, nothing cut', async () => {
    const draw = async (monoEm: number) => {
      const logs = installStubs({ monoEm })
      image.clearStickerCache()
      const canvas = await image.drawShareImage({ format: 'post', entries: seenAt({ country: 'CA', sub1: 'CA-NL' }), species, pack, now: NOW, theme: 'light', strings: en.ui, regions })
      return drawsOnly(logs.get(canvas as unknown as object)!).filter((l) => l.startsWith('fillText('))
    }
    const fits = await draw(0.6)
    expect(fits.some((l) => l.startsWith('fillText("Synthetic Bird 13"'))).toBe(true)
    expect(fits.some((l) => /^fillText\("Latest lifer · [^"]*\d{4} · Newfoundland and Labrador, Canada"/.test(l))).toBe(true)
    const tight = await draw(1.5)
    expect(tight.some((l) => l.startsWith('fillText("Synthetic Bird 13"'))).toBe(true)
    expect(tight.some((l) => /^fillText\("Latest lifer · [^"·]*\d{4}"/.test(l))).toBe(true)
    expect(tight.some((l) => l.includes('Newfoundland') || l.includes('…'))).toBe(false)
  })
  it('stacked (Story): a place too long for the label takes a line of its own under it, never cut', async () => {
    const logs = installStubs({ monoEm: 1.2 })
    image.clearStickerCache()
    const canvas = await image.drawShareImage({ format: 'story', entries: seenAt({ country: 'CA', sub1: 'CA-NL' }), species, pack, now: NOW, theme: 'light', strings: en.ui, regions })
    const texts = drawsOnly(logs.get(canvas as unknown as object)!).filter((l) => l.startsWith('fillText('))
    expect(texts.some((l) => /^fillText\("LATEST LIFER · [^"]*\d{4}"/.test(l))).toBe(true)
    expect(texts.some((l) => l.startsWith('fillText("NEWFOUNDLAND AND LABRADOR, CANADA"'))).toBe(true)
    expect(texts.some((l) => l.includes('…'))).toBe(false)
  })
})

describe('the room above the latest lifer row', () => {
  it('is the row\'s own gap (the oldest lineage row\'s, round 6 item 17), in every format; without the row, the collage takes it', () => {
    for (const format of ['story', 'post', 'square', 'wide', 'desktop'] as const) {
      const L = image.cardLayout(format, { name: true, filter: false, latest: true, count: 120 })
      // The 1080-wide cards keep the credit line placeFooter lifts the row by (`lift`); Post 5:4 and Desktop lift nothing.
      expect(L.latest!.lift ?? 0, format).toBe(['story', 'post', 'square'].includes(format) ? L.footer.credit + 12 : 0)
      expect(L.latest!.y - (L.collage.y + L.collage.h) - (L.latest!.lift ?? 0), format).toBe(format === 'square' ? 32 : 24)
      expect(L.latest!.y + L.latest!.icon, format).toBeLessThan(L.rule.y)
      expect(L.latest!.inline, format).toBe(format === 'story' ? undefined : true)
      const off = image.cardLayout(format, { name: true, filter: false, latest: false, count: 120 })
      expect(off.collage.y + off.collage.h).toBeGreaterThan(L.collage.y + L.collage.h)
      expect(off.collage.y + off.collage.h).toBeLessThan(off.rule.y)
    }
  })

  // Round 6: the pack was made for the frame with the row and fitted into the taller one without it, which left an empty
  // band above and below the birds. Now each packs for its own frame: the pack's aspect is the collage's, so fitPack maps
  // it edge to edge.
  it('without the row the collage takes its room: the pack is made for the taller frame, in every format and orientation', () => {
    for (const format of ['story', 'post', 'square', 'desktop', 'wide'] as const) {
      for (const countSize of ['medium', 'title'] as const) {
        for (const target of [undefined, 1500]) {
          const c = { name: true, filter: target !== undefined, count: 1092, countSize, target }
          const on = image.cardLayout(format, { ...c, latest: true }), off = image.cardLayout(format, { ...c, latest: false })
          const what = `${format} ${countSize} ${target ?? 'no goal'}`
          expect(off.collage.w, what).toBe(on.collage.w)
          expect(off.collage.y, what).toBe(on.collage.y)
          expect(off.collage.h, what).toBeGreaterThan(on.collage.h)
          for (const L of [on, off]) {
            const spec = image.imagePackSpec(format, { ...c, latest: L === on })
            expect(spec.aspect, what).toBeCloseTo(L.collage.w / L.collage.h, 12)
          }
        }
      }
    }
  })
})

describe('the poster foot\'s sticker', () => {
  const opts = (format: 'print' | 'printLandscape', over: Partial<image.ShareImageOpts> = {}) =>
    ({ format, printSize: 'A2', entries, species, pack, now: NOW, theme: 'light', strings: en.ui, ...over }) as image.ShareImageOpts
  it('draws the bird\'s sticker before its words at the foot\'s right end, sized to the line, on the line\'s capitals', async () => {
    // Without a DOM the measures are estimates: Geist Mono 0.6 em a character.
    const card = await image.prepareCard(opts('printLandscape'), printScale('A2'))
    const { L } = card
    expect(L.latest).toBeUndefined()
    expect(card.credit.latestBelow).toBe(false)
    const px = card.credit.size, side = image.posterIcon(px)
    expect(side).toBe(24)
    const row = species.byCode.get('bird13')!
    const textW = card.posterLatest!.length * 0.6 * px
    const lifer = card.lifer!
    expect(Math.max(lifer.w, lifer.h)).toBeCloseTo(side, 6)
    // Contained in its square, which ends half the line's size before the words.
    expect(lifer.x + lifer.w / 2).toBeCloseTo(L.collage.x + L.collage.w - textW - px * 0.5 - side / 2, 6)
    expect(lifer.y + lifer.h / 2).toBeCloseTo(L.footer.y + L.footer.size * 0.8 - 0.35 * px, 6)
    expect(lifer.url).toContain(row.code)
    // The poster's tiles include it, so its strips fetch and draw it.
    expect(image.cardUrls(card)).toContain(lifer.url)
  })
  it('keeps it before the words when they take a line of their own', async () => {
    const card = await image.prepareCard(opts('print', { nameOf: (r) => (r.code === 'bird13' ? 'A Very Long Synthetic Bird Name For The Foot' : r.com) }), printScale('A2'))
    expect(card.credit.latestBelow).toBe(true)
    const px = card.credit.size
    const textW = card.posterLatest!.length * 0.6 * px
    expect(card.lifer!.x + card.lifer!.w / 2).toBeCloseTo(card.L.collage.x + card.L.collage.w - textW - px * 0.5 - image.posterIcon(px) / 2, 6)
    // On the bottom line, the right part's own.
    expect(card.lifer!.y + card.lifer!.h / 2).toBeCloseTo(card.L.footer.y + card.L.footer.size * 0.8 - 0.35 * px, 6)
  })
  it('is the Tree\'s oldest lineage too: one foot line, the bird\'s sticker then "Oldest lineage: …", no big block', async () => {
    const row = species.byCode.get('bird3')!
    const card = await image.prepareCard(opts('print', { latestAs: { row, label: 'Oldest lineage · about 39 million years', poster: 'Oldest lineage: Synthetic Bird 3, about 39 million years' } }), printScale('A2'))
    expect(card.L.latest).toBeUndefined()
    expect(card.posterLatest).toBe('Oldest lineage: Synthetic Bird 3, about 39 million years')
    expect(card.lifer!.url).toContain('bird3')
    expect(Math.max(card.lifer!.w, card.lifer!.h)).toBeCloseTo(image.posterIcon(card.credit.size), 6)
  })
  it('draws no sticker without the latest lifer (Show latest lifer off)', async () => {
    const card = await image.prepareCard(opts('print', { latest: false }), printScale('A2'))
    expect(card.posterLatest).toBeUndefined()
    expect(card.lifer).toBeNull()
    expect(printDesign('A2')[0]).toBe(1080)
  })
})

describe('the row lifted with the footer', () => {
  // The rule and the row move up by a line when the credit takes its own line under the wordmark (placeFooter's shift):
  // the collage still ends the row's own gap above the row as drawn.
  it('keeps the row\'s gap from the collage once the footer is placed, in every format', async () => {
    for (const format of ['story', 'post', 'square', 'wide', 'desktop'] as const) {
      const card = await image.prepareCard({ format, entries, species, pack, now: NOW, theme: 'light', strings: en.ui, name: 'A title' })
      const { L } = card
      const gap = L.latest!.y - card.shift - (L.collage.y + L.collage.h)
      expect(gap, format).toBeGreaterThanOrEqual(format === 'square' ? 32 : 24)
    }
  })
})
