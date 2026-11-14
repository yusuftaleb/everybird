'use client'
// next/link that prefetches only on intent (pointer over it, focus, a touch), never because it is in the viewport:
// the top bar and footer are always on screen, and viewport prefetching sent every route's RSC payload (two
// requests each) to Vercel on every page load. Prefetching on intent keeps navigation quick where it is wanted.
import Link from 'next/link'
import { useState, type ComponentProps } from 'react'

export default function IntentLink({ prefetch, onPointerEnter, onFocus, onTouchStart, ...rest }: ComponentProps<typeof Link>) {
  const [intent, setIntent] = useState(false)
  return (
    <Link
      {...rest}
      prefetch={intent ? (prefetch ?? null) : false}
      onPointerEnter={(e) => { setIntent(true); onPointerEnter?.(e) }}
      onFocus={(e) => { setIntent(true); onFocus?.(e) }}
      onTouchStart={(e) => { setIntent(true); onTouchStart?.(e) }}
    />
  )
}
