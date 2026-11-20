'use client'
// The Tree tab: the list read on AvesData's dated tree of birds (public/data/tree.v1.json, fetched the first time the
// tab opens). It opens on every order; a tip opens its branch (an order to its families, a family to its genera, a genus
// to its species, whose tips on the list open the bird card), and the level switch (Orders | Families | Genera |
// Species) chooses what the open branch's tips are, a rank drawing more than MAX_TIPS tips disabled with its reason. The
// path above says where you are and steps back, with the count line ("18 of 45 orders"). From FAN_FROM px wide the
// drawing is a fan (fan.ts: the root at the centre, the tips on the arc, the age axis as rings, the names that fit at
// the tips) over a compact list of the rows; narrower, rows top to bottom beside the drawing. Branches have rounded
// corners and every node a filled dot. Each tip shows a sticker: the species' own, else one bird of the group on the
// list (groupSticker). The drawing is aria-hidden; the rows carry the names and counts in the tree's order and are how
// the keyboard and screen readers open a branch (a focused row rings its tip on the fan). A group the tree splits is
// one marked row at the smallest branch holding it, "with" the groups inside it; more than two genera inside are a
// button opening their list (PickerSheet), each opening its own species. Under it: the key (the mark and the dotted
// line of a tip placed without genetic data), the birds the tree does not place, and the source with its licence.
// levels.ts, fan.ts and tree.ts hold the logic.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { fmt, plural, rich } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { Sticker } from '@/components/collage/Sticker'
import { PickerSheet } from '@/components/filters/PickerSheet'
import type { ListEntry } from '@/lib/list/model'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName, familyName } from '@/lib/species/names'
import { useNames } from '@/lib/species/use-names'
import type { SpeciesRow } from '@/lib/species/types'
import { FAN_FROM, FAN_GAP, FAN_LABEL, FAN_STICKER, drawFan, fanBox, fanLabel, fanRing, keepNames } from '@/lib/tree/fan'
import { MAX_TIPS, RANKS, ROW_H, genusOf, levelView, ranksAt, tipOn, type Inside, type TipRank, type TreeLevel, type TreeRow } from '@/lib/tree/levels'
import { loadTree } from '@/lib/tree/load'
import { useTreeMine } from '@/lib/tree-mine'
import { ageTicks, drawTree, formatAge, oldestLineage, type Drawing, type Tree, type TreeFile } from '@/lib/tree/tree'
import '@/components/share/share.css' // .eb-seg, the share dialog's segmented control
import './tree.css'

export const AVES_URL = 'https://github.com/McTavishLab/AvesData'
export const CC_BY_URL = 'https://creativecommons.org/licenses/by/4.0/'

type Loaded = { file: TreeFile; tree: Tree; species: SpeciesIndex }
type Tip = Exclude<TreeRow, { kind: 'order' }>

/** The rows' drawing column (px) for a view `width` px wide: about 38% of it, between 112 and 480. */
const rowsTreeW = (width: number) => Math.round(Math.min(480, Math.max(112, width * 0.38)))
/** A row's sticker (px), and the fan's names' line height with its air. */
const ROW_STICKER = 24
const NAME_H = 17

