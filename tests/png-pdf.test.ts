import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { crc32, createZlibSink, filterUp, pdfParts, pngParts } from '../src/lib/share/png-pdf'

const width = 37, height = 23
const img = Uint8Array.from({ length: width * height * 4 }, (_, i) => {
  const pixel = Math.floor(i / 4), x = pixel % width, y = Math.floor(pixel / width)
  return i % 4 === 3 ? 255 : x < 18 ? (x * 7 + y * 11 + i % 4 * 29) % 256 : 220 - i % 4 * 20
})
function rgbOf(rgba: Uint8Array) {
  return Buffer.from(rgba.filter((_, i) => i % 4 !== 3))
}
async function encode(rgba: Uint8Array, w: number, strips: number[], native: boolean) {
  const sink = createZlibSink({ native })
  let prev: Uint8Array | null = null, y = 0
  const filtered: Uint8Array[] = []
  for (const rows of strips) {
    const { out, last } = filterUp(rgba.subarray(y * w * 4, (y + rows) * w * 4), w, rows, prev)
    filtered.push(out); prev = last; y += rows
    await sink.push(out)
  }
  return { chunks: await sink.end(), filtered: Buffer.concat(filtered) }
}
function unUp(filtered: Uint8Array, w: number) {
  const stride = 3 * w, rows = filtered.length / (stride + 1), rgb = Buffer.alloc(stride * rows)
  for (let y = 0; y < rows; y++) {
    expect(filtered[y * (stride + 1)]).toBe(2)
    for (let x = 0; x < stride; x++) rgb[y * stride + x] = (filtered[y * (stride + 1) + 1 + x] + (y ? rgb[(y - 1) * stride + x] : 0)) % 256
  }
  return rgb
}

it('CRC32 uses the standard polynomial and supports incremental calls', () => {
  const bytes = new TextEncoder().encode('123456789')
  expect(crc32(bytes)).toBe(0xcbf43926)
  expect(crc32(bytes.subarray(4), crc32(bytes.subarray(0, 4)))).toBe(crc32(bytes))
})

it('Up filtering drops alpha and carries the last RGB row without aliasing input', () => {
  const rgba = new Uint8Array([10, 20, 30, 0, 1, 2, 3, 255, 9, 22, 5, 100, 4, 1, 9, 0])
  const first = filterUp(rgba.subarray(0, 8), 2, 1, null)
  const second = filterUp(rgba.subarray(8), 2, 1, first.last)
  expect([...second.out]).toEqual([2, 255, 2, 231, 3, 255, 6])
  expect([...second.last]).toEqual([9, 22, 5, 4, 1, 9])
  rgba.fill(0)
  expect([...first.last]).toEqual([10, 20, 30, 1, 2, 3])
})

for (const native of [true, false]) describe(native ? 'CompressionStream' : 'fflate', () => {
  it('PNG decodes to identical RGB at 150 dpi with one strip or three; chunks have valid CRCs', async () => {
    const { chunks } = await encode(img, width, [10, 10, 3], native)
    const png = Buffer.concat(pngParts(width, height, chunks))
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height, info.channels]).toEqual([width, height, 3])
    expect(data).toEqual(rgbOf(img))
    expect((await sharp(png).metadata()).density).toBe(150)
    const single = await encode(img, width, [height], native)
    expect(await sharp(Buffer.concat(pngParts(width, height, single.chunks))).raw().toBuffer()).toEqual(data)
    const types: string[] = [], idat: Buffer[] = []
    for (let p = 8; p < png.length;) {
      const n = png.readUInt32BE(p), type = png.toString('ascii', p + 4, p + 8)
      types.push(type)
      expect(png.readUInt32BE(p + 8 + n)).toBe(crc32(png.subarray(p + 4, p + 8 + n)))
      if (type === 'IHDR') expect([...png.subarray(p + 16, p + 21)]).toEqual([8, 2, 0, 0, 0])
      if (type === 'sRGB') expect([n, png[p + 8]]).toEqual([1, 0])
      if (type === 'pHYs') expect([...png.subarray(p + 8, p + 17)]).toEqual([0, 0, 23, 18, 0, 0, 23, 18, 1])
      if (type === 'IDAT') idat.push(png.subarray(p + 8, p + 8 + n))
      p += 12 + n
    }
    expect(types).toEqual(['IHDR', 'sRGB', 'pHYs', ...chunks.map(() => 'IDAT'), 'IEND'])
    expect(Buffer.concat(idat)).toEqual(Buffer.concat(chunks))
  })

  it('inflates small and incompressible 6 MB input in 64 pushes without backpressure hanging', async () => {
    const small = await encode(img, width, [10, 10, 3], native)
    expect(inflateSync(Buffer.concat(small.chunks))).toEqual(small.filtered)
    let seed = 0x12345678
    const random = Uint8Array.from({ length: 2048 * 1024 * 4 }, () => {
      seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5
      return seed & 255
    })
    const large = await encode(random, 2048, Array(64).fill(16), native)
    expect(inflateSync(Buffer.concat(large.chunks)).equals(large.filtered)).toBe(true)
    expect(unUp(inflateSync(Buffer.concat(large.chunks)), 2048).equals(rgbOf(random))).toBe(true)
  }, 15000)

  it('PDF has byte-accurate xref offsets, A1 MediaBox, and the identical PNG image stream', async () => {
    const { chunks } = await encode(img, width, [10, 10, 3], native)
    const pdf = Buffer.concat(pdfParts(width, height, [1683.78, 2383.94], chunks))
    const text = pdf.toString('latin1')
    expect(text.slice(0, 8)).toBe('%PDF-1.4')
    expect(text).toContain('/MediaBox [0 0 1683.78 2383.94]')
    expect(text).toMatch(/\/Width 37 \/Height 23 [\s\S]*\/Predictor 15 \/Colors 3 \/BitsPerComponent 8 \/Columns 37/)
    const start = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(text)![1])
    expect(text.slice(start, start + 4)).toBe('xref')
    const offsets = text.slice(start).split('\n').slice(3, 8)
    offsets.forEach((line, i) => {
      expect(line).toMatch(/^\d{10} 00000 n /)
      const offset = Number(line.slice(0, 10))
      expect(text.slice(offset, offset + 7)).toBe(`${i + 1} 0 obj`)
    })
    const image = /4 0 obj\n[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(text)!
    const begin = image.index + image[0].length
    const stream = pdf.subarray(begin, begin + Number(image[1]))
    expect(stream).toEqual(Buffer.concat(chunks))
    expect(unUp(inflateSync(stream), width)).toEqual(rgbOf(img))
    expect(text).toContain('q 1683.78 0 0 2383.94 0 0 cm /Im0 Do Q')
    const us = Buffer.concat(pdfParts(width, height, [1728, 2592], chunks)).toString('latin1')
    expect(us).toContain('/MediaBox [0 0 1728 2592]')
    expect(us).toContain('q 1728 0 0 2592 0 0 cm /Im0 Do Q')
  })
})

it('uses fflate when CompressionStream is unavailable', async () => {
  vi.stubGlobal('CompressionStream', undefined)
  try {
    const sink = createZlibSink()
    await sink.push(new Uint8Array([1, 2, 3]))
    expect(inflateSync(Buffer.concat(await sink.end()))).toEqual(Buffer.from([1, 2, 3]))
  } finally { vi.unstubAllGlobals() }
})
