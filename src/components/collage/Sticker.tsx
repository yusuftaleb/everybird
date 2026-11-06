'use client'
import { BIRD_PATH, OUTLINE_SCALE } from '@/lib/bird-outline'
import { useState } from 'react'
import { LARGE, SMALL, STICKER_BASE, stickerUrl } from '@/lib/sticker-url'
import './Sticker.css'

export { stickerUrl }

/**
 * Most sticker downloads in flight at once; the rest wait, in the order asked. Thousands at once deadlocked WebKit
 * under Playwright's inspector (G1), and on a phone they compete with the stickers actually on screen.
 */
export const MAX_LOADS = 48
/**
 * Most sticker downloads started per frame. Each one is a handful of small tasks (response, data, decode, load);
 * hundreds at once (a fast scroll through thousands of birds, from a fast server) hold the next frame back by as
 * much as 100 ms at 4x CPU, though no single task is long.
 */
export const STARTS_PER_FRAME = 12
let queue: HTMLImageElement[] = []
let head = 0
const queued = new Set<HTMLImageElement>()
const flying = new Set<HTMLImageElement>()
/** Started this frame (an image that left the page since, an unmounted collage's, no longer counts). */
let started: HTMLImageElement[] = []
let frame = 0

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

const next = () => { frame = 0; started = []; pump() }

function pump() {
  // A download whose image left the page (an unmounted collage) no longer counts.
  if (flying.size >= MAX_LOADS) for (const img of flying) if (!img.isConnected) flying.delete(img)
  const raf = typeof requestAnimationFrame === 'function'
  while (flying.size < MAX_LOADS && head < queue.length) {
    if (raf && started.length >= STARTS_PER_FRAME) started = started.filter((i) => i.isConnected)
    if (raf && started.length >= STARTS_PER_FRAME) {
      // The rest wait for the next frame.
      frame ||= requestAnimationFrame(next)
      return
    }
    const img = queue[head++]
    if (!queued.delete(img) || !img.dataset.src || !img.isConnected) continue
    started.push(img)
    start(img)
    frame ||= raf ? requestAnimationFrame(next) : 0
  }
  if (head > 1024 && head * 2 > queue.length) { queue = queue.slice(head); head = 0 }
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

/** Whether a bird's sticker is waiting its turn or still downloading (it holds, or will hold, a MAX_LOADS slot). */
export function loading(el: Element): boolean {
  const img = el.querySelector('img')
  return !!img && (queued.has(img as HTMLImageElement) || flying.has(img as HTMLImageElement))
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
 * no-sticker outline (bird-outline.ts: Phosphor's Bird stroked thin in Line, as the share images draw it) when the
 * species has no sticker or the image fails to load.
 * - defer: render the image without its source (data-src / data-srcset hold it) until loadDeferred() is called
 *   (and never lazy: the collage starts it when it should load, and a lazy one would hold a download slot);
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
        <svg viewBox="0 0 256 256" aria-hidden="true" focusable="false">
          <path d={BIRD_PATH} transform={`translate(${128 * (1 - OUTLINE_SCALE)} ${128 * (1 - OUTLINE_SCALE)}) scale(${OUTLINE_SCALE})`} />
        </svg>
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
      loading={lazy && !defer ? 'lazy' : undefined}
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}
