'use client'
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import type { ListEntry } from '@/lib/list/model'
import {
  barInChoice, byFamily, choiceAt, choiceCodes, choiceWords, firstChoice, gridCols, groupPayload, joinNames, listColor, listFaint, memberships, partInChoice, ranking,
  regionCounts, showsWho, toggleList, type Choice,
} from '@/lib/share/compare'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import type { CompareShown } from '@/lib/share/compare-store'
import { shareTitle } from '@/lib/share/og'
import { diagramLayout, maskAt, numberSize, regionMasks, unshownCount, type Diagram } from '@/lib/share/venn'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useLoadNames, useNames } from '@/lib/species/use-names'
import type { CompareShare } from '@/components/share/dialog-options'
import { Sticker } from '@/components/collage/Sticker'
import { Chip } from '@/components/filters/Chip'
import { FamilyAccordion } from '@/components/collage/FamilyAccordion'
import './compare.css'

/** Each list's name in the comparison: its title, else "Birder 2" by its place in the comparison. */
function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
  return lists.map((p, i) => shareTitle(p, t) ?? fmt(t.compare.birder, { n: i + 1 }))
}

const entriesOf = (p: SharePayload): ListEntry[] =>
  p.birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { date: ymToDate(b.ym, b.yearOnly) } : {}), heard: false, dead: false, media: false, sources: ['ebird'] }))
const sizeOf = (p: SharePayload) => new Set(p.birds.map((b) => b.code)).size
const NO_LIST: ListEntry[] = []
/** Birds in taxonomic order (those the species file knows). */
const byTaxon = (codes: readonly string[], species: SpeciesIndex) =>
  codes.filter((c) => species.byCode.has(c)).sort((a, b) => species.byCode.get(a)!.to - species.byCode.get(b)!.to)

/**
 * A comparison's state: what is shown (`choice`: Yet to see, Every bird, or the birds on exactly the people chosen) and
 * `draw`, the Share dialog's two pictures (the comparison card and the wish list). `lists`: two or more (fewer: nothing
 * to show). `you`: the first list is the viewer's own (it opens on Yet to see and offers the wish list). Each list's
 * name is its title (listLabels). `keep`: the choice held by the caller (Compare keeps it on the device), else here.
 * Reads and writes nothing of the saved list.
 */
