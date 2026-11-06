'use client'
// The About page's "How it works" demo, as a Stageshow scene (src/components/about/stageshow, a subset of the kit).
// Started from the kit's `upload` gold example: a file on the desktop is carried into a browser window that runs off
// the right and bottom of the stage.
//
// The story, one loop of about 14 s:
//   1. An eBird export sits on the desktop beside Everybird's Settings ("Your sources"). It's dragged onto the eBird
//      file card, which lights up as the real one does; on the drop the card reads the rows.
//   2. "Added 197 species…" opens with "See my collage"; pressed, the page swaps to the collage: stickers arrive
//      around the count as it rolls up to 197.
//   3. The Herons chip is pressed: the order row gives way to the breadcrumb ("All birds / Herons / Herons, Egrets, and
//      Bitterns", an order with one family), the six herons glide and grow into the middle, the rest step out, the
//      count rolls to 6. "All birds" in the breadcrumb (the product's way back) brings everyone back.
//   4. Share: the share image (the centre-count design: the birder's name, the collage around "197 species", the
//      latest lifer, the wordmark and the sticker credit) comes up on the desktop, straddling the window. It holds;
//      then Settings in the top bar takes the window back to the start.
// On phones (compact) there is no desktop: "Choose your eBird file" is pressed instead of a drag, and the share image
// comes up over the window, as the share dialog shows it.
//
// Smoothness (H1): everything that moves is a transform or an opacity on its own element (no height, grid or margin
// animation, one transform property per element so the compositor runs it); the drag image follows the cursor by a
// direct style write, not a React render per frame; the counters write text only when the number changes, inside
// contained boxes.
//
// Real stickers for the focal birds (the configured sticker site), quiet silhouettes (the product's own fallback) at
// the edges. Colors and type are the site's tokens (tokens.css), so the demo follows the light and dark themes.
import { BIRD_PATH } from '@/lib/bird-outline'
import { ArrowRight, Binoculars, CheckSquareOffset, FileCsv, ShareNetwork } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { stickerUrl } from '@/lib/sticker-url'
import { BIRDS, SHARE_BIRDS } from './how-it-works-data'
import { Bar, Stage, Window, type Act, type Layout, type Point, type Rect } from './stageshow'
import './how-it-works.css'

type Ghost = { on: boolean; dropped: boolean; off: Point }
type S = {
  page: 'settings' | 'collage'
  ghost: Ghost
  reading: boolean
  rows: number
  made: boolean
  birds: boolean
  count: number
  herons: boolean
  share: boolean
}

const NO_GHOST: Ghost = { on: false, dropped: false, off: { x: 0, y: 0 } }
const initial: S = { page: 'settings', ghost: NO_GHOST, reading: false, rows: 0, made: false, birds: false, count: 0, herons: false, share: false }
/** The still most people see (reduced motion, a screenshot): the collage made, and its share image beside it. */
const poster: S = { ...initial, page: 'collage', birds: true, count: 197, share: true }

const FILE = 'MyEBirdData.csv'
/** Where the cursor rests between loops: below the file on the desktop (wide), in the window's empty margin (compact). */
const REST = { wide: { x: 122, y: 92 }, compact: { x: 286, y: 150 } }
const TOTAL = 197
const HERONS = 6
const ROWS = 4812
/** The latest lifer on the share image (one of the stickers in it). */
const LATEST = { code: 'triher', name: 'Tricolored Heron' }

// ---- Geometry ----
// Wide (720 × 470): one gutter (28) above the window; the desktop column holds the file at the top and the share
// image, straddling the window's left edge, below it. The window runs off the right and bottom.
// Compact (358 × 356): no desktop, so no tinted field: the window sits on the page itself, inset 16 at the top and
// left, off the right and bottom (what shows is square). The share image comes up over the window as the product's
// share dialog shows it, over a scrim.
type Geo = { win: { x: number; y: number; w: number; h: number }; col: number; f: number; share: { x: number; y: number } }
const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 156, y: 28, w: 660, h: 470 }, col: 524, f: 1, share: { x: 62, y: 217 } },
  compact: { win: { x: 16, y: 16, w: 400, h: 420 }, col: 310, f: 0.6, share: { x: 89, y: 104 } },
}

function Silhouette({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 256 256" className="ebd-sil" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d={BIRD_PATH} fill="currentColor" />
    </svg>
  )
}

