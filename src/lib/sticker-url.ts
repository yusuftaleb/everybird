// Sticker URLs. Not a client module, so server code (the link-preview image) can call it too.
// Default: the Cloudflare R2 bucket's domain. The GitHub Pages copy (https://yusuftaleb.github.io/everybird-stickers)
// holds the same v1/ files and is the fallback: point NEXT_PUBLIC_STICKER_BASE at it to switch back.
//
// Cache busting: every sticker file is served `immutable` for a year, so a file is never replaced at its URL. A
// sticker redrawn upstream after v1 (scripts/sync/huashu-sync.ts) gets a sticker version `sv` in species.v1.json and
// is published under a new name, `v1/<size>/<code>.<sv>.webp`, beside the old file. Species without `sv` keep their
// original URLs byte for byte.
export const STICKER_BASE = (process.env.NEXT_PUBLIC_STICKER_BASE || 'https://stickers.yusuftaleb.com').replace(/\/+$/, '')
export const SMALL = 128, LARGE = 384

/** The file's path under the sticker base: `v1/128/crowa.webp`, or `v1/128/crowa.<sv>.webp` for a versioned sticker. */
export function stickerPath(code: string, size: typeof SMALL | typeof LARGE, sv?: string): string {
  return `v1/${size}/${code}${sv ? `.${sv}` : ''}.webp`
}

/** Sticker URL: the 128 px file when cssPx · dpr ≤ 128 (long side), else the 384 px file. */
export function stickerUrl(code: string, cssPx: number, dpr: number, sv?: string): string {
  return `${STICKER_BASE}/${stickerPath(code, cssPx * dpr <= SMALL ? SMALL : LARGE, sv)}`
}

/**
 * Both files as a srcset. The long side of each file is its nominal size, so its width is that times `wf`
 * (min(1, aspect)); the browser then applies the 128/384 rule for the device pixel ratio.
 */
export function stickerSrcSet(code: string, ar: number, sv?: string): string {
  const wf = Math.min(1, ar > 0 ? ar : 1)
  return `${STICKER_BASE}/${stickerPath(code, SMALL, sv)} ${Math.round(SMALL * wf)}w, ${STICKER_BASE}/${stickerPath(code, LARGE, sv)} ${Math.round(LARGE * wf)}w`
}