type Props = {
  /** The filtered list. */
  entries: ListEntry[]
  sci: boolean
  /** Opens the bird card; `el` is the pressed button. */
  onPick: (code: string, el: HTMLElement) => void
  /** Told the level open and "Lifers only" (the bar's switch, tree-mine.ts) whenever they change, so Share can draw the same. */
  onLevel?: (level: TreeLevel, mine: boolean) => void
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

/** A sticker in a `size` px square, or nothing (a missing sticker leaves the name alone: tree.css hides the outline). */
function Thumb({ row, size, off }: { row?: SpeciesRow; size: number; off?: boolean }) {
  if (!row?.st) return null
  const w = row.ar >= 1 ? size : size * row.ar, h = row.ar >= 1 ? size / row.ar : size
  return <span className="eb-tree-st-in" data-off={off || undefined}><Sticker code={row.code} st={row.st} ar={row.ar} sv={row.sv} w={w} h={h} /></span>
}

export default function TreeView({ entries, sci, onPick, onLevel }: Props) {
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
  useEffect(() => onLevel?.(level, mine), [level, mine, onLevel])
  // The row whose list of genera inside is open, and the tip a focused or hovered row rings on the fan.
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
  const fan = width >= FAN_FROM
  const fb = useMemo(() => fanBox(width), [width])
  const treeW = rowsTreeW(width)
  const tips = useMemo(() => (view?.rows.filter((r): r is Tip => r.kind !== 'order') ?? []), [view])
  // The drawing in px once the width is known (rounded corners stay round); before it, the 1000-wide one stretched.
  const drawing = useMemo((): (Drawing & { tips?: ReturnType<typeof drawFan>['tips'] }) | undefined => {
    if (!view?.root) return view?.drawing
    const dotted = (_: unknown, i: number) => tips[i].dotted
    if (fan) return drawFan(view.root, tipOn(tips), view.stem, dotted, fb)
    return width ? drawTree(view.root, tipOn(tips), (i) => tips[i].top + ROW_H / 2, view.stem, dotted, treeW) : view.drawing
  }, [view, tips, fan, fb, width, treeW])

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
  // A rank for the open branch's tips: the focus stays on the switch.
  const choose = (k: TipRank) => {
    if (k === rank) return
    setList(null)
    setHot(null)
    setLevel({ ...path, tips: k === offered[0] ? undefined : k })
  }
  /** The branch a group's tip opens: the path down to it, the ranks above it named from its row. */
  const opens = (k: TipRank, key: string, r: SpeciesRow): TreeLevel =>
    k === 'orders' ? { ord: key } : k === 'families' ? { ord: r.ord, fam: key } : { ord: at.ord ?? r.ord, fam: at.fam ?? r.fam, genus: key }

  // "with Turacoena", "with Urolestes and Corvinella": the groups folded into a row's branch, named as the row's own.
  const withText = (rows: Inside[]) => {
    const names = rows.map((w) => nameAt(w.row, rank)[0])
    const tag = (chunk: string) => <span lang={rank === 'genera' || sci ? 'la' : undefined}>{chunk}</span>
    const b = names.pop()!
    return rich(names.length ? fmt(tt.withTwo, { a: names.join(', '), b }) : fmt(tt.withOne, { a: b }), { a: tag, b: tag })
  }
  const hover = (i: number) => ({ onFocus: () => setHot(i), onBlur: () => setHot(null), onMouseEnter: () => setHot(i), onMouseLeave: () => setHot(null) })
  const thumb = (r: Tip) => <span className="eb-tree-st" aria-hidden="true"><Thumb row={r.kind === 'species' ? r.row : r.sticker} size={ROW_STICKER} off={r.kind === 'species' && !r.on} /></span>
  const groupRow = (r: Extract<TreeRow, { kind: 'group' }>, i: number) => {
    const [primary, latin] = nameAt(r.row, rank)
    // The group's other name; a genus names its family when no family is open or it belongs to another one.
    const alt = rank === 'orders' ? (sci ? (t.orders as Record<string, string>)[r.row.ord] : r.row.ord)
      : rank === 'families' ? (sci ? familyName(r.row) : r.row.fam)
      : r.row.fam !== at.fam ? famLabel(r.row) : undefined
    const other = alt !== primary ? alt : undefined
    const otherLatin = rank === 'genera' ? sci : !sci
    const marked = !!r.with
    // More than two genera inside: a count opening their list instead of the sentence.
    const many = rank === 'genera' && r.with && r.with.length > 2 ? r.with : undefined
    return (
      <>
      <button
        type="button"
        className="eb-tree-btn"
        data-key={r.key}
        data-tip={i}
        data-on={r.on > 0 || undefined}
        onClick={() => go(opens(rank, r.key, r.row))}
        {...hover(i)}
      >
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name">
          <span lang={latin ? 'la' : undefined}>{primary}</span>
          {marked && <span className="eb-tree-mark" aria-hidden="true" />}
          {!!r.with?.length && !many && <>{' '}<span className="eb-tree-other" data-keep>{withText(r.with)}</span></>}
          {other && <>{' '}<span className="eb-tree-other" data-keep={rank === 'genera' || undefined} lang={otherLatin ? 'la' : undefined}>{other}</span></>}
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
    const name = sci ? r.row.sci : displayName(r.row)
    const inner = (
      <>
        <span className="eb-tree-dot" aria-hidden="true" />
        {thumb(r)}
        <span className="eb-tree-name">
          <span lang={sci ? 'la' : undefined}>{name}</span>
          {/* In a folded genus's branch, a species of another genus names its genus (its scientific name already does). */}
          {!sci && at.genus && genusOf(r.row.sci) !== at.genus && <>{' '}<span className="eb-tree-other" data-keep lang="la">{genusOf(r.row.sci)}</span></>}
        </span>
        <span className="eb-sr">, {r.on ? tt.onListOne : tt.notOnList}{r.dotted && `, ${tt.dottedSr}`}</span>
      </>
    )
    return r.on
      ? <button type="button" className="eb-tree-btn" data-on data-code={r.row.code} data-tip={i} onClick={(e) => onPick(r.row.code, e.currentTarget)} {...hover(i)}>{inner}</button>
      : <span className="eb-tree-btn" {...hover(i)}>{inner}</span>
  }
  const tipName = (r: Tip) => (r.kind === 'species' ? [sci ? r.row.sci : displayName(r.row), sci] as const : nameAt(r.row, rank))
  const tipCount = (r: Tip) => (r.kind === 'species' ? Number(r.on) : r.on)

  // The fan's names and stickers: as many as fit along the arc, those with more birds on the list first, every tip
  // with a name when there is room; the ringed tip's always.
  const fanTips = fan ? drawing.tips ?? [] : []
  const named = fan ? keepNames(fanTips.map((p, i) => ({ y: p.a * (fb.R + FAN_GAP * 2 + FAN_STICKER), n: tipCount(tips[i]) + 1 })), NAME_H) : new Set<number>()
  const stickered = fan ? keepNames(fanTips.map((p, i) => {
    const r = tips[i]
    const row = r.kind === 'species' ? r.row : r.sticker
    return { y: p.a * (fb.R + FAN_GAP + FAN_STICKER / 2), n: row?.st ? tipCount(r) + 1 : 0 }
  }), FAN_STICKER) : new Set<number>()
  // A press on a tip, its name or its sticker presses its row.
  const onFanClick = (e: MouseEvent) => {
    const i = (e.target as Element).closest('[data-i]')?.getAttribute('data-i')
    if (i != null) box.current?.querySelector<HTMLElement>(`.eb-tree-rows [data-tip="${i}"]`)?.click()
  }
  const fanFigure = fan && (
    // The rows under it are the keyboard's and screen readers' way in; this is a shortcut for the pointer.
    <div className="eb-tree-fan" style={{ height: fb.h }} aria-hidden="true" onClick={onFanClick}>
      <svg className="eb-tree-svg" width={width} height={fb.h} viewBox={`0 0 ${width} ${fb.h}`} focusable="false">
        {ticks.filter((v) => v > 0).map((v) => <path key={v} className="eb-tree-ring" d={fanRing(fb, (1 - v / drawing.rootAge) * fb.R)} />)}
        <path className="eb-tree-off" d={drawing.unseen} />
        <path className="eb-tree-on" d={drawing.seen} />
        <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
        <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
        <path className="eb-tree-node eb-tree-off" d={drawing.unseenNodes} />
        <path className="eb-tree-node eb-tree-on" d={drawing.seenNodes} />
        {fanTips.map((p, i) => {
          const r = tips[i]
          const d = r.kind === 'group' && r.with ? `M${p.x} ${p.y - 5}L${p.x + 5} ${p.y}L${p.x} ${p.y + 5}L${p.x - 5} ${p.y}Z` : `M${p.x - 4} ${p.y}a4 4 0 1 0 8 0a4 4 0 1 0 -8 0Z`
          return <path key={i} className="eb-tree-tipmark" data-i={i} data-on={tipCount(r) > 0 || undefined} d={d} />
        })}
        {hot != null && fanTips[hot] && <circle className="eb-tree-hot" cx={fanTips[hot].x} cy={fanTips[hot].y} r={9} />}
      </svg>
      {fanTips.map((p, i) => {
        if (!stickered.has(i)) return null
        const r = tips[i]
        const [x, y] = [fb.cx + (fb.R + FAN_GAP + FAN_STICKER / 2) * Math.cos(p.a), fb.cy - (fb.R + FAN_GAP + FAN_STICKER / 2) * Math.sin(p.a)]
        return (
          <span key={`s${i}`} className="eb-tree-fan-st" data-i={i} style={{ left: x - FAN_STICKER / 2, top: y - FAN_STICKER / 2 }}>
            <Thumb row={r.kind === 'species' ? r.row : r.sticker} size={FAN_STICKER} off={r.kind === 'species' && !r.on} />
          </span>
        )
      })}
      {fanTips.map((p, i) => {
        if (!named.has(i) && hot !== i) return null
        const r = tips[i]
        const l = fanLabel(fb, p.a, FAN_GAP * 2 + FAN_STICKER)
        const [name, latin] = tipName(r)
        return (
          <span
            key={`n${i}`} className="eb-tree-fan-name" data-i={i} data-flip={l.flip || undefined} data-on={tipCount(r) > 0 || undefined} data-hot={hot === i || undefined}
            style={{ left: l.flip ? l.x - FAN_LABEL : l.x, top: l.y - NAME_H / 2, width: FAN_LABEL, transform: `rotate(${l.rot.toFixed(2)}deg)` }}
          >
            <span className="eb-tree-fan-text" lang={latin ? 'la' : undefined}>{name}</span>
            {r.kind === 'group' && <span className="eb-mono eb-tree-fan-count">{fmt(tt.tipOf, { n: count(r.on), total: count(r.total) })}</span>}
          </span>
        )
      })}
      {ticks.map((v) => {
        const rr = (1 - v / drawing.rootAge) * fb.R
        return [fb.cx + rr, ...(rr > 12 ? [fb.cx - rr] : [])].map((x) => (
          <span key={`${v}:${x}`} className="eb-mono eb-tree-fan-tick" style={{ left: x, top: fb.cy + 10 }}>{formatAge(v, t.num)}</span>
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

  return (
    <div ref={boxRef} className="eb-tree" data-fan={fan || undefined} style={width ? { ['--tree-w' as string]: `${treeW}px` } : undefined}>
      {oldest && (
        <p className="eb-tree-fact">
          {fmt(tt.oldest, { name: displayName(species.byCode.get(oldest.code)!), age: formatAge(oldest.age, t.num) })}
        </p>
      )}
      <div className="eb-tree-levels">
        <div className="eb-seg eb-tree-ranks" role="group" aria-label={tt.rankGroup}>
          {RANKS.filter((k) => offered.includes(k)).map((k) => {
            const tooMany = (view.counts[k] ?? 0) > MAX_TIPS
            const why = `eb-tree-why-${k}`
            return (
              <span key={k} className="eb-tree-rank">
                <button
                  type="button" className="eb-seg-btn" aria-pressed={rank === k} aria-disabled={tooMany || undefined} aria-describedby={tooMany ? why : undefined}
                  onClick={(e) => (tooMany ? e.currentTarget.focus() : choose(k))}
                >
                  <span className="eb-seg-label">{tt.rank[k]}</span>
                </button>
                {tooMany && k !== 'orders' && <span id={why} role="tooltip" className="eb-tree-why">{tt.tooMany[k]}</span>}
              </span>
            )
          })}
        </div>
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
      </div>
      {view.split && here && <p className="eb-tree-note">{fmt(tt.split, { name: here })}</p>}
      {insideNote && <p className="eb-tree-note">{insideNote}</p>}
      {!view.rows.length ? <p className="eb-tree-note">{tt.mineNone}</p> : fan ? (
        <div className="eb-tree-chart">
          {fanFigure}
          <p className="eb-mono eb-tree-axis-title eb-tree-fan-axis" aria-hidden="true">{tt.axis}</p>
          <ol className="eb-tree-rows" aria-label={tt.tips}>{rowItems}</ol>
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
          <div className="eb-tree-body" style={{ height: view.height }}>
            <svg className="eb-tree-svg" viewBox={`0 0 ${width ? treeW : 1000} ${view.height}`} preserveAspectRatio={width ? undefined : 'none'} aria-hidden="true" focusable="false">
              <path className="eb-tree-off" d={drawing.unseen} />
              <path className="eb-tree-on" d={drawing.seen} />
              <path className="eb-tree-off eb-tree-dash" d={drawing.unseenDot} />
              <path className="eb-tree-on eb-tree-dash" d={drawing.seenDot} />
              <path className="eb-tree-node eb-tree-off" d={drawing.unseenNodes} />
              <path className="eb-tree-node eb-tree-on" d={drawing.seenNodes} />
            </svg>
            <ol className="eb-tree-rows" aria-label={tt.tips}>{rowItems}</ol>
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
        {rich(fmt(tt.credit, { tree: data.file.tree, taxonomy: data.file.taxonomy, year: data.file.ebirdTaxonomy }), {
          src: (chunk) => <a href={AVES_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
          lic: (chunk) => <a href={CC_BY_URL} target="_blank" rel="noopener noreferrer">{chunk}</a>,
        })}
      </p>
    </div>
  )
}
