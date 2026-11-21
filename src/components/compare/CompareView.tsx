'use client'
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import type { ListEntry } from '@/lib/list/model'
import { compareGroups, gridCols, GRID_ROWS, groupOfMask, groupPayload, listColor, ranking, regionCounts, type CompareGroup, type GroupId } from '@/lib/share/compare'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import { shareTitle } from '@/lib/share/og'
import { diagramLayout, maskAt, type Diagram } from '@/lib/share/venn'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useLoadNames, useNames } from '@/lib/species/use-names'
import type { CompareShare } from '@/components/share/dialog-options'
import { Sticker } from '@/components/collage/Sticker'
import '@/components/share/share.css' // .eb-seg, the share dialog's segmented control (Circles | Bars)
import './compare.css'

/** Each list's name in the comparison: its title, else "Birder 2" by its place in the comparison. */
export function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
  return lists.map((p, i) => shareTitle(p, t) ?? fmt(t.compare.birder, { n: i + 1 }))
}

const entriesOf = (p: SharePayload): ListEntry[] =>
  p.birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { date: ymToDate(b.ym, b.yearOnly) } : {}), heard: false, dead: false, media: false, sources: ['ebird'] }))
const sizeOf = (p: SharePayload) => new Set(p.birds.map((b) => b.code)).size
const NO_LIST: ListEntry[] = []
/** A group's birds in taxonomic order (those the species file knows). */
const byTaxon = (codes: readonly string[], species: SpeciesIndex) =>
  codes.filter((c) => species.byCode.has(c)).sort((a, b) => species.byCode.get(a)!.to - species.byCode.get(b)!.to)

/**
 * A comparison's state: the groups, the chosen one, and `draw`, the Share dialog's two pictures (the comparison card
 * and the wish list). `lists`: two or more (fewer: nothing to show). `you`: the first list is the viewer's own (it opens
 * on "Yet to see" and offers the wish list). Each list's name is its title (listLabels). Reads and writes nothing of
 * the saved list.
 */
export function useComparison(lists: readonly SharePayload[], { you = false }: { you?: boolean } = {}) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex } | null>(null)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState<GroupId | null>(null)
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
  const groups = useMemo(() => compareGroups(lists, you), [lists, you])
  const counts = useMemo(() => regionCounts(lists), [lists])
  const group = groups.find((g) => g.id === chosen) ?? groups.find((g) => g.id === (you ? 'need' : 'all'))!
  const need = groups.find((g) => g.id === 'need')
  const two = lists.length === 2
  /** A group's words: on the page "Only you" for the viewer's own; on the card (which travels) always a name. */
  const groupLabel = (g: CompareGroup, onCard = false) =>
    g.id === 'need' ? t.compare.yetToSee
      : g.id === 'all' ? (two ? t.compare.both : t.compare.everyone)
        : g.id === 'every' ? t.compare.every
          : you && g.id === 0 && !onCard ? t.compare.onlyYou : fmt(t.compare.only, { name: labels[g.id] })
  const wishTitle = (n: number) =>
    two ? plural(t.compare.wish, n, { n: formatInt(n, t.num), name: labels[1] }) : plural(t.compare.wishAll, n, { n: formatInt(n, t.num) })
  const caption = group.id === 'need' ? wishTitle(group.codes.length) : fmt(t.compare.cardCount, { label: groupLabel(group, true), n: formatInt(group.codes.length, t.num) })

  // Every number in the diagram, in words: the diagram's and the card's text alternative.
  const n = lists.length
  const full = (1 << n) - 1
  const masks = n === 2 ? [1, 3, 2] : n === 3 ? [1, 2, 4, 3, 5, 6, 7] : [full, ...lists.map((_, i) => 1 << i)]
  const alt = masks.map((m) => {
    const on = labels.filter((_, i) => m & (1 << i))
    const label = m === full ? (two ? t.compare.both : t.compare.everyone) : on.length === 1 ? fmt(t.compare.only, { name: on[0] }) : fmt(t.compare.onlyTwo, { a: on[0], b: on[1] })
    return fmt(t.compare.altPart, { label, n: formatInt(counts[m] ?? 0, t.num) })
  }).join(' ')

  const codes = data ? byTaxon(group.codes, data.species) : []
  // The wish list: the birds on the others' lists the viewer has yet to see.
  const canWish = ready && you && !!need?.codes.length
  /** Why the wish list can't be made, once a comparison shows ('' when it can). */
  const wishReason = !ready || canWish ? '' : you ? t.compare.wishNone : t.compare.wishNeedsYours
  /** The Share dialog's pictures, in its format and colours: the card (the chosen group's caption and strip) or the wish list. */
  const draw: CompareShare['draw'] = async (what, { format, theme, transparent }) => {
    if (!data) throw new Error('The species are not loaded yet')
    if (what === 'wish') {
      if (!need) throw new Error('No wish list without a list of your own')
      const { renderShareImage } = await import('@/lib/share/image')
      return renderShareImage({
        format, entries: entriesOf(groupPayload(lists, need.codes)), species: data.species, theme, transparent, latest: false, countSize: 'hide',
        name: wishTitle(need.codes.length), strings: t, nameOf: displayName,
      })
    }
    const { drawCompareCard } = await import('@/lib/share/compare-image')
    const card = await drawCompareCard({ names: [...labels], sizes, counts, caption, codes, species: data.species, theme, format, transparent, t })
    return card.blob
  }

  return {
    ready, data, failed, labels, sizes, groups, group, groupLabel, choose: setChosen, counts, alt, codes, canWish, wishReason, draw,
    /** What the drawings show, for the dialog: it draws again when this changes. */
    drawKey: `${labels.join('\n')}\n${sizes.join(',')}\n${caption}`,
    wishAlt: need ? wishTitle(need.codes.length) : '',
  }
}
export type Comparison = ReturnType<typeof useComparison>