export function useComparison(
  lists: readonly SharePayload[],
  { you = false, keep }: { you?: boolean; keep?: { pick: CompareShown | undefined; set: (p: CompareShown) => void } } = {},
) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex } | null>(null)
  const [failed, setFailed] = useState(false)
  // The choice belongs to these lists (by their names and sizes): other lists (Edit lists) open on the first choice again.
  const [own, setOwn] = useState<CompareShown | undefined>()
  const [pick, setPick] = keep ? [keep.pick, keep.set] : [own, setOwn]
  useEffect(() => {
    let live = true
    loadSpecies().then((species) => { if (live) setData({ species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  useLoadNames(NO_LIST)
  useNames()

  const ready = lists.length >= 2
  const labels = listLabels(lists, t)
  const sizes = useMemo(() => lists.map(sizeOf), [lists])
  const counts = useMemo(() => regionCounts(lists), [lists])
  const member = useMemo(() => memberships(lists), [lists])
  const drawKey = `${labels.join('\n')}\n${sizes.join(',')}`
  const choice: Choice = pick?.key === drawKey ? pick.choice : firstChoice(you)
  const choose = (c: Choice) => setPick({ key: drawKey, choice: c })
  const shown = useMemo(() => choiceCodes(lists, choice), [lists, choice])
  const need = useMemo(() => (you ? choiceCodes(lists, 'need') : null), [lists, you])
  const every = useMemo(() => choiceCodes(lists, 'every').length, [lists])
  const n = lists.length
  const two = n === 2
  const full = (1 << n) - 1
  /** What a choice is called (the grid's heading): "Only Kalvin", "Kalvin & Kalin", "On every list", "Yet to see". */
  const choiceLabel = (ch: Choice) => {
    const w = choiceWords(ch, n, you)
    return w.kind === 'need' ? t.compare.yetToSee
      : w.kind === 'every' ? t.compare.every
        : w.kind === 'all' ? (two ? t.compare.both : t.compare.everyone)
          : w.kind === 'you' ? t.compare.onlyYou
            : w.kind === 'one' ? fmt(t.compare.only, { name: labels[w.lists[0]] })
              : joinNames(w.lists.map((i) => labels[i]))
  }
  const wishTitle = (k: number) =>
    two ? plural(t.compare.wish, k, { n: formatInt(k, t.num), name: labels[1] }) : plural(t.compare.wishAll, k, { n: formatInt(k, t.num) })

  /** A region of the diagram in words, its number after it: "Only Ada: 12.", "Only Ada and Sam: 3.", "Both: 15." */
  const regionLabel = (m: number) => {
    const on = labels.filter((_, i) => m & (1 << i))
    const label = m === full ? (two ? t.compare.both : t.compare.everyone)
      : on.length === 1 ? fmt(t.compare.only, { name: on[0] })
        : on.length === 2 ? fmt(t.compare.onlyTwo, { a: on[0], b: on[1] }) : fmt(t.compare.only, { name: joinNames(on) })
    return fmt(t.compare.altPart, { label, n: formatInt(counts[m] ?? 0, t.num) })
  }
  /** The birds on combinations the circles have no region for (from four lists), and the line saying so. */
  const unshown = useMemo(() => (ready ? unshownCount(counts) : 0), [ready, counts])
  const unshownLine = unshown ? plural(t.compare.cantShow, unshown, { n: formatInt(unshown, t.num) }) : ''
  // Every number in the diagram, in words, then that line: the card's text alternative.
  const alt = [...regionMasks(n).map(regionLabel), ...(unshownLine ? [unshownLine] : [])].join(' ')

  const codes = data ? byTaxon(shown, data.species) : []
  /** The chosen birds by family, taxonomic, the birds most lists have first inside each (byFamily). */
  const families = useMemo(
    () => (data ? byFamily(codes, (c) => data.species.byCode.get(c)!.fam, (c) => member.get(c) ?? 0) : []),
    // codes is shown's and data's
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, data, member],
  )
  /** The lists that have `code`, in their order. */
  const listsOf = (code: string) => { const m = member.get(code) ?? 0; return labels.map((_, i) => i).filter((i) => m & (1 << i)) }
  // The wish list: the birds on the others' lists the viewer has yet to see.
  const canWish = ready && you && !!need?.length
  /** Why the wish list can't be made, once a comparison shows ('' when it can). */
  const wishReason = !ready || canWish ? '' : you ? t.compare.wishNone : t.compare.wishNeedsYours
  /** The Share dialog's pictures, in its format and colours: the card (the diagram) or the wish list (its birds). */
  const draw: CompareShare['draw'] = async (what, { format, theme, transparent }) => {
    if (!data) throw new Error('The species are not loaded yet')
    if (what === 'wish') {
      if (!need) throw new Error('No wish list without a list of your own')
      const { renderShareImage } = await import('@/lib/share/image')
      return renderShareImage({
        format, entries: entriesOf(groupPayload(lists, need)), species: data.species, theme, transparent, latest: false, countSize: 'hide',
        name: wishTitle(need.length), strings: t, nameOf: displayName,
      })
    }
    const { drawCompareCard } = await import('@/lib/share/compare-image')
    const card = await drawCompareCard({ names: [...labels], sizes, counts, species: data.species, theme, format, transparent, t })
    return card.blob
  }

  return {
    ready, data, failed, labels, sizes, counts, you, choice, choose, choiceLabel, regionLabel, shown, needCount: need?.length ?? 0, every,
    unshown, unshownLine, alt, codes, families, listsOf, canWish, wishReason, draw,
    /** What the drawings show, for the dialog: it draws again when this changes. */
    drawKey,
    wishAlt: need ? wishTitle(need.length) : '',
  }
}
export type Comparison = ReturnType<typeof useComparison>

/** A list's colour dot (the set-up's rows, the chips, the bars): the list's colour in the diagram. */
export function ListDot({ i }: { i: number }) {
  return <span className="eb-compare-dot" style={{ background: listColor(i) }} data-faint={listFaint(i) ? '' : undefined} aria-hidden="true" />
}

/**
 * The comparison under the page head: one row of chips (each person, any combination: the birds on exactly those
 * lists; then Yet to see, with your own list, and Every bird), then, side by side from 640px, the circles (or the
 * flower) and the bars, both marking the choice; pressing a region of the circles chooses its people, outside them
 * every bird; a bar chooses that person alone. Under them the choice named with its count ("Kalvin & Kalin · 144")
 * over its birds by family (FamilyAccordion, one family open at a time, the first on arrival and on a new choice), each
 * family a sticker grid; on Yet to see and Every bird each tile has a dot per list that has it. `sci`: families by
 * their Latin names (the page's Scientific switch).
 */
export function CompareResult({ c, sci = false }: { c: Comparison; sci?: boolean }) {
  const { t } = useI18n()
  const shownId = useId()
  if (c.failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  const people = typeof c.choice === 'number' ? c.choice : 0
  return (
    <div className="eb-compare-result">
      <div className="eb-level eb-compare-chips" role="group" aria-label={t.compare.groups} data-testid="compare-chips">
        {c.labels.map((name, i) => (
          <Chip
            key={i} label={<><ListDot i={i} /><span className="eb-compare-chip-name">{name}</span></>} count={c.sizes[i]}
            selected={!!(people & (1 << i))} onClick={() => c.choose(toggleList(c.choice, i))} testId={`compare-chip-${i}`}
          />
        ))}
        {c.you && <Chip label={t.compare.yetToSee} count={c.needCount} selected={c.choice === 'need'} onClick={() => c.choose('need')} testId="compare-chip-need" />}
        <Chip label={t.compare.every} count={c.every} selected={c.choice === 'every'} onClick={() => c.choose('every')} testId="compare-chip-every" />
      </div>
      <div className="eb-compare-cols">
        <Circles c={c} />
        <Bars c={c} />
      </div>
      <section className="eb-compare-shown" aria-labelledby={shownId}>
        <h2 id={shownId} className="eb-h2" data-testid="compare-shown">
          {c.choiceLabel(c.choice)}
          <span className="eb-compare-shown-n"> · {formatInt(c.shown.length, t.num)}</span>
        </h2>
        {!c.data ? (
          <div className="eb-compare-birds-wait" aria-hidden="true" />
        ) : c.families.length ? (
          <FamilyAccordion
            families={c.families.map((f) => ({ key: f.fam, row: c.data!.species.byCode.get(f.codes[0])!, n: f.codes.length }))}
            sci={sci} reset={`${c.drawKey}|${c.choice}`}
          >
            {(fam) => <Grid codes={c.families.find((f) => f.fam === fam)!.codes} species={c.data!.species} who={showsWho(c.choice) ? c : undefined} />}
          </FamilyAccordion>
        ) : (
          // Yet to see with nothing in it is the milestone (every friend's bird is on your list), not an empty group.
          <p className="eb-note" data-testid="compare-empty">{c.choice === 'need' ? t.compare.wishNone : t.compare.empty}</p>
        )}
      </section>
    </div>
  )
}

/** A comparison with nothing to edit or share (a comparison link's page). */
export function CompareView({ lists }: { lists: readonly SharePayload[] }) {
  return <CompareResult c={useComparison(lists)} />
}

/** The drawing at its largest (CSS px; under that, its column's width) and its shape. SVG units are CSS px, so the
 *  names, numbers and the tooltip are their true size at every width. */
const MAX_W = 443, SHAPE = 260 / 320, PAD = 4
/** The circles' names (14px, a line 18px tall), 6px past the edge, each at most NAME_CAP of the drawing's width. */
const NAME = { h: 18, gap: 6 }, NAME_CAP = 0.24
/** A number's size (px), most and least: a region too small for its number at NUM[1] shows it in the tooltip. */
const NUM = [24, 11] as const

/** The drawing's parts, one per region (diagramLayout's spots): inside its circles (`clip`), outside the others (`out`). */
function partsOf(d: Diagram): { mask: number; clip: number[]; out: number[] }[] {
  const all = d.circles.map((_, i) => i)
  return d.spots.map(({ mask }) => ({ mask, clip: all.filter((i) => mask & (1 << i)), out: all.filter((i) => !(mask & (1 << i))) }))
}

/**
 * The circles: two or three sized by their lists, or from four a ring of equal circles (venn.ts), each a light wash of
 * its list's colour (overlaps build up darker) with a 1.5px outline in it and its name outside its edge, each region's
 * number in it, Ink (a 0 and the regions outside the choice in Muted). The choice's parts stay at full strength; every
 * other part takes a Paper veil, eased (Every bird: none). A press anywhere chooses the region under it (choiceAt: its
 * people; outside the circles, every bird). For the keyboard each region is a button at its number, named by its region
 * and number ("Only Ada: 12."), pressed while it is the choice. A region too small for its number at this width shows
 * none; its number shows in the site's tooltip on hover and focus. Under the drawing, when the ring has no region for
 * some birds' combination, one quiet line says how many and how to see them.
 */
function Circles({ c }: { c: Comparison }) {
  const { t } = useI18n()
  const wrap = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(MAX_W)
  useEffect(() => {
    const el = wrap.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => { if (e.contentRect.width > 0) setW(Math.min(MAX_W, Math.round(e.contentRect.width))) })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const H = Math.round(W * SHAPE)
  // Each name's own width, read from the page once it is drawn (until then, and where nothing is drawn, the cap).
  const nameEls = useRef<(HTMLSpanElement | null)[]>([])
  const [natural, setNatural] = useState<readonly number[]>([])
  const names = c.labels.join('\n')
  useLayoutEffect(() => {
    let live = true
    const read = () => {
      if (!live) return
      const w = c.labels.map((_, i) => Math.ceil(nameEls.current[i]?.getBoundingClientRect().width ?? 0))
      setNatural((p) => (p.length === w.length && p.every((v, i) => v === w[i]) ? p : w))
    }
    read()
    document.fonts?.ready.then(read, () => {})
    return () => { live = false }
    // names is the labels'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [names])
  const cap = Math.round(W * NAME_CAP)
  const nameW = c.labels.map((_, i) => Math.min(cap, natural[i] || cap)).join(',')
  const d: Diagram = useMemo(
    () => diagramLayout(c.counts, { x: PAD, y: PAD, w: W - 2 * PAD, h: H - 2 * PAD }, { w: nameW.split(',').map(Number), h: NAME.h, gap: NAME.gap }),
    [c.counts, W, H, nameW],
  )
  const parts = useMemo(() => partsOf(d), [d])
  const nums = useMemo(
    () => d.spots.map((s) => { const text = formatInt(c.counts[s.mask] ?? 0, t.num); return { s, text, px: numberSize(d, s, text.length, NUM[0], NUM[1]) } }),
    [d, c.counts, t.num],
  )
  const hidden = (mask: number) => nums.some((m) => m.s.mask === mask && !m.px)
  const [tip, setTip] = useState<number | null>(null)
  const tipAt = tip == null ? undefined : nums.find((m) => m.s.mask === tip)
  const uid = useId().replace(/[^\w-]/g, '')
  const on = (mask: number) => partInChoice(c.choice, mask)
  const at = (e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const box = e.currentTarget.getBoundingClientRect()
    return box.width && box.height ? maskAt(d, ((e.clientX - box.left) * W) / box.width, ((e.clientY - box.top) * H) / box.height) : -1
  }
  const pick = (e: MouseEvent<SVGSVGElement>) => { const m = at(e); if (m >= 0) c.choose(choiceAt(m)) }
  const hover = (e: PointerEvent<SVGSVGElement>) => {
    if (e.pointerType !== 'mouse') return
    const m = at(e)
    setTip(m > 0 && hidden(m) ? m : null)
  }
  const key = (mask: number) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    c.choose(mask)
  }
  return (
    <div className="eb-compare-venn-col">
      <div className="eb-compare-venn-wrap" ref={wrap}>
        <svg
          className="eb-compare-venn" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={t.compare.diagram} onClick={pick}
          onPointerMove={hover} onPointerLeave={() => setTip(null)} data-testid="compare-diagram"
        >
          <defs>
            {d.circles.map((k, i) => <clipPath key={i} id={`${uid}-c${i}`}><circle cx={k.cx} cy={k.cy} r={k.r} /></clipPath>)}
            {parts.filter((p) => p.out.length).map((p) => (
              <mask key={p.mask} id={`${uid}-o${p.mask}`} maskUnits="userSpaceOnUse" x={0} y={0} width={W} height={H}>
                <rect width={W} height={H} fill="#fff" />
                {p.out.map((i) => <circle key={i} cx={d.circles[i].cx} cy={d.circles[i].cy} r={d.circles[i].r} fill="#000" />)}
              </mask>
            ))}
          </defs>
          {d.circles.map((k, i) => (
            <circle key={i} cx={k.cx} cy={k.cy} r={k.r} style={{ '--c': listColor(i) } as CSSProperties} className="eb-compare-circle" />
          ))}
          {parts.map((p) => (
            <g key={p.mask} mask={p.out.length ? `url(#${uid}-o${p.mask})` : undefined}>
              {p.clip.reduceRight<ReactNode>(
                (inner, k) => <g clipPath={`url(#${uid}-c${k})`}>{inner}</g>,
                <rect width={W} height={H} className="eb-compare-veil" data-off={on(p.mask) ? undefined : ''} data-testid={`compare-part-${p.mask}`} />,
              )}
            </g>
          ))}
          {nums.map(({ s, text, px }) => {
            // The focus ring: round the number, or a small round mark where there is none.
            const b = px ? { w: 0.6 * px * text.length + 12, h: px + 10 } : { w: 14, h: 14 }
            const quiet = !on(s.mask) || !c.counts[s.mask]
            return (
              <g
                key={s.mask} className="eb-compare-region" role="button" tabIndex={0} aria-label={c.regionLabel(s.mask)} aria-pressed={c.choice === s.mask}
                onKeyDown={key(s.mask)} onFocus={() => setTip(px ? null : s.mask)} onBlur={() => setTip(null)} data-testid={`compare-region-${s.mask}`}
                data-hidden={px ? undefined : ''}
              >
                <rect className="eb-compare-ring" x={s.x - b.w / 2} y={s.y - b.h / 2} width={b.w} height={b.h} rx={b.h / 2} />
                {px > 0 && <text x={s.x} y={s.y} fontSize={px} className="eb-compare-num" data-quiet={quiet ? '' : undefined}>{text}</text>}
              </g>
            )
          })}
        </svg>
        {d.names?.map((b, i) => (
          <span key={i} className="eb-compare-label" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} aria-hidden="true">
            <span ref={(el) => { nameEls.current[i] = el }}>{c.labels[i]}</span>
          </span>
        ))}
        {tipAt && (
          <div className="eb-card eb-tip eb-compare-tip" style={{ left: tipAt.s.x, top: tipAt.s.y - 10 }} aria-hidden="true" data-testid="compare-tip">
            {c.regionLabel(tipAt.s.mask)}
          </div>
        )}
      </div>
      {c.unshown > 0 && (
        <p className="eb-note eb-compare-unshown" data-testid="compare-unshown">{c.unshownLine} {t.compare.cantShowPick}</p>
      )}
    </div>
  )
}

/** One bar per list, most species first: its name, its count and a bar to scale in its colour, faded when the choice
 *  has none of that list's birds (barInChoice), as the regions are. A bar chooses that person alone. */
function Bars({ c }: { c: Comparison }) {
  const { t } = useI18n()
  const max = Math.max(1, ...c.sizes)
  return (
    <ul className="eb-compare-bars" aria-label={t.compare.people} data-testid="compare-bars">
      {ranking(c.sizes).map((i) => {
        const off = !barInChoice(c.choice, i)
        return (
          <li key={i}>
            <button type="button" className="eb-compare-pick" aria-pressed={c.choice === 1 << i} data-off={off ? '' : undefined} onClick={() => c.choose(1 << i)} data-testid={`compare-rank-${i}`}>
              <span className="eb-compare-name">{c.labels[i]}</span>
              <span className="eb-compare-count">{formatInt(c.sizes[i], t.num)}</span>
              <span className="eb-compare-bar" style={{ inlineSize: `${(100 * c.sizes[i]) / max}%`, background: listColor(i) }} aria-hidden="true" />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A family's chosen birds as a grid of stickers, every one in the same box, contained and standing on its bottom, the
 * name under each: three to GRID_MAX across by the grid's width (gridCols), all of them. With `who`, under the name one
 * 8px dot per list that has the bird, in the lists' colours and order, named "On Sam & Ada's lists".
 */
function Grid({ codes, species, who }: { codes: readonly string[]; species: SpeciesIndex; who?: Pick<Comparison, 'labels' | 'listsOf'> }) {
  const { t } = useI18n()
  const [cols, setCols] = useState(4)
  const ref = useRef<HTMLUListElement>(null)
  // Measured before the first paint (an opened family never shows a frame at 4 columns), then followed.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setCols(gridCols(el.clientWidth))
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCols(gridCols(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <ul className="eb-compare-grid" style={{ '--cols': cols } as CSSProperties} ref={ref} data-testid="compare-birds">
        {codes.map((code) => {
          const row = species.byCode.get(code)!
          const on = who?.listsOf(code)
          return (
            <li key={code} className="eb-compare-tile">
              <span className="eb-compare-tile-pic" aria-hidden="true">
                <Sticker code={row.code} st={row.st} ar={row.st && row.ar > 0 ? row.ar : 1} sv={row.sv} w={TILE_PIC[0]} h={TILE_PIC[1]} />
              </span>
              <span className="eb-compare-tile-name">{displayName(row)}</span>
              {on && (
                <span className="eb-compare-who" role="img" aria-label={fmt(t.compare.seenBy, { names: joinNames(on.map((i) => who!.labels[i])) })} data-testid="compare-who">
                  {on.map((i) => <span key={i} className="eb-compare-who-dot" style={{ background: listColor(i) }} data-faint={listFaint(i) ? '' : undefined} />)}
                </span>
              )}
            </li>
          )
        })}
    </ul>
  )
}
/** Every tile's sticker box at its largest (CSS px; compare.css .eb-compare-tile-pic): the size the files are asked for. */
const TILE_PIC = [104, 78] as const
