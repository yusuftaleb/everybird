'use client'
import { Bird as BirdIcon } from '@phosphor-icons/react'
import { memo, useState, type CSSProperties } from 'react'

const STICKER_BASE = (process.env.NEXT_PUBLIC_STICKER_BASE || 'https://yusuftaleb.github.io/everybird-stickers').replace(/\/+$/, '')
const SMALL = 128, LARGE = 384

/** Sticker URL: the 128 px file when cssPx · dpr ≤ 128 (long side), else the 384 px file. */
export function stickerUrl(code: string, cssPx: number, dpr: number): string {
  return `${STICKER_BASE}/v1/${cssPx * dpr <= SMALL ? SMALL : LARGE}/${code}.webp`
}

/** Frozen at a bird's first render; after that Collage writes its style and attributes directly. */
export type BirdInit = {
  style: CSSProperties
  off: boolean
  /** Box size in CSS px at first render (img width/height attributes and `sizes`). */
  w: number
  h: number
}

type Props = {
  code: string
  name: string
  st: boolean
  ar: number
  init: BirdInit
  register: (code: string, el: HTMLButtonElement | null) => void
}

/**
 * One bird: a button named by its common name, positioned by the stage's CSS variables. It takes no pointer
 * events (the stage hit-tests silhouettes) and is never re-rendered for motion. Species without a sticker,
 * and stickers that fail to load, show the Phosphor Bird silhouette in Muted.
 */
export const Bird = memo(function Bird({ code, name, st, ar, init, register }: Props) {
  const [failed, setFailed] = useState(false)
  // The long side of each file is its nominal size; srcset widths let the browser apply the 128/384 rule
  // for the device pixel ratio without a server/client mismatch.
  const wf = Math.min(1, ar > 0 ? ar : 1)
  return (
    <button
      ref={(el) => register(code, el)}
      type="button"
      className="eb-bird"
      data-code={code}
      data-off={init.off ? '' : undefined}
      aria-hidden={init.off ? true : undefined}
      aria-label={name}
      tabIndex={-1}
      style={init.style}
    >
      {st && !failed ? (
        // Plain <img>: stickers come from the static stickers site, not the Next image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={stickerUrl(code, Math.max(init.w, init.h), 1)}
          srcSet={`${STICKER_BASE}/v1/${SMALL}/${code}.webp ${Math.round(SMALL * wf)}w, ${STICKER_BASE}/v1/${LARGE}/${code}.webp ${Math.round(LARGE * wf)}w`}
          sizes={`${Math.max(1, Math.ceil(init.w))}px`}
          width={Math.max(1, Math.round(init.w))}
          height={Math.max(1, Math.round(init.h))}
          alt=""
          decoding="async"
          loading="lazy"
          draggable={false}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="eb-sil" data-silhouette="">
          <BirdIcon weight="fill" aria-hidden="true" focusable="false" />
        </span>
      )}
    </button>
  )
})
