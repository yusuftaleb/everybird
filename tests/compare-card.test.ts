import { describe, expect, it } from 'vitest'
import { packFrame } from '@/lib/layout/pack'
import { cardLayout, fitPack, imagePackSpec, maxTileSide, SPREAD, type ImagePack } from '@/lib/share/image'

// The comparison card draws the birds on every list, often none (three lists rarely share a bird): the empty pack
// must still lay out, so the card is the counts line over an empty collage, not a hang or NaN.
describe('the comparison card with nothing shared', () => {
  it('packs and fits zero birds to finite numbers', () => {
    const content = { name: true, filter: true, latest: false, count: 0 }
    const spec = imagePackSpec('post', content)
    const r = packFrame([], spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
    expect(r.boxes.size).toBe(0)
    expect(Number.isFinite(r.W) && Number.isFinite(r.H)).toBe(true)
    const pack: ImagePack = { W: r.W, H: r.H, boxes: new Map() }
    const L = cardLayout('post', content)
    const fit = fitPack(pack, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide), SPREAD.post)
    for (const v of Object.values(fit)) expect(Number.isFinite(v)).toBe(true)
  })
})
