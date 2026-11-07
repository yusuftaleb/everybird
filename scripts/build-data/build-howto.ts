// Builds src/components/about/how-it-works-data.ts, the About demo's birds: where each sticker sits in the demo's
// collage (all birds, and Herons chosen) and in its share images (story, post, square), packed by the product's own
// code: packBest with the masks in public/data/masks (painted-area sizes from relSizes, the count's hole from
// count-box.ts) for the collage, and cardLayout + packFrame + fitPack (src/lib/share/image.ts) for the images.
// The demo's list is made up (BIRDS below; TOTAL species in all); the boxes are the product's for these birds.
// Rerun after changing the birds, the demo's collage box (STAGE) or the packer:
//
//   npx tsx scripts/build-data/build-howto.ts
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { EXP } from '../../src/lib/layout/constants'
import { collageHole } from '../../src/lib/layout/count-box'
import { decodeMask } from '../../src/lib/layout/mask'
import { packBest, packFrame, relSizes, type Box, type PackBird } from '../../src/lib/layout/pack'
import type { MaskTable } from '../../src/lib/layout/layout.worker'
import { cardLayout, fitPack, maxTileSide, packSpec, spreadY, SPREAD, type ImageFormat } from '../../src/lib/share/image'
import type { SpeciesFile } from '../../src/lib/species/types'

/** The made-up list's size, and the stickers the demo shows (a miniature: these birds stand for all of them). */
const TOTAL = 112
const BIRDS = [
  'mutswa', 'cangoo', 'mallar3', 'wooduc', // Waterfowl
  'ribgul', 'killde', // Shorebirds and gulls
  'grbher3', 'greegr', 'bcnher', 'triher', 'snoegr', 'grnher', // Herons, the six
  'baleag', 'rethaw', // Hawks and eagles
  'grhowl', // Owls
  'pilwoo', 'dowwoo', // Woodpeckers
  'grtgra', 'blujay', 'amerob', 'norcar', 'barswa', 'amegfi', 'bkcchi', // Perching birds
]
export const HERONS = ['grbher3', 'greegr', 'bcnher', 'triher', 'snoegr', 'grnher']
/** The latest lifer (on the share images): one of the herons. */
const LATEST = 'triher'

/** The demo's collage box per design (px; layout units are px), its stretch, and the count's font size (F). */
const STAGE = {
  wide: { W: 524, H: 166, stretch: 3.1, F: 44 },
  compact: { W: 310, H: 104, stretch: 2.9, F: 32 },
} as const

