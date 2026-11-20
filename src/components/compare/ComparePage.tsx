'use client'
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { linksIn } from '@/lib/share/compare'
import { takeHandOff } from '@/lib/share/compare-handoff'
import { COMPARE_MAX, decodeCompare, decodeShare, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import Link from '@/components/app/IntentLink'
import { PageHead } from '@/components/app/PageHead'
import { CompareView, listLabels, type CompareEdit } from './CompareView'
import './compare.css'

type Pasted = { lists: SharePayload[]; bad: number; compared: boolean }
type Kept = { pasted: Pasted | null; names: Record<number, string> }
// The pasted lists outlive the page while the tab stays in the app (memory only, never storage): a visitor sent to add
// their own birds first finds their friend's list waiting when they come back.
let kept: Kept = { pasted: null, names: {} }
/** Test hook: forget the kept lists, as a new tab would. */
export function forgetCompare(): void {
  kept = { pasted: null, names: {} }
}

/**
 * /compare: one field for a friend's share link (several pasted at once work too); the birder's own list, when there is
 * one, is always the first. Once a comparison shows, the same field adds another friend to it. A pasted comparison link
 * (/c/) opens that comparison as it was shared, without the birder's own list (it holds its sharer's). "Compare with
 * mine" on a shared collage or comparison hands its link over in sessionStorage (compare-handoff.ts), read once on
 * arrival, and adds the birder's own list. The links stay in this page's state (never its URL: the beacon reports the
 * address), and nothing is sent anywhere. A pasted list can be renamed or removed for this comparison.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, data, mineSoon } = useEverybirdContext()
  const id = useId()
  const [text, setText] = useState('')
  const [pasted, setPastedState] = useState<Pasted | null>(kept.pasted)
  // Names given here, by the list's place among the pasted lists (so the birder's own list loading later shifts
  // nothing); '' clears a name ("Birder 2").
  const [names, setNamesState] = useState<Record<number, string>>(kept.names)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')
  const setPasted = (p: Pasted | null) => { kept = { ...kept, pasted: p }; setPastedState(p) }
  const setNames = (f: (m: Record<number, string>) => Record<number, string>) => setNamesState((m) => { const n = f(m); kept = { ...kept, names: n }; return n })

  useEffect(() => {
    const link = takeHandOff()
    if (!link) return
    // "Compare with mine": the link's lists, the birder's own added first, whatever was pasted before replaced.
    const r = linksIn(link, decodeShare, decodeCompare)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage, read once on arrival, isn't there to prerender
    setPasted({ ...r, compared: false })
    setNames(() => ({}))
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
      const n = names[i - first]
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
  const link = useMemo(() => (named.length >= 2 ? makeCompareLink(named, window.location.origin) : null), [named])
  const edit: CompareEdit = {
    can: (i) => i >= first,
    rename: (i, v) => setNames((m) => ({ ...m, [i - first]: v })),
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

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const r = linksIn(text, decodeShare, decodeCompare)
    // A comparison link starts that comparison over; a share link joins the one showing.
    if (r.compared || !pasted) setPasted(r)
    else setPasted({ lists: [...pasted.lists, ...r.lists], bad: r.bad, compared: pasted.compared })
    if (r.compared || !pasted) setNames(() => ({}))
    if (r.lists.length) setText('')
    setCopy('idle')
  }
  const copyLink = async () => {
    if (!link || !('url' in link)) return
    const ok = await navigator.clipboard?.writeText(link.url).then(() => true, () => false)
    setCopy(ok ? 'copied' : 'manual')
  }
  const blocked = link && 'blocked' in link ? (link.blocked === 'tooMany' ? fmt(t.compare.tooMany, { n: COMPARE_MAX }) : t.compare.tooBig) : ''
  const adding = friends.length > 0

  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      <PageHead title={t.compare.title} />
      <div className="eb-compare">
        <form className="eb-compare-form" onSubmit={submit}>
          <label htmlFor={`${id}-links`} className="eb-sr">{adding ? t.compare.addAnother : t.compare.paste}</label>
          <input
            id={`${id}-links`} className="eb-input eb-compare-paste" type="text" inputMode="url" autoComplete="off" spellCheck={false}
            placeholder={adding ? t.compare.addAnother : t.compare.paste} value={text} onChange={(e) => setText(e.target.value)} data-testid="compare-paste"
          />
          <button type="submit" className="eb-btn" disabled={!text.trim()} data-testid="compare-submit">{adding ? t.compare.add : t.compare.submit}</button>
        </form>
        <p className="eb-status" role="status" data-testid="compare-status">
          {/* After a Compare press: the links that didn't open, and whether there are two lists yet. */}
          {pasted && [pasted.bad ? plural(t.compare.bad, pasted.bad, { n: formatInt(pasted.bad, t.num) }) : '', lists.length < 2 && !waiting ? t.compare.needMore : ''].filter(Boolean).join(' ')}
        </p>
        {waiting && lists.length < 2 && (
          <p className="eb-note eb-compare-wait-note" data-testid="compare-no-list">
            {fmt(t.compare.noList, { name: labels[0] })}{' '}
            <Link href="/settings">{t.collage.addBirds}</Link>
          </p>
        )}
        {/* Always mounted, so its first message is announced. */}
        <p className="eb-status" role="status" id={`${id}-blocked`} data-testid="compare-share-status">{blocked || (copy === 'copied' ? t.compare.copied : '')}</p>
        {lists.length >= 2 && (
          <CompareView
            lists={lists} you={you} labels={labels} edit={edit}
            share={(
              <>
                <button type="button" className="eb-btn eb-btn-quiet" disabled={!!blocked} aria-describedby={`${id}-consent${blocked ? ` ${id}-blocked` : ''}`} onClick={() => void copyLink()} data-testid="compare-copy">
                  {t.compare.copyLink}
                </button>
                {copy === 'manual' && link && 'url' in link && (
                  <input className="eb-input" readOnly value={link.url} aria-label={t.compare.copyManual} onFocus={(e) => e.currentTarget.select()} />
                )}
                <p className="eb-note" id={`${id}-consent`} data-testid="compare-consent">{t.compare.consent}</p>
              </>
            )}
          />
        )}
      </div>
    </main>
  )
}
