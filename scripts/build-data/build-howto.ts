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
import { collageHole, scaleHole } from '../../src/lib/layout/count-box'
import { decodeMask } from '../../src/lib/layout/mask'
import { packBest, packFrame, relSizes, type Box, type PackBird } from '../../src/lib/layout/pack'
import type { MaskTable } from '../../src/lib/layout/layout.worker'
import { cardLayout, fitPack, maxTileSide, packSpec, spreadY, SPREAD, type ImageFormat } from '../../src/lib/share/image'
import type { SpeciesFile } from '../../src/lib/species/types'

/** The made-up list, every bird of it: the demo draws all TOTAL species (the count is never more than the stickers
 * shown). Per order as the chips show them (the scene's ORDERS, in taxonomic order), 31 families in all. */
const BY_ORDER: [ord: string, codes: string][] = [
  ['Anseriformes', 'mutswa cangoo mallar3 wooduc amewig gadwal norsho gnwtea buwtea cintea norpin canvas redhea rinduc lessca buffle hoomer'],
  ['Charadriiformes', 'ribgul killde amhgul1 calgul bongul caster1 forter sposan greyel lesyel leasan wilsni1'],
  ['Pelecaniformes', 'grbher3 greegr bcnher triher snoegr grnher'], // Herons, the six (one family)
  ['Accipitriformes', 'baleag rethaw coohaw shshaw reshaw norhar2 osprey swahaw'],
  ['Strigiformes', 'grhowl brdowl easowl1'],
  ['Piciformes', 'pilwoo dowwoo haiwoo rebwoo norfli'],
  ['Passeriformes', 'blujay amecro comrav stejay easpho eawpew easkin reevir1 eawvir1 buhvir logshr bkcchi tuftit carchi barswa treswa purmar nrwswa whbnut rebnut brncre carwre houwre winwre3 buggna gockin ruckin amerob easblu herthr woothr grycat normoc brnthr eursta cedwax houspa amegfi houfin pinsis sonspa whtspa daejun chispa fiespa rewbla grtgra balori easmea bnhcow yelwar1 comyel yerwar amered ovenbi1 bawwar norcar robgro indbun scatan horlar'],
]
const BIRDS = BY_ORDER.flatMap(([, codes]) => codes.split(' '))
const TOTAL = BIRDS.length
/** The scene's chips (HowItWorksScene ORDERS) and stats line: the list must add up to them. */
const ORDER_COUNTS = [17, 12, 6, 8, 3, 5, 61]
const FAMILIES = 31
export const HERONS = ['grbher3', 'greegr', 'bcnher', 'triher', 'snoegr', 'grnher']
/** The latest lifer (on the share images): one of the herons. */
const LATEST = 'triher'

/** The demo's collage box per design (px; layout units are px), its stretch, and the count's font size (F). The box is
 * the part of the window the stage shows below the filter (wide: 300-470 of the 720x470 stage; compact: 253-356 of
 * 358x356), so every bird packed into it is on screen; e2e/about.spec.ts checks the rendered stickers against it. */
const STAGE = {
  wide: { W: 524, H: 166, stretch: 3.1, F: 44, z: 2 },
  compact: { W: 310, H: 100, stretch: 2.9, F: 32, z: 3 },
} as const

const DATA = join(process.cwd(), 'public/data')
const read = <T>(f: string) => JSON.parse(readFileSync(join(DATA, f), 'utf8')) as T
const r1 = (x: number) => Math.round(x * 10) / 10

/** The generated file's text. */
export function makeHowtoData(): string {
  const species = read<SpeciesFile>('species.v1.json').species
  const byCode = new Map(species.map((r) => [r.code, r]))
  if (new Set(BIRDS).size !== TOTAL) throw new Error('a bird is listed twice')
  BY_ORDER.forEach(([ord, codes], i) => {
    const list = codes.split(' ')
    if (list.length !== ORDER_COUNTS[i]) throw new Error(`${ord}: ${list.length} birds, the chip says ${ORDER_COUNTS[i]}`)
    for (const c of list) if (byCode.get(c)?.ord !== ord) throw new Error(`${c}: not in ${ord}`)
  })
  const fams = new Set(BIRDS.map((c) => byCode.get(c)!.fam))
  if (fams.size !== FAMILIES) throw new Error(`${fams.size} families, the stats line says ${FAMILIES}`)
  if (new Set(HERONS.map((c) => byCode.get(c)!.fam)).size !== 1) throw new Error('the herons must be one family')
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
    // z: packed at z x the box in layout units (the count's font too) and drawn at 1/z, so the packer's fixed gap and
    // grid cell (layout units) don't crowd the phone's tiny stickers out: the same arrangement, the box's size.
    const z = s.z, W = s.W * z, H = s.H * z
    const layout = { W, H, stretch: s.stretch, F: s.F * z, minWidth: W, maxWidth: W }
    // The count's hole is the drawn count's (its label a fixed 12px), scaled up with the box
    const drawn = { W: s.W, F: s.F, minWidth: s.W, maxWidth: s.W }
    const hole = (n: number) => scaleHole(collageHole(n, drawn), z)
    const all = packBest(birds, layout, 'even', { fixedStage: [W, H], rel, hole: hole(TOTAL) })
    if (all.boxes.size !== TOTAL) throw new Error(`${name}: packed ${all.boxes.size} of ${TOTAL}`)
    for (const [id, [x, y, w, h]] of all.boxes) if (x < 0 || y < 0 || x + w > W || y + h > H) throw new Error(`${name}: ${BIRDS[id]} outside the box`)
    const six = birds.filter((b) => HERONS.includes(BIRDS[b.id]))
    const herons = packBest(six, layout, 'even', { fixedStage: [W, H], rel, refBase: all.base, hole: hole(HERONS.length) })
    const unz = (m: Map<number, Box>) => new Map([...m].map(([id, b]) => [id, b.map((v) => v / z) as unknown as Box]))
    return [name, { W: s.W, H: s.H, F: s.F, z, all: pick(unz(all.boxes)), herons: pick(unz(herons.boxes)) }]
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
/** The made-up list: ${TOTAL} species, every one drawn in the demo; ${FAMILIES} families. */
export const TOTAL = ${TOTAL}
export const FAMILIES = ${FAMILIES}
export const BIRDS: string[] = ${JSON.stringify(BIRDS)}
export const HERONS: string[] = ${JSON.stringify(HERONS)}
export const LATEST = ${JSON.stringify({ code: LATEST, name: byCode.get(LATEST)!.com })}
/** Width over height of each sticker (species.v1.json \`ar\`), the sticker version (\`sv\`) where there is one, the name. */
export const AR: Record<string, number> = ${JSON.stringify(ar)}
export const SV: Record<string, string> = ${JSON.stringify(sv)}
export const NAMES: Record<string, string> = ${JSON.stringify(names)}
/** The collage per design: its box (px), the count's font size, the scale it was packed at (z: in layout units z x the
 * box, drawn at 1/z), each sticker's box (px, from the box's top left). */
export const COLLAGE: Record<'wide' | 'compact', { W: number; H: number; F: number; z: number; all: Record<string, Box>; herons: Record<string, Box> }> = ${JSON.stringify(collage)}
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
