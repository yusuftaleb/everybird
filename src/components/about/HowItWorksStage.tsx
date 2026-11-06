'use client'
// The About page's "How it works" demo, as a Stageshow scene (src/components/about/stageshow, a subset of the kit).
// Started from the kit's `upload` gold example: a file on the desktop is carried into a browser window that runs off
// the right and bottom of the stage.
//
// The story, one loop of about 15 s:
//   1. An eBird export sits on the desktop beside Everybird's Settings ("Your sources"). It's dragged onto the eBird
//      file card, which lights up as the real one does; on the drop the card reads the rows.
//   2. "Added 197 species…" opens with "See my collage"; pressed, the page swaps to the collage: stickers arrive
//      around the count as it rolls up to 197.
//   3. The Herons chip is pressed: the six herons glide and grow into the middle, the rest step out, the count rolls to
//      6 of 197. Pressed again (the product's own way to clear it), everyone comes back.
//   4. Share: the share image (the birder's name, "197 species", the stickers and their credit) comes up on the
//      desktop, straddling the window. It holds; then Settings in the top bar takes the window back to the start.
// On phones (compact) there is no desktop: "Choose your eBird file" is pressed instead of a drag, and the share image
// comes up over the window, as the share dialog shows it.
//
// Real stickers for the focal birds (the configured sticker site), quiet silhouettes (the product's own fallback) at
// the edges. Colors and type are the site's tokens (tokens.css), so the demo follows the light and dark themes.
import { ArrowRight, Binoculars, CheckSquareOffset, FileCsv, ShareNetwork } from '@phosphor-icons/react'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { stickerUrl } from '@/lib/sticker-url'
import { Bar, Collapse, Stage, Window, type Act, type Layout, type Point } from './stageshow'
import './how-it-works.css'

type Ghost = { on: boolean; dropped: boolean; off: Point; at: Point }
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

const NO_GHOST: Ghost = { on: false, dropped: false, off: { x: 0, y: 0 }, at: { x: 0, y: 0 } }
const initial: S = { page: 'settings', ghost: NO_GHOST, reading: false, rows: 0, made: false, birds: false, count: 0, herons: false, share: false }
/** The still most people see (reduced motion, a screenshot): the collage made, and its share image beside it. */
const poster: S = { ...initial, page: 'collage', birds: true, count: 197, share: true }

const FILE = 'MyEBirdData.csv'
/** Where the cursor rests between loops: below the file on the desktop (wide), in the window's empty margin (compact). */
const REST = { wide: { x: 122, y: 92 }, compact: { x: 286, y: 150 } }
const TOTAL = 197
const ROWS = 4812

// ---- Geometry ----
// Wide (720 × 470): one gutter (28) above the window; the desktop column holds the file at the top and the share
// image, straddling the window's left edge, below it. The window runs off the right and bottom.
// Compact (358 × 356): the window inset 16 at the top and left, off the right and bottom (what shows is square). The
// share image comes up over the window as the product's share dialog shows it, over a scrim.
type Geo = { win: { x: number; y: number; w: number; h: number }; col: number; f: number; share: { x: number; y: number; w: number } }
const GEO: Record<Layout, Geo> = {
  wide: { win: { x: 156, y: 28, w: 660, h: 470 }, col: 524, f: 1, share: { x: 70, y: 226, w: 172 } },
  compact: { win: { x: 16, y: 16, w: 400, h: 420 }, col: 310, f: 0.6, share: { x: 102, y: 92, w: 170 } },
}