/** A list's colour dot (the set-up's rows, the pills): the list's colour in the diagram. */
export function ListDot({ i }: { i: number }) {
  return <span className="eb-compare-dot" style={{ background: listColor(i) }} aria-hidden="true" />
}

/**
 * The comparison: on top the lists as pills (colour dot, name, species count), `edit` after them and `share` at the
 * row's right end (the Compare page's Edit lists and Share; a comparison link's page has neither); then, side by side
 * from 640px, the diagram (Circles or Bars, chosen in its head row) and the groups as a list of rows, one chosen;
 * pressing a part of the diagram chooses its group too. Under both, the chosen group's birds as a sticker grid.
 */
export function CompareResult({ c, edit, share }: { c: Comparison; edit?: ReactNode; share?: ReactNode }) {
  const { t } = useI18n()
  const [view, setView] = useState<'circles' | 'bars'>('circles')
  const diagramId = useId()
  if (c.failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  const every = c.groups.find((g) => g.id === 'every')!.codes.length
  return (
    <div className="eb-compare-result">
      {/* One wrapping row: the pills, Edit lists after them, Share at the right end (on a phone the two buttons share the line under the pills). */}
      <div className="eb-compare-top">
        <ul className="eb-compare-pills" aria-label={t.compare.people} data-testid="compare-pills">
          {c.labels.map((name, i) => (
            <li key={i} className="eb-compare-pill" data-testid={`compare-pill-${i}`}>
              <ListDot i={i} />
              <span className="eb-compare-pill-name">{name}</span>
              <span className="eb-compare-pill-count">{formatInt(c.sizes[i], t.num)}</span>
            </li>
          ))}
        </ul>
        {edit}
        {share}
      </div>
      <div className="eb-compare-cols">
        <section className="eb-compare-diagram" aria-labelledby={diagramId}>
          <div className="eb-compare-diagram-head">
            <h2 id={diagramId} className="eb-compare-label" data-testid="compare-summary">
              {plural(t.compare.lists, c.labels.length, { n: formatInt(c.labels.length, t.num) })} · {plural(t.count.live, every, { n: formatInt(every, t.num) })}
            </h2>
            <div className="eb-seg eb-compare-seg" role="group" aria-label={t.compare.diagram} data-testid="compare-view">
              {(['circles', 'bars'] as const).map((v) => (
                <button key={v} type="button" className="eb-seg-btn" aria-pressed={view === v} onClick={() => setView(v)} data-testid={`compare-view-${v}`}>
                  {t.compare[v]}
                </button>
              ))}
            </div>
          </div>
          {view === 'circles' ? <Circles c={c} /> : <Bars c={c} />}
        </section>
        <div className="eb-compare-groups" role="group" aria-label={t.compare.groups} data-testid="compare-groups">
          {c.groups.map((g) => (
            <button
              key={String(g.id)} type="button" className="eb-compare-group" aria-pressed={g === c.group} onClick={() => c.choose(g.id)}
              data-testid={`compare-group-${g.id}`}
            >
              <span className="eb-compare-group-name">{c.groupLabel(g)}</span>
              <span className="eb-compare-group-count">{formatInt(g.codes.length, t.num)}</span>
            </button>
          ))}
        </div>
      </div>
      {!c.data ? (
        <div className="eb-compare-birds-wait" aria-hidden="true" />
      ) : c.codes.length ? (
        <Grid key={String(c.group.id)} codes={c.codes} species={c.data.species} />
      ) : (
        <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
      )}
    </div>
  )
}

/** A comparison with nothing to edit or share (a comparison link's page). */
export function CompareView({ lists }: { lists: readonly SharePayload[] }) {
  return <CompareResult c={useComparison(lists)} />
}

/** The diagram's drawing box (SVG units): its width, its height. */
const VB = [320, 260] as const
const PAD = 4

/**
 * The circles (two or three lists) or the flower (four to six): each circle a wash of its list's colour with an
 * outline in it, each region's number in it. The picture's text is every number in words (`alt`); pressing a list's own
 * part, or the part on every list, chooses that group (the groups list is the keyboard's way to them).
 */
function Circles({ c }: { c: Comparison }) {
  const { t } = useI18n()
  const d: Diagram = useMemo(() => diagramLayout(c.counts, { x: PAD, y: PAD, w: VB[0] - 2 * PAD, h: VB[1] - 2 * PAD }), [c.counts])
  const n = c.labels.length
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    const g = groupOfMask(maskAt(d, ((e.clientX - box.left) * VB[0]) / box.width, ((e.clientY - box.top) * VB[1]) / box.height), n)
    if (g !== null) c.choose(g)
  }
  return (
    // A pointer shortcut beside the groups list, which holds every group for the keyboard.
    <svg className="eb-compare-venn" viewBox={`0 0 ${VB[0]} ${VB[1]}`} role="img" aria-label={c.alt} onClick={pick} data-testid="compare-diagram">
      {d.circles.map((k, i) => (
        <circle key={i} cx={k.cx} cy={k.cy} r={k.r} style={{ '--c': listColor(i) } as CSSProperties} className="eb-compare-circle" />
      ))}
      {d.core && <circle cx={d.core.cx} cy={d.core.cy} r={d.core.r} className="eb-compare-core" />}
      {d.spots.map((s) => {
        const num = formatInt(c.counts[s.mask] ?? 0, t.num)
        // Mono digits are about .6em wide: as large as the region's room allows, 10 to 20 units.
        const size = Math.max(10, Math.min(20, s.h * 0.5, (s.w * 0.8) / (0.6 * Math.max(1, num.length))))
        return <text key={s.mask} x={s.x} y={s.y} fontSize={size} className="eb-compare-num" aria-hidden="true">{num}</text>
      })}
    </svg>
  )
}

