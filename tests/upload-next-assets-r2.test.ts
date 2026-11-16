import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { assetBase } from '../scripts/deploy/asset-base'
import { listStatic, main, targetFromEnv, uploadStatic } from '../scripts/deploy/upload-next-assets-r2'
import { CACHE_CONTROL, isVersionedKey, planUploads, put, type Target } from '../scripts/deploy/upload-stickers-r2'

const target: Target = { endpoint: 'https://test.r2.cloudflarestorage.com', bucket: 'test', creds: { accessKeyId: 'test', secretAccessKey: 'test' } }
const root = mkdtempSync(join(tmpdir(), 'everybird-assets-'))
mkdirSync(join(root, 'static/chunks'), { recursive: true })
mkdirSync(join(root, 'static/media'), { recursive: true })
mkdirSync(join(root, 'server'), { recursive: true })
writeFileSync(join(root, 'static/chunks/hash.js'), 'javascript')
writeFileSync(join(root, 'static/chunks/hash.css'), 'css')
writeFileSync(join(root, 'static/media/hash.woff2'), 'font')
writeFileSync(join(root, 'static/media/hash.svg'), '<svg/>')
writeFileSync(join(root, 'static/media/hash.wasm'), 'wasm')
writeFileSync(join(root, 'server/private.js'), 'must never upload')
writeFileSync(join(root, 'build-manifest.json'), '{}')
const local = listStatic(root)
const js = local.find((f) => f.key.endsWith('.js'))!
const listed = (key: string, size: number) => `<ListBucketResult><Contents><Key>${key}</Key><Size>${size}</Size></Contents></ListBucketResult>`

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('asset prefix', () => {
  it('leaves config unchanged when unset and normalizes a root HTTPS origin', () => {
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', '')
    expect(assetBase()).toBeUndefined()
    expect(assetBase('https://stickers.yusuftaleb.com///')).toBe('https://stickers.yusuftaleb.com')
    for (const value of ['http://cdn.test', 'https://cdn.test/data', 'https://cdn.test?x=1', 'https://user:secret@cdn.test', 'https://cdn.test#fragment']) {
      expect(() => assetBase(value)).toThrow()
    }
  })
  it('enables anonymous CDN assets and the same-origin worker override together', async () => {
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', 'https://cdn.test/')
    const { default: prefixed } = await import('../next.config')
    expect(prefixed.assetPrefix).toBe('https://cdn.test')
    expect(prefixed.crossOrigin).toBe('anonymous')
    expect(prefixed.experimental?.turbopackWorkerAssetPrefix).toBe('')
    vi.resetModules()
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', '')
    const { default: plain } = await import('../next.config')
    expect(plain.assetPrefix).toBeUndefined()
    expect(plain.crossOrigin).toBeUndefined()
    expect(plain.experimental?.turbopackWorkerAssetPrefix).toBeUndefined()
  })
  it('skips filesystem and network work when the prefix is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', '')
    vi.stubEnv('NEXT_DIST_DIR', '/nonexistent')
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await main([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires server-only R2 credentials and supports the account endpoint', () => {
    expect(() => targetFromEnv({})).toThrow('Asset upload requires')
    expect(targetFromEnv({ R2_BUCKET: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_ACCOUNT_ID: 'account' }).endpoint)
      .toBe('https://account.r2.cloudflarestorage.com')
  })
  it('has a strictly offline dry run even when R2 credentials exist', async () => {
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', 'https://cdn.test')
    vi.stubEnv('NEXT_DIST_DIR', root)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await main(['--dry-run'])
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('static asset upload', () => {
  it('includes only static build assets with browser-usable MIME types', () => {
    expect(local.map((f) => [f.key, f.type])).toEqual([
      ['_next/static/chunks/hash.css', 'text/css'],
      ['_next/static/chunks/hash.js', 'application/javascript'],
      ['_next/static/media/hash.svg', 'image/svg+xml'],
      ['_next/static/media/hash.wasm', 'application/wasm'],
      ['_next/static/media/hash.woff2', 'font/woff2'],
    ])
    expect(() => listStatic(join(root, 'missing'))).toThrow()
  })
  it('never plans to overwrite an existing build asset, even with force or another size', () => {
    expect(isVersionedKey(js.key)).toBe(true)
    expect(planUploads([js], new Map([[js.key, 999]]), true)).toEqual([])
  })
  it('uploads missing assets with immutable caching and a signed atomic create-only condition', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('<ListBucketResult/>')).mockResolvedValueOnce(new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    await uploadStatic([js], target)
    expect(new URL(fetcher.mock.calls[0][0]).searchParams.get('prefix')).toBe('_next/static/')
    const [url, request] = fetcher.mock.calls[1]
    expect(url).toBe(`${target.endpoint}/test/${js.key}`)
    expect(request.method).toBe('PUT')
    expect(request.headers['content-type']).toBe('application/javascript')
    expect(request.headers['cache-control']).toBe(CACHE_CONTROL)
    expect(request.headers['if-none-match']).toBe('*')
    expect(request.headers.authorization).toContain('if-none-match')
  })
  it('resumes by skipping present assets, but fails before any PUT on a size collision', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(listed(js.key, js.size)))
    vi.stubGlobal('fetch', fetcher)
    await uploadStatic([js], target)
    expect(fetcher).toHaveBeenCalledTimes(1)
    fetcher.mockResolvedValueOnce(new Response(listed(js.key, 999)))
    await expect(uploadStatic([js], target)).rejects.toThrow('Immutable asset collision')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('rejects listing, upload, network and concurrent-create failures to block the release', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('denied', { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(uploadStatic([js], target)).rejects.toThrow('list 403')
    fetcher.mockResolvedValueOnce(new Response('<ListBucketResult/>')).mockResolvedValueOnce(new Response('denied', { status: 403 }))
    await expect(uploadStatic([js], target)).rejects.toThrow('403')
    fetcher.mockRejectedValueOnce(new Error('offline'))
    await expect(uploadStatic([js], target)).rejects.toThrow('offline')
    fetcher.mockResolvedValueOnce(new Response(null, { status: 412 }))
    await expect(put(target, js)).rejects.toThrow('412')
  })
})
