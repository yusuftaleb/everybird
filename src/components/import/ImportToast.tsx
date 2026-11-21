'use client'
// Every import's one toast (round 6 menu audit, item 7: no progress in the sources grid), on the site's toast (Toast.tsx),
// mounted once in EverybirdProvider so an iNaturalist fetch keeps its toast on whatever page the birder moves to. While
// a file is read: "Reading your file… 1,200 rows" with a small spinner, and from the parsers that stream the file
// (MyEBirdData, observation.org's observations) "Reading your file… 120,000 rows · 45%" over a thin progress line (the
// share dialog's .eb-share-bar); Cancel stops the read. While iNaturalist is fetched: "Looking up “sam”…" with the
// spinner, then "Fetching your observations · 1,000 of 4,341" over the progress line, and Cancel. A read or fetch shows
// only after RUN_DELAY, so a quick file read shows only its done line. When an import lands: "Done · 282 from
// iNaturalist" (the summary's first part); the first birds into an empty list "Your collage has 282 species"; a Refresh
// or Replace of a source that had birds adds what changed, "Done · 282 from iNaturalist · 4 new species" (or "no new
// species"); for DONE_MS, longer while hovered or focused. An iNaturalist fetch that fails shows its message for DONE_MS
// too (the fetch outlives the dialog; the row keeps the words); a file's error or a cancel closes it, their words in the
// source's row. It never takes focus. Under reduced motion the spinner is a still ring.
import { useEffect, useState } from 'react'
import { Toast } from '@/components/app/Toast'
import { inatMessage, type ImportJobs, type InatJob, type Landed } from '@/components/app/use-import-jobs'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import { slotSource } from '@/lib/list/model'
import '@/components/share/share.css' // .eb-share-bar, the site's progress line

/** How long the done line stays (ms), while not hovered or focused. */
export const DONE_MS = 3000 // Yusuf, 2026-11-21: 3 to 5 s at most
/** A read or fetch shorter than this shows no running toast, only its done line. */
export const RUN_DELAY = 400

export function ImportToast({ jobs }: { jobs: ImportJobs }) {
  const { t } = useI18n()
  const ti = t.import.inat
  const file = [jobs.ebird, jobs.obsorg, jobs.sheet, jobs.scythebill, jobs.igoterra].find((j) => j.busy)
  const inat = jobs.inat.busyFor ? jobs.inat : null
  const busy = !!file || !!inat

  // Running, shown once it has lasted RUN_DELAY.
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!busy) return
    const id = setTimeout(() => setSlow(true), RUN_DELAY)
    return () => { clearTimeout(id); setSlow(false) }
  }, [busy])

  // The last import that landed, until its line has stayed its time (or a newer toast replaced it).
  const [done, setDone] = useState<Landed | null>(null)
  const [seen, setSeen] = useState(jobs.landed?.at)
  if (jobs.landed?.at !== seen) {
    setSeen(jobs.landed?.at)
    setDone(jobs.landed)
  }
  if (busy && done) setDone(null) // a new import: the last one's line is over (a cancel or error must not bring it back)

  // An iNaturalist fetch that failed, shown for DONE_MS (a new error object is a new failure).
  const [failed, setFailed] = useState<{ error: NonNullable<InatJob['error']>; at: number } | null>(null)
  const [errSeen, setErrSeen] = useState(jobs.inat.error)
  if (jobs.inat.error !== errSeen) {
    setErrSeen(jobs.inat.error)
    setFailed(jobs.inat.error ? { error: jobs.inat.error, at: (failed?.at ?? 0) + 1 } : null)
  }
  if (busy && failed) setFailed(null)

  const running = busy && slow
  const progress = inat?.progress ?? null
  const n = (x: number) => formatInt(x, t.num)
  let body = null
  if (running && inat) {
    body = (
      <span className="eb-toast-import">
        <span className="eb-toast-line">
          {!progress && <span className="eb-toast-spin" aria-hidden="true" />}
          <span>{progress ? <>{ti.progress}<span aria-hidden="true">{` · ${fmt(ti.fetched, { n: n(progress.fetched), total: n(progress.total) })}`}</span></> : fmt(ti.lookingUp, { user: inat.busyFor! })}</span>
        </span>
        {progress && (
          <span
            className="eb-share-bar" role="progressbar" aria-label={ti.progress}
            aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.fetched}
            aria-valuetext={fmt(ti.fetched, { n: n(progress.fetched), total: n(progress.total) })}
          >
            <span className="eb-share-bar-fill" style={{ width: `${(100 * progress.fetched) / Math.max(progress.total, 1)}%` }} />
          </span>
        )}
      </span>
    )
  } else if (running && file) {
    const pct = file.frac !== undefined ? Math.floor(100 * file.frac) : null
    const line = (
      <span className="eb-toast-line">
        {pct === null && <span className="eb-toast-spin" aria-hidden="true" />}
        {/* The count changes every few hundred rows: read once, shown as it climbs. */}
        <span className="eb-sr">{t.import.ebird.reading}</span>
        <span aria-hidden="true">
          {file.rows ? plural(t.import.ebird.readingRows, file.rows, { n: n(file.rows) }) : t.import.ebird.reading}
          {pct !== null && ` · ${fmt(t.import.ebird.percent, { n: n(pct) })}`}
        </span>
      </span>
    )
    body = pct === null ? line : (
      <span className="eb-toast-import">
        {line}
        <span
          className="eb-share-bar" role="progressbar" aria-label={t.import.ebird.reading}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={fmt(t.import.ebird.percent, { n: n(pct) })}
        >
          <span className="eb-share-bar-fill" style={{ width: `${pct}%` }} />
        </span>
      </span>
    )
  } else if (!busy && done) {
    const first = plural(t.import.summary.first[slotSource(done.slot)], done.species, { n: n(done.species) })
    body = (
      <span>
        {done.first
          ? plural(t.import.summary.head, done.species, { n: n(done.species) })
          : fmt(t.import.toastDone, {
            result: done.added === undefined ? first : `${first} · ${done.added ? plural(t.import.toastNew, done.added, { n: n(done.added) }) : t.import.toastNone}`,
          })}
      </span>
    )
  } else if (!busy && failed) {
    body = <span>{inatMessage(failed.error.code, failed.error.user, t)}</span>
  }
  return (
    <Toast
      show={!!body}
      stay={running ? undefined : DONE_MS}
      restart={running ? 'running' : body && failed && !done ? `fail${failed.at}` : done?.at}
      onDone={() => { setDone(null); setFailed(null) }}
      testId="import-toast"
    >
      {body}
      {running && inat && <button type="button" className="eb-textbtn" onClick={jobs.cancelInat}>{ti.cancel}</button>}
      {running && file && <button type="button" className="eb-textbtn" onClick={jobs.cancelFile} data-testid="import-cancel">{ti.cancel}</button>}
    </Toast>
  )
}
