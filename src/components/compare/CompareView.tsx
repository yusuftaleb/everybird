'use client'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Check, PencilSimple, ShareNetwork, X } from '@phosphor-icons/react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Ui } from '@/i18n/messages/en'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import { compareGroups, compareTable, groupPayload, pairGroups, ranking, spread, type CompareGroup, type PairPart } from '@/lib/share/compare'
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
import '@/components/collage/card-list.css'
import './compare.css'

/** Each list's name in the comparison: its title, else "Birder 2" by its place in the comparison. */
export function listLabels(lists: readonly SharePayload[], t: Ui): string[] {
  return lists.map((p, i) => shareTitle(p, t) ?? fmt(t.compare.birder, { n: i + 1 }))
}

/** What the birds part shows: one of the Venn's three regions, or (three or more lists) everyone's birds, one list's
 *  own, or the species × people table. */
type Sel = { pair: PairPart } | { multi: 'all' | number | 'table' }
/** Renaming and removing the pasted lists (the Compare page's; a shared comparison has neither). */
export type CompareEdit = { can: (i: number) => boolean; rename: (i: number, name: string) => void; remove: (i: number) => void }

const entriesOf = (p: SharePayload): ListEntry[] =>
  p.birds.map((b) => ({ code: b.code, ...(b.ym !== undefined ? { date: ymToDate(b.ym, b.yearOnly) } : {}), heard: false, dead: false, media: false, sources: ['ebird'] }))
const sizeOf = (p: SharePayload) => new Set(p.birds.map((b) => b.code)).size
const lightOnServer = (): Theme => 'light'
const SHOWN = 12

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
 * Two or more lists compared. The comparison card (drawn live: the Venn of the first list against one other, the
 * stickers, the counts), and beside it the birds: one segmented control for the Venn's three regions (for the viewer
 * and one other list, the birds they still need first), the regions on the card as pointer shortcuts to the same. With
 * three or more lists a ranking above it picks the other circle, and chips reach everyone's birds, each list's own and
 * the species × people table. `you`: the first list is the viewer's own. `labels`: the lists' names here (default
 * listLabels). `share`: the page's own sharing controls, after Share card. Reads and writes nothing of the saved list.
 */
