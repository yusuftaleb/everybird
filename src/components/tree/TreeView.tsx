'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). It opens on every order; a tip opens its branch, and the tree shows the rank one step under the open
// branch (Yusuf, 2026-11-20, round 6): an order its families, a family its genera, a genus its species, whose tips on
// the list open the bird card; or, deeper, the rank picked in the Display panel's Down to (round 6, item 8: the deeper
// of the two, within DRAW_CAP tips; levels.ts). The open order, family and genus are the taxonomy
// filter's (the path under the dock and the Taxa panel's chips: CollageView passes `branch` and gets `onOpen`, path.ts);
// opening a marked row also sets the filter's `with` (the other groups its branch holds), so every view shows the
// branch's birds. A branch never opens on one lone tip (levels.ts: an order with one family at its genera, a family with
// one genus at its species, a group of SPECIES_AT species or fewer at its species). The Layout choice (Fan | Radial |
// Rectangular, kept on the device; unpicked, the fan from FAN_FROM px wide when it names every tip at full size, rows
// otherwise; every one always offered and the one picked drawn, as in Share and Print: round 6, the Tree brief's item 12)
// is rendered here into the controls bar's Display
// panel (`layoutSlot`, a portal), beside the panel's switches, and under it Down to (round 6): the rank the tree draws at
// the least, kept on the device (tree-mine.ts); the tree draws the deeper of it and the one step under the open branch,
// so opening a branch never changes the choice; a rank over DRAW_CAP tips is offered off, with its reason. No count
// line of its own: the page's stats line counts against the taxonomy (CollageView, which also writes the oldest lineage under the view, in the legend's place). The
// Display panel's Time scale switch (tree-mine.ts): on, branches at their true ages over the age axis (rings and ages
// on the Fan and Radial); off, no axis, and the splits spaced evenly by branching order (bySplits).
// Fan and Radial (fan.ts): the root at the centre, the tips on the arc or all round, and every tip's label past it,
// along its radius: the dot, a gap, the sticker's box, a gap, the name, the mark and groups inside of a split group,
// the count (fitScreen sizes the drawing so that every name fits whole, using the whole width: the counts go first
// when room is short, then the sticker's box shrinks to the name's line, then, under the 11px floor, the names shrink as
// far as needed with the dots and branches, and a quiet note under the tree offers Rectangular; hovering, tapping or
// focusing a tip shows its whole name and count in a tooltip when the names are under the floor); on a touch screen, unpicked, Rectangular at any width
// (AD5). The rows are one Tab stop (↑ ↓ Home End, AU3); the chart fades in per branch, rank and layout (AN11); a failed
// load offers Try again (H4) and Lifers only emptying the view offers Show every group (D9); the ages where no branch
// runs (under the fan's centre; in the Radial's opening at the top, RADIAL_GAP, on Paper, only where the patch fits it),
// the axis title under the drawing. The rank drawn and how many (rankCount) goes up to the stats line (onRankLine).
// Their rows stay in the page, visually hidden, for the keyboard and screen readers. Rectangular draws the tree top to
// bottom in about half the width (rowsTreeW) beside the rows, which grow with their names and reach the view's right
// edge, the counts ending there in one column. Between the rows, headings name the group at the rank right above the
// tips (families over genera, genera over species, orders over families), after the higher ranks that change at the
// same row ("Passeriformes · Thraupidae"; levels.ts), in plain Muted mono, never selectable (round 6, item 10). In
// every layout, where such a group begins its most recent common ancestor keeps a small dot and the group's name along
// its stem, only where it touches no branch, row or other name (nodes.ts; the rule is in its header). Branches have rounded corners and simply join; every tip has one small
// hollow dot. Each tip shows a sticker: the species' own, else one bird of the group on the list, else (no bird on the
// list) the group's first species with a sticker, dimmed as a species off the list (groupSticker). One name per tip,
// following the Scientific switch. Hovering a tip, or focusing it from the keyboard, turns its name Accent with an
// underline (nothing moves); the keyboard's focus adds the outline round the name. A group the tree splits is one
// marked row at the smallest branch holding it, "with" the groups inside it right after its mark; more than two genera
// inside are a button opening their list (PickerSheet), each opening its own species. Under it: the key (the mark and the dotted line of a
// tip placed without genetic data, each when the drawing has it) and the birds the tree does not place. The credit is
// About's. levels.ts, fan.ts and tree.ts hold the logic.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type FocusEvent, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { Sticker } from '@/components/collage/Sticker'
import { PickerSheet } from '@/components/filters/PickerSheet'
import { DisplaySegments } from '@/components/app/DisplayPanel'
import type { ListEntry } from '@/lib/list/model'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { FAN_FROM, LABEL_COUNT, LABEL_GAP, RADIAL_GAP, SCREEN_SIZES, dotK, drawFan, fanLabel, fanRing, fitRound, fitScreen, inOpening, ringLabels, type FanShape, type LabelSpan } from '@/lib/tree/fan'
import { ROW_H, depthOf, downOptions, rankCount, rowsTreeW, genusOf, levelView, tipOn, type Inside, type LevelView, type TipRank, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { loadTree } from '@/lib/tree/load'
import { rowNodeLabels, roundNodeLabels, type NodeLabel } from '@/lib/tree/nodes'
import type { OpenBranch } from '@/lib/tree/path'
import { TREE_LAYOUTS, setTreeDown, setTreeLayout, setTreeMine, useTreeDown, useTreeLayout, useTreeMine, useTreeTime, type TreeLayout } from '@/lib/tree-mine'
import { TIP_R, ageTicks, bySplits, circlePath, drawTree, formatAge, type Tree, type TreeFile } from '@/lib/tree/tree'
import '@/components/collage/card-list.css'
import './tree.css'

type Loaded = { file: TreeFile; tree: Tree; species: SpeciesIndex }
/** What the view draws, for Share (view-image.ts ShareAt). */
export type TreeShown = { tree: TreeLevel; rank: TipRank; mine: boolean; layout: TreeLayout; time: boolean }
type Tip = Exclude<TreeRow, { kind: 'head' }>

/** Under the Fan and Radial, below their lowest label: air before the axis title. */
const ROUND_PAD = 8
/** A row's sticker (px); the split-group mark's width with its margins (px, at the 13px names). */
const ROW_STICKER = 24
const MARK_W = 7 + 8
/** A Fan's or Radial's sticker box under this (px) shows no bird: too small to see one. */
const MIN_STICKER = 6
/** The named nodes' text (px; the headings' Muted mono) and its line. */
const NODE_PX = 11
const NODE_LINE = 13
const shapeOf = (l: TreeLayout): FanShape => (l === 'circle' ? 'circle' : 'fan')
/** The Taxa panel head's word for each group rank (its "18 of 45 orders"). */
const TAXA_HEAD = { orders: 'order', families: 'family', genera: 'genus' } as const

type Props = {
  /** The filtered list. */
  entries: ListEntry[]
  sci: boolean
  /** Opens the bird card; `el` is the pressed button. */
  onPick: (code: string, el: HTMLElement) => void
  /** The open branch: the filter's order and family, and the genus kept beside them (path.ts). */
  branch: OpenBranch
  /** Opens a branch (CollageView sets the filter); `famName`, a family's name as shown. */
  onOpen: (branch: OpenBranch, famName?: string) => void
  /** Told the level drawn, "Lifers only" and "Time scale" (the bar's switches, tree-mine.ts), the layout drawn and which
   *  of the Fan and Radial can name every tip here, whenever they change, so Share can draw the same and offer the same. */
  onLevel?: (at: TreeShown) => void
  /** Told the rank line ("29 genera", "65 of 143 families"), or nothing when nothing is drawn: the stats line shows it. */
  onRankLine?: (text: string | undefined) => void
  /** The Display panel's slot for the Layout choice (none: the panel is closed). */
  layoutSlot?: HTMLElement | null
}

/** The element's width (0 until measured, and where ResizeObserver is missing). The observer's first answer comes
 *  before the first paint. */
function useWidth(el: HTMLElement | null): number {
  const [w, setW] = useState(0)
  useLayoutEffect(() => {
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => setW(el.clientWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [el])
  return w
}

type Measure = (text: string, px: number, weight: number, mono?: boolean, italic?: boolean) => number
/** Text widths measured so far (by font and text), and the canvas they are measured on (null where there is none). */
const widths = new Map<string, number>()
let measuring: CanvasRenderingContext2D | null | undefined
function textWidth(text: string, font: string, estimate: number): number {
  const key = `${font}|${text}`
  let w = widths.get(key)
  if (w === undefined) {
    if (measuring === undefined) {
      try { measuring = document.createElement('canvas').getContext('2d') } catch { measuring = null }
    }
    if (measuring) { measuring.font = font; w = measuring.measureText(text).width } else w = estimate
    widths.set(key, w)
  }
  return w
}
/** Text widths (px) in `el`'s fonts, by canvas, measured again once the web fonts have loaded; an estimate where canvas
 *  is missing. Used only for the fan and the circle (never in jsdom: no width, no fan). */
function useMeasure(el: HTMLElement | null): Measure {
  const [fonts, setFonts] = useState(0)
  useEffect(() => {
    let live = true
    document.fonts?.ready.then(() => { if (live) { widths.clear(); setFonts((n) => n + 1) } })
    return () => { live = false }
  }, [])
  return useMemo(() => {
    const css = el ? getComputedStyle(el) : undefined
    const body = css?.fontFamily || 'sans-serif'
    const mono = css?.getPropertyValue('--font-mono').trim() || 'monospace'
    // The counts are .eb-mono: upper case with .06em letter-spacing, which the canvas does not apply, so add both.
    // Latin is drawn italic (tree.css), and a bold italic runs a little wider: measure it italic.
    return (text, px, weight, isMono, italic) => isMono
      ? textWidth(text.toUpperCase(), `${weight} ${px}px ${mono}`, text.length * px * 0.62) + text.length * px * 0.06
      : textWidth(text, `${italic ? 'italic ' : ''}${weight} ${px}px ${body}`, text.length * px * 0.56)
    // `fonts` only says the fonts have loaded: measure again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, fonts])
}

/** Whether the last input was the keyboard (a key down since the last pointer press): focus then shows on a tip, and
 *  the tree moves focus as it opens and closes branches. A pointer press never moves focus or shows a focus state. */
let keyboard = false
let watching = false
function watchInput() {
  if (watching || typeof document === 'undefined') return
  watching = true
  document.addEventListener('keydown', () => { keyboard = true }, true)
  document.addEventListener('pointerdown', () => { keyboard = false }, true)
}

/** Whether the main pointer is coarse (a touch screen; AD5), from `(pointer: coarse)`; false on the server. */
function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    (f) => {
      const m = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(pointer: coarse)') : null
      m?.addEventListener?.('change', f)
      return () => m?.removeEventListener?.('change', f)
    },
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(pointer: coarse)').matches,
    () => false,
  )
}

/** A sticker in a `size` px square, or nothing (a missing sticker leaves its box empty: tree.css hides the outline). */
function Thumb({ row, size, off }: { row?: SpeciesRow; size: number; off?: boolean }) {
  if (!row?.st) return null
  const w = row.ar >= 1 ? size : size * row.ar, h = row.ar >= 1 ? size / row.ar : size
  return <span className="eb-tree-st-in" data-off={off || undefined}><Sticker code={row.code} st={row.st} ar={row.ar} sv={row.sv} w={w} h={h} /></span>
}

export default function TreeView({ entries, sci, onPick, branch, onOpen, onLevel, onRankLine, layoutSlot }: Props) {
  const { t } = useI18n()
  useNames()
  const tt = t.collage.tree
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  // Each "Try again" (H4) loads again: neither loader caches a failure.
  const [tries, setTries] = useState(0)
  useEffect(() => {
    watchInput()
    let live = true
    // The whole taxonomy (cached; the landing sample's own index holds only its birds), for every group and its totals.
    Promise.all([loadTree(), loadSpecies()]).then(([d, species]) => { if (live) setData({ ...d, species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [tries])
  const level: TreeLevel = branch
  const at = `${branch.ord ?? ''}|${branch.fam ?? ''}|${branch.genus ?? ''}`
  const mine = useTreeMine()
  const timeScale = useTreeTime()
  const pickedLayout = useTreeLayout()
  const down = useTreeDown()
  // The row whose list of genera inside is open, and the tip a hovered or keyboard-focused tip or row marks (`kb`: the
  // keyboard's, which adds the focus outline).
  const [list, setList] = useState<string | null>(null)
  const [hot, setHot] = useState<{ i: number; kb: boolean } | null>(null)
  // The Fan's or Radial's tip under the pointer, or tapped, live or not: its tooltip (round 6, item 12).
  const [peek, setPeek] = useState<number | null>(null)
  // The rows are one Tab stop (AU3, as the Collage): the last button focused in them keeps tabindex 0, every other -1;
  // ↑ ↓ Home End move between them. Set on the DOM after each render (the buttons come and go with the level).
  const rows = useRef<HTMLOListElement | null>(null)
  const rovingAt = useRef<string | null>(null)
  const rovingRef = useCallback((el: HTMLOListElement | null) => { rows.current = el }, [])
  const keyOf = (b: Element) => (b.hasAttribute('data-with') ? `w${b.getAttribute('data-with')}` : `t${b.getAttribute('data-tip')}`)
  useLayoutEffect(() => {
    const buttons = [...(rows.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const current = buttons.find((b) => keyOf(b) === rovingAt.current) ?? buttons[0]
    for (const b of buttons) b.tabIndex = b === current ? 0 : -1
  })
  const onRowsFocus = (e: FocusEvent) => { if (e.target instanceof HTMLButtonElement) rovingAt.current = keyOf(e.target) }
  const onRowsKey = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !(e.target instanceof HTMLButtonElement)) return
    const buttons = [...(rows.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])]
    const i = buttons.indexOf(e.target)
    if (i < 0) return
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))
    e.preventDefault()
    for (const b of buttons) b.tabIndex = b === buttons[next] ? 0 : -1
    buttons[next].focus()
  }
  const onList = useMemo(() => new Set(entries.map((e) => e.code)), [entries])
  const species = data?.species
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `level` is read through its key
  const view = useMemo(() => (data ? levelView(data.tree, data.species, level, onList, mine, undefined, down ?? undefined) : undefined), [data, at, onList, mine, down])
  const unmapped = useMemo(() => (data ? entries.filter((e) => !data.tree.tipOf.has(e.code)) : []), [data, entries])

  const box = useRef<HTMLDivElement | null>(null)
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null)
  const boxRef = useCallback((el: HTMLDivElement | null) => { box.current = el; setBoxEl(el) }, [])
  const width = useWidth(boxEl)
  const measure = useMeasure(boxEl)
  const treeW = rowsTreeW(width)

  const ordLabel = useCallback((ord: string) => (sci ? ord : (t.orders as Record<string, string>)[ord] ?? ord), [sci, t])
  /** A group's name at `rank` as shown, and whether it is Latin. */
  const nameAt = useCallback((r: SpeciesRow, k: TipRank): [string, boolean] =>
    k === 'orders' ? [ordLabel(r.ord), sci] : k === 'families' ? [sci ? r.fam : familyName(r), sci] : k === 'genera' ? [genusOf(r.sci), true] : [sci ? r.sci : displayName(r), sci], [ordLabel, sci])
  const count = useCallback((n: number) => formatInt(n, t.num), [t])
  const tipOfText = useCallback((r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: count(r.on), total: count(r.total) }) : ''), [tt, count])
  const tipsOf = (v: LevelView) => v.rows.filter((r): r is Tip => r.kind !== 'head')
  /** "with Turacoena", "with Urolestes and Corvinella" (the groups folded into a row's branch, named as the row's own,
   *  between <a> and <b> tags), or more than two genera "with 5 other genera" (a button opening their list). */
  const withWords = useCallback((ws: Inside[], k: TipRank) => {
    if (k === 'genera' && ws.length > 2) return plural(tt.withMany, ws.length, { n: count(ws.length) })
    const names = ws.map((w) => nameAt(w.row, k)[0])
    const b = names.pop()!
    return names.length ? fmt(tt.withTwo, { a: names.join(', '), b }) : fmt(tt.withOne, { a: b })
  }, [tt, count, nameAt])

  // The labels' widths at 13px (in units of the size), for the Fan's and Radial's fit.
  const spans = useMemo((): LabelSpan[] => {
    if (!view || !width) return []
    return tipsOf(view).map((r) => {
      const [name, latin] = r.kind === 'species' ? [sci ? r.row.sci : displayName(r.row), sci] : nameAt(r.row, view.tips)
      const c = tipOfText(r)
      // The mark of a split group, then right after it the groups inside (in the label's flex gap): "with" and "and"
      // upright, the names between <a> and <b> italic where they are Latin, as withText draws them.
      const withLatin = view.tips === 'genera' || sci
      const other = r.kind === 'group' && r.with?.length
        ? LABEL_GAP * 13 + withWords(r.with, view.tips).split(/(<a>.*?<\/a>|<b>.*?<\/b>)/).reduce((w, part) => {
          const inner = part.replace(/<\/?[ab]>/g, '')
          return w + (inner ? measure(inner, 13, 500, false, inner !== part && withLatin) : 0)
        }, 0)
        : 0
      return {
        name: (measure(name, 13, 600, false, latin) + (r.kind === 'group' && r.with ? MARK_W : 0) + other) / 13,
        count: c ? measure(c, 11, 500, true) / 13 : 0,
        on: r.kind === 'species' ? r.on : r.on > 0,
      }
    })
  }, [view, width, measure, sci, nameAt, tipOfText, withWords])
  // The Radial with its time scale opens at the top for its ages (RADIAL_GAP).
  const sizesOf = (s: FanShape) => (s === 'circle' && timeScale ? { ...SCREEN_SIZES, gap: RADIAL_GAP } : SCREEN_SIZES)
  // Whether the Fan names every tip at full size (the unpicked default; fitRound answers at once for a big rank).
  const fullFan = useMemo(() => spans.length > 0 && !!fitRound(spans, 'fan', { w: width }, SCREEN_SIZES), [spans, width])

  // The layout drawn (round 6, item 12: the screen offers what Share and Print offer): the one picked, always, a Fan or
  // Radial shrinking its names to fit (fitScreen: under the 11px floor where it must, as far as the share image would);
  // unpicked, the Fan from FAN_FROM px when it names every tip at full size, else Rectangular. Rows until the width is
  // known, and where nothing round fits at all (a column too narrow for the drawing; none at 320px or more on the
  // shipped tree's ranks, All birds' 1,970 genera included). Only the shape drawn is fitted (All birds' genera: about
  // half a second).
  // On a touch screen (AD5) a Fan needs width and Rectangular needs height, so unpicked it is Rectangular at any width.
  const coarse = useCoarsePointer()
  const wanted: TreeLayout = !width ? 'rows' : pickedLayout ?? (!coarse && width >= FAN_FROM && fullFan ? 'fan' : 'rows')
  const roundFit = useMemo(() => (wanted === 'rows' || !spans.length ? undefined : fitScreen(spans, shapeOf(wanted), width, sizesOf(shapeOf(wanted)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sizesOf reads timeScale
    [wanted, spans, width, timeScale])
  const layout: TreeLayout = wanted !== 'rows' && !roundFit ? 'rows' : wanted
  const shown = view
  const round = layout !== 'rows'
  const shape = shapeOf(layout)
  const fit = round ? roundFit : undefined
  const shownLevel = shown?.level
  const shownKey = shownLevel ? `${shownLevel.ord ?? ''}|${shownLevel.fam ?? ''}|${shownLevel.genus ?? ''}` : ''
  const shownRank = shown?.tips
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `shownLevel` is read through its key
  useEffect(() => { if (shownLevel && shownRank) onLevel?.({ tree: shownLevel, rank: shownRank, mine, layout, time: timeScale }) }, [shownKey, shownRank, mine, layout, timeScale, onLevel])
  const tips = useMemo(() => (shown ? tipsOf(shown) : []), [shown])
  // The rank drawn and how many, in the Taxa panel head's words ("29 genera"; with Lifers only leaving some out, "65 of
  // 143 families"), told up for the stats line ("… · 29 genera in this tree"; Yusuf, 2026-11-21: no line of its own).
  const rankLine = (() => {
    if (!shown?.rows.length) return undefined
    const { rank: k, n, total } = rankCount(shown, mine)
    const v = { n: count(n), total: count(total ?? n) }
    if (total === undefined) return plural(k === 'genera' ? tt.genera : t.collage.stats[k], n, v)
    return plural(k === 'species' ? t.collage.stats.of : t.collage.controls.taxaHead[TAXA_HEAD[k]], total, v)
  })()
  useEffect(() => { onRankLine?.(rankLine) }, [rankLine, onRankLine])
  useEffect(() => () => onRankLine?.(undefined), [onRankLine])

  // Rows: each row is as tall as its name needs (44px at least), so the drawing follows the rows' measured centres.
  const rowsRef = useRef<HTMLOListElement | null>(null)
  const [rowYs, setRowYs] = useState<{ y: number[]; h: number } | null>(null)
  const measureRows = useCallback(() => {
    const ol = rowsRef.current
    if (!ol) return
    const y = [...ol.querySelectorAll<HTMLElement>(':scope > .eb-tree-row')].map((li) => li.offsetTop + li.offsetHeight / 2)
    const h = ol.offsetHeight
    setRowYs((p) => (p && p.h === h && p.y.length === y.length && p.y.every((v, i) => v === y[i]) ? p : { y, h }))
  }, [])
  useLayoutEffect(() => { if (!round && width) measureRows() })
  useLayoutEffect(() => {
    const ol = rowsRef.current
    if (round || !width || !ol || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measureRows)
    ro.observe(ol)
    return () => ro.disconnect()
  }, [round, width, measureRows, shown])
  const ys = !round && width && rowYs && rowYs.y.length === tips.length && rowYs.h > 0 ? rowYs : undefined

  // The drawing in px once the width is known (rounded corners stay round); before it, 1000 wide and stretched. Without
  // the time scale, a node's age is its number of splits down to its deepest tip (bySplits).
  const drawing = useMemo(() => {
    if (!shown?.root) return shown?.drawing
    const dotted = (_: unknown, i: number) => tips[i].dotted
    const root = timeScale ? shown.root : bySplits(shown.root)
    const stem = timeScale ? shown.stem : 1
    if (fit) return drawFan(root, tipOn(tips), stem, dotted, fit)
    return drawTree(root, tipOn(tips), (i) => ys?.y[i] ?? tips[i].top + ROW_H / 2, stem, dotted, width ? treeW : 1000)
  }, [shown, tips, fit, width, treeW, ys, timeScale])

  // The named nodes (round 6, item 10; nodes.ts): where each group the headings name begins, its name along its stem,
  // only where it touches nothing. The Radial's ages in its opening stay clear (the points of their patches).
  const nodeLabels = useMemo((): NodeLabel[] => {
    if (!shown?.root || !width || !shown.groups.length) return []
    const root = timeScale ? shown.root : bySplits(shown.root)
    const stemAge = timeScale ? shown.stem : 1
    const groups = shown.groups.map((g) => { const [text, latin] = nameAt(g.row, g.rank); return { text, latin, first: g.first, last: g.last } })
    const mono = (text: string) => measure(text, NODE_PX, 500, true)
    if (fit) {
      const avoid: [number, number][] = []
      if (fit.shape === 'circle' && timeScale) {
        for (const v of ageTicks(drawing!.rootAge)) {
          const [x, y] = ringLabels(fit, (1 - v / drawing!.rootAge) * fit.R)[0]
          const w = measure(formatAge(v, t.num), 11, 400, true) + 6
          for (let dx = -w / 2; dx <= w / 2; dx += 2) for (let dy = -8; dy <= 8; dy += 2) avoid.push([x + dx, y + dy])
        }
      }
      return roundNodeLabels(root, groups, fit, { n: tips.length, stemAge, measure: mono, h: NODE_LINE, avoid })
    }
    if (!ys) return []
    return rowNodeLabels(root, groups, { yOf: (i) => ys.y[i], width: treeW, height: ys.h, stemAge, measure: mono, h: NODE_LINE })
  }, [shown, width, timeScale, nameAt, measure, fit, drawing, t, tips.length, ys, treeW])
  const nodeMarks = nodeLabels.map((l, i) => (
    <g key={i} className="eb-tree-node">
      <circle cx={l.node[0]} cy={l.node[1]} r={2.5} />
      <text x={l.x} y={l.y} transform={l.rot ? `rotate(${l.rot.toFixed(2)} ${l.x} ${l.y})` : undefined} fontStyle={l.latin ? 'italic' : undefined}>{l.text.toUpperCase()}</text>
    </g>
  ))

  // Focus follows the branch, from the keyboard only (a pointer press moves none): opening one focuses its first tip, a
  // step back (the chip row's path) the tip of the branch it came from. Never a scroll: the page stays where it is.
  const focusFirst = useRef(false)
  const before = useRef(branch)
  useEffect(() => {
    const was = before.current
    before.current = branch
    const first = focusFirst.current
    focusFirst.current = false
    if (!keyboard || (was.ord === branch.ord && was.fam === branch.fam && was.genus === branch.genus)) return
    const root = box.current
    const lost = !document.activeElement || document.activeElement === document.body
    let el: HTMLElement | null | undefined
    if (first) el = root?.querySelector<HTMLElement>('.eb-tree-rows button[data-tip]')
    else if (lost) {
      const d = depthOf(branch), back = [was.ord, was.fam, was.genus][d]
      // A genus opened from a row's list goes back to that list's button.
      if (back && depthOf(was) > d) el = root?.querySelector<HTMLElement>(`[data-key="${back}"], [data-inside~="${back}"]`)
    }
    el?.focus({ preventScroll: true })
  }, [branch])
  const go = (next: OpenBranch, famName?: string) => {
    focusFirst.current = true
    setList(null)
    setHot(null); setPeek(null)
    onOpen(next, famName)
  }

  // A failure says so, with "Try again" (H4); loading is the same line as CollageView's while this chunk arrives (O8).
  if (failed) {
    return (
      <p className="eb-tree-note" role="status" data-testid="tree-failed">
        {tt.failed}{' '}
        <button type="button" className="eb-textbtn" data-testid="tree-retry" onClick={() => { setFailed(false); setTries((n) => n + 1) }}>{tt.retry}</button>
      </p>
    )
  }
  if (!data || !view || !shown || !species || !drawing) return <div className="eb-mono" role="status">{tt.loading}</div>

  // The level drawn: a folded order, family or genus opens the row whose branch holds it.
  const lv = view.level
  const rank = shown.tips
  const famRow = lv.fam ? species.rows.find((r) => r.fam === lv.fam) : undefined
  const here = lv.genus ?? (famRow ? nameAt(famRow, 'families')[0] : lv.ord ? ordLabel(lv.ord) : undefined)
  const openRank: TipRank = lv.genus ? 'genera' : lv.fam ? 'families' : 'orders'
  const insideNote = (() => {
    if (!view.inside || !here) return undefined
    if (lv.genus && view.inside.length > 2) return plural(tt.insideMany, view.inside.length, { n: count(view.inside.length), name: here })
    const names = view.inside.map((r) => nameAt(r, openRank)[0])
    const last = names.pop()!
    return names.length ? fmt(tt.insideTwo, { a: names.join(', '), b: last, name: here }) : fmt(tt.insideOne, { a: last, name: here })
  })()
  const ticks = timeScale ? ageTicks(drawing.rootAge).filter((v) => v / drawing.rootAge <= 0.97 || v === 0) : []
  /** The branch a group's tip opens: the path down to it, the ranks above it named from its row. */
  const opens = (k: TipRank, key: string, r: SpeciesRow): OpenBranch =>
    k === 'orders' ? { ord: key } : k === 'families' ? { ord: r.ord, fam: key } : { ord: lv.ord ?? r.ord, fam: lv.fam ?? r.fam, genus: key }
  const famNameOf = (k: TipRank, r: SpeciesRow) => (k === 'orders' ? undefined : k === 'families' ? familyName(r) : famRow ? familyName(famRow) : familyName(r))

  const withText = (rows: Inside[]) => {
    const tag = (chunk: string) => <span lang={rank === 'genera' || sci ? 'la' : undefined}>{chunk}</span>
    return rich(withWords(rows, rank), { a: tag, b: tag })
  }
  /** More than two genera inside a marked row: a count opening their list instead of the sentence. */
  const manyOf = (r: Tip) => (rank === 'genera' && r.kind === 'group' && r.with && r.with.length > 2 ? r.with : undefined)
  // A row's focus marks its tip in the Fan or Radial (the rows are hidden there) and brings that tip into view.
  const onRowFocus = (i: number) => {
    if (!round || !keyboard) return
    setHot({ i, kb: true })
    requestAnimationFrame(() => box.current?.querySelector(`.eb-tree-fan-label[data-i="${i}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }))
  }
  const focusing = (i: number) => ({ onFocus: () => onRowFocus(i), onBlur: () => setHot((h) => (h?.i === i ? null : h)) })
  const thumb = (r: Tip) => (
    <span className="eb-tree-st" aria-hidden="true">
      {!round && <Thumb row={r.kind === 'species' ? r.row : r.sticker} size={ROW_STICKER} off={!isOn(r)} />}
    </span>
  )
  const groupRow = (r: Extract<TreeRow, { kind: 'group' }>, i: number) => {
    const [name, latin] = nameAt(r.row, rank)
    const marked = !!r.with
    const many = manyOf(r)
    return (
      <>
      <button
        type="button"
        className="eb-tree-btn"
        data-key={r.key}
        data-tip={i}
        data-on={r.on > 0 || undefined}
        data-many={many ? '' : undefined}
        onClick={() => go({ ...opens(rank, r.key, r.row), ...(r.holds?.length ? { with: r.holds } : {}) }, famNameOf(rank, r.row))}
        {...focusing(i)}
      >
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name">
          <span className="eb-tree-nm" lang={latin ? 'la' : undefined}>{name}</span>
          {marked && <span className="eb-tree-mark" aria-hidden="true" />}
          {!!r.with?.length && !many && <>{' '}<span className="eb-tree-other">{withText(r.with)}</span></>}
        </span>
        <span className="eb-sr">{marked && `, ${tt.markSr}`}, {fmt(tt.onList, { n: count(r.on), total: count(r.total) })}{r.dotted && `, ${tt.dottedSr}`}</span>
      </button>
      {many && (
        <button type="button" className="eb-tree-with" aria-haspopup="dialog" aria-expanded={list === r.key} data-inside={many.map((w) => w.key).join(' ')} data-with={i} onClick={() => setList(r.key)} {...focusing(i)}>
          <span className="eb-sr" lang="la">{r.key}</span>{' '}{plural(tt.withMany, many.length, { n: count(many.length) })}
        </button>
      )}
      {/* After the row's buttons (the list button right after the name's mark), so every count ends at the view's right
          edge, one column (the name says it). */}
      <span className="eb-mono eb-tree-count" aria-hidden="true" data-full={(r.on === r.total && r.total > 1) || undefined}>{count(r.on)} / {count(r.total)}</span>
      </>
    )
  }
  const speciesRow = (r: Extract<TreeRow, { kind: 'species' }>, i: number) => {
    const inner = (
      <>
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name"><span className="eb-tree-nm" lang={sci ? 'la' : undefined}>{sci ? r.row.sci : displayName(r.row)}</span></span>
        <span className="eb-sr">, {r.on ? tt.onListOne : tt.notOnList}{r.dotted && `, ${tt.dottedSr}`}</span>
      </>
    )
    return r.on
      ? <button type="button" className="eb-tree-btn" data-on data-code={r.row.code} data-tip={i} onClick={(e) => onPick(r.row.code, e.currentTarget)} {...focusing(i)}>{inner}</button>
      : <span className="eb-tree-btn" data-tip={i}>{inner}</span>
  }
  const tipName = (r: Tip) => (r.kind === 'species' ? [sci ? r.row.sci : displayName(r.row), sci] as const : nameAt(r.row, rank))
  /** A tip that does something when pressed: every group, and a species on the list. */
  const live = (r: Tip) => r.kind === 'group' || r.on
  const isOn = (r: Tip) => (r.kind === 'species' ? r.on : r.on > 0)

  // The Fan's or Radial's labels, one per tip, each named in full (fitRound): the sticker's box, the name, the count
  // where it fits. A press on one presses its row; a pointer over one marks it.
  const roundTips = fit && 'tips' in drawing ? (drawing.tips as { a: number; x: number; y: number }[]) : []
  const px = fit?.px ?? 13
  const S = fit?.st ?? 24
  // Under the floor the tips' dots and branches shrink with the names (as the image's do); a sticker box too small to
  // show a bird stays empty (no download for it).
  const k = fit ? dotK(fit.px) : 1
  const small = !!fit && fit.px < SCREEN_SIZES.floor
  const tipAt = (e: MouseEvent) => (e.target as Element).closest('[data-i]')?.getAttribute('data-i')
  const onFanClick = (e: MouseEvent) => {
    const i = tipAt(e)
    if (i == null) return
    const r = tips[Number(i)]
    // A tip that opens nothing shows its tooltip on a press (a tap has no hover).
    if (!live(r)) { setPeek(Number(i)); return }
    // A bird's card opens by its label on the drawing (its row is out of sight); a group opens as its row does.
    const el = box.current?.querySelector<HTMLElement>(`.eb-tree-fan-label[data-i="${i}"]`)
    if ((e.target as Element).closest('[data-many]')) { box.current?.querySelector<HTMLElement>(`.eb-tree-rows [data-with="${i}"]`)?.click(); return }
    if (r.kind === 'species') { if (r.on && el) onPick(r.row.code, el) }
    else box.current?.querySelector<HTMLElement>(`.eb-tree-rows [data-tip="${i}"]`)?.click()
  }
  const onFanOver = (e: MouseEvent) => {
    const i = tipAt(e)
    const n = i == null ? null : Number(i)
    setPeek(n)
    setHot((h) => (n == null || !live(tips[n]) ? (h?.kb ? h : null) : h?.i === n && !h.kb ? h : { i: n, kb: false }))
  }
  const label = (p: { a: number }, i: number) => {
    const r = tips[i]
    const [name, latin] = tipName(r)
    const l = fanLabel(fit!, p.a, TIP_R * k + px * LABEL_GAP)
    const isHot = hot?.i === i && live(r)
    return (
      <span
        key={i} className="eb-tree-fan-label" data-i={i} data-flip={l.flip || undefined} data-on={isOn(r) || undefined}
        data-live={live(r) || undefined} data-hot={isHot || undefined} data-focus={(isHot && hot?.kb) || undefined}
        style={{ left: l.x, top: l.y - S / 2, transform: `${l.flip ? 'translateX(-100%) ' : ''}rotate(${l.rot.toFixed(2)}deg)` }}
      >
        <span className="eb-tree-fan-st" style={l.rot ? { transform: `rotate(${(-l.rot).toFixed(2)}deg)` } : undefined}>
          <Thumb row={S < MIN_STICKER ? undefined : r.kind === 'species' ? r.row : r.sticker} size={S} off={!isOn(r)} />
        </span>
        <span className="eb-tree-fan-text" lang={latin ? 'la' : undefined}>{name}</span>
        {r.kind === 'group' && r.with && <span className="eb-tree-mark" />}
        {r.kind === 'group' && !!r.with?.length && <span className="eb-tree-other" data-many={manyOf(r) ? '' : undefined}>{withText(r.with)}</span>}
        {r.kind === 'group' && fit!.counts[i] && <span className="eb-mono eb-tree-fan-count">{tipOfText(r)}</span>}
      </span>
    )
  }
  const circle = shape === 'circle'
  const figH = fit ? fit.h + ROUND_PAD : 0
  const figureStyle = { height: figH, '--tree-px': `${px}px`, '--tree-st': `${S}px`, '--tree-gap': `${px * LABEL_GAP}px`, '--tree-count': `${px * LABEL_COUNT}px`, '--tree-k': k } as CSSProperties
  const roundFigure = fit && (
    // The hidden rows are the keyboard's and screen readers' way in; this is the pointer's.
    <div className="eb-tree-fan" data-circle={circle || undefined} style={figureStyle} aria-hidden="true" onClick={onFanClick} onMouseOver={onFanOver} onMouseLeave={() => { setPeek(null); setHot((h) => (h?.kb ? h : null)) }}>
      <svg className="eb-tree-svg" width={width} height={figH} viewBox={`0 0 ${width} ${figH}`} focusable="false">
        {ticks.filter((v) => v > 0).map((v) => <path key={v} className="eb-tree-ring" d={fanRing(fit, (1 - v / drawing.rootAge) * fit.R)} />)}
        <path className="eb-tree-off" d={drawing.unseen} />
        <path className="eb-tree-on" d={drawing.seen} />
        <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
        <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
        <path className="eb-tree-tipdot eb-tree-off" d={roundTips.filter((_, i) => !isOn(tips[i])).map((p) => circlePath(p.x, p.y, TIP_R * k)).join('')} />
        <path className="eb-tree-tipdot eb-tree-on" d={roundTips.filter((_, i) => isOn(tips[i])).map((p) => circlePath(p.x, p.y, TIP_R * k)).join('')} />
        {nodeMarks}
        {roundTips.map((p, i) => <circle key={i} className="eb-tree-tiphit" data-i={i} data-live={live(tips[i]) || undefined} cx={p.x} cy={p.y} r={8} />)}
      </svg>
      {roundTips.map(label)}
      {ticks.filter((v) => !circle || v > 0).map((v) => {
        const rr = (1 - v / drawing.rootAge) * fit.R
        const text = formatAge(v, t.num)
        // The Fan's ages sit under its centre, below every branch. The Radial's sit on a Paper patch on the radius straight
        // up (16px tall, 3px of padding each side), inside its opening (round 6): one whose patch would reach a branch
        // (an inner ring too small for it) is not written.
        return ringLabels(fit, rr).filter(() => !circle || inOpening(fit, tips.length, rr, measure(text, 11, 400, true) + 6, 16)).map(([x, y]) => (
          <span key={`${v}:${x}`} className="eb-mono eb-tree-fan-tick" style={{ left: x, top: circle ? y - 8 : y + 10 }}>{text}</span>
        ))
      })}
    </div>
  )

  // The tooltip (round 6, item 12): the tip under the pointer, tapped or with keyboard focus, its whole name and count,
  // in the site's tooltip look. Only when the names are under the floor (Yusuf, 2026-11-21): at full size the name is
  // whole on the drawing and the hover's Accent marks it. The Fan and Radial only (Rectangular's rows show every name
  // whole); aria-hidden, as the drawing is (the rows carry the words).
  const tipI = peek ?? hot?.i
  const tipRow = small && tipI != null ? tips[tipI] : undefined
  const tipAtP = tipRow && roundTips[tipI!]
  // Placed once drawn (the label's width is the DOM's): just past the name's end, along its line, so it covers neither
  // the name nor its bird, its near side toward the name, kept inside the column.
  const placeTip = (el: HTMLDivElement | null) => {
    const label = el && box.current?.querySelector<HTMLElement>(`.eb-tree-fan-label[data-i="${tipI}"]`)
    if (!el || !label || !tipAtP || !fit) return
    const at = fanLabel(fit, tipAtP.a, TIP_R * k + px * LABEL_GAP + label.offsetWidth + 8)
    const [w, h] = [el.offsetWidth, el.offsetHeight]
    const x = at.x + ((Math.cos(tipAtP.a) - 1) * w) / 2
    el.style.left = `${Math.min(Math.max(0, x), (el.parentElement?.clientWidth ?? w) - w)}px`
    el.style.top = `${at.y + ((-Math.sin(tipAtP.a) - 1) * h) / 2}px`
  }
  const tooltip = tipRow && tipAtP && (() => {
    const [name, latin] = tipName(tipRow)
    return (
      <div ref={placeTip} className="eb-card eb-tip eb-tree-tip" aria-hidden="true" data-testid="tree-tip">
        <span className="eb-tree-tip-name" lang={latin ? 'la' : undefined}>{name}</span>
        {tipRow.kind === 'group' && <span className="eb-mono">{tipOfText(tipRow)}</span>}
      </div>
    )
  })()
  // Under the floor, one quiet line under the tree (round 6, item 12), its layout word a button switching to Rectangular.
  const smallNote = small && (
    <p className="eb-tree-note eb-tree-small" data-testid="tree-small">
      {rich(tt.small, { rows: (chunk) => <button type="button" className="eb-textbtn" data-testid="tree-small-rows" onClick={() => { setHot(null); setPeek(null); setTreeLayout('rows') }}>{chunk}</button> })}
    </p>
  )

  const listRow = list ? shown.rows.find((r): r is Extract<TreeRow, { kind: 'group' }> => r.kind === 'group' && r.key === list && !!r.with) : undefined
  let tipNo = 0
  const rowItems = shown.rows.map((r) => {
    if (r.kind === 'head') {
      return (
        <li key={`h:${r.parts.map((p) => p.key).join('|')}:${r.top}`} className="eb-mono eb-tree-heading">
          <span>
            {r.parts.map((p, j) => {
              const [text, latin] = nameAt(p.row, p.rank)
              return <Fragment key={p.rank}>{j > 0 && ' · '}<span lang={latin ? 'la' : undefined}>{text}</span></Fragment>
            })}
          </span>
        </li>
      )
    }
    const i = tipNo++
    return <li key={`${r.kind === 'group' ? r.key : r.row.code}:${r.top}`} className="eb-tree-row">{r.kind === 'group' ? groupRow(r, i) : speciesRow(r, i)}</li>
  })

  const roundNow = round && !!fit
  // The key says only what the drawing shows: the mark of a group that is not one branch, the dotted line.
  const keyMark = tips.some((r) => r.kind === 'group' && !!r.with)
  const keyDotted = tips.some((r) => r.dotted)
  // The Layout choice, in the controls bar's Display panel (its slot; TreeView knows which layouts fit).
  // Under it, Down to (round 6): the ranks from the one step under the open branch down to the species, the one drawn
  // pressed; a rank over DRAW_CAP tips here stays listed, off, with its reason (downOptions). No row when only one rank
  // is left.
  const downChoices = downOptions(shown, mine)
  const layoutChoice = layoutSlot && createPortal(
    <>
      <DisplaySegments
        label={tt.layout} value={layout} testId="tree-layout"
        options={TREE_LAYOUTS.map((v) => ({ value: v, label: tt.layouts[v] }))}
        onChange={(v) => { setHot(null); setPeek(null); setTreeLayout(v) }}
      />
      {downChoices.length > 0 && (
        <DisplaySegments
          label={t.share.print.downTo} value={rank} testId="tree-down"
          options={downChoices.map((d) => ({ value: d.rank, label: tt.rank[d.rank], off: d.off && tt[d.off] }))}
          onChange={(v) => { setHot(null); setPeek(null); setTreeDown(v) }}
        />
      )}
    </>,
    layoutSlot,
  )

  // The chart is keyed by the branch, the rank and the layout (AN11), so each change fades the new drawing in (tree.css).
  const chartKey = `${at}|${shown.tips}|${layout}`

  return (
    <div ref={boxRef} className="eb-tree" data-round={roundNow || undefined} style={width ? { ['--tree-w' as string]: `${treeW}px` } : undefined}>
      {layoutChoice}
      {view.split && here && <p className="eb-tree-note">{fmt(tt.split, { name: here })}</p>}
      {insideNote && <p className="eb-tree-note">{insideNote}</p>}
      {!shown.rows.length ? (
        <p className="eb-tree-note">
          {tt.mineNone}
          {/* Lifers only emptied it (D9): the switch is in a closed panel, so the way back is here. */}
          {mine && <>{' '}<button type="button" className="eb-textbtn" data-testid="tree-show-all" onClick={() => setTreeMine(false)}>{tt.showAll}</button></>}
        </p>
      ) : roundNow ? (
        <div key={chartKey} className="eb-tree-chart">
          {/* Before the drawing, so a row the keyboard reaches is near its tip. */}
          <ol ref={rovingRef} className="eb-tree-rows" aria-label={tt.tips} onFocus={onRowsFocus} onKeyDown={onRowsKey}>{rowItems}</ol>
          <div className="eb-tree-fanwrap">
            {roundFigure}
            {tooltip}
          </div>
          {timeScale && <p className="eb-mono eb-tree-axis-title eb-tree-fan-axis" aria-hidden="true">{tt.axis}</p>}
          {smallNote}
        </div>
      ) : (
        <div key={chartKey} className="eb-tree-chart">
          {timeScale && (
            <div className="eb-tree-head" aria-hidden="true">
              <div className="eb-tree-axis">
                {ticks.map((v) => (
                  <span key={v} className="eb-mono eb-tree-tick" style={{ left: `${(1 - v / drawing.rootAge) * 100}%` }}>{formatAge(v, t.num)}</span>
                ))}
              </div>
              <span className="eb-mono eb-tree-axis-title">{tt.axis}</span>
            </div>
          )}
          <div className="eb-tree-body">
            <svg className="eb-tree-svg" viewBox={`0 0 ${width ? treeW : 1000} ${ys?.h ?? shown.height}`} preserveAspectRatio={width ? undefined : 'none'} aria-hidden="true" focusable="false">
              <path className="eb-tree-off" d={drawing.unseen} />
              <path className="eb-tree-on" d={drawing.seen} />
              <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
              <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
              {nodeMarks}
            </svg>
            <ol ref={(el) => { rowsRef.current = el; rovingRef(el) }} className="eb-tree-rows" aria-label={tt.tips} onFocus={onRowsFocus} onKeyDown={onRowsKey}>{rowItems}</ol>
          </div>
        </div>
      )}
      {listRow && (
        <PickerSheet title={fmt(tt.insideTitle, { name: listRow.key })} count={listRow.with!.length} onClose={() => setList(null)}>
          <ul className="eb-tree-inside">
            {listRow.with!.map((w) => (
              <li key={w.key}>
                <button type="button" className="eb-tree-btn" data-on={w.on > 0 || undefined} onClick={() => go({ ord: lv.ord ?? w.row.ord, fam: lv.fam ?? w.row.fam, genus: w.key }, famRow ? familyName(famRow) : familyName(w.row))}>
                  <span className="eb-tree-dot" aria-hidden="true" />
                  <span className="eb-tree-name"><span className="eb-tree-nm" lang="la">{w.key}</span></span>
                  <span className="eb-mono eb-tree-count" aria-hidden="true">{count(w.on)} / {count(w.total)}</span>
                  <span className="eb-sr">, {fmt(tt.onList, { n: count(w.on), total: count(w.total) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </PickerSheet>
      )}
      {(keyMark || keyDotted) && (
        <ul className="eb-tree-key">
          {keyMark && <li><span className="eb-tree-mark" aria-hidden="true" />{tt.keyMark}</li>}
          {keyDotted && (
            <li>
              <svg className="eb-tree-key-line" viewBox="0 0 24 4" aria-hidden="true" focusable="false"><path className="eb-tree-on eb-tree-dash" d="M0 2H24" /></svg>
              {tt.keyDotted}
            </li>
          )}
        </ul>
      )}
      {unmapped.length > 0 && (
        <div className="eb-tree-unmapped">
          <p>{plural(tt.unmapped, unmapped.length, { n: count(unmapped.length) })}</p>
          <ul>
            {unmapped.map((e) => {
              const r = species.byCode.get(e.code)!
              return (
                <li key={e.code}>
                  <button type="button" className="eb-tree-link" data-code={e.code} lang={sci ? 'la' : undefined} onClick={(ev) => onPick(e.code, ev.currentTarget)}>{sci ? r.sci : displayName(r)}</button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
