'use client'
import { Bird as BirdIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import './Sticker.css'

const STICKER_BASE = (process.env.NEXT_PUBLIC_STICKER_BASE || 'https://yusuftaleb.github.io/everybird-stickers').replace(/\/+$/, '')
const SMALL = 128, LARGE = 384

/** Sticker URL: the 128 px file when cssPx · dpr ≤ 128 (long side), else the 384 px file. */
export function stickerUrl(code: string, cssPx: number, dpr: number): string {
  return `${STICKER_BASE}/v1/${cssPx * dpr <= SMALL ? SMALL : LARGE}/${code}.webp`
}

/**
 * A bird's sticker filling its box (w × h CSS px, used for the width/height attributes and `sizes`), or the
 * Phosphor Bird silhouette in Muted when the species has no sticker or the image fails to load.
 */
export function Sticker({ code, st, ar, w, h, lazy = true }: { code: string; st: boolean; ar: number; w: number; h: number; lazy?: boolean }) {
  const [failed, setFailed] = useState(false)
  // The long side of each file is its nominal size; srcset widths let the browser apply the 128/384 rule
  // for the device pixel ratio without a server/client mismatch.
  const wf = Math.min(1, ar > 0 ? ar : 1)
  if (!st || failed) {
    return (
      <span className="eb-sil" data-silhouette="">
        <BirdIcon weight="fill" aria-hidden="true" focusable="false" />
      </span>
    )
  }
  return (
    // Plain <img>: stickers come from the static stickers site, not the Next image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={stickerUrl(code, Math.max(w, h), 1)}
      srcSet={`${STICKER_BASE}/v1/${SMALL}/${code}.webp ${Math.round(SMALL * wf)}w, ${STICKER_BASE}/v1/${LARGE}/${code}.webp ${Math.round(LARGE * wf)}w`}
      sizes={`${Math.max(1, Math.ceil(w))}px`}
      width={Math.max(1, Math.round(w))}
      height={Math.max(1, Math.round(h))}
      alt=""
      decoding="async"
      loading={lazy ? 'lazy' : undefined}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
