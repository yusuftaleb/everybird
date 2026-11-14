// Upload the sticker files (../everybird-stickers/v1/**, or $STICKERS_DIR/v1/**) to a Cloudflare R2 bucket over its
// S3 API, each with Cache-Control "public, max-age=31536000, immutable" (the files are versioned by path: v1/) and
// Content-Type image/webp. The bucket is served at https://stickers.yusuftaleb.com, the app's default sticker host
// (src/lib/sticker-url.ts); the GitHub Pages copy of the same files is the fallback.
//
//   npx tsx scripts/deploy/upload-stickers-r2.ts [--dry-run] [--force] [--concurrency 16] [--data]
//
// --data uploads the app's data files instead (src/lib/data-files.ts: species, taxonomy, regions, the masks bundle,
// the sample, the sample pack, the iNaturalist synonyms) from public/data to data/<content-hashed name>, with
// Content-Type application/json and the same year-long immutable cache; the app fetches them from
// NEXT_PUBLIC_DATA_BASE (https://stickers.yusuftaleb.com/data, src/lib/data-url.ts). A hashed key already in the
// bucket is never uploaded again (its name is its content). Run it before deploying a change to public/data.
//
// Env: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT (https://<account>.r2.cloudflarestorage.com)
// or R2_ACCOUNT_ID. Idempotent and resumable: it lists the bucket's v1/ objects first (1,000 per request) and skips
// every file already there at the same size; --force uploads them all, except versioned keys (<code>.<sv>.webp)
// already in the bucket, which are never overwritten. --dry-run lists what it would upload and sends
// nothing but the listing (with no credentials set, it skips the listing and plans every file). No dependencies: the
// requests are signed with AWS Signature V4 (node:crypto).
import { createHash, createHmac } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const CACHE_CONTROL = 'public, max-age=31536000, immutable'
export const CONTENT_TYPE = 'image/webp'
export const JSON_TYPE = 'application/json'
const REGION = 'auto' // R2's region for SigV4
const EMPTY_SHA = createHash('sha256').update('').digest('hex')

const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const hmac = (k: string | Buffer, s: string) => createHmac('sha256', k).update(s).digest()
/** RFC 3986 encoding, as SigV4 wants it (keep '/' in paths). */
const enc = (s: string, keepSlash = false) => {
  const e = encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
  return keepSlash ? e.replace(/%2F/g, '/') : e
}

export type Creds = { accessKeyId: string; secretAccessKey: string; region?: string; service?: string }
/**
 * AWS Signature V4 headers for one request: returns the headers to send (host, x-amz-date, x-amz-content-sha256,
 * authorization and the caller's own). `headers` keys are lower-case; every header given is signed.
 */
