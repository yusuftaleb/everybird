// masks.v3.bin (src/lib/layout/mask-file.ts): every mask it holds decodes to exactly what the per-order JSON gives.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import { unzlibSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { masksFile, readOrderMasks } from '../scripts/build-data/data-files'
import { decodeMask } from '@/lib/layout/mask'
import { decodeMaskFile, encodeMaskFile, readMaskFile } from '@/lib/layout/mask-file'

const data = join(process.cwd(), 'public/data')
const orders = readOrderMasks(join(data, 'masks'))
const file = readFileSync(join(data, 'masks.v3.bin'))
const buf = () => file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer

describe('masks.v3.bin', () => {
  it('is the build of the per-order JSON (rerun data-files.ts when it fails)', () => {
    expect(Buffer.from(masksFile(orders)).equals(file)).toBe(true)
  })

  it('every mask, all 11k, is bit for bit the JSON mask', async () => {
    const all = await readMaskFile(buf()) // DecompressionStream, as the browser and the Worker read it
    expect(Object.keys(all).sort()).toEqual([...orders.keys()].sort())
    let n = 0
    for (const [ord, rec] of orders) {
      expect(Object.keys(all[ord]).sort(), ord).toEqual(Object.keys(rec).sort())
      for (const [code, raw] of Object.entries(rec)) {
        const want = decodeMask(raw), got = all[ord][code]
        expect(got.w, code).toBe(want.w)
        expect(got.h, code).toBe(want.h)
        expect(Buffer.from(got.bits).equals(Buffer.from(want.bits)), code).toBe(true)
        n++
      }
    }
    expect(n).toBeGreaterThan(11_000)
    // fflate's inflate (the fallback without DecompressionStream) reads the same file.
    expect(decodeMaskFile(unzlibSync(file))).toEqual(all)
  })

  it('round-trips odd sizes and refuses what is not a masks file', () => {
    const tables = new Map([['Testiformes', { a: [1, 1, btoa('\x80')], b: [5, 3, btoa('\xab\xcd')], c: [24, 2, btoa('\xff\x00\xff\x0f\xf0\x01')] }]]) as Map<string, Record<string, [number, number, string]>>
    const got = decodeMaskFile(encodeMaskFile(tables))
    for (const [code, raw] of Object.entries(tables.get('Testiformes')!)) {
      const want = decodeMask(raw)
      // A JSON mask's spare bits past w × h never reach the file; the decoded mask keeps them clear.
      const total = want.w * want.h
      for (let i = total; i < want.bits.length * 8; i++) want.bits[i >> 3] &= ~(0x80 >> (i & 7))
      expect(got.Testiformes[code], code).toEqual(want)
    }
    expect(() => decodeMaskFile(new TextEncoder().encode('{"a":1}'))).toThrow(/not a masks file/)
    const p = encodeMaskFile(tables)
    expect(() => decodeMaskFile(p.subarray(0, p.length - 1))).toThrow(/wrong length/)
  })

  it.skipIf(process.env.SKIP_PERF === '1')('sizes and decode time', async () => {
    // The JSON it replaced (masks.v2.json): every order's table, orders and codes sorted, as data-files.ts wrote it.
    const sorted = <T,>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)))
    const json = Buffer.from(JSON.stringify(sorted(Object.fromEntries([...orders].map(([o, r]) => [o, sorted(r)])))))
    const br = (b: Uint8Array) => brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length
    const payload = unzlibSync(file)
    const t = performance.now()
    await readMaskFile(buf())
    const ms = performance.now() - t
    const t2 = performance.now()
    const parsed = JSON.parse(json.toString('utf8')) as Record<string, Record<string, [number, number, string]>>
    for (const rec of Object.values(parsed)) for (const raw of Object.values(rec)) decodeMask(raw)
    const jsonMs = performance.now() - t2
    console.log(`[masks] json ${json.length} B (br11 ${br(json)}); bin ${file.length} B shipped (payload ${payload.length}, br11 of payload ${br(payload)}); decode bin ${ms.toFixed(1)} ms, json parse+decode ${jsonMs.toFixed(1)} ms`)
    expect(file.length).toBeLessThan(br(json))
  })
})
