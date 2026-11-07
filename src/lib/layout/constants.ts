// Packing constants, values from build_lifelist.py (framer-site/scripts/lifelist).
export const EXP = 0.2 // "evened out": tile long side ~ mass ** EXP
export const EXP_TRUE = 1 / 3 // "true size": length ~ mass ** (1/3)
export const GAP = 2 // layout units kept between silhouettes
export const MAXUP = 1.5 // a filtered set may grow up to this much bigger than in the full collage

// W x H: starting stage in layout units (CSS px at that container width). stretch: x-stretch of the spiral on
// the starting stage; on a grown stage (H > the starting H) the spiral's x : y is stretch · H / grown H, the grown H
// counted up to maxH (pack.ts stretchAt), so the cluster follows the stage's aspect: a stage grown 1.5x taller packs
// as a round or tall cluster, not a wide oval.
// F: count font size (sets the hole). minWidth: narrowest container this layout serves.
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
  { name: 'wide', W: 1120, H: 700, stretch: 1.7, F: 64, minWidth: 880, minBase: 14, floor: 48, maxH: 1680, denseFrom: 380 },
  { name: 'medium', W: 700, H: 800, stretch: 1.0, F: 56, minWidth: 540, minBase: 12, floor: 40, maxH: 1050, denseFrom: 380 },
  { name: 'narrow', W: 350, H: 900, stretch: 0.55, F: 40, minWidth: 0, minBase: 10, floor: 30, maxH: 1800, denseFrom: 250 },
] as const

/** Ellipse radii [rx, ry] kept empty at the stage centre for the species count (number + small label). */
export const holeRadii = (F: number): [number, number] => [1.15 * F, 0.62 * F + 12]