const DATA = join(process.cwd(), 'public/data')
const read = <T>(f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as T
const r1 = (x: number) => Math.round(x * 10) / 10

/** The generated file's text. */
export function makeHowtoData(): string {
  const species = read<SpeciesFile>('species.v1.json').species
  const byCode = new Map(species.map((r) => [r.code, r]))
  const masks = new Map<string, MaskTable>()
  const birds: PackBird[] = BIRDS.map((code, id) => {
    const row = byCode.get(code)
    if (!row || !row.st) throw new Error(`${code}: no species row with a sticker`)
    if (!masks.has(row.ord)) masks.set(row.ord, read<MaskTable>(`masks/${row.ord}.v1.json`))
    const raw = masks.get(row.ord)![code]
    if (!raw) throw new Error(`${code}: no mask`)
    return { id, mass: row.g, mask: decodeMask(raw) }
  })
  const rel = relSizes(birds, EXP)
  const box = (b: Box) => b.map(r1) as unknown as Box
  const pick = (m: Map<number, Box>) => Object.fromEntries([...m].map(([id, b]) => [BIRDS[id], box(b)]))

  // The collage: every bird around the TOTAL count's hole; then Herons chosen, the six around "6" on the same stage,
  // each keeping its full-collage relative size (rel over the whole list), as the product packs a filtered state.
  const collage = Object.fromEntries(Object.entries(STAGE).map(([name, s]) => {
    const layout = { W: s.W, H: s.H, stretch: s.stretch, F: s.F, minWidth: s.W, maxWidth: s.W }
    const all = packBest(birds, layout, 'even', { fixedStage: [s.W, s.H], rel, hole: collageHole(TOTAL, layout) })
    const six = birds.filter((b) => HERONS.includes(BIRDS[b.id]))
    const herons = packBest(six, layout, 'even', { fixedStage: [s.W, s.H], rel, refBase: all.base, hole: collageHole(HERONS.length, layout) })
    return [name, { W: s.W, H: s.H, F: s.F, all: pick(all.boxes), herons: pick(herons.boxes) }]
  }))

  // The share images, without a name (the demo's collage has no title) and with the latest lifer row.
  const share = Object.fromEntries((['story', 'post', 'square'] as ImageFormat[]).map((format) => {
    const L = cardLayout(format, { name: false, filter: false, latest: true, count: TOTAL })
    const spec = packSpec(L)
    const p = packFrame(birds, spec.aspect, { hole: spec.hole, maxTile: spec.maxTile })
    const fit = fitPack({ W: p.W, H: p.H, boxes: new Map([...p.boxes].map(([id, b]) => [BIRDS[id], b])) }, L.collage, maxTileSide(L.collage.w, L.maxTile), SPREAD[format])
    const tiles = Object.fromEntries([...p.boxes].map(([id, b]) => {
      const w = b[2] * fit.s, h = b[3] * fit.s
      return [BIRDS[id], box([fit.cx + (b[0] - fit.ux) * fit.s, spreadY(fit, b[1] + b[3] / 2) - h / 2, w, h])]
    }))
    const g = Math.min(fit.grow, 1.3)
    const count = { cx: r1(fit.cx), cy: r1(fit.cy), size: Math.round(L.count.size * g), labelSize: Math.round(L.count.labelSize * Math.min(g, 1.15)), gap: Math.round(L.count.gap * g) }
    return [format, { W: L.W, H: L.H, tiles, count, latest: L.latest!, rule: L.rule.y, footer: L.footer.y }]
  }))

  const ar = Object.fromEntries(BIRDS.map((c) => [c, byCode.get(c)!.ar]))
  const sv = Object.fromEntries(BIRDS.flatMap((c) => (byCode.get(c)!.sv ? [[c, byCode.get(c)!.sv]] : [])))
  const names = Object.fromEntries(BIRDS.map((c) => [c, byCode.get(c)!.com]))
  const out = `// Generated by scripts/build-data/build-howto.ts: do not edit. The About demo's birds, packed by the product's code.
export type Box = [x: number, y: number, w: number, h: number]
/** The made-up list: ${TOTAL} species; these ${BIRDS.length} stickers stand for them in the demo. */
export const TOTAL = ${TOTAL}
export const BIRDS: string[] = ${JSON.stringify(BIRDS)}
export const HERONS: string[] = ${JSON.stringify(HERONS)}
export const LATEST = ${JSON.stringify({ code: LATEST, name: byCode.get(LATEST)!.com })}
/** Width over height of each sticker (species.v1.json \`ar\`), the sticker version (\`sv\`) where there is one, the name. */
export const AR: Record<string, number> = ${JSON.stringify(ar)}
export const SV: Record<string, string> = ${JSON.stringify(sv)}
export const NAMES: Record<string, string> = ${JSON.stringify(names)}
/** The collage per design: its box (px), the count's font size, each sticker's box (px, from the box's top left). */
export const COLLAGE: Record<'wide' | 'compact', { W: number; H: number; F: number; all: Record<string, Box>; herons: Record<string, Box> }> = ${JSON.stringify(collage)}
/** The share images (px of the 1080-wide image): sticker tiles, the count at the collage's centre, the latest lifer row, the rule and the footer. */
export const SHARE: Record<'story' | 'post' | 'square', { W: number; H: number; tiles: Record<string, Box>; count: { cx: number; cy: number; size: number; labelSize: number; gap: number }; latest: { y: number; icon: number; label: number; name: number }; rule: number; footer: number }> = ${JSON.stringify(share)}
`
  return out
}

export const HOWTO_DATA = join(process.cwd(), 'src/components/about/how-it-works-data.ts')

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(HOWTO_DATA, makeHowtoData())
  console.log(`how-it-works-data.ts: ${BIRDS.length} birds`)
}
