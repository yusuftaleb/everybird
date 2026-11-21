'use client'
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import type { ListEntry } from '@/lib/list/model'
import {
  barInChoice, byFamily, choiceAt, choiceCodes, choiceWords, firstChoice, gridCols, groupPayload, joinNames, listColor, memberships, partInChoice, ranking,
  regionCounts, showsWho, toggleList, type Choice,
} from '@/lib/share/compare'
import { ymToDate } from '@/lib/share/convert'
import type { SharePayload } from '@/lib/share/link'
import type { CompareShown } from '@/lib/share/compare-store'
import { shareTitle } from '@/lib/share/og'
import { diagramLayout, maskAt, type Diagram } from '@/lib/share/venn'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useLoadNames, useNames } from '@/lib/species/use-names'
import type { CompareShare } from '@/components/share/dialog-options'
import { Sticker } from '@/components/collage/Sticker'
import { Chip } from '@/components/filters/Chip'
import { FamilyAccordion } from '@/components/collage/FamilyAccordion'
import './compare.css'

/** Each list's name in the comparison: its title, else "Birder 2" by its place in the comparison. */
export function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
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
    const label = m === full ? (two ? t.compare.both : t.compare.everyone) : on.length === 1 ? fmt(t.compare.only, { name: on[0] }) : fmt(t.compare.onlyTwo, { a: on[0], b: on[1] })
    return fmt(t.compare.altPart, { label, n: formatInt(counts[m] ?? 0, t.num) })
  }
  // Every number in the diagram, in words: the card's text alternative.
  const masks = n === 2 ? [1, 3, 2] : n === 3 ? [1, 2, 4, 3, 5, 6, 7] : [full, ...lists.map((_, i) => 1 << i)]
  const alt = masks.map(regionLabel).join(' ')

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
    alt, codes, families, listsOf, canWish, wishReason, draw,
    /** What the drawings show, for the dialog: it draws again when this changes. */
    drawKey,
    wishAlt: need ? wishTitle(need.length) : '',
  }
}
export type Comparison = ReturnType<typeof useComparison>

/** A list's colour dot (the set-up's rows, the chips, the bars): the list's colour in the diagram. */
export function ListDot({ i }: { i: number }) {
  return <span className="eb-compare-dot" style={{ background: listColor(i) }} aria-hidden="true" />
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
          <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
        )}
      </section>
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

/** A part of the drawing: inside every circle `clip` names (the flower's centre is 'core'), outside every one `out` names. */
type Part = { mask: number; clip: (number | 'core')[]; out: (number | 'core')[] }
/** The drawing's parts, one per numbered region: every combination of two or three circles; the flower's petals (each
 *  petal outside the centre) and its centre. */
function partsOf(d: Diagram): Part[] {
  const n = d.circles.length, all = d.circles.map((_, i) => i)
  if (d.core) return [...all.map((i) => ({ mask: 1 << i, clip: [i], out: ['core' as const] })), { mask: (1 << n) - 1, clip: ['core'], out: [] }]
  return Array.from({ length: (1 << n) - 1 }, (_, k) => {
    const mask = k + 1
    return { mask, clip: all.filter((i) => mask & (1 << i)), out: all.filter((i) => !(mask & (1 << i))) }
  })
}

/**
 * The circles (two or three lists) or the flower (four to six): each circle a wash of its list's colour with an
 * outline in it, each region's number in it. The choice's parts stay at full strength; every other part takes a Paper
 * veil (the same fills, fainter) and its number fades, eased (Every bird: none faded). A press anywhere chooses the
 * region under it (choiceAt: its people; outside the circles, every bird). For the keyboard each region's number is a
 * button, named by its region and number ("Only Ada: 12."), pressed while its region is the choice.
 */
