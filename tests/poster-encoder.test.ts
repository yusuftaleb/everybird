import { inflateSync } from 'node:zlib'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PosterEncoder } from '../src/lib/share/poster-encoder'
import { pngParts } from '../src/lib/share/png-pdf'
vi.mock('../src/lib/share/png-pdf', async (original) => {
  const m = await original<typeof import('../src/lib/share/png-pdf')>()
  return { ...m, pngParts: vi.fn(m.pngParts) }
})
import type { PrintWorkerReply, PrintWorkerRequest } from '../src/lib/share/print.worker'

const width = 7, height = 5
const rgba = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 13) % 256)
const rgb = Buffer.from(rgba.filter((_, i) => i % 4 !== 3))
function pdfImage(pdf: Buffer) {
  const text = pdf.toString('latin1')
  const m = /4 0 obj\n[\s\S]*?\/Length (\d+) >>\nstream\n/.exec(text)!
  const start = m.index + m[0].length
  const filtered = inflateSync(pdf.subarray(start, start + Number(m[1])))
  const out = Buffer.alloc(width * height * 3), stride = width * 3
  for (let y = 0; y < height; y++) for (let x = 0; x < stride; x++) {
    out[y * stride + x] = filtered[y * (stride + 1) + 1 + x] + (y ? out[(y - 1) * stride + x] : 0)
  }
  return out
}

it('rejects overflow, incomplete input and file before end', async () => {
  const encoder = new PosterEncoder(width, height, { native: false })
  expect(() => encoder.file('png', [1, 1])).toThrow(/end|ready/)
  await expect(encoder.strip(new Uint8ClampedArray(width * 6 * 4), 6)).rejects.toThrow(/rows|height/)
  await expect(encoder.end()).rejects.toThrow(/rows|height/)
})

it('rejects malformed strips without consuming rows', async () => {
  const encoder = new PosterEncoder(width, height, { native: false })
  await expect(encoder.strip(rgba, 0)).rejects.toThrow()
  await expect(encoder.strip(rgba, 1.5)).rejects.toThrow()
  await expect(encoder.strip(new Uint8ClampedArray(1), height)).rejects.toThrow()
  await encoder.strip(rgba, height)
  await encoder.end()
  expect(encoder.file('png', [1, 1]).size).toBeGreaterThan(0)
})

for (const native of [true, false]) describe(native ? 'native' : 'fallback', () => {
  it('makes PNG and PDF from one encoder, including concurrent strips in order and repeat downloads', async () => {
    const encoder = new PosterEncoder(width, height, { native })
    await Promise.all([
      encoder.strip(rgba.slice(0, width * 2 * 4), 2),
      encoder.strip(rgba.slice(width * 2 * 4), 3),
    ])
    await encoder.end()
    const png = encoder.file('png', [595.28, 841.89]), pdf = encoder.file('pdf', [595.28, 841.89])
    expect(png.type).toBe('image/png'); expect(pdf.type).toBe('application/pdf')
    const pixels = await sharp(Buffer.from(await png.arrayBuffer())).raw().toBuffer()
    expect(pixels).toEqual(rgb)
    expect(pdfImage(Buffer.from(await pdf.arrayBuffer()))).toEqual(pixels)
    vi.mocked(pngParts).mockClear()
    expect(Buffer.from(await encoder.file('png', [595.28, 841.89]).arrayBuffer())).toEqual(Buffer.from(await png.arrayBuffer()))
    expect(pngParts).not.toHaveBeenCalled() // the PNG's parts (and their CRCs) are built once
    await expect(encoder.strip(rgba, height)).rejects.toThrow(/end|closed/)
  })
})

