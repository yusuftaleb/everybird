// Collision masks: a coarse occupancy grid per sticker, same settings as the reference build_lifelist.py.
export const MASK = 24 // longest side in cells

export type Mask = { w: number; h: number; bits: Uint8Array } // row-major, 1 bit per cell, MSB first

export function maskDims(width: number, height: number): [number, number] {
  const w = width >= height ? MASK : Math.max(1, Math.round((MASK * width) / height))
  const h = height >= width ? MASK : Math.max(1, Math.round((MASK * height) / width))
  return [w, h]
}

// Area-average (PIL Image.BOX) downscale of one channel, rounded to 8 bits.
function boxResize(src: Uint8Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
  const out = new Uint8Array(dw * dh)
  const xs = sw / dw, ys = sh / dh
  for (let dy = 0; dy < dh; dy++) {
    const y0 = dy * ys, y1 = y0 + ys
    for (let dx = 0; dx < dw; dx++) {
      const x0 = dx * xs, x1 = x0 + xs
      let sum = 0
      for (let y = Math.floor(y0); y < Math.min(sh, Math.ceil(y1)); y++) {
        const wy = Math.min(y + 1, y1) - Math.max(y, y0)
        for (let x = Math.floor(x0); x < Math.min(sw, Math.ceil(x1)); x++) {
          sum += src[y * sw + x] * wy * (Math.min(x + 1, x1) - Math.max(x, x0))
        }
      }
      out[dy * dw + dx] = Math.round(sum / (xs * ys))
    }
  }
  return out
}

/** Full-resolution alpha (width x height) -> [w, h, base64 bits]; cell set when box-averaged alpha > threshold. */
export function maskFromAlpha(alpha: Uint8Array, width: number, height: number, threshold = 40): [number, number, string] {
  const [w, h] = maskDims(width, height)
  const cells = boxResize(alpha, width, height, w, h)
  const bits = new Uint8Array(Math.ceil((w * h) / 8))
  for (let i = 0; i < cells.length; i++) if (cells[i] > threshold) bits[i >> 3] |= 0x80 >> (i & 7)
  return [w, h, Buffer.from(bits).toString('base64')]
}

export function decodeMask(m: [number, number, string]): Mask {
  const [w, h, b64] = m
  const bin = atob(b64)
  const bits = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bits[i] = bin.charCodeAt(i)
  return { w, h, bits }
}

export function maskCell(m: Mask, x: number, y: number): boolean {
  const i = y * m.w + x
  return (m.bits[i >> 3] & (0x80 >> (i & 7))) !== 0
}
