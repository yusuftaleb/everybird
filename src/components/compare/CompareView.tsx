'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { PencilSimple, X } from '@phosphor-icons/react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import { compareGroups, gridCols, GRID_ROWS, groupPayload, ranking, regionCounts, type CompareGroup, type GroupId } from '@/lib/share/compare'
import type { CompareCard } from '@/lib/share/compare-image'
import { ymToDate } from '@/lib/share/convert'
import { NAME_MAX, type SharePayload } from '@/lib/share/link'
import { shareTitle } from '@/lib/share/og'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { displayName } from '@/lib/species/names'
import { useLoadNames, useNames } from '@/lib/species/use-names'
import { currentTheme, subscribeTheme, type Theme } from '@/lib/theme'
import { Chip } from '@/components/filters/Chip'
import { Sticker } from '@/components/collage/Sticker'
import './compare.css'

/** Each list's name in the comparison: its title, else "Birder 2" by its place in the comparison. */
export function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
  return lists.map((p, i) => shareTitle(p, t) ?? fmt(t.compare.birder, { n: i + 1 }))
}

/** Renaming every list and removing the pasted ones (the Compare page's; a shared comparison has neither). */
export type CompareEdit = { rename: (i: number, name: string) => void; canRemove: (i: number) => boolean; remove: (i: number) => void }

const entriesOf = (p: SharePayload): ListEntry[] =>
  p.birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { date: ymToDate(b.ym, b.yearOnly) } : {}), heard: false, dead: false, media: false, sources: ['ebird'] }))
const sizeOf = (p: SharePayload) => new Set(p.birds.map((b) => b.code)).size
const lightOnServer = (): Theme => 'light'
const NO_LIST: ListEntry[] = []
/** A group's birds in taxonomic order (those the species file knows). */
const byTaxon = (codes: readonly string[], species: SpeciesIndex) =>
  codes.filter((c) => species.byCode.has(c)).sort((a, b) => species.byCode.get(a)!.to - species.byCode.get(b)!.to)

/**
 * Share `blob` through the system sheet where the browser takes files (with the full sticker credit as its text), else
 * download it. 'cancelled': the birder closed the sheet.
 */