function Circles({ c }: { c: Comparison }) {
  const { t } = useI18n()
  const d: Diagram = useMemo(() => diagramLayout(c.counts, { x: PAD, y: PAD, w: VB[0] - 2 * PAD, h: VB[1] - 2 * PAD }), [c.counts])
  const parts = useMemo(() => partsOf(d), [d])
  const uid = useId().replace(/[^\w-]/g, '')
  const ref = (k: number | 'core') => `url(#${uid}-c${k})`
  const on = (mask: number) => partInChoice(c.choice, mask)
  const pick = (e: MouseEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect()
    if (!box.width || !box.height) return
    c.choose(choiceAt(maskAt(d, ((e.clientX - box.left) * VB[0]) / box.width, ((e.clientY - box.top) * VB[1]) / box.height)))
  }
  const key = (mask: number) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    c.choose(mask)
  }
  return (
    <svg className="eb-compare-venn" viewBox={`0 0 ${VB[0]} ${VB[1]}`} role="group" aria-label={t.compare.diagram} onClick={pick} data-testid="compare-diagram">
      <defs>
        {[...d.circles.map((k, i) => [i, k] as const), ...(d.core ? [['core', d.core] as const] : [])].map(([i, k]) => (
          <clipPath key={i} id={`${uid}-c${i}`}><circle cx={k.cx} cy={k.cy} r={k.r} /></clipPath>
        ))}
        {parts.filter((p) => p.out.length).map((p) => (
          <mask key={p.mask} id={`${uid}-o${p.mask}`} maskUnits="userSpaceOnUse" x={0} y={0} width={VB[0]} height={VB[1]}>
            <rect width={VB[0]} height={VB[1]} fill="#fff" />
            {p.out.map((i) => {
              const k = i === 'core' ? d.core! : d.circles[i]
              return <circle key={i} cx={k.cx} cy={k.cy} r={k.r} fill="#000" />
            })}
          </mask>
        ))}
      </defs>
      {d.circles.map((k, i) => (
        <circle key={i} cx={k.cx} cy={k.cy} r={k.r} style={{ '--c': listColor(i) } as CSSProperties} className="eb-compare-circle" />
      ))}
      {d.core && <circle cx={d.core.cx} cy={d.core.cy} r={d.core.r} className="eb-compare-core" />}
      {parts.map((p) => (
        <g key={p.mask} mask={p.out.length ? `url(#${uid}-o${p.mask})` : undefined}>
          {p.clip.reduceRight<ReactNode>(
            (inner, k) => <g clipPath={ref(k)}>{inner}</g>,
            <rect width={VB[0]} height={VB[1]} className="eb-compare-veil" data-off={on(p.mask) ? undefined : ''} data-testid={`compare-part-${p.mask}`} />,
          )}
        </g>
      ))}
      {d.spots.map((s) => {
        const num = formatInt(c.counts[s.mask] ?? 0, t.num)
        // Mono digits are about .6em wide: as large as the region's room allows, 10 to 20 units.
        const size = Math.max(10, Math.min(20, s.h * 0.5, (s.w * 0.8) / (0.6 * Math.max(1, num.length))))
        const w = 0.6 * size * num.length + 12, h = size + 10
        return (
          <g
            key={s.mask} className="eb-compare-region" role="button" tabIndex={0} aria-label={c.regionLabel(s.mask)} aria-pressed={c.choice === s.mask}
            onKeyDown={key(s.mask)} data-testid={`compare-region-${s.mask}`}
          >
            <rect className="eb-compare-ring" x={s.x - w / 2} y={s.y - h / 2} width={w} height={h} rx={h / 2} />
            <text x={s.x} y={s.y} fontSize={size} className="eb-compare-num" data-off={on(s.mask) ? undefined : ''}>{num}</text>
          </g>
        )
      })}
    </svg>
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
 * 8px dot per list that has the bird, in the lists' colours and order, named "Seen by Sam & Ada".
 */
function Grid({ codes, species, who }: { codes: readonly string[]; species: SpeciesIndex; who?: Pick<Comparison, 'labels' | 'listsOf'> }) {
  const { t } = useI18n()
  const [cols, setCols] = useState(4)
  const ref = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
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
                  {on.map((i) => <span key={i} className="eb-compare-who-dot" style={{ background: listColor(i) }} />)}
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
