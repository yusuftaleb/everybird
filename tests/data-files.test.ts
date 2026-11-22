import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDataFiles, DATA_FILE_NAMES, hashedName, readOrderMasks } from '../scripts/build-data/data-files'
import { DATA_FILES } from '../src/lib/data-files'
import { NAME_LOCALES } from '../src/lib/species/name-locales'
import { dataUrls, fetchData } from '../src/lib/data-url'
import { isVersionedKey, listData, planUploads } from '../scripts/deploy/upload-stickers-r2'

const root = join(__dirname, '..')
const read = (n: string) => readFileSync(join(root, 'public/data', n), 'utf8')

describe('data files', () => {
  it('the committed masks file and hashed names match public/data (rerun scripts/build-data/data-files.ts)', () => {
    const out = buildDataFiles(read, readOrderMasks(join(root, 'public/data/masks')))
    for (const [rel, want] of out) expect(readFileSync(join(root, rel)).equals(Buffer.from(want)), rel).toBe(true)
  })
  // Every order file's masks in masks.v3.bin, bit for bit: tests/mask-file.test.ts.

  it('regional names are immutable even when a forced upload sees a different size', () => {
    const file = { key: 'data/names.es_AR.v1.0123456789.json', path: 'unused', size: 100 }
    expect(planUploads([file], new Map([[file.key, 99]]), true)).toEqual([])
  })

  it('names every fetched file by its content', () => {
    expect(Object.keys(DATA_FILES)).toEqual([...DATA_FILE_NAMES])
    expect(hashedName('species.v1.json', 'x')).toMatch(/^species\.v1\.[0-9a-f]{10}\.json$/)
    expect(hashedName('masks.v3.bin', 'x')).toMatch(/^masks\.v3\.[0-9a-f]{10}\.bin$/)
    expect(listData(join(root, 'public/data'), DATA_FILES).find((f) => f.key.endsWith('.bin'))?.type).toBe('application/octet-stream')
    for (const f of listData(join(root, 'public/data'), DATA_FILES)) expect(isVersionedKey(f.key), f.key).toBe(true)
    expect(isVersionedKey('data/species.v1.json')).toBe(false)
  })
})

describe('dataUrls / fetchData', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses /data/<name> without a base, the hashed name on the base first with one', () => {
    expect(dataUrls('species.v1.json', '')).toEqual(['/data/species.v1.json'])
    expect(dataUrls('masks.v3.bin', 'https://x.test/data')).toEqual([`https://x.test/data/${DATA_FILES['masks.v3.bin']}`, '/data/masks.v3.bin'])
  })

  it('routes every name locale through its hashed R2 name with a local fallback', () => {
    for (const locale of NAME_LOCALES) {
      const name = `names.${locale}.v1.json` as const
      expect(dataUrls(name, 'https://x.test/data')).toEqual([`https://x.test/data/${hashedName(name, read(name))}`, `/data/${name}`])
    }
  })

  it('fetches from /data when no base is set, and throws on a failure', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>(async () => new Response('{"a":1}'))
    vi.stubGlobal('fetch', fetch)
    expect(await fetchData('regions.v1.json')).toEqual({ a: 1 })
    expect(fetch.mock.calls[0][0]).toMatch(/\/data\/regions\.v1\.json$/)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 404 })))
    await expect(fetchData('regions.v1.json')).rejects.toThrow(/404/)
  })
})
