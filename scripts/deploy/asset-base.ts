/** Root origin only: uploaded keys are always _next/static/<path>, without an extra URL path. */
export function assetBase(value = process.env.NEXT_PUBLIC_ASSET_BASE): string | undefined {
  if (!value) return undefined
  const base = value.trim().replace(/\/+$/, '')
  const url = new URL(base)
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('NEXT_PUBLIC_ASSET_BASE must be an HTTPS origin, e.g. https://stickers.yusuftaleb.com')
  }
  return url.origin
}