export function CompareView({ lists, you = false, labels: named, share, edit }: { lists: readonly SharePayload[]; you?: boolean; labels?: readonly string[]; share?: ReactNode; edit?: CompareEdit }) {
  const { t } = useI18n()
  const [data, setData] = useState<{ species: SpeciesIndex } | null>(null)
  const [failed, setFailed] = useState(false)
  const [other, setOther] = useState(1)
  const [chosen, setChosen] = useState<Sel | null>(null)
  const [all, setAll] = useState(false)
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

  const fallback = listLabels(lists, t)
  const labels = named ?? fallback
  const three = lists.length >= 3
  const k = other > 0 && other < lists.length ? other : 1
  const pair = useMemo(() => pairGroups(lists, k), [lists, k])
  const multi = useMemo(() => (three ? compareGroups(lists) : []), [three, lists])
  const rows = useMemo(() => (three ? compareTable(lists) : []), [three, lists])
  const sel: Sel = chosen && !('multi' in chosen && typeof chosen.multi === 'number' && chosen.multi >= lists.length) ? chosen : { pair: you ? 'other' : 'both' }
  const choose = (s: Sel) => { setChosen(s); setAll(false) }
  const part = 'pair' in sel ? sel.pair : null
  const group: CompareGroup | null = 'pair' in sel ? pair.find((g) => g.part === sel.pair)! : sel.multi === 'table' ? null : sel.multi === 'all' ? multi[0] : multi[sel.multi + 1]
  const counts = { first: pair[2].codes.length, both: pair[1].codes.length, other: pair[0].codes.length }
  const names: [string, string] = [labels[0], labels[k]]
  const pairLabel = (p: PairPart) =>
    p === 'both' ? t.compare.both : p === 'other' ? (you ? t.compare.need : fmt(t.compare.only, { name: names[1] })) : (you ? t.compare.onlyYou : fmt(t.compare.only, { name: names[0] }))
  const alt = fmt(t.compare.venn, { first: names[0], a: formatInt(counts.first, t.num), both: formatInt(counts.both, t.num), other: names[1], b: formatInt(counts.other, t.num) })

  // The card, drawn again whenever what it shows changes (and in the page's theme). The card never says "you".
  const title = labels.join(' & ')
  const line = ranking(lists).map((i) => fmt(t.compare.cardCount, { label: labels[i], n: formatInt(sizeOf(lists[i]), t.num) })).join(' · ')
  useEffect(() => {
    if (!data) return
    let live = true
    const species = data.species
    const drawn = (codes: string[]) => codes.filter((c) => species.byCode.get(c)?.st)
    import('@/lib/share/compare-image')
      .then((m) => m.drawCompareCard({
        title, line, names, counts, species, theme, t,
        stickers: spread([drawn(pair[2].codes), drawn(pair[1].codes), drawn(pair[0].codes)], m.CARD_STICKERS),
      }))
      .then((c) => { if (live) setCard({ ...c, url: URL.createObjectURL(c.blob) }) }, () => { if (live) setNote({ text: t.share.imageFailed, error: true }) })
    return () => { live = false }
    // names and counts follow from labels, pair and k
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, pair, title, line, names[0], names[1], theme, t])
  const url = card?.url
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])

  const send = async (blob: Blob, file: string) => {
    const { SHARE_CREDIT } = await import('@/lib/share/image')
    const r = await shareOrSave(blob, file, SHARE_CREDIT)
    setNote(r === 'saved' ? { text: fmt(t.share.saved, { file }) } : null)
  }
  const shareCard = () => { if (card) void send(card.blob, 'everybird-compare.png') }
  // The wish list: the other list's birds the viewer lacks, as a share image of its own, named for the other list.
  const need = pair[0]
  const shareWish = async () => {
    if (!data || busy) return
    setBusy(true)
    try {
      const { renderShareImage } = await import('@/lib/share/image')
      const blob = await renderShareImage({
        format: 'post', entries: entriesOf(groupPayload(lists, need)), species: data.species, theme, latest: false, countSize: 'hide',
        name: plural(t.compare.wish, need.codes.length, { n: formatInt(need.codes.length, t.num), name: names[1] }), strings: t, nameOf: displayName,
      })
      await send(blob, 'everybird-wish-list.png')
    } catch {
      setNote({ text: t.share.imageFailed, error: true })
    } finally {
      setBusy(false)
    }
  }

  if (failed) return <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>
  return (
    <div className="eb-compare-result">
      <figure className="eb-compare-card" data-testid="compare-card-figure">
        <div className="eb-compare-pic">
          {card ? (
            <>
              {/* The live card is a blob URL, never optimised. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={card.url} width={card.W} height={card.H} alt={alt} data-testid="compare-card-image" />
              {/* The regions: pointer shortcuts to the segmented control's choices, which stay the keyboard's way. */}
              <svg className="eb-compare-venn" viewBox={`0 0 ${card.W} ${card.H}`} aria-hidden="true" focusable="false">
                {(['first', 'other', 'both'] as const).map((p) => card.venn.paths[p] && (
                  <path key={p} d={card.venn.paths[p]} data-on={part === p ? '' : undefined} onClick={() => choose({ pair: p })} data-testid={`compare-venn-${p}`} />
                ))}
              </svg>
            </>
          ) : (
            <div className="eb-compare-wait" role="img" aria-label={alt} />
          )}
        </div>
      </figure>
      <div className="eb-compare-side">
        <People lists={lists} labels={labels} you={you} k={k} three={three} edit={edit} onPick={(i) => { setOther(i); if ('multi' in sel) choose({ pair: you ? 'other' : 'both' }) }} />
        <div className="eb-compare-seg" role="group" aria-label={t.compare.groups} data-testid="compare-groups">
          {pair.map((g) => (
            <button
              key={g.part} type="button" className="eb-compare-seg-btn" aria-pressed={part === g.part} onClick={() => choose({ pair: g.part })}
              data-testid={three ? `compare-pair-${g.part}` : `compare-group-${g.who}`}
            >
              <span>{pairLabel(g.part)}</span>
              <span className="eb-compare-seg-n"> · {formatInt(g.codes.length, t.num)}</span>
            </button>
          ))}
        </div>
        {three && (
          <div className="eb-compare-groups" role="group" aria-label={t.compare.allLists}>
            {multi.map((g) => (
              <Chip
                key={String(g.who)} label={g.who === 'all' ? t.compare.everyone : you && g.who === 0 ? t.compare.onlyYou : fmt(t.compare.only, { name: labels[g.who] })}
                count={g.codes.length} selected={'multi' in sel && sel.multi === g.who} onClick={() => choose({ multi: g.who })} testId={`compare-group-${g.who}`}
              />
            ))}
            <Chip label={t.compare.every} count={rows.length} selected={'multi' in sel && sel.multi === 'table'} onClick={() => choose({ multi: 'table' })} testId="compare-group-table" />
          </div>
        )}
        {!data ? (
          <div className="eb-compare-birds-wait" aria-hidden="true" />
        ) : !group ? (
          <CompareTable rows={rows} labels={labels} species={data.species} />
        ) : group.codes.length ? (
          <Birds payload={groupPayload(lists, group)} from={labels[group.from]} species={data.species} all={all} onAll={() => setAll(true)} />
        ) : (
          <p className="eb-note" data-testid="compare-empty">{t.compare.empty}</p>
        )}
        <div className="eb-compare-actions">
          <button type="button" className="eb-btn" disabled={!card} onClick={shareCard} data-testid="compare-card">
            <ShareNetwork aria-hidden="true" focusable="false" />
            {t.compare.shareCard}
          </button>
          {you && part === 'other' && need.codes.length > 0 && (
            <button type="button" className="eb-btn eb-btn-quiet" disabled={!data} aria-disabled={busy || undefined} onClick={() => void shareWish()} data-testid="compare-wish">
              {t.compare.shareWish}
            </button>
          )}
          {share}
        </div>
        <p className={note?.error ? 'eb-status eb-error' : 'eb-status'} role="status" data-testid="compare-card-status">{note?.text ?? ''}</p>
      </div>
    </div>
  )
}

