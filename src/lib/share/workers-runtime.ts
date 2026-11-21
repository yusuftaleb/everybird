// Where the server code runs. OpenNext's Cloudflare Worker puts the request's env (its bindings: ASSETS, the R2 cache)
// on globalThis under this symbol for every request; Node (next dev, the Vercel build, next start) has none. Server code
// that must differ between the two (reading public/ with the Worker's static assets, sticker conversion) branches on this
// at run time, so the Vercel path loads nothing Cloudflare-only.
type AssetsFetcher = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> }
type WorkersContext = { env?: { ASSETS?: AssetsFetcher } }

/** The Workers env for this request, or null on Node. */
export function workersEnv(): { ASSETS?: AssetsFetcher } | null {
  const ctx = (globalThis as unknown as Record<symbol, WorkersContext | undefined>)[Symbol.for('__cloudflare-context__')]
  return ctx?.env ?? null
}
