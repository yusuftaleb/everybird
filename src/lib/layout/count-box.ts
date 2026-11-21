// The species count's text box, from font metrics, and the elliptical hole kept empty around it. One source of truth
// for the collage (Tally draws it, the packer reserves its hole), the share images (countLayout) and the link preview.
// The layout worker can't measure DOM text, so the widths are each glyph's advance, measured once in Chromium from the
// served fonts at 1000px (2026-11-06) and kept here. Each width is the widest of the faces that may draw the count:
// - Cabinet Grotesk 700 (DESIGN.md's display face; the link preview loads it on its own, og-server.ts);
// - Satoshi 700, tabular (the app's Fontshare stylesheet, which asks for Satoshi and Cabinet in one request, gets
//   Satoshi only, so `--font-display` falls back to Satoshi; tabular-nums there makes every digit 0.66em);
// - Satoshi 700, proportional (canvas text ignores font-variant-numeric: the share images).
// So the box holds whichever face draws it. Satoshi is the widest for every glyph (its "0" 0.705em proportional,
// the rest 0.66em tabular; Cabinet's widest digit is 0.655em, its "1" 0.323em).
//
// Advances in em (1000px measures / 1000), before tracking ("." added 2026-11-15 and "/" 0.407, " " 0.270 added with fontkit from the same served
// woff2 files, scripts/dev/measure-count-glyphs.ts, which reproduces every other column here exactly):
//            0      1      2      3      4      5      6      7      8      9      ,      .
// Cabinet  0.655  0.323  0.595  0.615  0.624  0.623  0.606  0.507  0.606  0.611  0.220  0.220
// Sat tab  0.660  0.660  0.660  0.660  0.660  0.660  0.660  0.660  0.660  0.660  0.291  0.291
// Sat prop 0.705  0.398  0.589  0.569  0.646  0.600  0.620  0.538  0.641  0.620  0.291  0.291
// es, pt and nl group with "." (src/i18n/format.ts), as wide as "," in every face: so the drawn count ("1.089") is never
// wider than the geometry's en-US text ("1,089"), and every language shares one hole.
// Vertical (em): Satoshi's digits rise 0.745 above the baseline (Cabinet 0.68) and the comma drops 0.115 below it; on
// a line box of line-height 0.85 the ink spans 0.065..0.925 (Satoshi) or 0.04..0.836 (Cabinet) of the em from the top.
// Geist Mono 500 (the label): 0.6em per character, caps 0.726em, an accented capital ("É", pt's "ESPÉCIES") 0.909em;
// its normal line box is 1.3em (ascent 1.005 + descent 0.295), so the line box holds the accent too.
// The label is sized for COUNT_LABEL_CHARS characters whatever the language says, so the hole is the same in every one.

import { formatInt } from '../../i18n/format'
import type { Ui } from '../../i18n/messages/en'

/** The table above, 0-9 then ",", per face (scripts/dev/measure-count-glyphs.ts checks itself against it). */
export const ADV_TABLE = {
  cabinet: [0.655, 0.323, 0.595, 0.615, 0.624, 0.623, 0.606, 0.507, 0.606, 0.611, 0.22],
  satTab: [0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.66, 0.291],
  satProp: [0.705, 0.398, 0.589, 0.569, 0.646, 0.6, 0.62, 0.538, 0.641, 0.62, 0.291],
} as const
const ADV: Record<string, number> = {
  '0': 0.705, '1': 0.66, '2': 0.66, '3': 0.66, '4': 0.66, '5': 0.66, '6': 0.66, '7': 0.66, '8': 0.66, '9': 0.66, ',': 0.291,
  '.': 0.291, '/': 0.407, ' ': 0.27,
}
/** The number's tracking (em per character), as .eb-num and the share images draw it. */
const NUM_TRACK = -0.02
/** Rounding, hinting and kerning: every width is taken this much wider. */
const SAFETY = 1.02
/** The number's ink and line box, top to bottom (em): the line box (0.85) or the comma's foot (0.925), whichever is lower. */
export const NUM_LINE = 0.85
const NUM_INK = 0.925
/** Digits' height above the baseline (em), the taller face's (Satoshi 0.745; Cabinet 0.68). */
export const DIGIT_CAP = 0.745
/** How far the comma's foot drops below the baseline (em; both faces about 0.115). */
export const COMMA_DROP = 0.12
/** The geometry's label (measuring only; what is drawn is the UI language's `count.label`, upper-cased). */
export const LABEL = 'SPECIES'
/**
 * The label box holds this many characters, the longest label across the languages ("ESPECIES", "ESPÉCIES" 8;
 * "SPECIES", "SOORTEN" 7). A new language's `count.label` must fit it, counted in labelCells (tests/count-box.test.ts).
 */