/** One bar per list, most species first: its name, its count and a bar to scale in its colour. A bar chooses that list's own birds. */
function Bars({ c }: { c: Comparison }) {
  const { t } = useI18n()
  const max = Math.max(1, ...c.sizes)
  return (
    <ul className="eb-compare-bars" aria-label={t.compare.people} data-testid="compare-bars">
      {ranking(c.sizes).map((i) => (
        <li key={i}>
          <button type="button" className="eb-compare-pick" aria-pressed={c.group.id === i} onClick={() => c.choose(i)} data-testid={`compare-rank-${i}`}>
            <span className="eb-compare-name">{c.labels[i]}</span>
            <span className="eb-compare-count">{formatInt(c.sizes[i], t.num)}</span>
            <span className="eb-compare-bar" style={{ inlineSize: `${(100 * c.sizes[i]) / max}%`, background: listColor(i) }} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}

/**
 * The chosen group's birds as a grid of stickers in equal boxes, the name under each: three to GRID_MAX across by the
 * grid's width (gridCols), the first GRID_ROWS rows, then "Show all N".
 */
function Grid({ codes, species }: { codes: readonly string[]; species: SpeciesIndex }) {
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  const [cols, setCols] = useState(4)
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(([e]) => setCols(gridCols(e.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const first = cols * GRID_ROWS
  return (
    <div className="eb-compare-birds-wrap">
      <ul className="eb-compare-grid" style={{ '--cols': cols } as CSSProperties} ref={ref} data-testid="compare-birds">
        {(all ? codes : codes.slice(0, first)).map((code) => {
          const row = species.byCode.get(code)!
          return (
            <li key={code} className="eb-compare-tile">
              <span className="eb-compare-tile-pic" aria-hidden="true">
                <Sticker code={row.code} st={row.st} ar={row.st && row.ar > 0 ? row.ar : 1} sv={row.sv} w={88} h={64} />
              </span>
              <span className="eb-compare-tile-name">{displayName(row)}</span>
            </li>
          )
        })}
      </ul>
      {!all && codes.length > first && (
        <button type="button" className="eb-textbtn eb-compare-more" onClick={() => setAll(true)} data-testid="compare-more">
          {fmt(t.compare.showAll, { n: formatInt(codes.length, t.num) })}
        </button>
      )}
    </div>
  )
}
