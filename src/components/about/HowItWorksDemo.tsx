'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { preconnect, preload } from 'react-dom'
import { STICKER_BASE } from '@/lib/sticker-url'
import { demoStickerUrl, poster, POSTER_STICKERS, Scene } from './HowItWorksScene'
import { LookContext, type Layout } from './stageshow/looks'

// The live scene (the Stageshow kit and the script) loads on its own, after the page: the poster stands in until then.
const loadStage = () => import('./HowItWorksStage')
/** The biggest stickers of the poster are preloaded from the document's head; the rest follow as the poster parses. */
const PRELOAD = 6
/** How long the poster holds in view before the story starts, and how long it waits at most for its stickers. */
const HOLD_MS = 600
const STICKERS_MS = 3000

const SIZE: Record<Layout, [number, number]> = { wide: [720, 470], compact: [358, 356] }

/**
 * The figure's first frame, server-rendered: the collage made, every sticker around its count (the scene's poster
 * state), in both designs; the slot's width picks one (under 560px the compact one, as the stage does) and scales it
 * to the slot. Layout and text are there with the page's HTML; each sticker fades in as it decodes. It is the whole
 * figure under reduced motion.
 */
export function HowItWorksPoster() {
  const box = useRef<HTMLDivElement>(null)
  // Where CSS can't divide lengths (calc(100cqw / 720px)), the scale is measured once mounted.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || CSS.supports('scale', 'calc(100cqw / 720px)')) return
    const fit = () => {
      const w = el.clientWidth
      el.style.setProperty('--k', String(Math.min(1, w / (w < 560 ? 358 : 720))))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={box} className="ebd-poster" data-testid="howto-poster">
      {(['wide', 'compact'] as const).map((layout) => (
        <div key={layout} className="ss-fit ebd" data-poster={layout}>
          <div className="ss-stage" data-still="" data-layout={layout} data-theme="light" data-palette="accent" data-fidelity="standard"
            style={{ width: SIZE[layout][0], height: SIZE[layout][1] }}>
            <LookContext.Provider value={{ theme: 'light', palette: 'accent', fidelity: 'standard', layout }}>
              <Scene s={poster} layout={layout} />
            </LookContext.Provider>
          </div>
        </div>
      ))}
    </div>
  )
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * The animated "How it works" figure on About. Decorative: the moving picture is aria-hidden and the caption (visually
 * hidden) tells the same story in words. The slot's height is set in CSS for both designs (about.css), and the static
 * poster fills it from the first paint, so the figure never shows an empty box and nothing shifts. Once the figure is
 * in view (and its poster's stickers are in, or a few seconds have passed) the live stage mounts under the poster and
 * the poster fades away as the story starts; the stage pauses off screen and in a hidden tab. Under reduced motion the
 * poster is all there is.
 */
export function HowItWorksDemo() {
  preconnect(STICKER_BASE)
  for (const code of POSTER_STICKERS.slice(0, PRELOAD)) preload(demoStickerUrl(code), { as: 'image' })
  const slot = useRef<HTMLDivElement>(null)
  const [Stage, setStage] = useState<ComponentType | null>(null)
  const [posterGone, setPosterGone] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const el = slot.current
    if (!el || reducedMotion()) return
    let live = true
    let timer = 0
    // The live scene's code, fetched once the page has loaded (at an idle moment), so it never competes with the page.
    const code = new Promise<ComponentType>((resolve) => {
      const go = () => void loadStage().then((m) => resolve(m.default))
      const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 200))
      if (document.readyState === 'complete') idle()
      else window.addEventListener('load', idle, { once: true })
    })
    // The poster's stickers: every one decoded (or failed), or STICKERS_MS, whichever comes first.
    const stickers = Promise.race([
      Promise.all([...el.querySelectorAll<HTMLImageElement>('[data-poster] img')].map((img) => img.decode().catch(() => {}))),
      new Promise((r) => window.setTimeout(r, STICKERS_MS)),
    ])
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      void Promise.all([code, stickers, new Promise((r) => { timer = window.setTimeout(r, HOLD_MS) })]).then(([C]) => {
        if (live) setStage(() => C)
      })
    }, { threshold: 0.35 })
    io.observe(el)
    return () => { live = false; io.disconnect(); window.clearTimeout(timer) }
  }, [])

  // The stage has mounted (its first frame is the start of the story): fade the poster out over it, then drop it.
  useEffect(() => {
    if (!Stage) return
    let raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => setFading(true)) })
    const t = window.setTimeout(() => setPosterGone(true), 700)
    return () => { cancelAnimationFrame(raf); window.clearTimeout(t) }
  }, [Stage])

  return (
    <figure className="eb-howto">
      <div ref={slot} className="eb-howto-slot" aria-hidden="true" data-testid="howto-demo" data-live={Stage ? '' : undefined}>
        {Stage && <Stage />}
        {!posterGone && <div className="eb-howto-poster" data-fading={fading || undefined}><HowItWorksPoster /></div>}
      </div>
      <p className="eb-howto-credit">
        Stickers:{' '}
        <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener noreferrer">huashu-bird-sticker</a>,
        CC BY 4.0
      </p>
      <figcaption className="eb-sr">
        An animation of Everybird at work: an eBird export file is dropped onto Settings, under Your list, and its rows
        are read; MyEBirdData is connected and the collage has 112 species, all from eBird. Then the collage builds,
        stickers arriving around the count as it rolls up to 112 species. Choosing the Herons order brings the six
        herons into the middle; All birds, in the breadcrumb, brings everyone back. Share opens the share dialog: the
        image, with the stickers around 112 species, the latest lifer and the footer line, in the Story, Post and
        Square formats.
      </figcaption>
    </figure>
  )
}