export function signV4(
  req: { method: string; url: string; headers?: Record<string, string>; payloadHash?: string },
  creds: Creds, now = new Date(),
): Record<string, string> {
  const u = new URL(req.url)
  const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const day = amzDate.slice(0, 8)
  const region = creds.region ?? REGION, service = creds.service ?? 's3'
  const headers: Record<string, string> = {
    ...req.headers, host: u.host, 'x-amz-date': amzDate, 'x-amz-content-sha256': req.payloadHash ?? EMPTY_SHA,
  }
  const names = Object.keys(headers).map((h) => h.toLowerCase()).sort()
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  const query = [...u.searchParams.entries()].map(([k, v]) => [enc(k), enc(v)]).sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : 1))
  const canonical = [
    req.method,
    u.pathname.split('/').map((p) => enc(decodeURIComponent(p))).join('/'),
    query.map(([k, v]) => `${k}=${v}`).join('&'),
    names.map((n) => `${n}:${lower[n].trim().replace(/\s+/g, ' ')}\n`).join(''),
    names.join(';'),
    lower['x-amz-content-sha256'],
  ].join('\n')
  const scope = `${day}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), region), service), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
}

export type LocalFile = { key: string; path: string; size: number; type?: string }
/** Every file under `<root>/v1`, keyed by its path from `root` with '/' ("v1/384/ostric2.webp"), sorted. */
export function listLocal(root: string): LocalFile[] {
  const out: LocalFile[] = []
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.isFile() && e.name.endsWith('.webp')) out.push({ key: relative(root, p).split(sep).join('/'), path: p, size: statSync(p).size })
    }
  }
  walk(join(root, 'v1'))
  return out.sort((a, b) => (a.key < b.key ? -1 : 1))
}

/** The data files as `data/<hashed name>` keys, from `dataDir` (public/data) and the DATA_FILES table. */
export function listData(dataDir: string, files: Record<string, string>): LocalFile[] {
  return Object.entries(files).map(([name, hashed]) => {
    const path = join(dataDir, name)
    return { key: `data/${hashed}`, path, size: statSync(path).size, type: JSON_TYPE }
  }).sort((a, b) => (a.key < b.key ? -1 : 1))
}

/**
 * A key written once, never replaced: a versioned sticker, `v1/<size>/<code>.<sv>.webp` (src/lib/sticker-url.ts),
 * or a content-hashed data file, `data/<name>.<10 hex>.json`.
 */
export const isVersionedKey = (key: string) => /^v1\/\d+\/[a-z0-9]+\.[0-9a-z]+\.webp$/.test(key) || /^data\/[a-z0-9.-]+\.[0-9a-f]{10}\.json$/.test(key)

/**
 * The files to upload: all with `force`, else those missing from the bucket or there at another size. A versioned
 * key already in the bucket is never uploaded again, even with `force` or at another size: its URL is immutable, so
 * a different file under it would be a bug (and a rerun after a failed sync skips what it already sent).
 */
export function planUploads(local: LocalFile[], remote: Map<string, number>, force = false): LocalFile[] {
  return local.filter((f) => {
    if (isVersionedKey(f.key) && remote.has(f.key)) return false
    return force || remote.get(f.key) !== f.size
  })
}

type Target = { endpoint: string; bucket: string; creds: Creds }
const objectUrl = (t: Target, key: string) => `${t.endpoint}/${enc(t.bucket)}/${enc(key, true)}`

/** The bucket's objects under `prefix` with their sizes (ListObjectsV2, 1,000 a page). */
async function listRemote(t: Target, prefix: string): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  let token: string | undefined
  do {
    const u = new URL(`${t.endpoint}/${enc(t.bucket)}`)
    u.searchParams.set('list-type', '2')
    u.searchParams.set('prefix', prefix)
    if (token) u.searchParams.set('continuation-token', token)
    const res = await fetch(u, { headers: signV4({ method: 'GET', url: u.toString() }, t.creds) })
    const xml = await res.text()
    if (!res.ok) throw new Error(`list ${res.status}: ${xml.slice(0, 300)}`)
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = m[1].match(/<Key>([\s\S]*?)<\/Key>/)?.[1]
      const size = m[1].match(/<Size>(\d+)<\/Size>/)?.[1]
      if (key && size) out.set(unxml(key), Number(size))
    }
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml) ? unxml(xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] ?? '') : undefined
  } while (token)
  return out
}
const unxml = (s: string) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

async function put(t: Target, f: LocalFile): Promise<void> {
  const body = readFileSync(f.path)
  const url = objectUrl(t, f.key)
  for (let attempt = 1; ; attempt++) {
    const headers = signV4({ method: 'PUT', url, payloadHash: sha256(body), headers: { 'cache-control': CACHE_CONTROL, 'content-type': f.type ?? CONTENT_TYPE } }, t.creds)
    const res = await fetch(url, { method: 'PUT', headers, body })
    if (res.ok) return
    const msg = `${f.key}: ${res.status} ${(await res.text()).slice(0, 200)}`
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(msg)
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt))
  }
}

async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry-run'), force = args.includes('--force'), data = args.includes('--data')
  const ci = args.indexOf('--concurrency')
  const concurrency = ci >= 0 ? Math.max(1, Number(args[ci + 1]) || 16) : 16
  const root = resolve(process.env.STICKERS_DIR ?? join(fileURLToPath(new URL('.', import.meta.url)), '../../../everybird-stickers'))
  const repo = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
  const local = data ? listData(join(repo, 'public/data'), (await import('../../src/lib/data-files')).DATA_FILES) : listLocal(root)
  console.log(data ? `${local.length} data files under ${join(repo, 'public/data')}` : `${local.length} sticker files under ${join(root, 'v1')}`)

  const { R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = process.env
  const endpoint = (process.env.R2_ENDPOINT ?? (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '')
  const haveCreds = !!(bucket && accessKeyId && secretAccessKey && endpoint)
  if (!haveCreds && !dry) throw new Error('Set R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ENDPOINT (or R2_ACCOUNT_ID), or pass --dry-run')
  const t: Target | null = haveCreds ? { endpoint, bucket: bucket!, creds: { accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! } } : null

  // Listed even with --force: versioned keys already there are never overwritten.
  const remote = t ? await listRemote(t, data ? 'data/' : 'v1/') : new Map<string, number>()
  const todo = planUploads(local, remote, force)
  const clash = local.filter((f) => isVersionedKey(f.key) && remote.has(f.key) && remote.get(f.key) !== f.size)
  if (clash.length) console.warn(`warning: ${clash.length} versioned keys already in the bucket at another size were left alone, e.g. ${clash[0].key}`)
  console.log(`${remote.size} already in the bucket; ${todo.length} to upload${dry ? ' (dry run: nothing sent)' : ''}`)
  if (dry) {
    for (const f of todo.slice(0, 20)) console.log(`  ${f.key} (${f.size} B)`)
    if (todo.length > 20) console.log(`  … and ${todo.length - 20} more`)
    return
  }
  let next = 0, done = 0
  const failed: string[] = []
  await Promise.all(Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
    while (next < todo.length) {
      const f = todo[next++]
      try { await put(t!, f) } catch (e) { failed.push((e as Error).message) }
      if (++done % 500 === 0 || done === todo.length) console.log(`  ${done}/${todo.length}`)
    }
  }))
  if (failed.length) {
    console.error(`${failed.length} failed (rerun to retry them):\n${failed.slice(0, 20).join('\n')}`)
    process.exit(1)
  }
  console.log('done')
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