const dpr = () => (typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 1))

/** A sticker from the configured sticker site; the product's silhouette if it fails to load (as the collage does). */
function Sticker({ code, px }: { code: string; px: number }) {
  const [failed, setFailed] = useState(false)
  if (failed) return <Silhouette />
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={stickerUrl(code, px, dpr())} alt="" draggable={false} decoding="async" onError={() => setFailed(true)} />
}

/**
 * The count in the collage's hole, ticking from the old total to the new one (ease-out quart) as the product's own
 * Tally does (src/components/collage/Tally.tsx). It jumps inside a snap, off screen or under reduced motion. The text
 * is written only when the shown number changes (a few dozen writes, not one per frame), in a contained box.
 */
function Tick({ value, ms }: { value: number; ms: number }) {
  const el = useRef<HTMLSpanElement>(null)
  const from = useRef(value)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const a = from.current
    from.current = value
    let shown = ''
    const show = (n: number) => {
      const t = n.toLocaleString('en-US')
      if (t !== shown) { shown = t; node.textContent = t }
    }
    const instant = !!node.closest('[data-instant], [data-offscreen], [data-still]')
    if (a === value || instant) { show(value); return }
    let raf = 0
    const t0 = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - t0) / ms))
      show(Math.round(a + (value - a) * (1 - Math.pow(1 - k, 4))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    show(a)
    raf = requestAnimationFrame(step)
    return () => { cancelAnimationFrame(raf); show(value) }
  }, [value, ms])
  return <span ref={el}>{value.toLocaleString('en-US')}</span>
}

// ---- The drag image: moved by direct style writes, never by a render ----

/** One per stage: the drag image's element, its grab offset, and the drop card it lights. */
type Drag = { el: HTMLDivElement | null; card: Rect | null; cardEl: HTMLElement | null; over: boolean }

function dragTo(d: Drag, at: Point, off: Point) {
  const el = d.el
  if (el) el.style.transform = `translate(${at.x - off.x}px, ${at.y - off.y}px)`
  const c = d.card
  const over = !!c && at.x >= c.x && at.x <= c.x + c.width && at.y >= c.y && at.y <= c.y + c.height
  if (over !== d.over) {
    d.over = over
    d.cardEl?.toggleAttribute('data-over', over)
  }
}
function bindDrag(d: Drag, el: HTMLDivElement | null) {
  d.el = el
}
function dragEnd(d: Drag) {
  d.cardEl?.removeAttribute('data-over')
  d.over = false
  d.card = null
}

// ---- The script ----

function makeScript(drag: Drag) {
  return async function script(a: Act<S>) {
    await a.wait(400)
    const wide = a.layout === 'wide'

    // 1. The eBird file arrives: carried in from the desktop (wide), or chosen (compact)
    if (wide) {
      a.mark('grab')
      const icon = a.rect('desk-icon')
      const file = a.rect('desk-file')
      const grab = { x: icon.x + icon.width / 2, y: icon.y + icon.height * 0.55 }
      await a.move(grab)
      await a.wait(200)
      const off = { x: grab.x - file.x, y: grab.y - file.y }
      drag.card = a.rect('drop')
      drag.cardEl = drag.el?.closest('.ss-stage')?.querySelector<HTMLElement>('[data-drop]') ?? null
      dragTo(drag, grab, off)
      // Shown during the press (the drag waits ~130 ms before it carries), so this render never lands mid-move
      a.put({ ghost: { on: true, dropped: false, off } })
      const card = drag.card
      await a.drag({ x: card.x + card.width * 0.6, y: card.y + card.height * 0.5 }, (at) => dragTo(drag, at, off), { duration: 1150, cursor: 'preserve' })
      a.mark('drop')
      dragEnd(drag)
      await a.set((s) => ({ ghost: { ...s.ghost, dropped: true }, reading: true }))
    } else {
      await a.move({ at: 'choose', x: 0.86, y: 0.62 })
      await a.click()
      a.mark('drop')
      await a.set({ reading: true })
    }
    await a.wait(150)
    await a.set({ rows: ROWS })
    await a.wait(1050)

    // 2. Done: "See my collage", and the collage builds around the count
    a.mark('made')
    await a.set({ made: true, reading: false, ghost: NO_GHOST })
    await a.wait(650)
    await a.move({ at: 'see', x: 0.84, y: 0.62 })
    await a.click()
    a.mark('collage')
    await a.set({ page: 'collage' })
    await a.wait(240)
    // The Settings page has faded out: put it back as it was before the import, out of sight
    await a.snap({ made: false, rows: 0 })
    await a.set({ birds: true, count: TOTAL })
    await a.wait(1800)

    // 3. Herons: the six glide into the middle; "All birds" in the breadcrumb brings everyone back
    await a.move({ at: 'herons', x: 0.86, y: 0.64 })
    await a.click()
    a.mark('herons')
    await a.set({ herons: true, count: HERONS })
    await a.wait(1000)
    await a.move({ at: 'all-birds', x: 0.78, y: 1.05 })
    await a.click()
    a.mark('all')
    await a.set({ herons: false, count: TOTAL })
    await a.wait(250)

    // 4. Share: the cursor heads for it while everyone comes back
    await a.move({ at: 'share', x: 0.82, y: 0.64 })
    await a.wait(150)
    await a.click()
    a.mark('share')
    await a.set({ share: true })
    await a.wait(2300)

    // Reset: Settings in the top bar takes the window back; the image leaves with the collage
    await a.move({ at: 'nav-settings', x: 0.78, y: 0.64 })
    await a.click()
    a.mark('reset')
    await a.set({ page: 'settings', share: false })
    await a.wait(450)
    await a.snap({ birds: false, count: 0 })
    // Back to rest beside the file, where the next loop picks it up
    await a.move(REST[a.layout])
  }
}

