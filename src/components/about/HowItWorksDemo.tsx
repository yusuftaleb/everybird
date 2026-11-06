'use client'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'

// The scene and the kit load only when the figure comes near the viewport, so they never weigh on the page's first load.
const HowItWorksStage = lazy(() => import('./HowItWorksStage'))

/**
 * The animated "How it works" figure on About. Decorative: the moving picture is aria-hidden and the caption (visually
 * hidden) tells the same story in words. The slot's height is set in CSS for both designs (about.css), so nothing
 * shifts when the scene arrives. The stage itself pauses off screen and in a hidden tab, and shows its poster frame
 * under reduced motion.
 */
export function HowItWorksDemo() {
  const slot = useRef<HTMLDivElement>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = slot.current
    if (!el) return
    // Near the viewport, and then only once the page has settled: the scene never competes with the page's own load
    // (or with a quick move to another page).
    let timer = 0
    let idle = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      timer = window.setTimeout(() => {
        const go = () => setNear(true)
        if ('requestIdleCallback' in window) idle = window.requestIdleCallback(go, { timeout: 1500 })
        else go()
      }, 700)
    }, { rootMargin: '400px 0px' })
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
      if (idle && 'cancelIdleCallback' in window) window.cancelIdleCallback(idle)
    }
  }, [])
  return (
    <figure className="eb-howto">
      <div ref={slot} className="eb-howto-slot" aria-hidden="true" data-testid="howto-demo">
        {near && (
          <Suspense fallback={null}>
            <HowItWorksStage />
          </Suspense>
        )}
      </div>
      <p className="eb-howto-credit">
        Stickers:{' '}
        <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener noreferrer">huashu-bird-sticker</a>,
        CC BY 4.0
      </p>
      <figcaption className="eb-sr">
        An animation of Everybird at work: an eBird export file is dropped onto Settings, under Your sources, and its rows
        are read. Then the collage builds, stickers arriving around the count as it rolls up to 197 species. Choosing the
        Herons filter brings the six herons into the middle; All birds, in the breadcrumb, brings everyone back. Share
        makes the image to post: the birder&apos;s name, the stickers around 197 species, the latest lifer and the
        sticker credit.
      </figcaption>
    </figure>
  )
}
