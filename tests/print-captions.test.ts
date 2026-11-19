import { afterEach, describe, expect, it, vi } from 'vitest'
import { en } from '@/i18n/messages/en'
import { touchesHole } from '@/lib/layout/count-box'
import { createLayoutHandler, type MaskLoader } from '@/lib/layout/layout.worker'
import { MASK } from '@/lib/layout/mask'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { planCaptions, verifyAndPlaceCaptions, wrapCaption } from '@/lib/share/captions'
import * as image from '@/lib/share/image'
import { CAPTION_CAPS, captionMinPx, printScale } from '@/lib/share/print'
import { installStubs } from './fixtures/share-image-harness'

afterEach(() => vi.unstubAllGlobals())

const solidMask: [number, number, string] = [
  MASK,
  MASK,
  Buffer.from(new Uint8Array(Math.ceil((MASK * MASK) / 8)).fill(0xff)).toString('base64'),
]

function makeSpeciesAndEntries(count: number, nameFn = (i: number) => `Common Bird ${i + 1}`) {
  const rows: SpeciesRow[] = []
  const entries: ListEntry[] = []
  const masks: Record<string, [number, number, string]> = {}
  for (let i = 0; i < count; i++) {
    const code = `bird${i}`
    rows.push({
      code,
      com: nameFn(i),
      sci: `Avis ${code}`,
      ord: 'Passeriformes',
      fam: 'Passeridae',
      famCom: 'Sparrows',
      to: i + 1,
      g: 25 + (i % 10),
      gSrc: 'family',
      st: true,
      ar: 1,
      q: true,
    })
    entries.push({ code, date: '2024-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })
    masks[code] = solidMask
  }
  const load: MaskLoader = async () => masks
  return { species: buildSpeciesIndex(rows), entries, load }
}

function rectsOverlap(ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number): boolean {
  return ax0 < bx1 - 1e-6 && ax1 > bx0 + 1e-6 && ay0 < by1 - 1e-6 && ay1 > by0 + 1e-6
}

describe('print captions', () => {
  it('defines exact species caps and >= 9pt minimum design-unit font sizes', () => {
    expect(CAPTION_CAPS).toEqual({
      A4: 40, A3: 80, A2: 160, A1: 320,
      US12x18: 80, US18x24: 180, US24x36: 360,
    })
    for (const size of Object.keys(CAPTION_CAPS) as (keyof typeof CAPTION_CAPS)[]) {
      expect(captionMinPx(size)).toBeCloseTo(18.75 / printScale(size), 6)
    }
  })

  it('rejects 41 species on A4 with cap reason and accepts 40 species on A4 with zero overlap', async () => {
    const over = makeSpeciesAndEntries(41)
    const overPlan = planCaptions(over.entries, over.species, 'A4', 952)
    expect(overPlan).toEqual({ ok: false, reason: 'cap' })

    const { species, entries, load } = makeSpeciesAndEntries(40, (i) => `Northern Synthetic Warbler ${i + 1}`)
    const content: image.CardContent = { name: true, filter: false, latest: true, count: entries.length }
    const L = image.cardLayout('print', content, image.cardDims('print', 'A4'))
    const plan = planCaptions(entries, species, 'A4', L.collage.w)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    const spec = image.imagePackSpec('print', content, 'A4', plan)
    const handle = createLayoutHandler(load)
    const birds = entries.map((e) => ({ code: e.code, mass: species.byCode.get(e.code)!.g, ord: 'Passeriformes' }))
    const reply = await handle({
      type: 'image',
      id: 1,
      entries: birds,
      aspect: spec.aspect,
      hole: spec.hole,
      maxTile: spec.maxTile,
      captions: birds.map((b) => spec.captionBoxes![b.code]),
    })
    const pack = image.packFromReply(reply)
    const fitRes = image.fitCaptionPack(pack, entries, 'print', content, 'A4', plan)
    expect(fitRes.ok).toBe(true)
    expect(fitRes.captions).toHaveLength(40)

    const hole = {
      ...L.count.hole,
      num: L.count.hole.num,
      label: L.count.hole.label,
    }
    for (const cap of fitRes.captions!) {
      expect(cap.lines.length).toBeLessThanOrEqual(2)
      expect(cap.lines.join(' ')).not.toContain('…')
      expect(cap.fontPx).toBeGreaterThanOrEqual(captionMinPx('A4') - 1e-6)
      expect(cap.x).toBeGreaterThanOrEqual(L.collage.x - 1e-6)
      expect(cap.x + cap.w).toBeLessThanOrEqual(L.collage.x + L.collage.w + 1e-6)
      expect(cap.y).toBeGreaterThanOrEqual(L.collage.y - 1e-6)
      expect(cap.y + cap.h).toBeLessThanOrEqual(L.collage.y + L.collage.h + 1e-6)
      expect(
        touchesHole(
          [cap.x - fitRes.fit.cx, cap.y - fitRes.fit.cy, cap.x + cap.w - fitRes.fit.cx, cap.y + cap.h - fitRes.fit.cy],
          hole,
        ),
      ).toBe(false)
      for (const tile of fitRes.placed) {
        expect(rectsOverlap(cap.x, cap.y, cap.x + cap.w, cap.y + cap.h, tile.x, tile.y, tile.x + tile.w, tile.y + tile.h)).toBe(false)
      }
      for (const other of fitRes.captions!) {
        if (other === cap) continue
        expect(rectsOverlap(cap.x, cap.y, cap.x + cap.w, cap.y + cap.h, other.x, other.y, other.x + other.w, other.y + other.h)).toBe(false)
      }
    }
  })

  it('rejects unbreakable long names and overlapping caption placements', () => {
    expect(wrapCaption('Superlongunbreakablebirdspeciesnamethatcannotpossiblyfitintwolines', 150, (s) => s.length * 10)).toBeNull()

    const { species, entries } = makeSpeciesAndEntries(2, () => 'Superlongunbreakablebirdspeciesnamethatcannotpossiblyfitintwolines')
    expect(planCaptions(entries, species, 'A4', 952)).toEqual({ ok: false, reason: 'fit' })

    const okSet = makeSpeciesAndEntries(2, (i) => `Bird ${i}`)
    const plan = planCaptions(okSet.entries, okSet.species, 'A4', 952)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return

    const overlapRes = verifyAndPlaceCaptions(
      [
        { code: 'bird0', x: 100, y: 100, w: 60, h: 60 },
        { code: 'bird1', x: 100, y: 165, w: 60, h: 60 },
      ],
      { x: 64, y: 64, w: 952, h: 1300 },
      { cx: 540, cy: 700 },
      { num: [-10, -10, 10, 10], label: [-10, 10, 10, 20], pad: 2 },
      plan,
    )
    expect(overlapRes).toEqual({ ok: false, reason: 'fit' })
  })

  it('draws localized nameOf captions identically in preview and across poster strip seams', async () => {
    const logs = installStubs()
    const { species, entries } = makeSpeciesAndEntries(2, (i) => `English Name ${i}`)
    const pack: image.ImagePack = {
      W: 400,
      H: 500,
      boxes: new Map([
        ['bird0', [60, 120, 60, 60]],
        ['bird1', [260, 320, 60, 60]],
      ]),
    }
    image.clearStickerCache()
    const card = await image.prepareCard({
      format: 'print',
      printSize: 'A4',
      showNames: true,
      entries,
      species,
      pack,
      theme: 'light',
      strings: en.ui,
      nameOf: (row) => `Local ${row.code}`,
    })
    expect(card.captions).toHaveLength(2)
    const cap0 = card.captions![0]
    const seamY = cap0.y + cap0.h / 2

    const canvasA = document.createElement('canvas')
    const ctxA = canvasA.getContext('2d')!
    const canvasB = document.createElement('canvas')
    const ctxB = canvasB.getContext('2d')!
    const imgs = new Map<string, CanvasImageSource | null>()

    image.paintCard(ctxA, card, imgs, { y0: 0, y1: seamY })
    image.paintCard(ctxB, card, imgs, { y0: seamY, y1: card.L.H })

    const drawnA = logs.get(canvasA as unknown as object)!.filter((l) => l.includes('Local bird0'))
    const drawnB = logs.get(canvasB as unknown as object)!.filter((l) => l.includes('Local bird0'))
    expect(drawnA.length).toBeGreaterThan(0)
    expect(drawnB.length).toBeGreaterThan(0)
    expect(drawnA).toEqual(drawnB)
  })
})