export const COUNT_LABEL_CHARS = 8
/**
 * With a goal the share images' label reads "/ 150 SPECIES" (share.bigYear.ofTarget, the number as large as without
 * one): its box holds the target's en-US digits and this many characters more, the words around the number in the
 * longest language ("sur  espèces", "van  soorten" 12). tests/count-box.test.ts checks every language's against it.
 */
export const GOAL_LABEL_CHARS = 12
/** The goal label's width in characters for `target` (labelEm's `cells`). */
export const goalLabelCells = (target: number): number => GOAL_LABEL_CHARS + countText(target).length
/** Full-width characters: kana, Han, CJK punctuation and full-width forms. About 1em each, wider than Geist Mono's 0.6em. */
export const WIDE_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u3000-\u303f\u30fc\uff00-\uffef]/u
/** A label's width in Geist Mono characters: a full-width character (WIDE_CHAR) counts as two, so COUNT_LABEL_CHARS
 *  stays a width limit (two cells, 1.32em with tracking, hold one CJK character's 1em). */
export function labelCells(label: string): number {
  let n = 0
  for (const ch of label) n += WIDE_CHAR.test(ch) ? 2 : 1
  return n
}
/** Geist Mono: advance per character and the label's tracking (em), caps height, normal line box. */
export const MONO_EM = 0.6, MONO_TRACK = 0.06, MONO_CAP = 0.73, MONO_LINE = 1.3
/** Geist Mono 500's accented capital's ink top above the baseline (em; "É" 0.909): the share images' label box. */
export const MONO_CAP_ACCENT = 0.91

/** The count's geometry text, en-US: "7", "197", "1,089", "11,019". The boxes and countScale key on it in every language. */
export const countText = (n: number): string => Math.max(0, Math.round(n)).toLocaleString('en-US')
/** The count as drawn, in the UI language: "1,089", "1.089" (src/i18n/format.ts formatInt). Never wider than countText. */
export const countDisplay = (n: number, num: Ui['num']): string => formatInt(Math.max(0, Math.round(n)), num)

/** The number's width in em at its tracking (the widest face's advances, plus SAFETY). */
export function numberEm(text: string): number {
  let em = 0
  for (const ch of text) em += (ADV[ch] ?? 0.705) + NUM_TRACK
  return em * SAFETY
}
/** The label's width in em at its tracking (the last letter's tracking too, as the DOM box counts it), for
 *  COUNT_LABEL_CHARS characters (or `cells`, a goal's label: goalLabelCells): the same in every language. */
export const labelEm = (cells: number = COUNT_LABEL_CHARS): number => cells * (MONO_EM + MONO_TRACK) * SAFETY

/**
 * How much smaller the collage's number is drawn than the layout's F: five digits ("11,019", six characters) are drawn
 * at 85%, so the hole doesn't eat the middle of the collage; shorter counts at F. Tally and the packer both use it.
 */
export const countScale = (text: string): number => (text.length >= 6 ? 0.85 : 1)

/** A box [x0, y0, x1, y1] about the hole's centre (0, 0), y down. */
export type Rect = [x0: number, y0: number, x1: number, y1: number]
/** The count's text: the number's box over the label's, about the hole's centre, in any one unit. */
export type CountBoxes = { num: Rect; label: Rect }
/**
 * The hole kept empty for the count: every point within `pad` of the text, a rounded box hugging the number over the
 * label (the two boxes and the bridge between them, grown by pad with round corners). Centred on the stage's centre.
 */
