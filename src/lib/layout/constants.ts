// Packing constants, values from build_lifelist.py (framer-site/scripts/lifelist).
// Sizes follow the PAINTED AREA (2026-11-06; before, the tile's long side did, so long-tailed and long-legged birds
// drew a small body and an upright compact one filled its box: a cormorant read bigger than a peafowl twice its mass).
// A sticker's painted area is L² · shape: L its tile's long side, shape its mask's set cells / MASK² (pack.ts
// maskShape: the opaque share of the L x L square, so it already counts the aspect). relSizes makes it
// L ∝ mass ** EXP / sqrt(shape / SHAPE_REF), so the painted area ∝ mass ** (2 · EXP).
export const EXP = 0.2 // "evened out": painted area ~ mass ** (2 · EXP) = mass ** 0.4 (a typical shape's long side ~ mass ** 0.2)
export const EXP_TRUE = 1 / 3 // "true size": painted area ~ mass ** (2/3), so length ~ mass ** (1/3)
// The reference shape: a bird of this shape keeps the long side it had when sizes followed the long side. Calibrated
// so the median rel over all 10,989 sticker species is unchanged in both modes (the median shape is 222 / 576; the
// median rel, a product, needs 218 / 576), so the median sticker, the floors and the stage growth stay as they were.
export const SHAPE_REF = 218 / 576
// The no-sticker outline (bird-outline.ts: Phosphor's Bird at 0.72 of its box), filled and measured as a mask would be
// (141 of 576 cells): its silhouette's area follows mass as a sticker's does. Its collision mask stays the ellipse.
export const OUTLINE_SHAPE = 141 / 576
export const GAP = 2 // layout units kept between silhouettes
export const MAXUP = 1.5 // a filtered set may grow up to this much bigger than in the full collage

// W x H: starting stage in layout units (CSS px at that container width). stretch: x-stretch of the spiral on
// the starting stage; on a grown stage (H > the starting H) the spiral's x : y is stretch · H / grown H, the grown H
// counted up to maxH (pack.ts stretchAt), so the cluster follows the stage's aspect: a stage grown 1.5x taller packs
// as a round or tall cluster, not a wide oval.
// F: the count's font size in layout units (count-box.ts sizes the hole from the shown count's text at F).
// minWidth / maxWidth: the stage widths (CSS px) this layout serves (wide up to the page's 1152px column).
// Big lists (packBest): the stage grows taller, never wider, in two stages.
// - floor: the median sticker's long side, in CSS px at the reference width W, below which the stage grows
//   taller (a comfortable on-screen size), up to maxH. Past maxH the birds may get smaller than the floor.
//   wide and medium cap at 2:3 (H = 1.5 W); narrow starts taller than that, so its cap is twice its start.
//   Raised 2026-11-06 (wide 36 -> 48, medium 30 -> 40, narrow 26 -> 30): mid-size lists (about 250 to 700 on
//   wide) grow taller with bigger birds instead of stopping early. Narrow stays at 30, the most that keeps a
//   200-bird list on its starting stage (tests/pack.test.ts "small lists keep their layouts").
// - minBase: the smallest acceptable base size at all. Below it the stage keeps growing past maxH (huge lists).
// denseFrom: from this many species, even layouts are packed dense: one GAP between birds and a settling pass
// that closes the edge's loose lattice of small stickers (set where lists stopped meeting the old floors).
export const LAYOUTS = [
  { name: 'wide', W: 1120, H: 700, stretch: 1.7, F: 64, minWidth: 880, maxWidth: 1152, minBase: 14, floor: 48, maxH: 1680, denseFrom: 380 },
  { name: 'medium', W: 700, H: 800, stretch: 1.0, F: 56, minWidth: 540, maxWidth: 880, minBase: 12, floor: 40, maxH: 1050, denseFrom: 380 },
  { name: 'narrow', W: 350, H: 900, stretch: 0.55, F: 40, minWidth: 0, maxWidth: 540, minBase: 10, floor: 30, maxH: 1800, denseFrom: 250 },
] as const

