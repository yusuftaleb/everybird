'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). It opens on every order; a tip opens its branch, and the tree always shows the rank one step under the
// open branch (Yusuf, 2026-11-20, round 6): an order its families, a family its genera, a genus its species, whose tips
// on the list open the bird card; there is no other choice of rank. The open order, family and genus are the taxonomy
// filter's (the path under the dock and the Taxa panel's chips: CollageView passes `branch` and gets `onOpen`, path.ts);
// opening a marked row also sets the filter's `with` (the other groups its branch holds), so every view shows the
// branch's birds. A branch never opens on one lone tip (levels.ts: an order with one family at its genera, a family with
// one genus at its species, a group of SPECIES_AT species or fewer at its species). The Layout choice (Fan | Radial |
// Rectangular, kept on the device; unpicked, the fan from FAN_FROM px wide when it names every tip, rows otherwise; one
// that can't name every tip stays listed, disabled, with its reason) is rendered here into the controls bar's Display
// panel (`layoutSlot`, a portal), beside the panel's switches. No count line of its own: the page's stats line counts
// against the taxonomy (CollageView, which also writes the oldest lineage under the view, in the legend's place). The
// Display panel's Time scale switch (tree-mine.ts): on, branches at their true ages over the age axis (rings and ages
// on the Fan and Radial); off, no axis, and the splits spaced evenly by branching order (bySplits).
// Fan and Radial (fan.ts): the root at the centre, the tips on the arc or all round, and every tip's label past it,
// along its radius: the dot, a gap, the sticker's box, a gap, the name, the count (fitRound sizes the drawing so that
// every name fits whole; the counts go first when room is short); the ages where no branch runs (under the fan's
// centre; on the circle's radius straight up, on Paper, never over a branch end), the axis title under the drawing.
// Their rows stay in the page, visually hidden, for the keyboard and screen readers. Rectangular draws the tree top to
// bottom in about half the width (rowsTreeW) beside the rows, which grow with their names and reach the view's right
// edge, the counts ending there in one column. Branches have rounded corners and simply join; every tip has one small
// hollow dot. Each tip shows a sticker: the species' own, else one bird of the group on the list, else (no bird on the
// list) the group's first species with a sticker, dimmed as a species off the list (groupSticker). One name per tip,
// following the Scientific switch. Hovering a tip, or focusing it from the keyboard, turns its name Accent with an
// underline (nothing moves); the keyboard's focus adds the outline round the name. A group the tree splits is one
// marked row at the smallest branch holding it, "with" the groups inside it; more than two genera inside are a button
// opening their list (PickerSheet), each opening its own species. Under it: the key (the mark and the dotted line of a
// tip placed without genetic data, each when the drawing has it) and the birds the tree does not place. The credit is
// About's. levels.ts, fan.ts and tree.ts hold the logic.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent } from 'react'
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
import { FAN_FROM, LABEL_COUNT, LABEL_GAP, LABEL_STICKER, clearOfEnds, drawFan, fanLabel, fanRing, fitRound, ringLabels, type FanShape, type LabelSpan, type RoundFit } from '@/lib/tree/fan'
import { ROW_H, depthOf, rowsTreeW, genusOf, levelView, tipOn, type Inside, type LevelView, type TipRank, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { loadTree } from '@/lib/tree/load'
import type { OpenBranch } from '@/lib/tree/path'
import { TREE_LAYOUTS, setTreeLayout, useTreeLayout, useTreeMine, useTreeTime, type TreeLayout } from '@/lib/tree-mine'
import { TIP_R, ageTicks, bySplits, circlePath, drawTree, formatAge, type Tree, type TreeFile } from '@/lib/tree/tree'
import './tree.css'

type Loaded = { file: TreeFile; tree: Tree; species: SpeciesIndex }
/** What the view draws, for Share (view-image.ts ShareAt). */
export type TreeShown = { tree: TreeLevel; mine: boolean; layout: TreeLayout; time: boolean; fits: Record<FanShape, boolean> }
type Tip = Exclude<TreeRow, { kind: 'order' }>

/** Under the Fan and Radial, below their lowest label: air before the axis title. */
const ROUND_PAD = 8
/** A row's sticker (px); the split-group mark's width with its margins (px, at the 13px names). */
const ROW_STICKER = 24
const MARK_W = 7 + 8
const shapeOf = (l: TreeLayout): FanShape => (l === 'circle' ? 'circle' : 'fan')

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

type Measure = (text: string, px: number, weight: number, mono?: boolean) => number
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
    return (text, px, weight, isMono) => isMono
      ? textWidth(text.toUpperCase(), `${weight} ${px}px ${mono}`, text.length * px * 0.62) + text.length * px * 0.06
      : textWidth(text, `${weight} ${px}px ${body}`, text.length * px * 0.56)
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

/** A sticker in a `size` px square, or nothing (a missing sticker leaves its box empty: tree.css hides the outline). */
function Thumb({ row, size, off }: { row?: SpeciesRow; size: number; off?: boolean }) {
  if (!row?.st) return null
  const w = row.ar >= 1 ? size : size * row.ar, h = row.ar >= 1 ? size / row.ar : size
  return <span className="eb-tree-st-in" data-off={off || undefined}><Sticker code={row.code} st={row.st} ar={row.ar} sv={row.sv} w={w} h={h} /></span>
}

export default function TreeView({ entries, sci, onPick, branch, onOpen, onLevel, layoutSlot }: Props) {
  const { t } = useI18n()
  useNames()
  const tt = t.collage.tree
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    watchInput()
    let live = true
    // The whole taxonomy (cached; the landing sample's own index holds only its birds), for every group and its totals.
    Promise.all([loadTree(), loadSpecies()]).then(([d, species]) => { if (live) setData({ ...d, species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const level: TreeLevel = branch
  const at = `${branch.ord ?? ''}|${branch.fam ?? ''}|${branch.genus ?? ''}`
  const mine = useTreeMine()
  const timeScale = useTreeTime()
  const pickedLayout = useTreeLayout()
  // The row whose list of genera inside is open, and the tip a hovered or keyboard-focused tip or row marks (`kb`: the
  // keyboard's, which adds the focus outline).
  const [list, setList] = useState<string | null>(null)
  const [hot, setHot] = useState<{ i: number; kb: boolean } | null>(null)
  const onList = useMemo(() => new Set(entries.map((e) => e.code)), [entries])
  const species = data?.species
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `level` is read through its key
  const view = useMemo(() => (data ? levelView(data.tree, data.species, level, onList, mine) : undefined), [data, at, onList, mine])
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
  const tipsOf = (v: LevelView) => v.rows.filter((r): r is Tip => r.kind !== 'order')

  // Whether the Fan and Radial can name every tip of this level at this width (fitRound).
  const fits = useMemo(() => {
    const out: Record<FanShape, RoundFit | undefined> = { fan: undefined, circle: undefined }
    if (!view || !width) return out
    const spans: LabelSpan[] = tipsOf(view).map((r) => {
      const name = r.kind === 'species' ? (sci ? r.row.sci : displayName(r.row)) : nameAt(r.row, view.tips)[0]
      const c = tipOfText(r)
      return {
        name: (measure(name, 13, 600) + (r.kind === 'group' && r.with ? MARK_W : 0)) / 13,
        count: c ? measure(c, 11, 500, true) / 13 : 0,
        on: r.kind === 'species' ? r.on : r.on > 0,
      }
    })
    for (const s of ['fan', 'circle'] as const) out[s] = fitRound(spans, s, { w: width })
    return out
  }, [view, width, measure, sci, nameAt, tipOfText])

  // The layout drawn: the one picked, else the fan from FAN_FROM px; rows until the width is known, and rows when the
  // Fan or Radial cannot name every tip.
  const roundOk = { fan: !!fits.fan, circle: !!fits.circle }
  let layout: TreeLayout = !width ? 'rows' : pickedLayout ?? (width >= FAN_FROM ? 'fan' : 'rows')
  if (layout !== 'rows' && !roundOk[shapeOf(layout)]) layout = 'rows'
  const shown = view
  const round = layout !== 'rows'
  const shape = shapeOf(layout)
  const fit = round ? fits[shape] : undefined
  const shownLevel = shown?.level
  const shownKey = shownLevel ? `${shownLevel.ord ?? ''}|${shownLevel.fam ?? ''}|${shownLevel.genus ?? ''}` : ''
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `shownLevel` is read through its key
  useEffect(() => { if (shownLevel) onLevel?.({ tree: shownLevel, mine, layout, time: timeScale, fits: roundOk }) }, [shownKey, mine, layout, timeScale, roundOk.fan, roundOk.circle, onLevel])
  const tips = useMemo(() => (shown ? tipsOf(shown) : []), [shown])

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
    setHot(null)
    onOpen(next, famName)
  }

  if (failed) return <p className="eb-tree-note">{tt.failed}</p>
  if (!data || !view || !shown || !species || !drawing) return <p className="eb-mono eb-tree-note">{tt.loading}</p>

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

  /** "with Turacoena", "with Urolestes and Corvinella": the groups folded into a row's branch, named as the row's own. */
  const withWords = (rows: Inside[]) => {
    const names = rows.map((w) => nameAt(w.row, rank)[0])
    const b = names.pop()!
    return names.length ? fmt(tt.withTwo, { a: names.join(', '), b }) : fmt(tt.withOne, { a: b })
  }
  const withText = (rows: Inside[]) => {
    const tag = (chunk: string) => <span lang={rank === 'genera' || sci ? 'la' : undefined}>{chunk}</span>
    return rich(withWords(rows), { a: tag, b: tag })
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
        <button type="button" className="eb-tree-with" aria-haspopup="dialog" aria-expanded={list === r.key} data-inside={many.map((w) => w.key).join(' ')} onClick={() => setList(r.key)} {...focusing(i)}>
          <span className="eb-sr" lang="la">{r.key}</span>{' '}{plural(tt.withMany, many.length, { n: count(many.length) })}
        </button>
      )}
      {/* After the row's buttons, so every count ends at the view's right edge, one column (the name says it). */}
      <span className="eb-mono eb-tree-count" aria-hidden="true">{count(r.on)} / {count(r.total)}</span>
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
  const ends = fit && 'ends' in drawing ? (drawing.ends as [number, number][]) : []
  const px = fit?.px ?? 13
  const S = px * LABEL_STICKER
  const tipAt = (e: MouseEvent) => (e.target as Element).closest('[data-i]')?.getAttribute('data-i')
  const onFanClick = (e: MouseEvent) => {
    const i = tipAt(e)
    if (i == null) return
    const r = tips[Number(i)]
    // A bird's card opens by its label on the drawing (its row is out of sight); a group opens as its row does.
    const el = box.current?.querySelector<HTMLElement>(`.eb-tree-fan-label[data-i="${i}"]`)
    if (r.kind === 'species') { if (r.on && el) onPick(r.row.code, el) }
    else box.current?.querySelector<HTMLElement>(`.eb-tree-rows [data-tip="${i}"]`)?.click()
  }
  const onFanOver = (e: MouseEvent) => {
    const i = tipAt(e)
    const n = i == null ? null : Number(i)
    setHot((h) => (n == null || !live(tips[n]) ? (h?.kb ? h : null) : h?.i === n && !h.kb ? h : { i: n, kb: false }))
  }
  const label = (p: { a: number }, i: number) => {
    const r = tips[i]
    const [name, latin] = tipName(r)
    const l = fanLabel(fit!, p.a, TIP_R + px * LABEL_GAP)
    const isHot = hot?.i === i && live(r)
    return (
      <span
        key={i} className="eb-tree-fan-label" data-i={i} data-flip={l.flip || undefined} data-on={isOn(r) || undefined}
        data-live={live(r) || undefined} data-hot={isHot || undefined} data-focus={(isHot && hot?.kb) || undefined}
        style={{ left: l.x, top: l.y - S / 2, transform: `${l.flip ? 'translateX(-100%) ' : ''}rotate(${l.rot.toFixed(2)}deg)` }}
      >
        <span className="eb-tree-fan-st" style={l.rot ? { transform: `rotate(${(-l.rot).toFixed(2)}deg)` } : undefined}>
          <Thumb row={r.kind === 'species' ? r.row : r.sticker} size={S} off={!isOn(r)} />
        </span>
        <span className="eb-tree-fan-text" lang={latin ? 'la' : undefined}>{name}</span>
        {r.kind === 'group' && r.with && <span className="eb-tree-mark" />}
        {r.kind === 'group' && fit!.counts[i] && <span className="eb-mono eb-tree-fan-count">{tipOfText(r)}</span>}
      </span>
    )
  }
  const circle = shape === 'circle'
  const figH = fit ? fit.h + ROUND_PAD : 0
  const figureStyle = { height: figH, '--tree-px': `${px}px`, '--tree-st': `${S}px`, '--tree-gap': `${px * LABEL_GAP}px`, '--tree-count': `${px * LABEL_COUNT}px` } as CSSProperties
  const roundFigure = fit && (
    // The hidden rows are the keyboard's and screen readers' way in; this is the pointer's.
    <div className="eb-tree-fan" data-circle={circle || undefined} style={figureStyle} aria-hidden="true" onClick={onFanClick} onMouseOver={onFanOver} onMouseLeave={() => setHot((h) => (h?.kb ? h : null))}>
      <svg className="eb-tree-svg" width={width} height={figH} viewBox={`0 0 ${width} ${figH}`} focusable="false">
        {ticks.filter((v) => v > 0).map((v) => <path key={v} className="eb-tree-ring" d={fanRing(fit, (1 - v / drawing.rootAge) * fit.R)} />)}
        <path className="eb-tree-off" d={drawing.unseen} />
        <path className="eb-tree-on" d={drawing.seen} />
        <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
        <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
        <path className="eb-tree-tipdot eb-tree-off" d={roundTips.filter((_, i) => !isOn(tips[i])).map((p) => circlePath(p.x, p.y)).join('')} />
        <path className="eb-tree-tipdot eb-tree-on" d={roundTips.filter((_, i) => isOn(tips[i])).map((p) => circlePath(p.x, p.y)).join('')} />
        {roundTips.map((p, i) => <circle key={i} className="eb-tree-tiphit" data-i={i} data-live={live(tips[i]) || undefined} cx={p.x} cy={p.y} r={8} />)}
      </svg>
      {roundTips.map(label)}
      {ticks.filter((v) => !circle || v > 0).map((v) => {
        const rr = (1 - v / drawing.rootAge) * fit.R
        const text = formatAge(v, t.num)
        // The circle's ages sit on a Paper patch on the radius straight up (16px tall, 3px of padding each side): one
        // that would hide a branch end is not written.
        return ringLabels(fit, rr).filter(([x, y]) => !circle || clearOfEnds(ends, x, y, measure(text, 11, 400, true) + 6, 16)).map(([x, y]) => (
          <span key={`${v}:${x}`} className="eb-mono eb-tree-fan-tick" style={{ left: x, top: circle ? y - 8 : y + 10 }}>{text}</span>
        ))
      })}
    </div>
  )

  const listRow = list ? shown.rows.find((r): r is Extract<TreeRow, { kind: 'group' }> => r.kind === 'group' && r.key === list && !!r.with) : undefined
  let tipNo = 0
  const rowItems = shown.rows.map((r) => {
    if (r.kind === 'order') return <li key={`o:${r.ord}:${r.top}`} className="eb-mono eb-tree-order" lang={sci ? 'la' : undefined}>{ordLabel(r.ord)}</li>
    const i = tipNo++
    return <li key={`${r.kind === 'group' ? r.key : r.row.code}:${r.top}`} className="eb-tree-row">{r.kind === 'group' ? groupRow(r, i) : speciesRow(r, i)}</li>
  })

  const roundNow = round && !!fit
  // The key says only what the drawing shows: the mark of a group that is not one branch, the dotted line.
  const keyMark = tips.some((r) => r.kind === 'group' && !!r.with)
  const keyDotted = tips.some((r) => r.dotted)
  // The Layout choice, in the controls bar's Display panel (its slot; TreeView knows which layouts fit).
  const layoutChoice = layoutSlot && createPortal(
    <DisplaySegments
      label={tt.layout} value={layout} testId="tree-layout"
      options={TREE_LAYOUTS.map((v) => ({ value: v, label: tt.layouts[v], off: width && v !== 'rows' && !roundOk[shapeOf(v)] ? tt.noRoom : undefined }))}
      onChange={(v) => { setHot(null); setTreeLayout(v) }}
    />,
    layoutSlot,
  )

  return (
    <div ref={boxRef} className="eb-tree" data-round={roundNow || undefined} style={width ? { ['--tree-w' as string]: `${treeW}px` } : undefined}>
      {layoutChoice}
      {view.split && here && <p className="eb-tree-note">{fmt(tt.split, { name: here })}</p>}
      {insideNote && <p className="eb-tree-note">{insideNote}</p>}
      {!shown.rows.length ? <p className="eb-tree-note">{tt.mineNone}</p> : roundNow ? (
        <div className="eb-tree-chart">
          {/* Before the drawing, so a row the keyboard reaches is near its tip. */}
          <ol className="eb-tree-rows" aria-label={tt.tips}>{rowItems}</ol>
          {roundFigure}
          {timeScale && <p className="eb-mono eb-tree-axis-title eb-tree-fan-axis" aria-hidden="true">{tt.axis}</p>}
        </div>
      ) : (
        <div className="eb-tree-chart">
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
            </svg>
            <ol ref={rowsRef} className="eb-tree-rows" aria-label={tt.tips}>{rowItems}</ol>
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