// ---- The theme: the stage follows the site's light/dark switch ----

function useSiteTheme(): 'light' | 'dark' {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  useEffect(() => {
    const html = document.documentElement
    const read = () => setTheme(html.dataset.theme === 'dark' ? 'dark' : 'light')
    read()
    const mo = new MutationObserver(read)
    mo.observe(html, { attributes: true, attributeFilter: ['data-theme'] })
    return () => mo.disconnect()
  }, [])
  return theme
}

export default function HowItWorksStage() {
  const theme = useSiteTheme()
  const [drag] = useState<Drag>(() => ({ el: null, card: null, cardEl: null, over: false }))
  const [script] = useState(() => makeScript(drag))
  return (
    <Stage<S>
      width={720}
      height={470}
      compact={{ below: 560, width: 358, height: 356 }}
      initial={initial}
      poster={poster}
      script={script}
      theme={theme}
      cursor={{ at: REST }}
      className="ebd"
    >
      {(s, _rect, layout) => <Scene s={s} layout={layout} drag={drag} />}
    </Stage>
  )
}

function Scene({ s, layout, drag }: { s: S; layout: Layout; drag: Drag }) {
  const g = GEO[layout]
  const wide = layout === 'wide'
  const lifted = s.ghost.on && !s.ghost.dropped
  return (
    <>
      {wide && (
        <div className="ebd-desk" data-target="desk-file" data-lifted={lifted || undefined}>
          <span data-target="desk-icon"><CsvIcon /></span>
          <span className="ebd-desk-name">{FILE}</span>
        </div>
      )}

      <Window
        className="ebd-window"
        url="everybird.yusuftaleb.com"
        urlShape="pill"
        style={{ left: g.win.x, top: g.win.y, width: g.win.w, height: g.win.h }}
        body={{ className: 'ebd-body', 'data-crop': true, style: { ['--col' as string]: `${g.col}px` } }}
      >
        <TopBar page={s.page} compact={!wide} />
        <div className="ebd-pages">
          <div className="ebd-page" data-show={s.page === 'settings' || undefined}>
            <SettingsPage s={s} wide={wide} />
          </div>
          <div className="ebd-page" data-show={s.page === 'collage' || undefined}>
            <CollagePage s={s} layout={layout} />
          </div>
        </div>
        {!wide && <div className="ebd-scrim" data-show={s.share || undefined} />}
      </Window>

      <ShareImage show={s.share} at={g.share} />

      {wide && (
        <DragImage ghost={s.ghost} drag={drag}>
          <CsvIcon />
          <span className="ebd-drag-name">{FILE}</span>
        </DragImage>
      )}
    </>
  )
}

