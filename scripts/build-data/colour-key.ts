// One main colour per sticker, as one small integer that sorts like a rainbow (build-colours.ts writes it; the layout
// worker's By colour arrangement reads it, src/lib/layout/arrange.ts).
//
// Keys 0..179: a chromatic bird by the hue of its main colour, 2° a step, starting at crimson (345°) and going red,
// orange, yellow, green, blue, violet, pink. Keys 180..199: a neutral bird (black, grey, brown, white) by its mean
// lightness, dark to light, so the neutrals sort together after every colour.
// A visual name selects its key range. Within a vivid range, average the matching chromatic pixel keys
// (use the midpoint if none match). Without a name, use the pixel-only rule below.
//
// The pixels read: opaque ones (alpha >= 128) more than EDGE px from transparency, so the sticker's white die-cut border
// (1-2 px at 128 px) is left out. A pixel is chromatic when saturated and bright enough; in the orange range a brown
// (darker or duller) pixel counts as neutral. A bird is chromatic when at least CHROMA_SHARE of its pixels are; its hue
// is then the circular mean of the pixels in its most common 10° hue bin and the two beside it.
export const CHROMATIC_KEYS = 180
export const NEUTRAL_STEPS = 20
export const EDGE = 3
export const CHROMA_SHARE = 0.18
const START_HUE = 345

// Half-open ranges in key order. Pink ends where crimson starts again.
const RANGES = {
  red: [0, 15], orange: [15, 28], yellow: [28, 44], green: [44, 94],
  blue: [94, 138], purple: [138, 160], pink: [160, 180],
  brown: null, black: null, grey: null, white: null,
} as const
export type ColourName = keyof typeof RANGES

function hueKey(hue: number): number {
  return Math.round(((hue - START_HUE + 360) % 360) / 2) % CHROMATIC_KEYS
}

/** HSV of an 8-bit RGB pixel: h in degrees [0, 360), s and v in [0, 1]. */
function hsv(r: number, g: number, b: number): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn
  const v = mx / 255, s = mx ? d / mx : 0
  if (!d) return [0, s, v]
  let h = mx === r ? (g - b) / d : mx === g ? 2 + (b - r) / d : 4 + (r - g) / d
  h *= 60
  return [h < 0 ? h + 360 : h, s, v]
}

function chromatic(h: number, s: number, v: number): boolean {
  if (h >= 15 && h < 50) return s >= 0.5 && v >= 0.55 // orange and yellow-orange, not brown or buff
  return s >= 0.3 && v >= 0.3
}

/** Each pixel's distance (4-neighbour chamfer) to the nearest transparent pixel or the image's edge. */
function edgeDistance(rgba: Uint8Array | Buffer, w: number, h: number): Int32Array {
  const d = new Int32Array(w * h).fill(1 << 20)
  for (let i = 0; i < w * h; i++) if (rgba[i * 4 + 3] < 128) d[i] = 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x])
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = Math.min(d[y * w + x], at(x - 1, y) + 1, at(x, y - 1) + 1)
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) d[y * w + x] = Math.min(d[y * w + x], at(x + 1, y) + 1, at(x, y + 1) + 1)
  return d
}

/** The sticker's colour key (see the header) from its RGBA pixels; null when it has no inner opaque pixel. */
export function colourKey(rgba: Uint8Array | Buffer, w: number, h: number, name?: ColourName): number | null {
  const range = name === undefined ? undefined : RANGES[name]
  if (name !== undefined && range === undefined) throw new Error(`Unknown colour name: ${name}`)
  let namedSum = 0, namedCount = 0
  const dist = edgeDistance(rgba, w, h)
  const bins = new Float64Array(36)
  const hues: number[] = []
  let opaque = 0, chroma = 0, light = 0
  for (let i = 0; i < w * h; i++) {
    if (dist[i] <= EDGE) continue
    const r = rgba[i * 4], g = rgba[i * 4 + 1], b = rgba[i * 4 + 2]
    opaque++
    light += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
    if (range === null) continue
    const [hu, s, v] = hsv(r, g, b)
    if (!chromatic(hu, s, v)) continue
    if (range) {
      const key = hueKey(hu)
      if (key >= range[0] && key < range[1]) {
        namedSum += key
        namedCount++
      }
      continue
    }
    chroma++
    bins[Math.floor(hu / 10) % 36]++
    hues.push(hu)
  }
  if (!opaque) return null
  if (range) return namedCount ? Math.round(namedSum / namedCount) : Math.floor((range[0] + range[1]) / 2)
  if (chroma / opaque < CHROMA_SHARE) return CHROMATIC_KEYS + Math.min(NEUTRAL_STEPS - 1, Math.round((light / opaque) * (NEUTRAL_STEPS - 1)))
  let peak = 0, best = -1
  for (let k = 0; k < 36; k++) {
    const sum = bins[(k + 35) % 36] + bins[k] + bins[(k + 1) % 36]
    if (sum > best) { best = sum; peak = k }
  }
  let sx = 0, sy = 0
  for (const hu of hues) {
    const k = Math.floor(hu / 10) % 36
    if (k !== peak && k !== (peak + 1) % 36 && k !== (peak + 35) % 36) continue
    sx += Math.cos((hu * Math.PI) / 180); sy += Math.sin((hu * Math.PI) / 180)
  }
  const mean = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360
  return hueKey(mean)
}
