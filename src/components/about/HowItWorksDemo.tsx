'use client'
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { preconnect, preload } from 'react-dom'
import { fmt, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { STICKER_BASE } from '@/lib/sticker-url'
import { TOTAL } from './how-it-works-data'
import { demoSticker, poster, POSTER_EAGER, POSTER_STICKERS, Scene } from './HowItWorksScene'
import { LookContext, type Layout } from './stageshow/looks'

// The live scene (the Stageshow kit and the script) loads on its own, after the page: the poster stands in until then.
const loadStage = () => import('./HowItWorksStage')
/** How long the poster holds in view before the story starts, and how long it waits at most for its stickers. */
const HOLD_MS = 600
const STICKERS_MS = 3000

const SIZE: Record<Layout, [number, number]> = { wide: [720, 470], compact: [358, 356] }

/**
 * The figure's first frame, server-rendered: the collage made, every sticker around its count (the scene's poster
 * state), in both designs; the slot's width picks one (under 560px the compact one, as the stage does) and zooms it
 * to the slot, past its design size too (up to 2x, as the stage's fill), laid out at that size so it stays sharp. Layout and text are there with the page's HTML; each sticker fades in as it decodes. It is the whole
 * figure under reduced motion.
 */
export function HowItWorksPoster() {
  const box = useRef<HTMLDivElement>(null)
  // Where CSS can't make the ratio (tan(atan2(100cqw, 720px)), how-it-works.css), the zoom is measured once mounted.
  useLayoutEffect(() => {
    const el = box.current
    if (!el || CSS.supports('scale', 'tan(atan2(100cqw, 720px))')) return
    const fit = () => {
      const w = el.clientWidth
      el.style.setProperty('--k', String(Math.min(2, w / (w < 560 ? 358 : 720))))
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
 * the poster fades away as the story starts; the stage pauses off screen and in a hidden tab, and a quiet Pause beside
 * the credit stops it (its still frame) until Play. Under reduced motion the poster is all there is.
 */
export function HowItWorksDemo() {
  const { t } = useI18n()
  preconnect(STICKER_BASE)
  for (const code of POSTER_STICKERS.slice(0, POSTER_EAGER)) {
    const img = demoSticker(code)
    preload(img.src, { as: 'image', imageSrcSet: img.srcSet, imageSizes: img.sizes })
  }
  const slot = useRef<HTMLDivElement>(null)
  const [Stage, setStage] = useState<ComponentType<{ paused?: boolean }> | null>(null)
  // The viewer's Pause (WCAG 2.2.2: a loop that runs as long as it is on screen can be stopped); Play starts it afresh.
  const [paused, setPaused] = useState(false)
  const [posterGone, setPosterGone] = useState(false)
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const el = slot.current
    if (!el || reducedMotion()) return
    let live = true
    let timer = 0
    // The live scene's code, fetched once the page has loaded (at an idle moment), so it never competes with the page.
    const code = new Promise<ComponentType<{ paused?: boolean }>>((resolve) => {
      const go = () => void loadStage().then((m) => resolve(m.default))
      const idle = () => ('requestIdleCallback' in window ? window.requestIdleCallback(go, { timeout: 2000 }) : setTimeout(go, 200))
      if (document.readyState === 'complete') idle()
      else window.addEventListener('load', idle, { once: true })
    })
    // The shown design's stickers: every one decoded (or failed), or STICKERS_MS, whichever comes first. The other design
    // is display: none, and its lazy stickers never load.
    const shown = [...el.querySelectorAll<HTMLElement>('[data-poster]')].filter((d) => d.getClientRects().length > 0)
    const stickers = Promise.race([
      Promise.all(shown.flatMap((d) => [...d.querySelectorAll('img')]).map((img) => img.decode().catch(() => {}))),
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
        {Stage && <Stage paused={paused} />}
        {!posterGone && <div className="eb-howto-poster" data-fading={fading || undefined}><HowItWorksPoster /></div>}
      </div>
      <div className="eb-howto-foot">
        <p className="eb-howto-credit">
          {rich(t.demo.credit, { link: (chunk) => <a href="https://github.com/alchaincyf/huashu-bird-sticker" target="_blank" rel="noopener noreferrer">{chunk}</a> })}
        </p>
        {/* Only once the live stage runs (never under reduced motion, where the poster is all there is). */}
        {Stage && (
          <button type="button" className="eb-textbtn eb-howto-pause" onClick={() => setPaused(!paused)} data-testid="howto-pause">
            {paused ? t.demo.play : t.demo.pause}
          </button>
        )}
      </div>
      <figcaption className="eb-sr">{fmt(t.demo.caption, { total: formatInt(TOTAL, t.num) })}</figcaption>
    </figure>
  )
}
