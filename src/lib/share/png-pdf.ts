// Worker-safe RGB (or RGBA) PNG and single-page PDF wrappers around the same Up-filtered zlib stream.
import { Zlib } from 'fflate'

let crcTable: Uint32Array | undefined

/** Standard PNG CRC, with a completed prior CRC accepted for incremental updates. */
export function crc32(bytes: Uint8Array, crc = 0): number {
  if (!crcTable) {
    crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
      let c = n
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0)
      return c >>> 0
    })
  }
  let c = crc ^ 0xffffffff
  for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function positiveInteger(n: number): boolean { return Number.isSafeInteger(n) && n > 0 }

/** Drop alpha (the caller paints opaque paper), or keep it with `alpha`; PNG filter 2 carries across strip boundaries. */
export function filterUp(rgba: Uint8Array | Uint8ClampedArray, width: number, rows: number, prev: Uint8Array | null, alpha = false): { out: Uint8Array; last: Uint8Array } {
  const ch = alpha ? 4 : 3
  const stride = ch * width
  if (!positiveInteger(width) || !positiveInteger(rows) || rgba.length !== width * rows * 4 || (prev !== null && prev.length !== stride)) {
    throw new Error('invalid poster strip')
  }
  const out = new Uint8Array(rows * (stride + 1))
  const last = prev ? new Uint8Array(prev) : new Uint8Array(stride)
  for (let y = 0; y < rows; y++) {
    const row = y * (stride + 1)
    out[row] = 2
    for (let x = 0; x < width; x++) {
      for (let c = 0; c < ch; c++) {
        const i = ch * x + c, value = rgba[(y * width + x) * 4 + c]
        out[row + 1 + i] = value - last[i]
        last[i] = value
      }
    }
  }
  return { out, last }
}

export type ZlibSink = { push(b: Uint8Array): Promise<void>; end(): Promise<Uint8Array[]> }

export function createZlibSink(opts: { native?: boolean } = {}): ZlibSink {
  const chunks: Uint8Array[] = []
  let ended = false
  if (opts.native !== false && typeof CompressionStream !== 'undefined') {
    const stream = new CompressionStream('deflate')
    const writer = stream.writable.getWriter(), reader = stream.readable.getReader()
    // Drain from the first write: awaiting writes before reading can deadlock on incompressible input.
    const drained = (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (value.length) chunks.push(value)
        }
      } finally { reader.releaseLock() }
    })()
    // Keep an early read failure handled until end() joins it; writer errors still reject push().
    void drained.catch(() => {})
    return {
      async push(b) {
        if (ended) throw new Error('zlib stream ended')
        // CompressionStream accepts ArrayBuffer views, including those with a byte offset.
        await writer.write(b as Uint8Array<ArrayBuffer>)
      },
      async end() {
        if (ended) throw new Error('zlib stream ended')
        ended = true
        try { await writer.close(); await drained } finally { writer.releaseLock() }
        return chunks
      },
    }
  }
  const stream = new Zlib({ level: 6 }, (chunk) => { if (chunk.length) chunks.push(chunk) })
  return {
    async push(b) {
      if (ended) throw new Error('zlib stream ended')
      stream.push(b)
    },
    async end() {
      if (ended) throw new Error('zlib stream ended')
      ended = true
      stream.push(new Uint8Array(0), true)
      return chunks
    },
  }
}

const ascii = (s: string) => new TextEncoder().encode(s)
function u32(n: number): Uint8Array {
  const b = new Uint8Array(4)
  new DataView(b.buffer).setUint32(0, n)
  return b
}
function dimensions(width: number, height: number): void {
  if (!positiveInteger(width) || !positiveInteger(height) || width > 0x7fffffff || height > 0x7fffffff) throw new Error('invalid poster dimensions')
}
function chunk(type: string, data: Uint8Array): Uint8Array[] {
  const name = ascii(type), head = new Uint8Array(8)
  head.set(u32(data.length)); head.set(name, 4)
  // Keep the compressed data as a part, rather than copying it into a second large buffer.
  return [head, data, u32(crc32(data, crc32(name)))]
}

/** `alpha`: colour type 6 (RGBA, from filterUp's `alpha`), else 2 (RGB). */
export function pngParts(width: number, height: number, zlib: Uint8Array[], dpi = 150, alpha = false): Uint8Array[] {
  dimensions(width, height)
  const ihdr = new Uint8Array(13)
  ihdr.set(u32(width)); ihdr.set(u32(height), 4); ihdr.set([8, alpha ? 6 : 2, 0, 0, 0], 8)
  const phys = new Uint8Array(9), ppm = Math.round(dpi / 0.0254)
  phys.set(u32(ppm)); phys.set(u32(ppm), 4); phys[8] = 1
  // sRGB with rendering intent 0 (perceptual): the canvas pixels are sRGB, so viewers and print shops need not guess.
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunk('IHDR', ihdr), ...chunk('sRGB', new Uint8Array([0])), ...chunk('pHYs', phys)]
  for (const b of zlib) parts.push(...chunk('IDAT', b))
  parts.push(...chunk('IEND', new Uint8Array(0)))
  return parts
}

export function pdfParts(width: number, height: number, page: readonly [number, number], zlib: Uint8Array[]): Uint8Array[] {
  dimensions(width, height)
  if (page.some((p) => !Number.isFinite(p) || p <= 0)) throw new Error('invalid poster page')
  const [w, h] = page.map((n) => String(Number(n.toFixed(2))))
  const parts: Uint8Array[] = [], offsets = [0]
  let position = 0
  const add = (b: Uint8Array) => { parts.push(b); position += b.length }
  const text = (s: string) => add(ascii(s))
  const object = (id: number, body: string) => { offsets[id] = position; text(`${id} 0 obj\n${body}\nendobj\n`) }
  text('%PDF-1.4\n')
  add(new Uint8Array([37, 226, 227, 207, 211, 10]))
  object(1, '<< /Type /Catalog /Pages 2 0 R >>')
  object(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  object(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`)
  offsets[4] = position
  const length = zlib.reduce((n, b) => n + b.length, 0)
  // DeviceRGB, not an ICC-based sRGB space: embedding a profile would add ~3 KB and an extra object for a value
  // every common viewer already assumes for untagged RGB. The PNG carries an explicit sRGB chunk instead.
  text(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors 3 /BitsPerComponent 8 /Columns ${width} >> /Length ${length} >>\nstream\n`)
  for (const b of zlib) add(b)
  text('\nendstream\nendobj\n')
  const content = `q ${w} 0 0 ${h} 0 0 cm /Im0 Do Q\n`
  object(5, `<< /Length ${ascii(content).length} >>\nstream\n${content}endstream`)
  const start = position
  text('xref\n0 6\n0000000000 65535 f \n')
  for (const offset of offsets.slice(1)) text(`${String(offset).padStart(10, '0')} 00000 n \n`)
  text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`)
  return parts
}
