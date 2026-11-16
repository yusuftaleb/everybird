// Runs after next build, before Vercel can publish HTML. Check the built config, including prefixes from .env files.
// Local inspection: npx tsx scripts/deploy/upload-next-assets-r2.ts --dry-run (never contacts R2).
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { extname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assetBase } from './asset-base'
import { listRemote, planUploads, put, type LocalFile, type Target } from './upload-stickers-r2'

const TYPES: Record<string, string> = {
  '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm',
  '.ts': 'text/plain',
}

/** Only static/ is public. Never include server/, cache/, manifests or any other build internals. */
export function listStatic(dist: string): LocalFile[] {
  const root = join(dist, 'static')
  const out: LocalFile[] = []
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) walk(path)
      else if (entry.isFile()) out.push({
        key: `_next/static/${relative(root, path).split(sep).join('/')}`,
        path, size: statSync(path).size, type: TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream',
      })
      else throw new Error(`Unexpected non-file in static assets: ${path}`)
    }
  }
  walk(root)
  if (!out.length) throw new Error(`No assets in ${root}; run next build first`)
  return out.sort((a, b) => a.key.localeCompare(b.key))
}

export function targetFromEnv(env: Record<string, string | undefined> = process.env): Target {
  const { R2_BUCKET: bucket, R2_ACCESS_KEY_ID: accessKeyId, R2_SECRET_ACCESS_KEY: secretAccessKey } = env
  const endpoint = (env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : '')).replace(/\/+$/, '')
  if (!bucket || !accessKeyId || !secretAccessKey || !endpoint) {
    throw new Error('Asset upload requires R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_ENDPOINT (or R2_ACCOUNT_ID)')
  }
  return { endpoint, bucket, creds: { accessKeyId, secretAccessKey } }
}

export async function uploadStatic(local: LocalFile[], target: Target): Promise<void> {
  const remote = await listRemote(target, '_next/static/')
  // An immutable URL at another size is a collision, never permission to replace it or publish broken HTML.
  const clash = local.find((f) => remote.has(f.key) && remote.get(f.key) !== f.size)
  if (clash) throw new Error(`Immutable asset collision: ${clash.key}; refusing to publish`)
  const todo = planUploads(local, remote)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(16, todo.length) }, async () => {
    while (next < todo.length) await put(target, todo[next++])
  }))
  console.log(`R2 static assets: ${todo.length} uploaded, ${local.length - todo.length} already present`)
}

/** Build output is authoritative: Next loads dotenv files, but the following tsx process does not. */
export function builtAssetBase(dist: string): string | undefined {
  const manifest = JSON.parse(readFileSync(join(dist, 'required-server-files.json'), 'utf8'))
  const built = assetBase(manifest.config?.assetPrefix || '')
  if (built !== assetBase()) {
    throw new Error('Built assetPrefix differs from NEXT_PUBLIC_ASSET_BASE; export the same value and rebuild before uploading')
  }
  return built
}

/** Check the actual custom domain after upload, so a wrong bucket, MIME or CORS setting blocks release. */
export async function verifyPublicAssets(local: LocalFile[], base: string): Promise<void> {
  const types = ['application/javascript', 'text/css', 'font/woff2']
  const samples = types.map((type) => local.find((f) => f.type === type)).filter((f): f is LocalFile => !!f)
  await Promise.all(samples.map(async (f) => {
    const res = await fetch(`${base}/${f.key}`, {
      method: 'HEAD', headers: { Origin: 'https://everybird.yusuftaleb.com' }, redirect: 'error',
    })
    if (!res.ok || res.headers.get('content-type')?.split(';')[0].trim() !== f.type
      || res.headers.get('access-control-allow-origin') !== '*'
      || Number(res.headers.get('content-length')) !== f.size
      || !res.headers.get('cache-control')?.includes('immutable')) {
      throw new Error(`Public asset verification failed: ${f.key} (${res.status}); check the custom domain, MIME, cache headers and CORS`)
    }
  }))
  console.log(`R2 public assets: ${samples.length} JS/CSS/font checks passed`)
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const dist = resolve(process.env.NEXT_DIST_DIR || '.next')
  const base = builtAssetBase(dist)
  if (!base) {
    console.log('R2 static assets: skipped (build has no assetPrefix)')
    return
  }
  const local = listStatic(dist)
  if (args.includes('--dry-run')) {
    console.log(`R2 static assets: ${local.length} files, ${local.reduce((n, f) => n + f.size, 0)} bytes (offline dry run; nothing sent)`)
    return
  }
  await uploadStatic(local, targetFromEnv())
  await verifyPublicAssets(local, base)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1 })
}
