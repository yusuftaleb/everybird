'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). It opens on every order; a tip opens its branch (an order to its families, a family to its genera, a genus
// to its species, whose tips on the list open the bird card). Two menus in the controls bar (rendered here, into the
// bar's slot, through a portal): Level (Orders | Families | Genera | Species: what the open branch's tips are, a rank
// drawing more than MAX_TIPS tips listed but disabled with its reason) and Layout (Fan | Circle | Rows, kept on the
// device; unpicked, the fan from FAN_FROM px wide and rows under it). The path above says where you are and steps back,
// with the count line ("18 of 45 orders"). The fan and the circle (fan.ts: the root at the centre, the tips on the
// arc or all round, the age axis as rings, the names that fit in full at the tips) sit over a list of the rows in up
// to three columns; Rows draws the tree top to bottom beside the rows, which grow with their names. Branches have
// rounded corners and simply join; every tip has one small hollow dot. Each tip shows a sticker: the species' own,
// else one bird of the group on the list (groupSticker). One name per tip, following the bar's Scientific switch. The
// drawing is aria-hidden; the rows carry the names and counts in the tree's order and are how the keyboard and screen
// readers open a branch. Hovering or focusing a row or a tip gives the tip's label (sticker, name, count) the Surface
// background, its whole name shown. A group the tree splits is one marked row at the smallest branch holding it,
// "with" the groups inside it; more than two genera inside are a button opening their list (PickerSheet), each opening
// its own species. Under it: the key (the mark and the dotted line of a tip placed without genetic data), the birds the
// tree does not place, and a one-line credit (the full one is on About). levels.ts, fan.ts and tree.ts hold the logic.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { Sticker } from '@/components/collage/Sticker'
import { PickerSheet } from '@/components/filters/PickerSheet'
import { MenuSelect } from '@/components/share/MenuSelect'
import type { ListEntry } from '@/lib/list/model'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { FAN_FROM, FAN_GAP, FAN_STICKER, drawFan, fanBox, fanLabel, fanRing, keepNames, polar, rayRoom, ringLabels, type FanTip } from '@/lib/tree/fan'
import { MAX_TIPS, RANKS, ROW_H, genusOf, levelView, ranksAt, rowColumns, tipOn, type Inside, type TipRank, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { loadTree } from '@/lib/tree/load'
import { TREE_LAYOUTS, setTreeLayout, useTreeLayout, useTreeMine, type TreeLayout } from '@/lib/tree-mine'
import { ageTicks, circlePath, drawTree, formatAge, oldestLineage, type Tree, type TreeFile } from '@/lib/tree/tree'
import '@/components/share/share.css' // .eb-share-dd, the menus' button (MenuSelect)
import './tree.css'

export const AVES_URL = 'https://github.com/McTavishLab/AvesData'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'

type Loaded = { file: TreeFile; tree: Tree; species: SpeciesIndex }
type Tip = Exclude<TreeRow, { kind: 'order' }>

/** The rows' drawing column (px) for a view `width` px wide: about 38% of it, between 112 and 480. */
const rowsTreeW = (width: number) => Math.round(Math.min(480, Math.max(112, width * 0.38)))
/** A row's sticker (px); the fan's and circle's labels: height (a sticker and its padding), padding, the gap between
 *  their parts, the name's line; the mark's width with its gap. */
const ROW_STICKER = 24
const LABEL_H = 28
const LABEL_PAD = 4
const LABEL_GAP = 6
const NAME_H = 17
const MARK_W = 7 + LABEL_GAP
/** Between the columns of rows under the fan or circle (px), and a row's parts besides its name and count (the dot, the
 *  sticker, their gaps, the padding) with a little air. */
const COLUMN_GAP = 24
const ROW_FIXED = 8 + 10 + 20 + 10 + 10 + 4 + 8

type Props = {
  /** The filtered list. */
  entries: ListEntry[]
  sci: boolean
  /** Opens the bird card; `el` is the pressed button. */
  onPick: (code: string, el: HTMLElement) => void
  /** Told the level open, "Lifers only" (the bar's switch, tree-mine.ts) and the layout drawn whenever they change, so
   *  Share can draw the same. */
  onLevel?: (level: TreeLevel, mine: boolean, layout: TreeLayout) => void
  /** The controls bar's slot for the Level and Layout menus (none: no menus). */
  menus?: HTMLElement | null
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
 *  is missing. Used only for the fan, the circle and the columns under them (never in jsdom: no width, no fan). */
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
    return (text, px, weight, isMono) => textWidth(text, `${weight} ${px}px ${isMono ? mono : body}`, text.length * px * (isMono ? 0.62 : 0.56))
    // `fonts` only says the fonts have loaded: measure again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el, fonts])
}

/** A sticker in a `size` px square, or nothing (a missing sticker leaves the name alone: tree.css hides the outline). */
function Thumb({ row, size, off }: { row?: SpeciesRow; size: number; off?: boolean }) {
  if (!row?.st) return null
  const w = row.ar >= 1 ? size : size * row.ar, h = row.ar >= 1 ? size / row.ar : size
  return <span className="eb-tree-st-in" data-off={off || undefined}><Sticker code={row.code} st={row.st} ar={row.ar} sv={row.sv} w={w} h={h} /></span>
}

export default function TreeView({ entries, sci, onPick, onLevel, menus }: Props) {
  const { t } = useI18n()
  useNames()
  const tt = t.collage.tree
  const [data, setData] = useState<Loaded | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    // The whole taxonomy (cached; the landing sample's own index holds only its birds), for every group and its totals.
    Promise.all([loadTree(), loadSpecies()]).then(([d, species]) => { if (live) setData({ ...d, species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  const [level, setLevel] = useState<TreeLevel>({})
  const mine = useTreeMine()
  const picked = useTreeLayout()
  // The row whose list of genera inside is open, and the tip a hovered or focused row or tip gives its label's background.
  const [list, setList] = useState<string | null>(null)
  const [hot, setHot] = useState<number | null>(null)
  const onList = useMemo(() => new Set(entries.map((e) => e.code)), [entries])
  const species = data?.species
  const view = useMemo(() => (data ? levelView(data.tree, data.species, level, onList, mine) : undefined), [data, level, onList, mine])
  const unmapped = useMemo(() => (data ? entries.filter((e) => !data.tree.tipOf.has(e.code)) : []), [data, entries])
  const oldest = useMemo(() => (data ? oldestLineage(data.tree, onList) : undefined), [data, onList])

  const box = useRef<HTMLDivElement | null>(null)
  const [boxEl, setBoxEl] = useState<HTMLDivElement | null>(null)
  const boxRef = useCallback((el: HTMLDivElement | null) => { box.current = el; setBoxEl(el) }, [])
  const width = useWidth(boxEl)
  const measure = useMeasure(boxEl)
  // The layout drawn: the one picked, else the fan from FAN_FROM px and rows under it; rows until the width is known.
  const layout: TreeLayout = !width ? 'rows' : picked ?? (width >= FAN_FROM ? 'fan' : 'rows')
  const round = layout !== 'rows'
  useEffect(() => onLevel?.(level, mine, layout), [level, mine, layout, onLevel])
  const fb = useMemo(() => fanBox(width, layout === 'circle' ? 'circle' : 'fan'), [width, layout])
  const treeW = rowsTreeW(width)
  const tips = useMemo(() => (view?.rows.filter((r): r is Tip => r.kind !== 'order') ?? []), [view])

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
  }, [round, width, measureRows, view])
  const ys = !round && width && rowYs && rowYs.y.length === tips.length && rowYs.h > 0 ? rowYs : undefined

  // The drawing in px once the width is known (rounded corners stay round); before it, the 1000-wide one stretched.
  const drawing = useMemo(() => {
    if (!view?.root) return view?.drawing
    const dotted = (_: unknown, i: number) => tips[i].dotted
    if (round) return drawFan(view.root, tipOn(tips), view.stem, dotted, fb)
    return width ? drawTree(view.root, tipOn(tips), (i) => ys?.y[i] ?? tips[i].top + ROW_H / 2, view.stem, dotted, treeW) : view.drawing
  }, [view, tips, round, fb, width, treeW, ys])

  // Focus follows the level: drilling in focuses the path's current step, a step back the row it came from.
  const focus = useRef<string | null>(null)
  useEffect(() => {
    const f = focus.current
    if (!f) return
    focus.current = null
    // A genus opened from a row's list goes back to that list's button.
    box.current?.querySelector<HTMLElement>(f === 'here' ? '.eb-tree-here' : `[data-key="${f}"], [data-inside~="${f}"]`)?.focus()
  }, [level])
  const go = (next: TreeLevel, back?: string) => {
    focus.current = back ?? 'here'
    setList(null)
    setHot(null)
    setLevel(next)
  }
  const ids = useId()
  const escape = useRef<(() => void) | null>(null)

  if (failed) return <p className="eb-tree-note">{tt.failed}</p>
  if (!data || !view || !species || !drawing) return <p className="eb-mono eb-tree-note">{tt.loading}</p>

  // The level drawn: a folded order, family or genus opens the row whose branch holds it.
  const at = view.level
  const path = { ord: at.ord, fam: at.fam, genus: at.genus }
  const rank = view.tips
  const famRow = at.fam ? species.rows.find((r) => r.fam === at.fam) : undefined
  const ordLabel = (ord: string) => (sci ? ord : (t.orders as Record<string, string>)[ord] ?? ord)
  const famLabel = (r: SpeciesRow) => (sci ? r.fam : familyName(r))
  /** A group's name at `rank` as shown, and whether it is Latin. */
  const nameAt = (r: SpeciesRow, k: TipRank): [string, boolean] =>
    k === 'orders' ? [ordLabel(r.ord), sci] : k === 'families' ? [famLabel(r), sci] : k === 'genera' ? [genusOf(r.sci), true] : [sci ? r.sci : displayName(r), sci]
  const crumbs: { label: string; latin: boolean; to?: TreeLevel; back?: string }[] = [{ label: tt.all, latin: false, to: {}, back: at.ord }]
  if (at.ord) crumbs.push({ label: ordLabel(at.ord), latin: sci, to: { ord: at.ord }, back: at.fam })
  if (famRow) crumbs.push({ label: famLabel(famRow), latin: sci, to: { ord: at.ord, fam: at.fam }, back: at.genus })
  if (at.genus) crumbs.push({ label: at.genus, latin: true })
  const here = at.genus ?? (famRow ? famLabel(famRow) : at.ord ? ordLabel(at.ord) : undefined)
  const openRank: TipRank = at.genus ? 'genera' : at.fam ? 'families' : 'orders'
  const count = (n: number) => formatInt(n, t.num)
  const insideNote = (() => {
    if (!view.inside || !here) return undefined
    if (at.genus && view.inside.length > 2) return plural(tt.insideMany, view.inside.length, { n: count(view.inside.length), name: here })
    const names = view.inside.map((r) => nameAt(r, openRank)[0])
    const last = names.pop()!
    return names.length ? fmt(tt.insideTwo, { a: names.join(', '), b: last, name: here }) : fmt(tt.insideOne, { a: last, name: here })
  })()
  const ticks = ageTicks(drawing.rootAge).filter((v) => v / drawing.rootAge <= 0.97 || v === 0)
  const offered = ranksAt(at)
  // A rank for the open branch's tips: the focus goes back to the Level menu's button.
  const choose = (k: TipRank) => {
    if (k === rank) return
    setList(null)
    setHot(null)
    setLevel({ ...path, tips: k === offered[0] ? undefined : k })
  }
  /** The branch a group's tip opens: the path down to it, the ranks above it named from its row. */
  const opens = (k: TipRank, key: string, r: SpeciesRow): TreeLevel =>
    k === 'orders' ? { ord: key } : k === 'families' ? { ord: r.ord, fam: key } : { ord: at.ord ?? r.ord, fam: at.fam ?? r.fam, genus: key }

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
  const hover = (i: number) => ({ onFocus: () => setHot(i), onBlur: () => setHot(null), onMouseEnter: () => setHot(i), onMouseLeave: () => setHot(null) })
  const thumb = (r: Tip) => <span className="eb-tree-st" aria-hidden="true"><Thumb row={r.kind === 'species' ? r.row : r.sticker} size={ROW_STICKER} off={r.kind === 'species' && !r.on} /></span>
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
        data-hot={hot === i || undefined}
        onClick={() => go(opens(rank, r.key, r.row))}
        {...hover(i)}
      >
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name">
          <span lang={latin ? 'la' : undefined}>{name}</span>
          {marked && <span className="eb-tree-mark" aria-hidden="true" />}
          {!!r.with?.length && !many && <>{' '}<span className="eb-tree-other">{withText(r.with)}</span></>}
        </span>
        <span className="eb-mono eb-tree-count" aria-hidden="true">{count(r.on)} / {count(r.total)}</span>
        <span className="eb-sr">{marked && `, ${tt.markSr}`}, {fmt(tt.onList, { n: count(r.on), total: count(r.total) })}{r.dotted && `, ${tt.dottedSr}`}</span>
      </button>
      {many && (
        <button type="button" className="eb-tree-with" aria-haspopup="dialog" aria-expanded={list === r.key} data-inside={many.map((w) => w.key).join(' ')} onClick={() => setList(r.key)}>
          <span className="eb-sr" lang="la">{r.key}</span>{' '}{plural(tt.withMany, many.length, { n: count(many.length) })}
        </button>
      )}
      </>
    )
  }
  const speciesRow = (r: Extract<TreeRow, { kind: 'species' }>, i: number) => {
    const inner = (
      <>
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name"><span lang={sci ? 'la' : undefined}>{sci ? r.row.sci : displayName(r.row)}</span></span>
        <span className="eb-sr">, {r.on ? tt.onListOne : tt.notOnList}{r.dotted && `, ${tt.dottedSr}`}</span>
      </>
    )
    return r.on
      ? <button type="button" className="eb-tree-btn" data-on data-code={r.row.code} data-tip={i} data-hot={hot === i || undefined} onClick={(e) => onPick(r.row.code, e.currentTarget)} {...hover(i)}>{inner}</button>
      : <span className="eb-tree-btn" data-tip={i} data-hot={hot === i || undefined} {...hover(i)}>{inner}</span>
  }
  const tipName = (r: Tip) => (r.kind === 'species' ? [sci ? r.row.sci : displayName(r.row), sci] as const : nameAt(r.row, rank))
  const tipCount = (r: Tip) => (r.kind === 'species' ? Number(r.on) : r.on)
  const tipOfText = (r: Tip) => (r.kind === 'group' ? fmt(tt.tipOf, { n: count(r.on), total: count(r.total) }) : '')

  // The fan's or circle's labels: a sticker where one fits, a name (with its count) where it fits in full without
  // touching another, those with more birds on the list first; the hot tip's whole label.
  const roundTips: FanTip[] = round && 'tips' in drawing ? (drawing.tips as FanTip[]) : []
  const circle = layout === 'circle'
  const nameAt0 = fb.R + FAN_GAP * 2 + FAN_STICKER
  const labelW = (r: Tip) => {
    const c = tipOfText(r)
    return measure(tipName(r)[0], 13, 600) + (c ? LABEL_GAP + measure(c, 11, 500, true) : 0) + (r.kind === 'group' && r.with ? MARK_W : 0)
  }
  const named = round ? keepNames(roundTips.map((p, i) => ({ y: p.a * nameAt0, n: tipCount(tips[i]) + 1, w: labelW(tips[i]) })), NAME_H, fb.label, circle ? 2 * Math.PI * nameAt0 : undefined) : new Set<number>()
  const stickerAt = fb.R + FAN_GAP + FAN_STICKER / 2
  const stickered = round ? keepNames(roundTips.map((p, i) => {
    const r = tips[i]
    const row = r.kind === 'species' ? r.row : r.sticker
    return { y: p.a * stickerAt, n: row?.st ? tipCount(r) + 1 : 0 }
  }), FAN_STICKER, undefined, circle ? 2 * Math.PI * stickerAt : undefined) : new Set<number>()
  // A press on a tip's label presses its row; a pointer over one makes it hot.
  const tipAt = (e: MouseEvent) => (e.target as Element).closest('[data-i]')?.getAttribute('data-i')
  const onFanClick = (e: MouseEvent) => {
    const i = tipAt(e)
    if (i != null) box.current?.querySelector<HTMLElement>(`.eb-tree-rows [data-tip="${i}"]`)?.click()
  }
  const onFanOver = (e: MouseEvent) => { const i = tipAt(e); setHot(i == null ? null : Number(i)) }
  const label = (p: FanTip, i: number) => {
    const isHot = hot === i
    const showName = named.has(i) || isHot
    if (!showName && !stickered.has(i)) return null
    const r = tips[i]
    const [name, latin] = tipName(r)
    const l = fanLabel(fb, p.a, FAN_GAP - LABEL_PAD)
    const w = labelW(r) + FAN_STICKER + LABEL_GAP + 2 * LABEL_PAD
    // The hot label of a name too long for its room runs level instead, kept inside the drawing.
    const flat = isHot && !named.has(i) && w > rayRoom(fb, width, fb.h, p.a, FAN_GAP - LABEL_PAD)
    const [x, y] = flat ? polar(fb, fb.R + FAN_GAP + FAN_STICKER / 2, p.a) : [l.x, l.y]
    const style = flat
      ? { left: Math.max(0, Math.min(width - w, x - FAN_STICKER / 2 - LABEL_PAD)), top: Math.max(0, Math.min(fb.h - LABEL_H, y - LABEL_H / 2)) }
      : { left: l.x, top: l.y - LABEL_H / 2, transform: `${l.flip ? 'translateX(-100%) ' : ''}rotate(${l.rot.toFixed(2)}deg)` }
    const rot = flat ? 0 : l.rot
    return (
      <span
        key={i} className="eb-tree-fan-label" data-i={i} data-flip={!flat && l.flip ? '' : undefined} data-on={tipCount(r) > 0 || undefined} data-hot={isHot || undefined}
        style={style}
      >
        <span className="eb-tree-fan-st" style={rot ? { transform: `rotate(${(-rot).toFixed(2)}deg)` } : undefined}>
          {(stickered.has(i) || isHot) && <Thumb row={r.kind === 'species' ? r.row : r.sticker} size={FAN_STICKER} off={r.kind === 'species' && !r.on} />}
        </span>
        {showName && (
          <span className="eb-tree-fan-words">
            <span className="eb-tree-fan-text" lang={latin ? 'la' : undefined}>{name}</span>
            {r.kind === 'group' && r.with && <span className="eb-tree-mark" />}
            {r.kind === 'group' && <span className="eb-mono eb-tree-fan-count">{tipOfText(r)}</span>}
          </span>
        )}
      </span>
    )
  }
  const roundFigure = round && (
    // The rows under it are the keyboard's and screen readers' way in; this is a shortcut for the pointer.
    <div className="eb-tree-fan" data-circle={circle || undefined} style={{ height: fb.h }} aria-hidden="true" onClick={onFanClick} onMouseOver={onFanOver} onMouseLeave={() => setHot(null)}>
      <svg className="eb-tree-svg" width={width} height={fb.h} viewBox={`0 0 ${width} ${fb.h}`} focusable="false">
        {ticks.filter((v) => v > 0).map((v) => <path key={v} className="eb-tree-ring" d={fanRing(fb, (1 - v / drawing.rootAge) * fb.R)} />)}
        <path className="eb-tree-off" d={drawing.unseen} />
        <path className="eb-tree-on" d={drawing.seen} />
        <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
        <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
        <path className="eb-tree-tipdot eb-tree-off" d={roundTips.filter((_, i) => !tipCount(tips[i])).map((p) => circlePath(p.x, p.y)).join('')} />
        <path className="eb-tree-tipdot eb-tree-on" d={roundTips.filter((_, i) => tipCount(tips[i])).map((p) => circlePath(p.x, p.y)).join('')} />
        {roundTips.map((p, i) => <circle key={i} className="eb-tree-tiphit" data-i={i} cx={p.x} cy={p.y} r={8} />)}
      </svg>
      {roundTips.map(label)}
      {ticks.filter((v) => !circle || v > 0).map((v) => {
        const rr = (1 - v / drawing.rootAge) * fb.R
        return ringLabels(fb, rr).map(([x, y]) => (
          <span key={`${v}:${x}`} className="eb-mono eb-tree-fan-tick" style={{ left: x, top: circle ? y - 8 : y + 10 }}>{formatAge(v, t.num)}</span>
        ))
      })}
    </div>
  )

  const listRow = list ? view.rows.find((r): r is Extract<TreeRow, { kind: 'group' }> => r.kind === 'group' && r.key === list && !!r.with) : undefined
  let tipNo = 0
  const rowItems = view.rows.map((r) => {
    if (r.kind === 'order') return <li key={`o:${r.ord}:${r.top}`} className="eb-mono eb-tree-order" lang={sci ? 'la' : undefined}>{ordLabel(r.ord)}</li>
    const i = tipNo++
    return <li key={`${r.kind === 'group' ? r.key : r.row.code}:${r.top}`} className="eb-tree-row">{r.kind === 'group' ? groupRow(r, i) : speciesRow(r, i)}</li>
  })
  // Under the fan or circle: as many columns (at most three) as hold every row on one line, its name in full.
  const columns = round ? rowColumns(width, Math.max(0, ...tips.map((r) => {
    const many = manyOf(r)
    return ROW_FIXED + measure(tipName(r)[0], 15, 600)
      + (r.kind === 'group' ? 10 + measure(`${count(r.on)} / ${count(r.total)}`, 12, 400, true) : 0)
      + (r.kind === 'group' && r.with ? MARK_W : 0)
      + (r.kind === 'group' && r.with && !many ? 8 + measure(withWords(r.with), 13, 500) : 0)
      + (many ? 12 + measure(plural(tt.withMany, many.length, { n: count(many.length) }), 13, 400) : 0)
  })), COLUMN_GAP) : 1

  const offeredOptions = RANKS.filter((k) => offered.includes(k)).map((k) => ({
    value: k, label: tt.rank[k], off: k !== 'orders' && (view.counts[k] ?? 0) > MAX_TIPS ? tt.tooMany[k] : undefined,
  }))
  const menuBar = menus && createPortal(
    <>
      <span id={`${ids}-level`} className="eb-sr">{tt.level}</span>
      <MenuSelect labelledBy={`${ids}-level`} menuLabel={tt.level} options={offeredOptions} value={rank} onChange={choose} escapeRef={escape} testId="tree-level" />
      <span id={`${ids}-layout`} className="eb-sr">{tt.layout}</span>
      <MenuSelect
        labelledBy={`${ids}-layout`} menuLabel={tt.layout} options={TREE_LAYOUTS.map((v) => ({ value: v, label: tt.layouts[v] }))} value={layout}
        onChange={(v) => { setHot(null); setTreeLayout(v) }} escapeRef={escape} testId="tree-layout"
      />
    </>,
    menus,
  )

  return (
    <div ref={boxRef} className="eb-tree" data-round={round || undefined} style={width ? { ['--tree-w' as string]: `${treeW}px` } : undefined}>
      {menuBar}
      {oldest && (
        <p className="eb-tree-fact">
          {fmt(tt.oldest, { name: displayName(species.byCode.get(oldest.code)!), age: formatAge(oldest.age, t.num) })}
        </p>
      )}
      <nav aria-label={tt.nav} className="eb-tree-nav">
        <p className="eb-path eb-tree-path">
          {crumbs.map((c, i) => (
            <span key={i} className="eb-path-item">
              {i > 0 && <span className="eb-path-sep" aria-hidden="true">/</span>}
              {i === crumbs.length - 1
                ? <span className="eb-tree-here" aria-current="location" tabIndex={-1} lang={c.latin ? 'la' : undefined}>{c.label}</span>
                : <button type="button" lang={c.latin ? 'la' : undefined} onClick={() => go(c.to!, c.back)}>{c.label}</button>}
            </span>
          ))}
        </p>
        <p className="eb-mono eb-tree-cover">{plural(tt.cover[rank], view.cover[1], { n: count(view.cover[0]), total: count(view.cover[1]) })}</p>
      </nav>
      {view.split && here && <p className="eb-tree-note">{fmt(tt.split, { name: here })}</p>}
      {insideNote && <p className="eb-tree-note">{insideNote}</p>}
      {!view.rows.length ? <p className="eb-tree-note">{tt.mineNone}</p> : round ? (
        <div className="eb-tree-chart">
          {roundFigure}
          <p className="eb-mono eb-tree-axis-title eb-tree-fan-axis" aria-hidden="true">{tt.axis}</p>
          <ol className="eb-tree-rows" aria-label={tt.tips} style={{ columns }}>{rowItems}</ol>
        </div>
      ) : (
        <div className="eb-tree-chart">
          <div className="eb-tree-head" aria-hidden="true">
            <div className="eb-tree-axis">
              {ticks.map((v) => (
                <span key={v} className="eb-mono eb-tree-tick" style={{ left: `${(1 - v / drawing.rootAge) * 100}%` }}>{formatAge(v, t.num)}</span>
              ))}
            </div>
            <span className="eb-mono eb-tree-axis-title">{tt.axis}</span>
          </div>
          <div className="eb-tree-body">
            <svg className="eb-tree-svg" viewBox={`0 0 ${width ? treeW : 1000} ${ys?.h ?? view.height}`} preserveAspectRatio={width ? undefined : 'none'} aria-hidden="true" focusable="false">
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
                <button type="button" className="eb-tree-btn" data-on={w.on > 0 || undefined} onClick={() => go({ ord: at.ord ?? w.row.ord, fam: at.fam ?? w.row.fam, genus: w.key })}>
                  <span className="eb-tree-dot" aria-hidden="true" />
                  <span className="eb-tree-name"><span lang="la">{w.key}</span></span>
                  <span className="eb-mono eb-tree-count" aria-hidden="true">{count(w.on)} / {count(w.total)}</span>
                  <span className="eb-sr">, {fmt(tt.onList, { n: count(w.on), total: count(w.total) })}</span>
                </button>
              </li>
            ))}
          </ul>
        </PickerSheet>
      )}
      <ul className="eb-tree-key">
        <li><span className="eb-tree-mark" aria-hidden="true" />{tt.keyMark}</li>
        <li>
          <svg className="eb-tree-key-line" viewBox="0 0 24 4" aria-hidden="true" focusable="false"><path className="eb-tree-on eb-tree-dash" d="M0 2H24" /></svg>
          {tt.keyDotted}
        </li>
      </ul>
      <div className="eb-tree-unmapped">
        {unmapped.length ? (
          <>
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
          </>
        ) : <p>{tt.allMapped}</p>}
      </div>
      <p className="eb-tree-credit">
        {rich(tt.credit, {
          src: (chunk) => <a href={AVES_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
          lic: (chunk) => <a href={CC_BY_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
        })}
      </p>
    </div>
  )
}
