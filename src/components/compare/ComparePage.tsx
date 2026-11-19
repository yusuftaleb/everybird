'use client'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { payloadFromList } from '@/lib/share/convert'
import { linksIn } from '@/lib/share/compare'
import { COMPARE_MAX, decodeShare, type SharePayload } from '@/lib/share/link'
import { makeCompareLink } from '@/lib/share/make-link'
import { useEverybirdContext } from '@/components/app/EverybirdProvider'
import { PageHead } from '@/components/app/PageHead'
import { CompareView } from './CompareView'
import './compare.css'

/**
 * /compare: paste friends' share links; the birder's own list, when there is one, is always the first. The links stay
 * in this page's state (never its URL: the beacon reports the address), and nothing is sent anywhere.
 */
export function ComparePage() {
  const { t } = useI18n()
  const { state, data } = useEverybirdContext()
  const id = useId()
  const [text, setText] = useState('')
  const [pasted, setPasted] = useState<{ lists: SharePayload[]; bad: number } | null>(null)
  const [copy, setCopy] = useState<'idle' | 'copied' | 'manual'>('idle')

  const name = state.saved.name?.trim()
  const lists = useMemo(() => {
    const friends = pasted?.lists ?? []
    if (!data || !state.list.length) return friends
    const mine = payloadFromList(state.list, data.regions, name)
    if (mine.name) mine.titled = true // the collage's title, verbatim (link.ts F_TITLE)
    return [mine, ...friends]
  }, [data, state.list, name, pasted])
  const you = !!data && state.list.length > 0
  const link = useMemo(() => (lists.length >= 2 ? makeCompareLink(lists, window.location.origin) : null), [lists])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setPasted(linksIn(text, decodeShare))
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
      <PageHead title={t.compare.title} lede={t.compare.lede} />
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
          <div className="eb-compare-share">
            <button type="button" className="eb-btn eb-btn-quiet" disabled={!!blocked} aria-describedby={blocked ? `${id}-blocked` : undefined} onClick={() => void copyLink()} data-testid="compare-copy">
              {t.compare.copyLink}
            </button>
            {copy === 'manual' && link && 'url' in link && (
              <input className="eb-input" readOnly value={link.url} aria-label={t.compare.copyManual} onFocus={(e) => e.currentTarget.select()} />
            )}
          </div>
        )}
        {/* Always mounted, so its first message is announced. */}
        <p className="eb-status" role="status" id={`${id}-blocked`} data-testid="compare-share-status">{blocked || (copy === 'copied' ? t.compare.copied : '')}</p>
        {lists.length >= 2 && <CompareView lists={lists} you={you} />}
      </div>
    </main>
  )
}
