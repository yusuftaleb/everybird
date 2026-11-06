'use client'
import { memo, type CSSProperties } from 'react'
import { Sticker, stickerUrl } from './Sticker'

export { stickerUrl }

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
 * events (the stage hit-tests silhouettes) and is never re-rendered for motion. Its sticker downloads only when
 * the collage sees it near the viewport (Sticker `defer`, Collage's observer). Species without a sticker,
 * and stickers that fail to load, show the Phosphor Bird silhouette in Muted.
 */
export const Bird = memo(function Bird({ code, name, st, ar, init, register }: Props) {
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
      <Sticker code={code} st={st} ar={ar} w={init.w} h={init.h} defer />
    </button>
  )
})
