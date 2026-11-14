import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildDataFiles, DATA_FILE_NAMES, hashedName, readOrderMasks } from '../scripts/build-data/data-files'
import { DATA_FILES } from '../src/lib/data-files'
import { dataUrls, fetchData } from '../src/lib/data-url'
import { isVersionedKey, listData } from '../scripts/deploy/upload-stickers-r2'

const root = join(__dirname, '..')
const read = (n: string) => readFileSync(join(root, 'public/data', n), 'utf8')

describe('data files', () => {
  it('the committed masks bundle and hashed names match public/data (rerun scripts/build-data/data-files.ts)', () => {
    const out = buildDataFiles(read, readOrderMasks(join(root, 'public/data/masks')))
    for (const [rel, text] of out) expect(readFileSync(join(root, rel), 'utf8'), rel).toBe(text)
  })

  it('the bundle holds every order file, unchanged', () => {
    const bundle = JSON.parse(read('masks.v2.json')) as Record<string, Record<string, unknown>>
    const orders = readOrderMasks(join(root, 'public/data/masks'))
    expect(Object.keys(bundle).sort()).toEqual([...orders.keys()].sort())
    for (const [ord, rec] of orders) expect(bundle[ord]).toEqual(rec)
  })

  it('names every fetched file by its content', () => {
    expect(Object.keys(DATA_FILES)).toEqual([...DATA_FILE_NAMES])
    expect(hashedName('species.v1.json', 'x')).toMatch(/^species\.v1\.[0-9a-f]{10}\.json$/)
    for (const f of listData(join(root, 'public/data'), DATA_FILES)) expect(isVersionedKey(f.key), f.key).toBe(true)
    expect(isVersionedKey('data/species.v1.json')).toBe(false)
  })
})

describe('dataUrls / fetchData', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses /data/<name> without a base, the hashed name on the base first with one', () => {
    expect(dataUrls('species.v1.json', '')).toEqual(['/data/species.v1.json'])
    expect(dataUrls('masks.v2.json', 'https://x.test/data')).toEqual([`https://x.test/data/${DATA_FILES['masks.v2.json']}`, '/data/masks.v2.json'])
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