async function shareOrSave(blob: Blob, file: string, text: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const f = new File([blob], file, { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (typeof nav.share === 'function' && nav.canShare?.({ files: [f] })) {
    try {
      await nav.share({ files: [f], title: 'Everybird', text })
      return 'shared'
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled'
    }
  }
  downloadBlob(blob, file)
  return 'saved'
}

/**
 * A comparison's state and its sharing, for the page head's buttons and the result under it. `lists`: two or more
 * (fewer: nothing is drawn, nothing can be shared). `you`: the first list is the viewer's own (it opens on "Yet to see"
 * and offers the wish list). `labels`: the lists' names here (default listLabels). Reads and writes nothing of the
 * saved list.
 */
export function useComparison(lists: readonly SharePayload[], { you = false, labels: named }: { you?: boolean; labels?: readonly string[] } = {}) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex } | null>(null)
  const [failed, setFailed] = useState(false)
  const [chosen, setChosen] = useState<GroupId | null>(null)
  const [card, setCard] = useState<(CompareCard & { url: string }) | null>(null)
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, lightOnServer)
  useEffect(() => {
    let live = true
    loadSpecies().then((species) => { if (live) setData({ species }) }, () => { if (live) setFailed(true) })
    return () => { live = false }
  }, [])
  useLoadNames(NO_LIST)
  useNames()

  const ready = lists.length >= 2
  const fallback = listLabels(lists, t)
  const labels = named ?? fallback
  const sizes = useMemo(() => lists.map(sizeOf), [lists])
  const groups = useMemo(() => compareGroups(lists, you), [lists, you])
  const counts = useMemo(() => regionCounts(lists), [lists])
  const group = groups.find((g) => g.id === chosen) ?? groups.find((g) => g.id === (you ? 'need' : 'all'))!
  const need = groups.find((g) => g.id === 'need')
  const two = lists.length === 2
  /** A chip's words: on the page "Only you" for the viewer's own; on the card (which travels) always a name. */
  const groupLabel = (g: CompareGroup, onCard = false) =>
    g.id === 'need' ? t.compare.yetToSee
      : g.id === 'all' ? (two ? t.compare.both : t.compare.everyone)
        : g.id === 'every' ? t.compare.every
          : you && g.id === 0 && !onCard ? t.compare.onlyYou : fmt(t.compare.only, { name: labels[g.id] })
  const wishTitle = (n: number) =>
    two ? plural(t.compare.wish, n, { n: formatInt(n, t.num), name: labels[1] }) : plural(t.compare.wishAll, n, { n: formatInt(n, t.num) })
  const caption = group.id === 'need' ? wishTitle(group.codes.length) : fmt(t.compare.cardCount, { label: groupLabel(group, true), n: formatInt(group.codes.length, t.num) })

  // Every number in the diagram, in words: the card's text alternative.
  const n = lists.length
  const full = (1 << n) - 1
  const masks = n === 2 ? [1, 3, 2] : n === 3 ? [1, 2, 4, 3, 5, 6, 7] : [full, ...lists.map((_, i) => 1 << i)]
  const alt = masks.map((m) => {
    const on = labels.filter((_, i) => m & (1 << i))
    const label = m === full ? (two ? t.compare.both : t.compare.everyone) : on.length === 1 ? fmt(t.compare.only, { name: on[0] }) : fmt(t.compare.onlyTwo, { a: on[0], b: on[1] })
    return fmt(t.compare.altPart, { label, n: formatInt(counts[m] ?? 0, t.num) })
  }).join(' ')

  // The card, drawn again whenever what it shows changes (and in the page's theme).
  const codes = useMemo(() => (data ? byTaxon(group.codes, data.species) : []), [data, group])
  const key = `${labels.join('\n')}\n${caption}\n${theme}`
  useEffect(() => {
    if (!data || !ready) return
    let live = true
    import('@/lib/share/compare-image')
      .then((m) => m.drawCompareCard({ names: [...labels], sizes, counts, caption, codes, species: data.species, theme, t }))
      .then((c) => { if (live) setCard({ ...c, url: URL.createObjectURL(c.blob) }) }, () => { if (live) setNote({ text: t.share.imageFailed, error: true }) })
    return () => { live = false }
    // labels, caption and theme are in key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, ready, key, sizes, counts, codes, t])
  const url = card?.url
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const send = async (blob: Blob, file: string) => {
    const { SHARE_CREDIT } = await import('@/lib/share/image')
    const r = await shareOrSave(blob, file, SHARE_CREDIT)
    setNote(r === 'saved' ? { text: fmt(t.share.saved, { file }) } : null)
  }
  const shareCard = () => { if (card) void send(card.blob, 'everybird-compare.png') }
  // The wish list: the birds on the others' lists the viewer has yet to see, as a share image of its own.
  const canWish = ready && you && !!need?.codes.length
  const shareWish = async () => {
    if (!data || !need || busy) return
    setBusy(true)
    try {
      const { renderShareImage } = await import('@/lib/share/image')
      const blob = await renderShareImage({
        format: 'post', entries: entriesOf(groupPayload(lists, need.codes)), species: data.species, theme, latest: false, countSize: 'hide',
        name: wishTitle(need.codes.length), strings: t, nameOf: displayName,
      })
      await send(blob, 'everybird-wish-list.png')
    } catch {
      setNote({ text: t.share.imageFailed, error: true })
    } finally {
      setBusy(false)
    }
  }
  /** Why the wish list can't be made, once a comparison shows ('' when it can). */
  const wishReason = !ready || canWish ? '' : you ? t.compare.wishNone : t.compare.wishNeedsYours

  return {
    // A card of an earlier comparison never stays on screen or in the share.
    ready, data, failed, labels, sizes, groups, group, groupLabel, choose: setChosen, card: ready ? card : null, alt, codes,
    note, busy, shareCard, shareWish, canWish, wishReason,
  }
}
export type Comparison = ReturnType<typeof useComparison>

/**
 * The comparison under the page head: the card on the left with one bar per list under it, and the birds on the right
 * (stacked on phones, the card first): one row of chips, one per group, and the chosen group's birds as a sticker grid.
 * `edit`: renaming every list and removing the pasted ones (the Compare page's).
 */
export function CompareResult({ c, you = false, edit }: { c: Comparison; you?: boolean; edit?: CompareEdit }) {
  const { t } = useI18n()
  if (c.failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  return (
    <div className="eb-compare-result">
      <div className="eb-compare-left">
        <figure className="eb-compare-card" data-testid="compare-card-figure">
          <div className="eb-compare-pic">
            {c.card ? (
              // The live card is a blob URL, never optimised.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={c.card.url} width={c.card.W} height={c.card.H} alt={c.alt} data-testid="compare-card-image" />
            ) : (
              <div className="eb-compare-wait" role="img" aria-label={c.alt} />
            )}
          </div>
        </figure>
        <Bars c={c} you={you} edit={edit} />
      </div>
      <div className="eb-compare-side">
        <div className="eb-compare-groups" role="group" aria-label={t.compare.groups} data-testid="compare-groups">
          {c.groups.map((g) => (
            <Chip key={String(g.id)} label={c.groupLabel(g)} count={g.codes.length} selected={g === c.group} onClick={() => c.choose(g.id)} testId={`compare-group-${g.id}`} />
          ))}
        </div>
        {!c.data ? (
          <div className="eb-compare-birds-wait" aria-hidden="true" />
        ) : c.codes.length ? (
          <Grid key={String(c.group.id)} codes={c.codes} species={c.data.species} />
        ) : (
          <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
        )}
        <p className={c.note?.error ? 'eb-status eb-error' : 'eb-status'} role="status" data-testid="compare-card-status">{c.note?.text ?? ''}</p>
      </div>
    </div>
  )
}

/** A comparison with nothing to edit or share (a comparison link's page). */
export function CompareView({ lists }: { lists: readonly SharePayload[] }) {
  return <CompareResult c={useComparison(lists)} />
}

/**
 * One bar per list, most species first: its name, its count and a bar to scale, the viewer's own marked. Pressing a
 * name chooses that list's own birds. A name has a pencil (it turns into a field in place); a pasted list a remove.
 */
function Bars({ c, you, edit }: { c: Comparison; you: boolean; edit?: CompareEdit }) {
  const { t } = useI18n()
  const { labels, sizes } = c
  const [editing, setEditing] = useState<number | null>(null)
  // The field open now (Escape, Enter and the blur that may follow either close it once) and the pencil to focus once
  // it has closed.
  const open = useRef<number | null>(null)
  const back = useRef<number | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const max = Math.max(1, ...sizes)
  useEffect(() => {
    if (editing !== null || back.current === null) return
    list.current?.querySelector<HTMLElement>(`[data-testid="compare-rename-${back.current}"]`)?.focus()
    back.current = null
  }, [editing])
  const start = (i: number) => { open.current = i; setEditing(i) }
  const done = (i: number, value: string | null) => {
    if (open.current !== i) return
    open.current = null
    if (value !== null && value !== labels[i]) edit?.rename(i, value.trim())
    back.current = i
    setEditing(null)
  }
  const order = ranking(sizes)
  return (
    <ul className="eb-compare-people" aria-label={t.compare.people} ref={list} data-testid="compare-people">
      {order.map((i) => (
        <li key={i} className="eb-compare-person">
          {editing === i ? (
            <input
              className="eb-input eb-compare-rename" defaultValue={labels[i]} maxLength={NAME_MAX} autoFocus
              placeholder={fmt(t.compare.birder, { n: i + 1 })} aria-label={fmt(t.compare.rename, { name: labels[i] })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') done(i, e.currentTarget.value)
                else if (e.key === 'Escape') { e.preventDefault(); done(i, null) }
              }}
              onBlur={(e) => done(i, e.currentTarget.value)}
              data-testid={`compare-name-${i}`}
            />
          ) : (
            <button type="button" className="eb-compare-pick" aria-pressed={c.group.id === i} onClick={() => c.choose(i)} data-testid={`compare-rank-${i}`}>
              <span className="eb-compare-name">
                {labels[i]}
                {you && i === 0 && <span className="eb-compare-you">{t.compare.you}</span>}
              </span>
              <span className="eb-compare-count">{formatInt(sizes[i], t.num)}</span>
              <span className="eb-compare-bar" style={{ inlineSize: `${(100 * sizes[i]) / max}%` }} aria-hidden="true" />
            </button>
          )}
          {edit && editing !== i && (
            <>
              <button type="button" className="eb-compare-icon" aria-label={fmt(t.compare.rename, { name: labels[i] })} onClick={() => start(i)} data-testid={`compare-rename-${i}`}>
                <PencilSimple aria-hidden="true" focusable="false" />
              </button>
              {edit.canRemove(i) && (
                <button type="button" className="eb-compare-icon" aria-label={fmt(t.compare.remove, { name: labels[i] })} onClick={() => edit.remove(i)} data-testid={`compare-remove-${i}`}>
                  <X aria-hidden="true" focusable="false" />
                </button>
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * The chosen group's birds as a grid of stickers in equal boxes, the name under each: three to six across by the
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
    <>
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
    </>
  )
}
