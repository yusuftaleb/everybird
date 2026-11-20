'use client'
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { Binoculars, LinkSimple, Plus, ShareNetwork } from '@phosphor-icons/react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { addWithin, linksIn } from '@/lib/share/compare'
import { takeHandOff } from '@/lib/share/compare-handoff'
import { COMPARE_MAX, decodeCompare, decodeShare, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import Link from '@/components/app/IntentLink'
import { PageHead } from '@/components/app/PageHead'
import { CompareResult, listLabels, useComparison, type CompareEdit } from './CompareView'
import './compare.css'

/** `over`: the links left out of the last paste, past the page's COMPARE_MAX lists. */
type Pasted = { lists: SharePayload[]; bad: number; compared: boolean; over?: number }
type Kept = { pasted: Pasted | null; names: Record<number, string> }
// The pasted lists outlive the page while the tab stays in the app (memory only, never storage): a visitor sent to add
// their own birds first finds their friend's list waiting when they come back.
let kept: Kept = { pasted: null, names: {} }
/** Test hook: forget the kept lists, as a new tab would. */
export function forgetCompare(): void {
  kept = { pasted: null, names: {} }
}
/** Link fields before the first comparison: one per friend. */
const FIELDS = COMPARE_MAX - 1
/** How many pasted lists the page holds: COMPARE_MAX, less the birder's own unless a comparison link's lists stand alone. */
const roomFor = (compared: boolean) => (compared ? COMPARE_MAX : COMPARE_MAX - 1)
/** The links read from `text`, added to `held` within the page's cap. */
function pasteInto(held: readonly SharePayload[], r: ReturnType<typeof linksIn>, compared: boolean): Pasted {
  const { lists, over } = addWithin(held, r.lists, roomFor(compared))
  return { lists, bad: r.bad, compared, over }
}
/** The name given to the birder's own list, kept beside the pasted lists' (keyed by their place among them). */
const MINE = -1

/**
 * /compare. The page head holds the title and the sharing: Share card (the main button), Share wish list and Copy
 * comparison link, disabled with the reason under the head until two lists are compared. Under the head the paste field:
 * before the first comparison, "Add more" adds a field per friend (pasting several links into one works too); after it,
 * the one field adds lists, up to COMPARE_MAX lists in all (yours among them): links past it are not added, with a note,
 * and Add more is off once the fields reach it. The birder's own list, when there is one, is always the first. A pasted comparison link
 * (/c/) opens that comparison as it was shared, without the birder's own list (it holds its sharer's). "Compare with
 * mine" on a shared collage or comparison hands its link over in sessionStorage (compare-handoff.ts), read once on
 * arrival, and adds the birder's own list. The links stay in this page's state (never its URL: the beacon reports the
 * address), and nothing is sent anywhere. Every list can be renamed for this comparison; a pasted one removed.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, data, mineSoon } = useEverybirdContext()
  const id = useId()
  const [texts, setTexts] = useState<string[]>([''])
  const [pasted, setPastedState] = useState<Pasted | null>(kept.pasted)
  // Names given here: a pasted list's by its place among the pasted lists (so the birder's own list loading later shifts
  // nothing), the birder's own under MINE; '' clears a name ("Birder 2").
  const [names, setNamesState] = useState<Record<number, string>>(kept.names)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
  const setPasted = (p: Pasted | null) => { kept = { ...kept, pasted: p }; setPastedState(p) }
  const setNames = (f: (m: Record<number, string>) => Record<number, string>) => setNamesState((m) => { const n = f(m); kept = { ...kept, names: n }; return n })
  // A new comparison forgets the pasted lists' names, not the one given to the birder's own.
  const keepMine = (m: Record<number, string>): Record<number, string> => (MINE in m ? { [MINE]: m[MINE] } : {})

  useEffect(() => {
    const link = takeHandOff()
    if (!link) return
    // "Compare with mine": the link's lists, the birder's own added first, whatever was pasted before replaced.
    const r = linksIn(link, decodeShare, decodeCompare)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage, read once on arrival, isn't there to prerender
    setPasted(pasteInto([], r, false))
    setNames(keepMine)
  }, [])

  const name = state.saved.name?.trim()
  const friends = pasted?.lists ?? []
  const lists = useMemo(() => {
    if (pasted?.compared || !data || !state.list.length) return friends
    const mine = payloadFromList(state.list, data.regions, name)
    if (mine.name) mine.titled = true // the collage's title, verbatim (link.ts F_TITLE)
    return [mine, ...friends]
    // friends is pasted's
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, state.list, name, pasted])
  const you = !pasted?.compared && !!data && state.list.length > 0
  const first = lists.length - friends.length // the first pasted list's place in `lists`
  // The lists as shared: each renamed one with its new name as a verbatim title (link.ts F_TITLE).
  const named = useMemo(
    () => lists.map((p, i): SharePayload => {
      const n = names[i < first ? MINE : i - first]
      if (n === undefined) return p
      const out: SharePayload = { ...p }
      delete out.name
      delete out.titled
      if (n) { out.name = n; out.titled = true }
      return out
    }),
    [lists, names, first],
  )
  const labels = listLabels(named, t)
  const c = useComparison(lists, { you, labels })
  const link = useMemo(() => (named.length >= 2 ? makeCompareLink(named, window.location.origin) : null), [named])
  const edit: CompareEdit = {
    rename: (i, v) => setNames((m) => ({ ...m, [i < first ? MINE : i - first]: v })),
    canRemove: (i) => i >= first,
    remove: (i) => {
      const j = i - first
      if (!pasted) return
      setPasted({ ...pasted, lists: pasted.lists.filter((_, x) => x !== j) })
      // The names after the removed list move up one place with their lists.
      setNames((m) => Object.fromEntries(Object.entries(m).flatMap(([x, v]) => (+x === j ? [] : [[+x > j ? +x - 1 : +x, v]]))))
      setCopy('idle')
    },
  }
  // No list of the birder's own yet: the friend's list waits for it.
  const waiting = !pasted?.compared && friends.length > 0 && mineSoon === false

  // Once a comparison shows, the one field adds lists to it.
  const adding = c.ready
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = linksIn((adding ? texts.slice(0, 1) : texts).join(' '), decodeShare, decodeCompare)
    // A comparison link starts that comparison over; a share link joins the one showing.
    if (r.compared || !pasted) {
      setPasted(pasteInto([], r, r.compared))
      setNames(keepMine)
    } else setPasted(pasteInto(pasted.lists, r, pasted.compared))
    if (r.lists.length) setTexts([''])
    setCopy('idle')
  }
  const copyLink = async () => {
    if (!link || !('url' in link)) return
    const ok = await navigator.clipboard?.writeText(link.url).then(() => true, () => false)
    setCopy(ok ? 'copied' : 'manual')
  }
  const blocked = link && 'blocked' in link ? (link.blocked === 'tooMany' ? fmt(t.compare.tooMany, { n: COMPARE_MAX }) : t.compare.tooBig) : ''
  const setText = (i: number, v: string) => setTexts((xs) => xs.map((x, j) => (j === i ? v : x)))
  // Under the head: why the buttons wait, then (once they work) what a comparison link carries and why there's no wish list.
  const head = c.ready ? [t.compare.consent, c.wishReason].filter(Boolean).join(' ') : t.compare.needFirst

  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      <PageHead
        title={t.compare.title}
        lede={<span id={`${id}-head`} data-testid="compare-consent">{head}</span>}
        actions={<>
          <button
            type="button" className="eb-btn eb-btn-quiet" aria-label={t.compare.copyLink} disabled={!c.ready || !!blocked}
            aria-describedby={`${id}-head${blocked ? ` ${id}-blocked` : ''}`} onClick={() => void copyLink()} data-testid="compare-copy"
          >
            <LinkSimple aria-hidden="true" focusable="false" />
            <span className="eb-sm-hide">{t.compare.copyLink}</span>
          </button>
          <button
            type="button" className="eb-btn eb-btn-quiet" aria-label={t.compare.shareWish} disabled={!c.canWish || !c.data}
            aria-disabled={c.busy || undefined} aria-describedby={`${id}-head`} onClick={() => void c.shareWish()} data-testid="compare-wish"
          >
            <Binoculars aria-hidden="true" focusable="false" />
            <span className="eb-sm-hide">{t.compare.shareWish}</span>
          </button>
          <button type="button" className="eb-btn" disabled={!c.card} aria-describedby={`${id}-head`} onClick={c.shareCard} data-testid="compare-card">
            <ShareNetwork aria-hidden="true" focusable="false" weight="bold" />
            {t.compare.shareCard}
          </button>
        </>}
      />
      <div className="eb-compare">
        <form className="eb-compare-form" onSubmit={submit}>
          {(adding ? [texts[0]] : texts).map((text, i) => (
            <div key={i} className="eb-compare-field">
              <label htmlFor={`${id}-link-${i}`} className="eb-sr">{adding ? t.compare.addAnother : i ? fmt(t.compare.linkN, { n: i + 1 }) : t.compare.paste}</label>
              <input
                id={`${id}-link-${i}`} className="eb-input eb-compare-paste" type="text" inputMode="url" autoComplete="off" spellCheck={false}
                placeholder={adding ? t.compare.addAnother : i ? t.compare.addAnother : t.compare.paste} value={text} autoFocus={i > 0}
                onChange={(e) => setText(i, e.target.value)} data-testid={i ? `compare-paste-${i}` : 'compare-paste'}
              />
              {i === 0 && (
                <button type="submit" className="eb-btn" disabled={!texts.some((x) => x.trim())} data-testid="compare-submit">{adding ? t.compare.add : t.compare.submit}</button>
              )}
            </div>
          ))}
          {!adding && (
            <button
              type="button" className="eb-textbtn eb-compare-addmore" disabled={texts.length >= FIELDS} aria-describedby={`${id}-limit`}
              onClick={() => setTexts((xs) => [...xs, ''])} data-testid="compare-add-more"
            >
              <Plus aria-hidden="true" focusable="false" />
              {t.compare.addMore}
            </button>
          )}
          <p className="eb-note" id={`${id}-limit`} data-testid="compare-limit">{fmt(t.compare.limit, { n: COMPARE_MAX, m: COMPARE_MAX - 1 })}</p>
        </form>
        <p className="eb-status" role="status" data-testid="compare-status">
          {/* After a Compare press: the links that didn't open, those past the cap, and whether there are two lists yet. */}
          {pasted && [
            pasted.bad ? plural(t.compare.bad, pasted.bad, { n: formatInt(pasted.bad, t.num) }) : '',
            pasted.over ? fmt(t.compare.over, { n: COMPARE_MAX }) : '',
            lists.length < 2 && !waiting ? t.compare.needMore : '',
          ].filter(Boolean).join(' ')}
        </p>
        {waiting && lists.length < 2 && (
          <p className="eb-note eb-compare-wait-note" data-testid="compare-no-list">
            {fmt(t.compare.noList, { name: labels[0] })}{' '}
            <Link href="/settings">{t.collage.addBirds}</Link>
          </p>
        )}
        {/* Always mounted, so its first message is announced. */}
        <p className="eb-status" role="status" id={`${id}-blocked`} data-testid="compare-share-status">{blocked || (copy === 'copied' ? t.compare.copied : '')}</p>
        {copy === 'manual' && link && 'url' in link && (
          <input className="eb-input eb-compare-manual" readOnly value={link.url} aria-label={t.compare.copyManual} onFocus={(e) => e.currentTarget.select()} />
        )}
        {c.ready && <CompareResult c={c} you={you} edit={edit} />}
      </div>
    </main>
  )
}