function TopBar({ page, compact }: { page: S['page']; compact: boolean }) {
  return (
    <div className="ebd-top">
      <span className="ebd-wordmark">Everybird</span>
      <span className="ebd-nav">
        <span className="ebd-nav-link" data-label="Collage" data-on={page === 'collage' || undefined}>Collage</span>
        <span className="ebd-nav-link" data-label="Settings" data-on={page === 'settings' || undefined} data-target="nav-settings">Settings</span>
        {!compact && <span className="ebd-nav-link" data-label="About">About</span>}
      </span>
    </div>
  )
}

function SettingsPage({ s, wide }: { s: S; wide: boolean }) {
  return (
    <div className="ebd-col ebd-col-settings">
      {/* The banner opens over the top of the column and pushes the sources down by a transform (no height animates) */}
      <div className="ebd-made" data-show={s.made || undefined}>
        <span className="ebd-made-text">Added 197 species{wide ? ' from your eBird export' : ''}.</span>
        <span className="ebd-btn ebd-btn-see" data-target="see">
          See my collage
          <ArrowRight weight="bold" />
        </span>
      </div>
      <div className="ebd-below" data-pushed={s.made || undefined}>
        <div className="ebd-h2">Your sources</div>
        <div className="ebd-way" data-target="drop" data-drop data-busy={s.reading || undefined}>
          <div className="ebd-way-title"><FileCsv />eBird file</div>
          <div className="ebd-lines">
            <Bar w={wide ? 300 : 230} h={7} tone={3} />
            <Bar w={wide ? 210 : 150} h={7} tone={3} />
          </div>
          <span className="ebd-btn ebd-btn-quiet" data-target="choose">Choose your eBird file</span>
          {/* The card's status line keeps its place (as .eb-status does); the words fade in and out */}
          <p className="ebd-status">
            <span data-show={s.reading || undefined}>Reading your file… <Tick value={s.rows} ms={900} /> rows</span>
          </p>
          {wide && <Bar w={196} h={6} tone={2} />}
        </div>
        <div className="ebd-way">
          <div className="ebd-way-title"><Binoculars />iNaturalist</div>
          <div className="ebd-lines">
            <Bar w={wide ? 280 : 210} h={7} tone={3} />
          </div>
          <div className="ebd-field-row">
            <span className="ebd-field"><Bar w={110} h={6} tone={2} /></span>
            <span className="ebd-btn ebd-btn-quiet ebd-btn-blank"><Bar w={64} h={6} tone={3} /></span>
          </div>
        </div>
        <div className="ebd-way">
          <div className="ebd-way-title"><CheckSquareOffset />Tick by hand</div>
          <div className="ebd-lines">
            <Bar w={wide ? 260 : 200} h={7} tone={3} />
          </div>
        </div>
      </div>
    </div>
  )
}

function CollagePage({ s, layout }: { s: S; layout: Layout }) {
  const g = GEO[layout]
  const wide = layout === 'wide'
  const filtered = s.herons
  return (
    <div className="ebd-col ebd-col-collage">
      <div className="ebd-head">
        <span className="ebd-head-title">My collage</span>
        <span className="ebd-btn ebd-btn-share" data-target="share"><ShareNetwork weight="bold" />Share</span>
      </div>
      {/* The taxonomy filter as the product shows it: the order row, and once an order is chosen the breadcrumb in its
          place (Herons is an order with one family here, so the breadcrumb ends with the family and no row follows) */}
      <div className="ebd-filter" data-chosen={filtered || undefined}>
        <div className="ebd-chips">
          <span className="ebd-chips-label">Orders</span>
          {wide && <span className="ebd-chip">Perching birds<span className="ebd-chip-n">112</span></span>}
          <span className="ebd-chip">Waterfowl<span className="ebd-chip-n">21</span></span>
          <span className="ebd-chip" data-target="herons">Herons<span className="ebd-chip-n">{HERONS}</span></span>
        </div>
        <div className="ebd-path">
          <span className="ebd-path-link" data-target="all-birds">All birds</span>
          <span className="ebd-path-sep">/</span>
          <span className="ebd-path-link">Herons</span>
          <span className="ebd-path-sep">/</span>
          <span className="ebd-path-here">Herons, Egrets, and Bitterns</span>
        </div>
      </div>
      <div className="ebd-collage" data-birds={s.birds || undefined}>
        {BIRDS.map((b, i) => {
          if (!wide && b.wideOnly) return null
          const f = g.f
          const inGroup = !!b.heron
          const t = filtered && b.heron ? b.heron : b
          const k = filtered && b.heron ? b.heron.s / b.s : 1
          const out = filtered && !inGroup
          const dist = Math.hypot(b.x, b.y)
          // Stickers that leave shrink a little as they fade; the silhouettes only fade (fewer things in flight)
          const scale = out && b.code ? k * 0.6 : k
          const style: CSSProperties = {
            width: b.s * f,
            height: b.s * f,
            marginLeft: (-b.s * f) / 2,
            marginTop: (-b.s * f) / 2,
            transform: `translate(${t.x * f}px, ${t.y * f}px) scale(${scale})`,
            ['--d' as string]: `${Math.round(dist * 1.6)}ms`,
            ['--md' as string]: out ? '0ms' : filtered ? '40ms' : inGroup ? '0ms' : '90ms',
          }
          return (
            <span key={i} className="ebd-bird" data-out={out || undefined} data-fill={!b.code || undefined} style={style}>
              <span className="ebd-bird-in">
                {b.code ? <Sticker code={b.code} px={(b.heron?.s ?? b.s) * f} /> : <Silhouette flip={b.flip} />}
              </span>
            </span>
          )
        })}
        <div className="ebd-mid">
          <span className="ebd-num"><Tick value={s.count} ms={s.count === TOTAL && !s.herons ? 1400 : 640} /></span>
          <span className="ebd-mid-label">Species</span>
        </div>
      </div>
    </div>
  )
}

