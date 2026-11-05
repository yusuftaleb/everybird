// Sticker URLs. Not a client module, so server code (the link-preview image) can call it too.
export const STICKER_BASE = (process.env.NEXT_PUBLIC_STICKER_BASE || 'https://yusuftaleb.github.io/everybird-stickers').replace(/\/+$/, '')
export const SMALL = 128, LARGE = 384

/** Sticker URL: the 128 px file when cssPx · dpr ≤ 128 (long side), else the 384 px file. */
export function stickerUrl(code: string, cssPx: number, dpr: number): string {
  return `${STICKER_BASE}/v1/${cssPx * dpr <= SMALL ? SMALL : LARGE}/${code}.webp`
}
