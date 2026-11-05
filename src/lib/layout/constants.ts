// Packing constants, values from build_lifelist.py (framer-site/scripts/lifelist).
export const EXP = 0.2 // "evened out": tile long side ~ mass ** EXP
export const EXP_TRUE = 1 / 3 // "true size": length ~ mass ** (1/3)
export const GAP = 2 // layout units kept between silhouettes
export const MAXUP = 1.5 // a filtered set may grow up to this much bigger than in the full collage

// W x H: starting stage in layout units (CSS px at that container width). stretch: x-stretch of the spiral.
// F: count font size (sets the hole). minWidth: narrowest container this layout serves. minBase: smallest
// acceptable base size before the stage grows taller instead (large lists).
export const LAYOUTS = [
  { name: 'wide', W: 1120, H: 700, stretch: 1.7, F: 64, minWidth: 880, minBase: 14 },
  { name: 'medium', W: 700, H: 800, stretch: 1.0, F: 56, minWidth: 540, minBase: 12 },
  { name: 'narrow', W: 350, H: 900, stretch: 0.55, F: 40, minWidth: 0, minBase: 10 },
] as const

/** Ellipse radii [rx, ry] kept empty at the stage centre for the species count (number + small label). */
export const holeRadii = (F: number): [number, number] => [1.15 * F, 0.62 * F + 12]