export type Hole = CountBoxes & { pad: number }

/**
 * The boxes of a block drawn as one centred column: the number (numW x numH) over the label (labelW x labelH), `gap`
 * between them, each centred horizontally and the column vertically on the centre.
 */
export function columnBoxes(numW: number, numH: number, gap: number, labelW: number, labelH: number): CountBoxes {
  const h = numH + gap + labelH
  return { num: [-numW / 2, -h / 2, numW / 2, -h / 2 + numH], label: [-labelW / 2, h / 2 - labelH, labelW / 2, h / 2] }
}

/** The hole's rects before padding: the number's, the label's and the bridge between them (the narrower one's width). */
export function holeRects(h: Hole): Rect[] {
  const { num, label } = h
  const half = Math.min(num[2], label[2])
  const out: Rect[] = [num, label]
  if (label[1] > num[3] && half > 0) out.push([-half, num[3], half, label[1]])
  return out
}

/** The distance between two rects (0 when they touch or overlap). */
export function rectGap(a: Rect, b: Rect): number {
  const dx = Math.max(0, b[0] - a[2], a[0] - b[2]), dy = Math.max(0, b[1] - a[3], a[1] - b[3])
  return Math.hypot(dx, dy)
}

/** Does the rect r (about the hole's centre) reach into the hole (come within pad of the text)? */
export function touchesHole(r: Rect, h: Hole): boolean {
  if (!isHole(h)) return false
  return holeRects(h).some((q) => rectGap(r, q) <= h.pad)
}

/** A hole with nothing in it (share images without a count, tests): it keeps no cell empty. */
export const NO_HOLE: Hole = { num: [0, 0, 0, 0], label: [0, 0, 0, 0], pad: 0 }
export const isHole = (h: Hole): boolean => h.pad > 0 || holeRects(h).some((r) => r[2] > r[0] && r[3] > r[1])

/** The hole's half extents [x, y] from its centre: the furthest its edge reaches sideways and up or down. */
export function holeExtent(h: Hole): [number, number] {
  if (!isHole(h)) return [0, 0]
  const rs = holeRects(h)
  return [Math.max(...rs.map((r) => Math.max(-r[0], r[2]))) + h.pad, Math.max(...rs.map((r) => Math.max(-r[1], r[3]))) + h.pad]
}

/** The hole's area, near enough for the packer's size estimate (the padded rects, each with round corners). */
export function holeArea(h: Hole): number {
  if (!isHole(h)) return 0
  const p = h.pad
  return holeRects(h).reduce((a, [x0, y0, x1, y1], i) => {
    const w = x1 - x0, ht = y1 - y0
    // The number and the label grown by pad all round; the bridge only sideways (the others cover its ends).
    return a + (i < 2 ? (w + 2 * p) * (ht + 2 * p) - (4 - Math.PI) * p * p : w * ht)
  }, 0)
}

/** The same hole k times bigger (share images pass it as fractions of the frame's width). */
export function scaleHole(h: Hole, k: number): Hole {
  const s = (r: Rect): Rect => [r[0] * k, r[1] * k, r[2] * k, r[3] * k]
  return { num: s(h.num), label: s(h.label), pad: h.pad * k }
}

// The collage (Tally, collage.css): the number is F · countScale layout units (it is set in cqw: --f) on a 0.85 line
// box, over a fixed 12px .eb-mono label (a 15.6px line box) 6px below, the column centred on the stage centre. Layout
// units are CSS px at the layout's width W, so the label's px are W / stage px units: the layout serves stages from
// minWidth (a 320px phone's 288px for narrow) to maxWidth px wide, and the boxes hold the text at every one of them.
const LABEL_PX = 12, GAP_PX = 6, MIN_STAGE_PX = 288
export type CountLayout = { W: number; F: number; minWidth?: number; maxWidth?: number }