// ---- The birds ----
// Centre offsets (px) from the count, the long side of the sticker's box, and where a heron goes when Herons is chosen.
type BirdDef = { code?: string; x: number; y: number; s: number; flip?: boolean; heron?: { x: number; y: number; s: number }; wideOnly?: boolean }
const BIRDS: BirdDef[] = [
  { code: 'baleag', x: -118, y: -6, s: 96 },
  { code: 'grbher3', x: 124, y: 2, s: 104, heron: { x: 150, y: 2, s: 150 } },
  { code: 'mutswa', x: -6, y: 86, s: 82 },
  { code: 'grhowl', x: -44, y: -80, s: 58 },
  { code: 'rethaw', x: 52, y: -80, s: 60 },
  { code: 'greegr', x: -172, y: 70, s: 64, heron: { x: -148, y: 4, s: 128 } },
  { code: 'mallar3', x: -96, y: 84, s: 54 },
  { code: 'wooduc', x: 90, y: 88, s: 48 },
  { code: 'blujay', x: 206, y: -66, s: 44 },
  { code: 'snoegr', x: 196, y: 72, s: 58, heron: { x: -42, y: -80, s: 70 } },
  { code: 'amerob', x: -128, y: -84, s: 40 },
  { code: 'comkin1', x: 136, y: -84, s: 36 },
  { code: 'whiibi', x: -182, y: -52, s: 46, heron: { x: 48, y: 82, s: 74 } },
  { code: 'bcnher', x: 232, y: 4, s: 46, heron: { x: -46, y: 82, s: 72 }, wideOnly: true },
  { code: 'grnher', x: 160, y: 20, s: 40, heron: { x: 44, y: -80, s: 64 } },
  { code: 'annhum', x: 46, y: 50, s: 22 },
  { code: 'barswa', x: -50, y: 50, s: 28 },
  // Filler at the edges and under the crop: the product's silhouette, in Hairline
  { x: -238, y: -96, s: 26, wideOnly: true },
  { x: 238, y: -98, s: 24, flip: true, wideOnly: true },
  { x: -248, y: 40, s: 28, wideOnly: true },
  { x: 246, y: 52, s: 30, flip: true, wideOnly: true },
  { x: -150, y: 126, s: 34 },
  { x: 150, y: 128, s: 32, flip: true },
  { x: -230, y: 116, s: 30, flip: true, wideOnly: true },
  { x: 232, y: 118, s: 34, wideOnly: true },
  { x: -58, y: 136, s: 30, flip: true },
  { x: 62, y: 140, s: 28 },
  { x: 174, y: -26, s: 22, flip: true },
]

/** The mini collage on the share image: (x, y, size) in the image's collage box (0 to 1), its own packing. */
const SHARE_BIRDS: { code: string; x: number; y: number; s: number }[] = [
  { code: 'baleag', x: 0.27, y: 0.42, s: 0.42 },
  { code: 'grbher3', x: 0.72, y: 0.4, s: 0.46 },
  { code: 'mutswa', x: 0.5, y: 0.8, s: 0.34 },
  { code: 'rethaw', x: 0.52, y: 0.24, s: 0.26 },
  { code: 'greegr', x: 0.1, y: 0.8, s: 0.3 },
  { code: 'mallar3', x: 0.27, y: 0.86, s: 0.22 },
  { code: 'wooduc', x: 0.73, y: 0.86, s: 0.2 },
  { code: 'blujay', x: 0.92, y: 0.16, s: 0.18 },
  { code: 'norcar', x: 0.08, y: 0.14, s: 0.17 },
  { code: 'snoegr', x: 0.92, y: 0.74, s: 0.24 },
  { code: 'comkin1', x: 0.28, y: 0.1, s: 0.15 },
  { code: 'amerob', x: 0.75, y: 0.1, s: 0.16 },
  { code: 'annhum', x: 0.5, y: 0.55, s: 0.1 },
]

const BIRD_PATH =
  'M236.44,73.34,213.21,57.86A60,60,0,0,0,156,16h-.29C122.79,16.16,96,43.47,96,76.89V96.63L11.63,197.88l-.1.12A16,16,0,0,0,24,224h88A104.11,104.11,0,0,0,216,120V100.28l20.44-13.62a8,8,0,0,0,0-13.32ZM126.15,133.12l-60,72a8,8,0,1,1-12.29-10.24l60-72a8,8,0,1,1,12.29,10.24ZM164,80a12,12,0,1,1,12-12A12,12,0,0,1,164,80Z'

