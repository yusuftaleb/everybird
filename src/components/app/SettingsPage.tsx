'use client'
import { ArrowRight, DownloadSimple, LockSimple, Trash } from '@phosphor-icons/react'
import Link from '@/components/app/IntentLink'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { ImportPanel } from '@/components/import/ImportPanel'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import { TickList } from '@/components/import/TickList'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import { placesNoteFor } from '@/lib/list/filter-summary'
import { countParts, sourceCounts, summaryLine } from '@/lib/list/source-counts'
import type { Saved } from '@/lib/list/storage'
import { useEverybirdContext } from './EverybirdProvider'
import { EnglishNamesSwitch } from './LanguageField'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

/**
 * `/settings`, everything in the page, behind no click: "Your list" (the summary line, one row per source, the match
 * report, the privacy footnote), "Add by hand" (the whole taxonomy to tick, open), then "Counting" (the rules) beside
 * "Your data" (downloads, restore, forget; the collage's title is in the share dialog) in two columns from 1024px, then
 * "Language" (only the English-names switch, when the UI isn't English: the language is the top bar's menu). Arriving at
 * /settings#sources (the welcome's "Make mine") focuses the sources; #tick lands on Add by hand; the Places notes'
 * #add-mydata and #add-obsorg open their row's Add panel (use-anchor-target.ts); #match opens the match report.
 */
export function SettingsPage() {
  const eb = useEverybirdContext()
  const { t, lang } = useI18n()
  const d = t.settings.data
  const { state, dispatch, data, mine, jobs } = eb
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState<Saved | null>(null)
  const sources = useRef<HTMLElement>(null)
  useEffect(() => {
    if (data && location.hash === '#sources') sources.current?.focus({ preventScroll: true })
  }, [data])
  const landed = jobs.landed
  const count = state.list.length
  const { saved } = state
  const onList = useMemo(() => new Set(state.list.map((e) => e.code)), [state.list])
  const counts = useMemo(() => sourceCounts(saved, state.list), [saved, state.list])
  const line = mine ? summaryLine(counts, t) : null
  const ticked = counts.rows.manual
  const listEmpty = Object.values(saved.records).every((r) => r.length === 0) && saved.edits.added.length === 0
  return (
    <main className="eb-page eb-page-settings eb-page-titled">
      <PageHead title={t.shell.nav.settings} />
      <AppNotices eb={eb} />
      {data ? (
        <>
          <section ref={sources} id="sources" className="eb-block eb-import" aria-labelledby="eb-sources-h" tabIndex={-1}>
            <div className="eb-block-head">
              <h2 id="eb-sources-h" className="eb-h2">{t.import.head}</h2>
              {line ? (
                <p className="eb-summary" role="status" data-testid="see-collage">
                  {line}
                  {landed && count > 0 && (
                    <>
                      {' '}
                      <Link href="/" className="eb-summary-link">{t.settings.seeCollage}<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
                    </>
                  )}
                </p>
              ) : <p className="eb-note">{t.import.combine}</p>}
            </div>
            <ImportPanel
              saved={saved}
              dispatch={dispatch}
              species={data.species}
              jobs={jobs}
              counts={counts}
              placesNote={placesNoteFor(saved, count, state.seen.full)}
            />
            <MatchReport open={state.openUnmatched} saved={saved} species={data.species} dispatch={dispatch} />
            {/* Where files and usernames are handed over; the full privacy note is on About. */}
            <p className="eb-privacy"><LockSimple aria-hidden="true" focusable="false" weight="bold" />{t.import.privacy}</p>
          </section>
          <section id="tick" className="eb-block eb-import" aria-labelledby="eb-tick-h">
            <div className="eb-block-head">
              <h2 id="eb-tick-h" className="eb-h2">{t.add.hand}</h2>
              {ticked.species > 0 && <p className="eb-mono eb-note">{[t.tick.title, ...countParts(ticked, t)].join(' · ')}</p>}
            </div>
            <TickList species={data.species} regions={data.regions} edits={saved.edits} dispatch={dispatch} onList={onList} listEmpty={listEmpty} sci={state.sci} />
          </section>
        </>
      ) : (
        !eb.failed && <div className="eb-ways-wait" aria-hidden="true" />
      )}
      {/* Counting (left) beside Your data (right) on wide screens, stacked on narrow ones (app.css). */}
      <div className={mine && data ? 'eb-settings-pair' : 'eb-settings-one'}>
        {mine && data && <RulesSwitches saved={saved} dispatch={dispatch} />}
        {(mine || data) && <section className="eb-block" aria-labelledby="eb-data-h">
          <div className="eb-block-head">
            <h2 id="eb-data-h" className="eb-h2">{d.head}</h2>
            <p className="eb-note">{mine ? d.noteMine : d.noteRestore}</p>
          </div>
          {mine ? (
            <div className="eb-tools">
              <button type="button" className="eb-btn eb-btn-quiet" disabled={!data} onClick={() => data && downloadText(toCsv(state.list, data.species, data.regions, state.seen), `everybird-${today()}.csv`, 'text/csv')}>
                <DownloadSimple aria-hidden="true" focusable="false" />
                {d.downloadCsv}
              </button>
              <button type="button" className="eb-btn eb-btn-quiet" disabled={!data} onClick={() => downloadText(toJson(saved), `everybird-backup-${today()}.json`, 'application/json')}>
                <DownloadSimple aria-hidden="true" focusable="false" />
                {d.downloadJson}
              </button>
              <RestoreBackup onRestore={(s) => { setConfirming(false); setRestoring(s) }} disabled={!data} />
              <button type="button" className="eb-btn eb-btn-quiet eb-btn-danger" aria-expanded={confirming} onClick={() => { setRestoring(null); setConfirming((c) => !c) }}>
                <Trash aria-hidden="true" focusable="false" />
                {d.forget}
              </button>
            </div>
          ) : data && (
            <div className="eb-tools">
              <RestoreBackup onRestore={(s) => { dispatch({ type: 'restore', saved: s }); router.push('/') }} />
            </div>
          )}
          {restoring && (
            <div className="eb-confirm" role="group" aria-label={d.restore}>
              <p>{d.restoreAsk}</p>
              <div className="eb-row">
                <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { dispatch({ type: 'restore', saved: restoring }); setRestoring(null) }}>{d.restoreYes}</button>
                <button type="button" className="eb-btn eb-btn-quiet" onClick={() => setRestoring(null)}>{d.restoreKeep}</button>
              </div>
            </div>
          )}
          {confirming && (
            <div className="eb-confirm" role="group" aria-label={d.forget}>
              <p>{d.forgetAsk}</p>
              <div className="eb-row">
                <button type="button" className="eb-btn eb-btn-danger-solid" autoFocus onClick={() => { setConfirming(false); dispatch({ type: 'forget' }) }}>{d.forgetYes}</button>
                <button type="button" className="eb-btn eb-btn-quiet" onClick={() => setConfirming(false)}>{d.forgetKeep}</button>
              </div>
            </div>
          )}
        </section>}
      </div>
      {/* The English-names switch, when the UI isn't English, with or without a list, in the prerendered page too. The
          language itself is the top bar's menu. */}
      {lang !== 'en' && <section className="eb-block" aria-labelledby="eb-lang-h">
        <div className="eb-block-head">
          <h2 id="eb-lang-h" className="eb-h2">{t.settings.language}</h2>
        </div>
        <div className="eb-langrow">
          <EnglishNamesSwitch />
        </div>
      </section>}
    </main>
  )
}
