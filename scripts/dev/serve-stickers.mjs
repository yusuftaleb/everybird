// Local static server for the sticker files (dev and e2e): serves ../everybird-stickers (or $STICKERS_DIR)
// on 127.0.0.1:4100 (or $PORT; loopback only) with CORS, standing in for the production sticker host (R2, https://stickers.yusuftaleb.com).
// Point the app at it with NEXT_PUBLIC_STICKER_BASE=http://127.0.0.1:4100.
import { createReadStream, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve, sep } from 'node:path'

const root = resolve(process.env.STICKERS_DIR ?? join(import.meta.dirname, '../../../everybird-stickers'))
const port = Number(process.env.PORT ?? 4100)
const TYPES = { '.webp': 'image/webp', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' }

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  let path
  try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname) } catch { path = '' }
  const file = resolve(root, '.' + path)
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return }
  if (path === '/') { res.writeHead(200, { 'Content-Type': 'text/plain' }).end('everybird stickers\n'); return }
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(403).end(); return }
  let st
  try { st = statSync(file) } catch { st = null }
  if (!st?.isFile()) { res.writeHead(404).end(); return }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
    'Content-Length': st.size,
    'Cache-Control': 'public, max-age=3600',
  })
  if (req.method === 'HEAD') res.end()
  else {
    const stream = createReadStream(file)
    stream.on('error', () => { if (!res.headersSent) res.writeHead(500); res.destroy() })
    stream.pipe(res)
  }
}).listen(port, '127.0.0.1', () => console.log(`stickers: serving ${root} on http://127.0.0.1:${port}`))