function Silhouette({ flip }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 256 256" className="ebd-sil" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d={BIRD_PATH} fill="currentColor" />
    </svg>
  )
}

const dpr = () => (typeof window === 'undefined' ? 2 : Math.min(3, window.devicePixelRatio || 1))

function Sticker({ code, px }: { code: string; px: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={stickerUrl(code, px, dpr())} alt="" draggable={false} decoding="async" />
}

/**
 * The count in the collage's hole, ticking from the old total to the new one (ease-out quart) as the product's own
 * Tally does (src/components/collage/Tally.tsx). It jumps inside a snap, off screen or under reduced motion.
 */
function Tick({ value, ms }: { value: number; ms: number }) {
  const el = useRef<HTMLSpanElement>(null)
  const from = useRef(value)
  useLayoutEffect(() => {
    const node = el.current
    if (!node) return
    const a = from.current
    from.current = value
    const show = (n: number) => { node.textContent = n.toLocaleString('en-US') }
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

// ---- The script ----

async function script(a: Act<S>) {
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
    const card = a.rect('drop')
    await a.drag({ x: card.x + card.width * 0.6, y: card.y + card.height * 0.5 }, (at) => {
      a.put({ ghost: { on: true, dropped: false, off, at } })
    }, { duration: 1150, cursor: 'preserve' })
    a.mark('drop')
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

  // 3. Herons: the six glide into the middle; pressed again, everyone comes back
  await a.move({ at: 'herons', x: 0.86, y: 0.64 })
  await a.click()
  a.mark('herons')
  await a.set({ herons: true, count: 6 })
  await a.wait(1600)
  await a.click()
  a.mark('all')
  await a.set({ herons: false, count: TOTAL })
  await a.wait(900)

  // 4. Share: the image the birder posts
  await a.move({ at: 'share', x: 0.82, y: 0.64 })
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
      {(s, _rect, layout) => <Scene s={s} layout={layout} />}
    </Stage>
  )
}

function Scene({ s, layout }: { s: S; layout: Layout }) {
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
        url="everybird.vercel.app"
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

      <ShareImage show={s.share} geo={g.share} layout={layout} />

      {wide && (
        <DragImage ghost={s.ghost}>
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
    <div className="ebd-col">
      <Collapse open={s.made} reveal="drop">
        <div className="ebd-made">
          <span className="ebd-made-text">Added 197 species{wide ? ' from your eBird export' : ''}.</span>
          <span className="ebd-btn ebd-btn-see" data-target="see">
            See my collage
            <ArrowRight weight="bold" />
          </span>
        </div>
      </Collapse>
      <div className="ebd-h2">Your sources</div>
      <div className="ebd-way" data-target="drop" data-drop data-busy={s.reading || undefined}>
        <div className="ebd-way-title"><FileCsv />eBird file</div>
        <div className="ebd-lines">
          <Bar w={wide ? 300 : 230} h={7} tone={3} />
          <Bar w={wide ? 210 : 150} h={7} tone={3} />
        </div>
        <span className="ebd-btn ebd-btn-quiet" data-target="choose">Choose your eBird file</span>
        <Collapse open={s.reading}>
          <p className="ebd-status">
            Reading your file… <Tick value={s.rows} ms={900} /> rows
          </p>
        </Collapse>
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
      <div className="ebd-chips" data-chosen={filtered || undefined}>
        <span className="ebd-chips-label">Orders</span>
        {wide && <span className="ebd-chip">Perching birds<span className="ebd-chip-n">112</span></span>}
        <span className="ebd-chip">Waterfowl<span className="ebd-chip-n">21</span></span>
        <span className="ebd-chip" data-target="herons" data-on={filtered || undefined}>Herons<span className="ebd-chip-n">6</span></span>
      </div>
      <div className="ebd-collage" data-birds={s.birds || undefined} data-herons={filtered || undefined}>
        {BIRDS.map((b, i) => {
          if (!wide && b.wideOnly) return null
          const f = g.f
          const inGroup = !!b.heron
          const t = filtered && b.heron ? b.heron : b
          const k = filtered && b.heron ? b.heron.s / b.s : 1
          const out = filtered && !inGroup
          const dist = Math.hypot(b.x, b.y)
          const style: CSSProperties = {
            width: b.s * f,
            height: b.s * f,
            marginLeft: (-b.s * f) / 2,
            marginTop: (-b.s * f) / 2,
            transform: `translate(${t.x * f}px, ${t.y * f}px) scale(${out ? k * 0.6 : k})`,
            ['--d' as string]: `${Math.round(dist * 1.6)}ms`,
            ['--md' as string]: out ? '0ms' : filtered ? '40ms' : inGroup ? '0ms' : '90ms',
          }
          return (
            <span key={i} className="ebd-bird" data-out={out || undefined} data-fill={!b.code || undefined} style={style}>
              {b.code ? <Sticker code={b.code} px={(b.heron?.s ?? b.s) * f} /> : <Silhouette flip={b.flip} />}
            </span>
          )
        })}
        <div className="ebd-mid">
          <span className="ebd-num"><Tick value={s.count} ms={s.count === TOTAL && !s.herons ? 1400 : 640} /></span>
          <span className="ebd-mid-label">
            <span data-show={!filtered || undefined}>Species</span>
            <span data-show={filtered || undefined}>of 197 species</span>
          </span>
        </div>
      </div>
    </div>
  )
}

function ShareImage({ show, geo, layout }: { show: boolean; geo: Geo['share']; layout: Layout }) {
  const w = geo.w
  const h = Math.round((w * 1350) / 1080)
  const inner = w - 24
  return (
    <div className="ebd-share" data-show={show || undefined} data-layout={layout} style={{ left: geo.x, top: geo.y, width: w, height: h }}>
      <div className="ebd-share-name">Sam Reyes</div>
      <div className="ebd-share-count">197 species</div>
      <div className="ebd-share-collage">
        {SHARE_BIRDS.map((b) => {
          const side = b.s * inner
          return (
            <span key={b.code} className="ebd-share-bird" style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: side, height: side }}>
              <Sticker code={b.code} px={side} />
            </span>
          )
        })}
      </div>
      <div className="ebd-share-foot">
        <span className="ebd-share-mark">Everybird</span>
        <span className="ebd-share-credit">Stickers: huashu-bird-sticker, CC BY 4.0</span>
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

/** The drag image follows the cursor on the drag's own frame callback, and lights the [data-drop] card under it. */
function DragImage({ ghost, children }: { ghost: Ghost; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const over = useRef<HTMLElement | null>(null)
  const following = ghost.on && !ghost.dropped
  const { x: ox, y: oy } = ghost.off
  const { x, y } = ghost.at
  useLayoutEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.ss-stage')
    let next: HTMLElement | null = null
    if (following && root) {
      const box = root.getBoundingClientRect()
      const scale = box.width / root.offsetWidth || 1
      const hit = document.elementFromPoint(box.left + x * scale, box.top + y * scale)?.closest<HTMLElement>('[data-drop]') ?? null
      if (hit && root.contains(hit)) next = hit
    }
    if (next !== over.current) {
      over.current?.removeAttribute('data-over')
      next?.setAttribute('data-over', '')
      over.current = next
    }
  }, [following, x, y])
  useLayoutEffect(() => () => over.current?.removeAttribute('data-over'), [])
  return (
    <div ref={ref} className="ebd-drag" data-show={following || undefined} data-dropped={ghost.dropped || undefined} style={{ transform: `translate(${x - ox}px, ${y - oy}px)` }}>
      <div className="ebd-drag-inner" style={{ transformOrigin: `${ox}px ${oy}px` }}>{children}</div>
    </div>
  )
}