// The share image (the post format, 1080 × 1350, drawn at 180 × 225): the product's centre-count design
// (src/lib/share/image.ts cardLayout): the name on top, the collage with the count in its middle, the latest lifer row,
// a hairline, then the wordmark and site, and the sticker credit, which at this size takes its own line (as the
// product's does when it doesn't fit beside the wordmark). Text is set larger than the true scale so it reads; the
// site's address and the "Latest lifer" label are filler.
const SHARE_COLLAGE = { w: 158, h: 138 }

function ShareImage({ show, at }: { show: boolean; at: Geo['share'] }) {
  return (
    <div className="ebd-share" data-show={show || undefined} style={{ left: at.x, top: at.y }}>
      <div className="ebd-share-name">Sam Reyes</div>
      <div className="ebd-share-collage">
        {SHARE_BIRDS.map((b) => (
          <span
            key={b.code}
            className="ebd-share-bird"
            style={{ left: b.x * SHARE_COLLAGE.w - b.s / 2, top: b.y * SHARE_COLLAGE.h - b.s / 2, width: b.s, height: b.s }}
          >
            <Sticker code={b.code} px={b.s} />
          </span>
        ))}
        <div className="ebd-share-mid">
          <span className="ebd-share-num">197</span>
          <span className="ebd-share-label">Species</span>
        </div>
      </div>
      <div className="ebd-share-latest">
        <span className="ebd-share-latest-icon"><Sticker code={LATEST.code} px={16} /></span>
        <span className="ebd-share-latest-text">
          <Bar w={46} h={3} tone={2} />
          <span>{LATEST.name}</span>
        </span>
      </div>
      {/* As the real share image's footer: the wordmark, then the address (a bar here) and "· stickers by huashu". */}
      <div className="ebd-share-foot">
        <span className="ebd-share-mark">Everybird</span>
        <Bar w={26} h={3} tone={2} />
        <span className="ebd-share-credit">· stickers by huashu</span>
      </div>
    </div>
  )
}

/** The eBird export on the desktop: a page with a folded corner and a CSV band. */
function CsvIcon() {
  return (
    <span className="ebd-csv">
      <span className="ebd-csv-band">CSV</span>
    </span>
  )
}

/**
 * The drag image. Its position is written straight to its style by the script's drag (dragTo), so the drag never
 * re-renders the scene; React only shows it, drops it and hides it.
 */
function DragImage({ ghost, drag, children }: { ghost: Ghost; drag: Drag; children: ReactNode }) {
  const following = ghost.on && !ghost.dropped
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    bindDrag(drag, ref.current)
    return () => { dragEnd(drag); bindDrag(drag, null) }
  }, [drag])
  return (
    <div ref={ref} className="ebd-drag" data-show={following || undefined} data-dropped={ghost.dropped || undefined}>
      <div className="ebd-drag-inner" style={{ transformOrigin: `${ghost.off.x}px ${ghost.off.y}px` }}>{children}</div>
    </div>
  )
}