/**
 * The lists in the comparison, most species first: each name with its count, the viewer's own marked. With three or
 * more lists a ranking: a bar to scale under each name, and pressing a name (any but the first list's) makes it the
 * Venn's other circle. A pasted list's name has a small edit control (it turns into a field in place) and a remove.
 */
function People({ lists, labels, you, k, three, edit, onPick }: { lists: readonly SharePayload[]; labels: readonly string[]; you: boolean; k: number; three: boolean; edit?: CompareEdit; onPick: (i: number) => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState<number | null>(null)
  // The field open now (Escape, Enter and the blur that may follow either close it once) and the edit button to
  // focus once it has closed.
  const open = useRef<number | null>(null)
  const back = useRef<number | null>(null)
  const list = useRef<HTMLUListElement>(null)
  const sizes = lists.map(sizeOf)
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
  return (
    <ul className="eb-compare-people" aria-label={t.compare.people} data-three={three ? '' : undefined} ref={list} data-testid="compare-people">
      {ranking(lists).map((i) => {
        const body = (
          <>
            <span className="eb-compare-name">
              {labels[i]}
              {you && i === 0 && <span className="eb-compare-you">{t.compare.you}</span>}
            </span>
            <span className="eb-compare-count">{formatInt(sizes[i], t.num)}</span>
            {three && <span className="eb-compare-bar" style={{ inlineSize: `${(100 * sizes[i]) / max}%` }} aria-hidden="true" />}
          </>
        )
        return (
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
            ) : three && i !== 0 ? (
              <button type="button" className="eb-compare-pick" aria-pressed={i === k} onClick={() => onPick(i)} data-testid={`compare-rank-${i}`}>{body}</button>
            ) : (
              <div className="eb-compare-pick">{body}</div>
            )}
            {edit?.can(i) && editing !== i && (
              <>
                <button type="button" className="eb-compare-icon" aria-label={fmt(t.compare.rename, { name: labels[i] })} onClick={() => start(i)} data-testid={`compare-rename-${i}`}>
                  <PencilSimple aria-hidden="true" focusable="false" />
                </button>
                <button type="button" className="eb-compare-icon" aria-label={fmt(t.compare.remove, { name: labels[i] })} onClick={() => edit.remove(i)} data-testid={`compare-remove-${i}`}>
                  <X aria-hidden="true" focusable="false" />
                </button>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/** The chosen group's birds in taxonomic order: a sticker, the name, whose list and the year; the first SHOWN, then all. */
function Birds({ payload, from, species, all, onAll }: { payload: SharePayload; from: string; species: SpeciesIndex; all: boolean; onAll: () => void }) {
  const { t } = useI18n()
  const shown = useMemo(
    () => payload.birds.flatMap((b) => { const row = species.byCode.get(b.code); return row ? [{ b, row }] : [] }).sort((x, y) => x.row.to - y.row.to),
    [payload, species],
  )
  const rest = shown.length - SHOWN
  return (
    <>
      <ul className="eb-compare-birds" data-testid="compare-birds">
        {(all ? shown : shown.slice(0, SHOWN)).map(({ b, row }) => {
          const ar = row.st && row.ar > 0 ? row.ar : 1
          const [w, h] = ar >= 56 / 40 ? [56, 56 / ar] : [40 * ar, 40]
          return (
            <li key={b.code} className="eb-compare-bird">
              <span className="eb-row-thumb" aria-hidden="true"><Sticker code={row.code} st={row.st} ar={ar} sv={row.sv} w={w} h={h} /></span>
              <span className="eb-compare-bird-name">{displayName(row)}</span>
              <span className="eb-compare-bird-meta">{b.ym !== undefined ? `${from} · ${ymToDate(b.ym, true)}` : from}</span>
            </li>
          )
        })}
      </ul>
      {!all && rest > 0 && (
        <button type="button" className="eb-textbtn eb-compare-more" onClick={onAll} data-testid="compare-more">
          {fmt(t.compare.showAll, { n: formatInt(shown.length, t.num) })}
        </button>
      )}
    </>
  )
}

const NO_LIST: ListEntry[] = []

/** The species × people table: a row per bird (in taxonomic order), a column per list, a mark where the list has it. */
function CompareTable({ rows, labels, species }: { rows: { code: string; on: boolean[] }[]; labels: readonly string[]; species: SpeciesIndex }) {
  const { t } = useI18n()
  const shown = useMemo(
    () => rows.flatMap((r) => { const row = species.byCode.get(r.code); return row ? [{ ...r, row }] : [] }).sort((a, b) => a.row.to - b.row.to),
    [rows, species],
  )
  return (
    <div className="eb-compare-table" role="region" aria-label={t.compare.tableCaption} tabIndex={0} data-testid="compare-table">
      <table>
        <caption className="eb-sr">{t.compare.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{t.compare.bird}</th>
            {labels.map((l, i) => <th key={i} scope="col">{l}</th>)}
          </tr>
        </thead>
        <tbody>
          {shown.map(({ code, on, row }) => (
            <tr key={code}>
              <th scope="row">{displayName(row)}</th>
              {on.map((has, i) => (
                <td key={i}>
                  {has && (
                    <>
                      <Check aria-hidden="true" focusable="false" weight="bold" />
                      <span className="eb-sr">{t.compare.onList}</span>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
