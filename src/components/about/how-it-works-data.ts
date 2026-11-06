// The demo's birds: where each sticker sits in the collage, where the herons go when Herons is chosen, and the share
// image's own small collage. Hand-placed so that no sticker's box touches another's (or the count's hole), in every
// state the demo shows; the boxes come from each sticker's aspect ratio (`ar` in species.v1.json, width over height).

/** Width over height of each sticker used (species.v1.json `ar`). */
export const AR: Record<string, number> = {
  baleag: 0.9688, grbher3: 0.6719, mutswa: 1.5118, grhowl: 0.6198, rethaw: 1.0295, greegr: 0.9557, mallar3: 2.0317,
  wooduc: 1.9394, blujay: 1.219, snoegr: 0.7865, amerob: 1.0213, comkin1: 1.1497, triher: 1.1743, bcnher: 0.7109,
  grnher: 1.0159, annhum: 1.0971, barswa: 1.7297, norcar: 0.763,
}

/**
 * A bird in the collage: its centre (px from the count, wide design; compact multiplies by its factor), the long side
 * of its sticker's box, and, for the six herons, where it goes when Herons is chosen. Without a code it's filler: the
 * product's silhouette in Hairline, at the edges and under the crop.
 */
export type BirdDef = { code?: string; x: number; y: number; s: number; flip?: boolean; heron?: { x: number; y: number; s: number }; wideOnly?: boolean }

export const BIRDS: BirdDef[] = [
  { code: 'baleag', x: -117, y: -10, s: 96 },
  { code: 'grbher3', x: 118, y: 2, s: 104, heron: { x: 150, y: 2, s: 150 } },
  { code: 'mutswa', x: -7, y: 91, s: 82 },
  { code: 'grhowl', x: -45, y: -82, s: 58 },
  { code: 'rethaw', x: 53, y: -84, s: 60 },
  { code: 'greegr', x: -163, y: 75, s: 64, heron: { x: -148, y: 4, s: 128 } },
  { code: 'mallar3', x: -96, y: 84, s: 54 },
  { code: 'wooduc', x: 90, y: 88, s: 48 },
  { code: 'blujay', x: 206, y: -65, s: 44 },
  { code: 'snoegr', x: 196, y: 71, s: 58, heron: { x: -46, y: -89, s: 62 } },
  { code: 'amerob', x: -122, y: -84, s: 40 },
  { code: 'comkin1', x: 136, y: -84, s: 36 },
  { code: 'triher', x: -168, y: -80, s: 40, heron: { x: 51, y: 86, s: 64 } },
  { code: 'bcnher', x: 232, y: 4, s: 46, heron: { x: -50, y: 88, s: 64 } },
  { code: 'grnher', x: 178, y: 18, s: 40, heron: { x: 48, y: -87, s: 58 } },
  { code: 'annhum', x: 53, y: 54, s: 22 },
  { code: 'barswa', x: -57, y: 51, s: 28 },
  { x: -238, y: -96, s: 26, wideOnly: true },
  { x: 238, y: -100, s: 24, flip: true, wideOnly: true },
  { x: -248, y: 40, s: 28, wideOnly: true },
  { x: 246, y: 52, s: 30, flip: true, wideOnly: true },
  { x: -150, y: 129, s: 34 },
  { x: 150, y: 128, s: 32, flip: true },
  { x: -230, y: 116, s: 30, flip: true, wideOnly: true },
  { x: 232, y: 122, s: 34, wideOnly: true },
  { x: -58, y: 139, s: 30, flip: true },
  { x: 62, y: 140, s: 28 },
  { x: 175, y: -26, s: 22, flip: true },
]

/** The share image's collage: centre (0 to 1 of the collage box) and long side (px at the image's drawn size). */
export const SHARE_BIRDS: { code: string; x: number; y: number; s: number }[] = [
  { code: 'grbher3', x: 0.253, y: 0.5, s: 46 },
  { code: 'baleag', x: 0.785, y: 0.5, s: 44 },
  { code: 'mutswa', x: 0.5, y: 0.223, s: 42 },
  { code: 'greegr', x: 0.5, y: 0.814, s: 38 },
  { code: 'rethaw', x: 0.737, y: 0.811, s: 33 },
  { code: 'grhowl', x: 0.304, y: 0.814, s: 32 },
  { code: 'mallar3', x: 0.744, y: 0.258, s: 30 },
  { code: 'snoegr', x: 0.275, y: 0.193, s: 30 },
  { code: 'triher', x: 0.136, y: 0.784, s: 28 },
  { code: 'wooduc', x: 0.731, y: 0.129, s: 26 },
  { code: 'blujay', x: 0.07, y: 0.5, s: 22 },
  { code: 'amerob', x: 0.073, y: 0.333, s: 21 },
  { code: 'norcar', x: 0.905, y: 0.239, s: 20 },
  { code: 'comkin1', x: 0.915, y: 0.746, s: 18 },
  { code: 'barswa', x: 0.085, y: 0.625, s: 17 },
  { code: 'annhum', x: 0.5, y: 0.053, s: 13 },
]

/** The sticker's drawn box (object-fit: contain in an s × s square), centred on (x, y). */
export function stickerBox(code: string | undefined, s: number, x: number, y: number) {
  const ar = code ? AR[code] ?? 1 : 1
  const w = ar >= 1 ? s : s * ar
  const h = ar >= 1 ? s / ar : s
  return { x: x - w / 2, y: y - h / 2, w, h }
}
