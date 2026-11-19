// The print poster's sizes and strips. Pure: no DOM, nothing from image.ts (image.ts imports this file).
//
// A poster is an ISO A size or a US poster size at 150 dpi, portrait or landscape (the dialog's orientation): a landscape
// poster is the same size turned, its width and height swapped (printPx, printPt, printCm, printIn, printDesign). It is laid
// out like the share images, 1080 design units across its short side (PRINT_DESIGN_W), and drawn at printScale(size) device
// px per unit, the same in both. One pack serves every size of one shape (printPackH): the A sizes' is made at
// PRINT_DESIGN_H, and fitPack absorbs the small difference to each size's own printDesignH; the US sizes' at their exact
// height (2:3, 12 × 18 and 24 × 36 in, 1620; 3:4, 18 × 24 in, 1440). An A1 (3508 × 4967) or a 24 × 36 in (3600 × 5400)
// is over iOS Safari's canvas cap (IOS_CANVAS_AREA), so posters are painted in horizontal strips of at most STRIP_AREA px.

export type IsoSize = 'A4' | 'A3' | 'A2' | 'A1'
export type UsSize = 'US12x18' | 'US18x24' | 'US24x36'
export type PrintSize = IsoSize | UsSize
export const PRINT_SIZES: readonly PrintSize[] = ['A4', 'A3', 'A2', 'A1', 'US12x18', 'US18x24', 'US24x36']

/** Width and height in px at 150 dpi, portrait. */
export const PRINT_PX: Record<PrintSize, readonly [number, number]> = {
  A4: [1240, 1754], A3: [1754, 2480], A2: [2480, 3508], A1: [3508, 4967],
  US12x18: [1800, 2700], US18x24: [2700, 3600], US24x36: [3600, 5400],
}
/** Width and height in PDF points (1/72 inch), the ISO and US sizes. */
export const PRINT_PT: Record<PrintSize, readonly [number, number]> = {
  A4: [595.28, 841.89], A3: [841.89, 1190.55], A2: [1190.55, 1683.78], A1: [1683.78, 2383.94],
  US12x18: [864, 1296], US18x24: [1296, 1728], US24x36: [1728, 2592],
}
/** Width and height in cm, the ISO sizes (the US sizes' exact metric equivalents). */
export const PRINT_CM: Record<PrintSize, readonly [number, number]> = {
  A4: [21, 29.7], A3: [29.7, 42], A2: [42, 59.4], A1: [59.4, 84.1],
  US12x18: [30.48, 45.72], US18x24: [45.72, 60.96], US24x36: [60.96, 91.44],
}
export const PRINT_IN: Record<UsSize, readonly [number, number]> = {
  US12x18: [12, 18], US18x24: [18, 24], US24x36: [24, 36],
}
export const isUsSize = (s: PrintSize): s is UsSize => s in PRINT_IN
export const PRINT_DPI = 150
/** The print card's width in design units, as the share images. */
export const PRINT_DESIGN_W = 1080
/** The height the A sizes' pack is made at (every A size's printDesignH is within 0.2% of it). */
export const PRINT_DESIGN_H = 1527

/** Device px per design unit: A4 1.148, A3 1.624, A2 2.296, A1 3.248, 12 × 18 in 1.667, 18 × 24 in 2.5, 24 × 36 in 3.333. The same for a landscape poster: its short side is the width of the portrait one, so the type and the sticker tiers match. */
export const printScale = (s: PrintSize): number => PRINT_PX[s][0] / PRINT_DESIGN_W
/** The size's long side in design units (A4 about 1527.7, A1 about 1529.2, 2:3 1620, 3:4 1440): the portrait height, the landscape width. */
export const printDesignH = (s: PrintSize): number => PRINT_PX[s][1] / printScale(s)

/**
 * A poster's width and height in px at 150 dpi: portrait as PRINT_PX, landscape with the two swapped (an A4 landscape
 * is 1754 × 1240). Every other table below takes the same `landscape` flag.
 */
export const printPx = (s: PrintSize, landscape = false): readonly [number, number] => (landscape ? [PRINT_PX[s][1], PRINT_PX[s][0]] : PRINT_PX[s])
/** Width and height in PDF points, swapped for landscape. */
export const printPt = (s: PrintSize, landscape = false): readonly [number, number] => (landscape ? [PRINT_PT[s][1], PRINT_PT[s][0]] : PRINT_PT[s])
/** Width and height in cm, swapped for landscape. */
export const printCm = (s: PrintSize, landscape = false): readonly [number, number] => (landscape ? [PRINT_CM[s][1], PRINT_CM[s][0]] : PRINT_CM[s])
export const printIn = (s: UsSize, landscape = false): readonly [number, number] => (landscape ? [PRINT_IN[s][1], PRINT_IN[s][0]] : PRINT_IN[s])
export const printPackH = (s: PrintSize): number => (isUsSize(s) ? Math.round(printDesignH(s)) : PRINT_DESIGN_H)
/**
 * The card's design size in units, width by height: 1080 by printDesignH(s) for a portrait poster, the same two swapped
 * for landscape (the short side is always PRINT_DESIGN_W units, so the landscape card is printDesignH(s) by 1080).
 */
export const printDesign = (s: PrintSize, landscape = false): [number, number] => (landscape ? [printDesignH(s), PRINT_DESIGN_W] : [PRINT_DESIGN_W, printDesignH(s)])
/** A poster's file stem: "everybird-a2", "everybird-a2-landscape", "everybird-24x36in". */
export const printFileStem = (s: PrintSize, landscape = false): string =>
  `everybird-${isUsSize(s) ? `${PRINT_IN[s][0]}x${PRINT_IN[s][1]}in` : s.toLowerCase()}${landscape ? '-landscape' : ''}`

/** iOS Safari's largest canvas, in px. No canvas the poster makes may be larger. */
export const IOS_CANVAS_AREA = 16_777_216
/** A strip's largest area in px (about 1 MP, 4 MB of RGBA). */
export const STRIP_AREA = 1_048_576
/**
 * A strip's most rows in design units (about 8% of the card), so the current and the next strip never hold most of
 * the stickers at once on a small poster, and no strip is one long main-thread task.
 */
export const STRIP_DESIGN_ROWS = 120

/**
 * The strips that cover a `width` × `height` poster once, top to bottom: `rows` device rows each (the last one
 * shorter), whole rows so strip edges never fall inside a pixel.
 */
export function stripRanges(width: number, height: number, rows = Math.floor(STRIP_AREA / width)): { y: number; rows: number }[] {
  const step = Math.max(1, Math.floor(rows))
  const out: { y: number; rows: number }[] = []
  for (let y = 0; y < height; y += step) out.push({ y, rows: Math.min(step, height - y) })
  return out
}
