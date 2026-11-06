'use client'
import { Bird as BirdIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { LARGE, SMALL, STICKER_BASE, stickerUrl } from '@/lib/sticker-url'
import './Sticker.css'

export { stickerUrl }

/**
 * Start a deferred sticker's download (see Sticker's `defer`): its data-src / data-srcset become src / srcset.
 * Returns whether there was one to start.
 */
export function loadDeferred(el: Element): boolean {
  const img = el.querySelector<HTMLImageElement>('img[data-src]')
  if (!img) return false
  img.srcset = img.dataset.srcset ?? ''
  img.src = img.dataset.src!
  delete img.dataset.src
  delete img.dataset.srcset
  return true
}

/**
 * A bird's sticker filling its box (w × h CSS px, used for the width/height attributes and `sizes`), or the
 * Phosphor Bird silhouette in Muted when the species has no sticker or the image fails to load.
 * - defer: render the image without its source (data-src / data-srcset hold it) until loadDeferred() is called;
 *   the collage starts it once the bird nears the viewport. The browser's own lazy loading starts every image
 *   within 1,250-2,500 px of the viewport, which on a tall collage of thousands of birds is nearly all of them.
 */
export function Sticker({ code, st, ar, w, h, lazy = true, defer = false }: { code: string; st: boolean; ar: number; w: number; h: number; lazy?: boolean; defer?: boolean }) {
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
  const src = stickerUrl(code, Math.max(w, h), 1)
  const srcSet = `${STICKER_BASE}/v1/${SMALL}/${code}.webp ${Math.round(SMALL * wf)}w, ${STICKER_BASE}/v1/${LARGE}/${code}.webp ${Math.round(LARGE * wf)}w`
  return (
    // Plain <img>: stickers come from the static stickers site, not the Next image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={defer ? undefined : src}
      srcSet={defer ? undefined : srcSet}
      data-src={defer ? src : undefined}
      data-srcset={defer ? srcSet : undefined}
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
