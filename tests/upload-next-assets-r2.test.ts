import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assetBase } from '../scripts/deploy/asset-base'
import { builtAssetBase, listStatic, main, targetFromEnv, uploadStatic, verifyPublicAssets } from '../scripts/deploy/upload-next-assets-r2'
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
const manifest = (prefix: string) => writeFileSync(join(root, 'required-server-files.json'), JSON.stringify({ config: { assetPrefix: prefix } }))

beforeEach(() => manifest(''))
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

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
  it('skips assets, credentials and network work when the built prefix is unset', async () => {
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', '')
    vi.stubEnv('NEXT_DIST_DIR', root)
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    await main([])
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('fails closed for a dotenv-only prefix or a stale build with another prefix', () => {
    manifest('https://cdn.test')
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', '')
    expect(() => builtAssetBase(root)).toThrow('Built assetPrefix differs')
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', 'https://other.test')
    expect(() => builtAssetBase(root)).toThrow('Built assetPrefix differs')
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', 'https://cdn.test')
    expect(builtAssetBase(root)).toBe('https://cdn.test')
    manifest('')
    expect(() => builtAssetBase(root)).toThrow('Built assetPrefix differs')
  })
  it('requires server-only R2 credentials and supports the account endpoint', () => {
    expect(() => targetFromEnv({})).toThrow('Asset upload requires')
    expect(targetFromEnv({ R2_BUCKET: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_ACCOUNT_ID: 'account' }).endpoint)
      .toBe('https://account.r2.cloudflarestorage.com')
  })
  it('has a strictly offline dry run even when R2 credentials exist', async () => {
    vi.stubEnv('NEXT_PUBLIC_ASSET_BASE', 'https://cdn.test')
    manifest('https://cdn.test')
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
  it('rejects listing and upload failures to block the release', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('denied', { status: 403 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(uploadStatic([js], target)).rejects.toThrow('list 403')
    fetcher.mockResolvedValueOnce(new Response('<ListBucketResult/>')).mockResolvedValueOnce(new Response('denied', { status: 403 }))
    await expect(uploadStatic([js], target)).rejects.toThrow('403')
  })
  it('accepts an identical concurrent object after 412 without replacing it', async () => {
    const etag = `"${createHash('md5').update('javascript').digest('hex')}"`
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, { headers: { etag } }))
    vi.stubGlobal('fetch', fetcher)
    await put(target, js)
    expect(fetcher.mock.calls.map((c) => c[1].method)).toEqual(['PUT', 'HEAD'])
    expect(fetcher.mock.calls[1][1].headers.authorization).toContain('AWS4-HMAC-SHA256')
  })
  it('rejects a different or unverifiable concurrent object', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, { headers: { etag: '"different"' } }))
    vi.stubGlobal('fetch', fetcher)
    await expect(put(target, js)).rejects.toThrow('Immutable asset collision')
  })
  it('retries a lost upload response and verifies the resulting 412', async () => {
    vi.useFakeTimers()
    const etag = `"${createHash('md5').update('javascript').digest('hex')}"`
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(new Response(null, { status: 412 }))
      .mockResolvedValueOnce(new Response(null, { headers: { etag } }))
    vi.stubGlobal('fetch', fetcher)
    const pending = put(target, js)
    await vi.runAllTimersAsync()
    await pending
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('fails after bounded network retries', async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    vi.stubGlobal('fetch', fetcher)
    const pending = expect(put(target, js)).rejects.toThrow('offline')
    await vi.runAllTimersAsync()
    await pending
    expect(fetcher).toHaveBeenCalledTimes(4)
  })
})

describe('public serving gate', () => {
  const good = (f: typeof js) => new Response(null, { headers: {
    'content-type': f.type!, 'content-length': String(f.size), 'cache-control': CACHE_CONTROL, 'access-control-allow-origin': '*',
  } })
  it('checks JS, CSS and fonts only after upload, without redirects', async () => {
    const fetcher = vi.fn().mockImplementation(async (url: string) => good(local.find((f) => url.endsWith(f.key))!))
    vi.stubGlobal('fetch', fetcher)
    await verifyPublicAssets(local, 'https://cdn.test')
    expect(fetcher).toHaveBeenCalledTimes(3)
    for (const [url, init] of fetcher.mock.calls) {
      expect(url).toMatch(/^https:\/\/cdn.test\/_next\/static\//)
      expect(init).toEqual({ method: 'HEAD', headers: { Origin: 'https://everybird.yusuftaleb.com', 'Accept-Encoding': 'identity' }, redirect: 'error' })
    }
  })
  it('blocks release for wrong bucket, MIME, CORS, size or caching headers', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    for (const response of [new Response(null, { status: 404 }), new Response(null), good({ ...js, type: 'text/html' }), good({ ...js, size: 99 })]) {
      fetcher.mockResolvedValueOnce(response)
      await expect(verifyPublicAssets([js], 'https://cdn.test')).rejects.toThrow('Public asset verification failed')
    }
    for (const name of ['access-control-allow-origin', 'cache-control']) {
      const res = good(js)
      res.headers.delete(name)
      fetcher.mockResolvedValueOnce(res)
      await expect(verifyPublicAssets([js], 'https://cdn.test')).rejects.toThrow('Public asset verification failed')
    }
  })
})