afterEach(() => vi.unstubAllGlobals())
it('worker queues strips before end and returns took, encoded, PNG and PDF, with errors reported', async () => {
  const replies: PrintWorkerReply[] = []
  const scope: { onmessage?: (e: { data: PrintWorkerRequest }) => void; postMessage(r: PrintWorkerReply): void } = {
    postMessage: (r) => replies.push(r),
  }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('../src/lib/share/print.worker')
  const send = (data: PrintWorkerRequest) => scope.onmessage!({ data })
  send({ type: 'file', kind: 'png', page: [595.28, 841.89] })
  await vi.waitFor(() => expect(replies).toHaveLength(1))
  expect(replies[0]).toMatchObject({ type: 'error' })
  send({ type: 'begin', width, height })
  send({ type: 'strip', rgba: rgba.slice(0, width * 2 * 4).buffer, rows: 2 })
  send({ type: 'strip', rgba: rgba.slice(width * 2 * 4).buffer, rows: 3 })
  send({ type: 'end' })
  send({ type: 'file', kind: 'png', page: [595.28, 841.89] })
  send({ type: 'file', kind: 'pdf', page: [595.28, 841.89] })
  await vi.waitFor(() => expect(replies).toHaveLength(6))
  expect(replies.slice(1).map((r) => r.type)).toEqual(['took', 'took', 'encoded', 'file', 'file'])
  expect(replies[1]).toEqual({ type: 'took', rows: 2 })
  expect(replies[2]).toEqual({ type: 'took', rows: 3 })
  const encoded = replies[3], png = replies[4], pdf = replies[5]
  if (encoded.type !== 'encoded' || png.type !== 'file' || pdf.type !== 'file') throw new Error('wrong protocol')
  expect(encoded.bytes).toBeGreaterThan(0)
  expect(await sharp(Buffer.from(await png.blob.arrayBuffer())).raw().toBuffer()).toEqual(rgb)
  expect(pdfImage(Buffer.from(await pdf.blob.arrayBuffer()))).toEqual(rgb)
  send({ type: 'strip', rgba: rgba.slice().buffer, rows: height })
  await vi.waitFor(() => expect(replies).toHaveLength(7))
  expect(replies[6]).toMatchObject({ type: 'error' })
})

it('worker refuses a second begin while a poster is open, and allows one after it ends', async () => {
  const replies: PrintWorkerReply[] = []
  const scope: { onmessage?: (e: { data: PrintWorkerRequest }) => void; postMessage(r: PrintWorkerReply): void } = {
    postMessage: (r) => replies.push(r),
  }
  vi.stubGlobal('self', scope)
  vi.resetModules()
  await import('../src/lib/share/print.worker')
  const send = (data: PrintWorkerRequest) => scope.onmessage!({ data })
  send({ type: 'begin', width, height })
  send({ type: 'strip', rgba: rgba.slice(0, width * 2 * 4).buffer, rows: 2 })
  send({ type: 'begin', width: 1, height: 1 })
  await vi.waitFor(() => expect(replies).toHaveLength(2))
  expect(replies[0]).toEqual({ type: 'took', rows: 2 })
  expect(replies[1]).toMatchObject({ type: 'error', message: expect.stringMatching(/already open/) })
  // The open poster was kept: it still takes its remaining rows and ends.
  send({ type: 'strip', rgba: rgba.slice(width * 2 * 4).buffer, rows: 3 })
  send({ type: 'end' })
  send({ type: 'file', kind: 'png', page: [1, 1] })
  await vi.waitFor(() => expect(replies).toHaveLength(5))
  expect(replies.slice(2).map((r) => r.type)).toEqual(['took', 'encoded', 'file'])
  const png = replies[4]
  if (png.type !== 'file') throw new Error('wrong protocol')
  expect(await sharp(Buffer.from(await png.blob.arrayBuffer())).raw().toBuffer()).toEqual(rgb)
  send({ type: 'begin', width: 1, height: 1 })
  send({ type: 'strip', rgba: new Uint8ClampedArray(4).buffer, rows: 1 })
  await vi.waitFor(() => expect(replies).toHaveLength(6))
  expect(replies[5]).toEqual({ type: 'took', rows: 1 })
})

it('a transparent (alpha) poster is an RGBA PNG that keeps every pixel, and has no PDF', async () => {
  const encoder = new PosterEncoder(width, height, { native: false, alpha: true })
  await encoder.strip(rgba.subarray(0, width * 2 * 4), 2)
  await encoder.strip(rgba.subarray(width * 2 * 4), 3)
  await encoder.end()
  const png = Buffer.from(await encoder.file('png', [100, 100]).arrayBuffer())
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  expect(info.channels).toBe(4)
  expect(data).toEqual(Buffer.from(rgba))
  expect(() => encoder.file('pdf', [100, 100])).toThrow('no PDF')
})
