import { describe, expect, it } from 'vitest'
import { packFrame } from '@/lib/layout/pack'
import { cardLayout, fitPack, imagePackSpec, maxTileSide, type ImagePack } from '@/lib/share/image'

// A share image with no birds to draw (an empty group): the empty pack must still lay out, the card's text over an
// empty collage, not a hang or NaN.
describe('a share image with no birds', () => {
  it('packs and fits zero birds to finite numbers', () => {
    const content = { name: true, filter: true, latest: false, count: 0 }
    const spec = imagePackSpec('post', content)
    const r = packFrame([], spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
    expect(r.boxes.size).toBe(0)
    expect(Number.isFinite(r.W) && Number.isFinite(r.H)).toBe(true)
    const pack: ImagePack = { W: r.W, H: r.H, boxes: new Map() }
    const L = cardLayout('post', content)
    const fit = fitPack(pack, L.collage, maxTileSide(L.collage.w, L.maxTile, L.maxSide))
    for (const v of Object.values(fit)) expect(Number.isFinite(v)).toBe(true)
  })
})
