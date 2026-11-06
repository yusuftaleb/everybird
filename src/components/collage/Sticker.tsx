'use client'
import { Bird as BirdIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { LARGE, SMALL, STICKER_BASE, stickerUrl } from '@/lib/sticker-url'
import './Sticker.css'

export { stickerUrl }

/**
 * Most sticker downloads in flight at once; the rest wait, in the order asked. Thousands at once deadlocked WebKit
 * under Playwright's inspector (G1), and on a phone they compete with the stickers actually on screen.
 */
export const MAX_LOADS = 48
const queue: HTMLImageElement[] = []
const queued = new Set<HTMLImageElement>()
const flying = new Set<HTMLImageElement>()

function start(img: HTMLImageElement) {
  img.srcset = img.dataset.srcset ?? ''
  img.src = img.dataset.src!
  delete img.dataset.src
  delete img.dataset.srcset
  if (img.complete) return // a cached file: nothing in flight
  flying.add(img)
  const done = () => {
    img.removeEventListener('load', done)
    img.removeEventListener('error', done)
    if (flying.delete(img)) pump()
  }
  img.addEventListener('load', done)
  img.addEventListener('error', done)
}

function pump() {
  // A download whose image left the page (an unmounted collage) no longer counts.
  if (flying.size >= MAX_LOADS) for (const img of flying) if (!img.isConnected) flying.delete(img)
  while (flying.size < MAX_LOADS && queue.length) {
    const img = queue.shift()!
    if (!queued.delete(img) || !img.dataset.src || !img.isConnected) continue
    start(img)
  }
}

/**
 * Start a deferred sticker's download (see Sticker's `defer`): its data-src / data-srcset become src / srcset, at
 * once while fewer than MAX_LOADS are in flight, else in turn. Returns whether there was one to start.
 */
export function loadDeferred(el: Element): boolean {
  const img = el.querySelector<HTMLImageElement>('img[data-src]')
  if (!img) return false
  if (!queued.has(img)) { queued.add(img); queue.push(img) }
  pump()
  return true
}

/**
 * Let go of a started sticker's image (the reverse of loadDeferred), so the browser can drop its decoded pixels;
 * loadDeferred starts it again. A sticker still waiting its turn just leaves the queue. Returns whether there was one.
 */
export function unloadSticker(el: Element): boolean {
  const waiting = el.querySelector<HTMLImageElement>('img[data-src]')
  if (waiting) queued.delete(waiting) // pump skips it
  const img = el.querySelector<HTMLImageElement>('img:not([data-src])')
  const src = img?.getAttribute('src')
  if (!img || !src) return false
  img.dataset.src = src
  img.dataset.srcset = img.getAttribute('srcset') ?? ''
  img.removeAttribute('srcset')
  img.removeAttribute('src')
  if (flying.delete(img)) pump()
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
