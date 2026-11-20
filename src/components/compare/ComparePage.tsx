'use client'
import { ArrowLeft } from '@phosphor-icons/react'
import { useId, useMemo, useState, type FocusEvent, type FormEvent } from 'react'
import Link from '@/components/app/IntentLink'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { linksIn } from '@/lib/share/compare'
import { shareTitle } from '@/lib/share/og'
import { COMPARE_MAX, decodeCompare, decodeShare, NAME_MAX, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import { PageHead } from '@/components/app/PageHead'
import { CompareView, listLabels } from './CompareView'
import './compare.css'

/**
 * /compare: paste friends' share links; the birder's own list, when there is one, is always the first. A pasted
 * comparison link (/c/) opens that comparison as it was shared, without the birder's own list (it holds its sharer's),
 * any share links pasted with it after its lists. The links stay in this page's state (never its URL: the beacon
 * reports the address), and nothing is sent anywhere. A pasted list can be renamed for this comparison: the name shows
 * in the groups, the table, the card and the comparison link.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, data } = useEverybirdContext()
  const id = useId()
  const [text, setText] = useState('')
  const [pasted, setPasted] = useState<{ lists: SharePayload[]; bad: number; compared: boolean } | null>(null)
  // Names given here, by the list's place among the pasted lists (so the birder's own list loading later shifts
  // nothing); '' clears a name ("Birder 2").
  const [names, setNames] = useState<Record<number, string>>({})
  const [round, setRound] = useState(0)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')

  const name = state.saved.name?.trim()
  const lists = useMemo(() => {
    const friends = pasted?.lists ?? []
    if (pasted?.compared || !data || !state.list.length) return friends
    const mine = payloadFromList(state.list, data.regions, name)
    if (mine.name) mine.titled = true // the collage's title, verbatim (link.ts F_TITLE)
    return [mine, ...friends]
  }, [data, state.list, name, pasted])
  const you = !pasted?.compared && !!data && state.list.length > 0
  const first = lists.length - (pasted?.lists.length ?? 0) // the first pasted list's place in `lists`
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
  const rename = (i: number) => (e: FocusEvent<HTMLInputElement>) => {
    const v = e.currentTarget.value.trim()
    if (v !== (names[i] ?? e.currentTarget.defaultValue)) setNames((m) => ({ ...m, [i]: v }))
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setPasted(linksIn(text, decodeShare, decodeCompare))
    setNames({})
    setRound((r) => r + 1)
    setCopy('idle')
  }
  const copyLink = async () => {
    if (!link || !('url' in link)) return
    const ok = await navigator.clipboard?.writeText(link.url).then(() => true, () => false)
    setCopy(ok ? 'copied' : 'manual')
  }
  const blocked = link && 'blocked' in link ? (link.blocked === 'tooMany' ? fmt(t.compare.tooMany, { n: COMPARE_MAX }) : t.compare.tooBig) : ''

  return (
    <main className="eb-page eb-page-collage eb-page-titled">
      <PageHead
        title={t.compare.title}
        lede={t.compare.lede}
        actions={(
          // Compare is an entry of the collage's view switcher: the plain way back to the views.
          <Link href="/" className="eb-btn eb-btn-quiet" data-testid="compare-back">
            <ArrowLeft aria-hidden="true" focusable="false" />
            {t.compare.back}
          </Link>
        )}
      />
      <div className="eb-compare">
        <form className="eb-compare-form" onSubmit={submit}>
          <label htmlFor={`${id}-links`} className="eb-label">{t.compare.linksLabel}</label>
          <textarea id={`${id}-links`} className="eb-input eb-compare-paste" rows={4} value={text} onChange={(e) => setText(e.target.value)} data-testid="compare-paste" />
          <button type="submit" className="eb-btn" disabled={!text.trim()} data-testid="compare-submit">{t.compare.submit}</button>
        </form>
        <p className="eb-status" role="status" data-testid="compare-status">
          {/* After a Compare press: the links that didn't open, and whether there are two lists yet. */}
          {pasted && [pasted.bad ? plural(t.compare.bad, pasted.bad, { n: formatInt(pasted.bad, t.num) }) : '', lists.length < 2 ? t.compare.needMore : ''].filter(Boolean).join(' ')}
        </p>
        {lists.length >= 2 && (
          // Re-keyed per paste, so the fields start from the new lists' names.
          <fieldset className="eb-compare-names" key={`${round}:${first}`}>
            <legend className="eb-label">{t.compare.names}</legend>
            {lists.map((p, i) => (you && i === 0 ? (
              <p key={i} className="eb-compare-name">{fmt(t.compare.yourList, { name: labels[0] })}</p>
            ) : (
              <div key={i} className="eb-compare-name">
                <label htmlFor={`${id}-name-${i}`}>{fmt(t.compare.listN, { n: i + 1 })}</label>
                <input
                  id={`${id}-name-${i}`} className="eb-input" defaultValue={shareTitle(p, t) ?? ''} placeholder={fmt(t.compare.birder, { n: i + 1 })}
                  maxLength={NAME_MAX} onBlur={rename(i - first)} data-testid={`compare-name-${i}`}
                />
              </div>
            )))}
          </fieldset>
        )}
        {/* Always mounted, so its first message is announced. */}
        <p className="eb-status" role="status" id={`${id}-blocked`} data-testid="compare-share-status">{blocked || (copy === 'copied' ? t.compare.copied : '')}</p>
        {lists.length >= 2 && (
          <CompareView
            lists={lists} you={you} labels={labels}
            share={(
              <>
                <p className="eb-note" id={`${id}-consent`} data-testid="compare-consent">{t.compare.consent}</p>
                <button type="button" className="eb-btn eb-btn-quiet" disabled={!!blocked} aria-describedby={`${id}-consent${blocked ? ` ${id}-blocked` : ''}`} onClick={() => void copyLink()} data-testid="compare-copy">
                  {t.compare.copyLink}
                </button>
                {copy === 'manual' && link && 'url' in link && (
                  <input className="eb-input" readOnly value={link.url} aria-label={t.compare.copyManual} onFocus={(e) => e.currentTarget.select()} />
                )}
              </>
            )}
          />
        )}
      </div>
    </main>
  )
}