/** The collage count's boxes in layout units, holding the text on every stage width the layout serves. */
export function collageBoxes(count: number, layout: CountLayout): CountBoxes {
  const text = countText(count)
  const S = layout.F * countScale(text)
  const uHi = layout.W / Math.max(layout.minWidth ?? 0, MIN_STAGE_PX) // layout units per CSS px, at most
  const uLo = layout.maxWidth ? layout.W / layout.maxWidth : uHi // and at least
  const tail = (GAP_PX + MONO_LINE * LABEL_PX) // the column below the number's line box, px
  // The column's top is at -(0.85 S + tail · u) / 2: highest at uHi. The number's ink ends NUM_INK S below it (the
  // comma's foot), lowest at uLo. The label's line box spans [h / 2 - 15.6 u, h / 2], h = 0.85 S + tail · u.
  const numW = numberEm(text) * S, labelW = labelEm() * LABEL_PX * uHi
  const top = -(NUM_LINE * S + tail * uHi) / 2
  const numBottom = -(NUM_LINE * S + tail * uLo) / 2 + NUM_INK * S
  const hHi = NUM_LINE * S + tail * uHi
  return {
    num: [-numW / 2, top, numW / 2, numBottom],
    label: [-labelW / 2, hHi / 2 - MONO_LINE * LABEL_PX * uHi, labelW / 2, hHi / 2],
  }
}

/** How far the reader's text size may grow the collage's label (Tally): at most this times its 12px. */
export const LABEL_GROW_MAX = 1.25

/**
 * The collage label's font size bounds, in cqw of the stage (100 = the stage's width), that keep collageBoxes true
 * whatever the reader's text size or page zoom: the boxes hold the 12px label (and its 6px gap, which scale with it)
 * at up to uHi layout units per px, i.e. on a stage as narrow as max(minWidth, 288) px; so the label may be at most
 * 12 px x stage / that width (`max`), which on a stage wider than that lets it grow, and on a narrower one (a page
 * zoomed to 200% makes a 390px phone's stage 163 CSS px) shrinks it with the stage. `min`: the smallest tail the
 * number's box allows (12 px at maxWidth), so the number never sits lower than the box. Tally draws
 * clamp(min, max(12px, .75rem) capped at LABEL_GROW_MAX, max): never more than the hole holds.
 */
export function labelBounds(layout: CountLayout): { min: number; max: number } {
  const narrowest = Math.max(layout.minWidth ?? 0, MIN_STAGE_PX)
  return { min: layout.maxWidth ? (LABEL_PX * 100) / layout.maxWidth : 0, max: (LABEL_PX * 100) / narrowest }
}

/** The count's air, in F: 0.06 for a single bird, rising in a straight line to 0.17 at PAD_FULL_AT birds, and 0.17 above. */
export const PAD_SHORT = 0.06, PAD_LONG = 0.17, PAD_FULL_AT = 20
/**
 * Air between the count's text and the hole's edge, in layout units (the packer keeps GAP around every sticker too).
 * A filter that leaves a few birds has a small count, and its label box (eight characters wide) is much wider than the
 * number, so the full air of 0.17 F kept those birds far from the count: it rises with the count from 0.06 F (one bird)
 * to 0.17 F (PAD_FULL_AT birds), and a list of 20 or more keeps 0.17 F, where it always was. The 0.17 F keeps a
 * three-digit count's hole where the old ellipse was (wide 197: about 74 x 52 units from the centre). The packer's hole
 * is the text grown by this pad, so no sticker enters the text's boxes.
 */
export function collagePad(layout: { F: number }, count: number): number {
  const short = Math.min(1, Math.max(0, (PAD_FULL_AT - count) / (PAD_FULL_AT - 1)))
  return (PAD_LONG - (PAD_LONG - PAD_SHORT) * short) * layout.F
}

/** The hole (layout units) the packer keeps empty at the stage centre for `count` species. None for F = 0. */
export function collageHole(count: number, layout: CountLayout): Hole {
  if (!(layout.F > 0)) return NO_HOLE
  return { ...collageBoxes(count, layout), pad: collagePad(layout, count) }
}
