'use client'
import { ArrowRight, DownloadSimple, Plus, Trash } from '@phosphor-icons/react'
import Link from '@/components/app/IntentLink'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { AddBirdsDialog, type AddWay } from '@/components/import/AddBirdsDialog'
import { MatchReport } from '@/components/import/MatchReport'
import { RulesSwitches } from '@/components/import/RulesSwitches'
import { downloadText, today } from '@/lib/download'
import { toCsv, toJson } from '@/lib/list/export'
import { MYEBIRDDATA_PLACES, OBSORG_PLACES } from '@/lib/list/filter-summary'
import { sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { NAME_MAX, type Saved } from '@/lib/list/storage'
import { useEverybirdContext } from './EverybirdProvider'
import { EnglishNamesSwitch, LanguageField } from './LanguageField'
import { AppNotices } from './Notices'
import { PageHead } from './PageHead'
import { RestoreBackup } from './RestoreBackup'
import './app.css'

/** The addresses that open the Add birds dialog on arrival: the ways in (the welcome's "Make mine"), the Places
 * notes' file rows (they open their row's Add panel, use-anchor-target.ts) and Add by hand. */
function wayFor(hash: string): AddWay | 'choose' | undefined {
  if (hash === '#sources') return 'choose'
  if (hash === `#${MYEBIRDDATA_PLACES.anchor}` || hash === `#${OBSORG_PLACES.anchor}`) return 'file'
  if (hash === '#tick') return 'hand'
}

/** Settings > Your data > "Name your collage": saved with the list as you type (trimmed, at most NAME_MAX characters),
 *  it is the collage's title, verbatim ("Yusuf’s life list", "Birds of 2026"), and each share dialog's starting title.
 *  Empty: "My collage" on the page and no title on shares. */
function NameField({ stored, onName }: { stored: string; onName: (name: string) => void }) {
  const id = useId()
  const { t } = useI18n()
  const n = t.settings.data.name
  const [name, setName] = useState(stored)
  // A restore or a forget changes the saved title underneath the field: follow it (not while the field only differs
  // by the spaces the store trims off).
  const [seen, setSeen] = useState(stored)
  if (seen !== stored) {
    setSeen(stored)
    if (name.trim() !== stored) setName(stored)
  }
  return (
    <div className="eb-namefield">
      <label htmlFor={id} className="eb-namefield-label">{n.label}</label>
      <input
        id={id}
        className="eb-input"
        type="text"
        autoComplete="off"
        maxLength={NAME_MAX}
        placeholder={n.placeholder}
        aria-describedby={`${id}-n`}
        value={name}
        onChange={(e) => { setName(e.target.value); onName(e.target.value) }}
      />
      <p id={`${id}-n`} className="eb-note">{n.helper}</p>
    </div>
  )
}

/**
 * `/settings`, three sections: "Your list" (the summary line, "Add birds" for the Add birds dialog, the match report,
 * the counting rules), "Language" and "Your data" (the collage's title, downloads, restore, forget).
 */
export function SettingsPage() {
  const eb = useEverybirdContext()
  const { t } = useI18n()
  const d = t.settings.data
  const { state, dispatch, data, mine, jobs } = eb
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [restoring, setRestoring] = useState<Saved | null>(null)
  const [adding, setAdding] = useState<AddWay | 'choose' | null>(null)
  useEffect(() => {
    // Read once mounted too: a client navigation writes the address after this renders and fires no hashchange.
    const onHash = () => { const w = wayFor(location.hash); if (w) setAdding((a) => a ?? w) }
    onHash()
    addEventListener('hashchange', onHash)
    return () => removeEventListener('hashchange', onHash)
  }, [])
  const closeAdd = () => {
    setAdding(null)
    // So "Add birds" opens the dialog afresh, not at the row the address named.
    if (wayFor(location.hash)) history.replaceState(history.state, '', location.pathname + location.search)
  }
  const landed = jobs.landed
  const count = state.list.length
  const { saved } = state
  const counts = useMemo(() => sourceCounts(saved, state.list), [saved, state.list])
  const line = mine ? summaryLine(counts, t) : null
  return (
    <main className="eb-page eb-page-settings eb-page-titled">
      <PageHead title={t.shell.nav.settings} />
      <AppNotices eb={eb} />
      {data ? (
        <section id="sources" className="eb-block eb-import" aria-labelledby="eb-sources-h">
          <div className="eb-block-head">
            <h2 id="eb-sources-h" className="eb-h2">{t.import.head}</h2>
            {line && (
              <p className="eb-summary" role="status" data-testid="see-collage">
                {line}
                {landed && count > 0 && (
                  <>
                    {' '}
                    <Link href="/" className="eb-summary-link">{t.settings.seeCollage}<ArrowRight aria-hidden="true" focusable="false" weight="bold" /></Link>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="eb-tools">
            <button type="button" className="eb-btn" aria-haspopup="dialog" data-add-birds="" onClick={() => setAdding('choose')}>
              <Plus aria-hidden="true" focusable="false" weight="bold" />
              {t.collage.addBirds}
            </button>
          </div>
          <MatchReport open={state.openUnmatched} saved={saved} species={data.species} dispatch={dispatch} />
          {mine && <RulesSwitches saved={saved} dispatch={dispatch} />}
        </section>
      ) : (
        !eb.failed && <div className="eb-ways-wait" aria-hidden="true" />
      )}
      <div className={mine ? 'eb-settings-pair' : 'eb-settings-one'}>
        {/* Always shown, with or without a list, in the prerendered page too. */}
        <section className="eb-block" aria-labelledby="eb-lang-h">
          <div className="eb-block-head">
            <h2 id="eb-lang-h" className="eb-h2">{t.settings.language}</h2>
          </div>
          <div className="eb-langrow">
            <LanguageField />
            <EnglishNamesSwitch />
          </div>
        </section>
        {(mine || data) && <section className="eb-block" aria-labelledby="eb-data-h">
          <div className="eb-block-head">
            <h2 id="eb-data-h" className="eb-h2">{d.head}</h2>
            <p className="eb-note">{mine ? d.noteMine : d.noteRestore}</p>
          </div>
          {mine ? (
            <div className="eb-datarow">
              <NameField stored={saved.name ?? ''} onName={(name) => dispatch({ type: 'name', name })} />
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
      {adding && <AddBirdsDialog start={adding === 'choose' ? undefined : adding} onClose={closeAdd} />}
    </main>
  )
}
