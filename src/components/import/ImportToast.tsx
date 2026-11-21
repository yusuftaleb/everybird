'use client'
// Every import's one toast (round 6 menu audit, item 7: no progress in the sources grid), on the site's toast (Toast.tsx),
// mounted once in EverybirdProvider so an iNaturalist fetch keeps its toast on whatever page the birder moves to. While
// a file is read: "Reading your file… 1,200 rows" with a small spinner (a file's total isn't known); while iNaturalist is
// fetched: "Looking up “sam”…" with the spinner, then "Fetching your observations · 1,000 of 4,341" over a thin progress
// line (the share dialog's .eb-share-bar) and Cancel. A read or fetch shows only after RUN_DELAY, so a quick file read
// shows only its done line. When an import lands: "Done · 282 from iNaturalist" (the summary's first part), for DONE_MS,
// longer while hovered or focused. An error or a cancel closes it: their words stay in the source's row. It never takes
// focus. Under reduced motion the spinner is a still ring.
import { useEffect, useState } from 'react'
import { Toast } from '@/components/app/Toast'
import type { ImportJobs, Landed } from '@/components/app/use-import-jobs'
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
    body = (
      <span className="eb-toast-line">
        <span className="eb-toast-spin" aria-hidden="true" />
        {/* The count changes every few hundred rows: read once, shown as it climbs. */}
        <span className="eb-sr">{t.import.ebird.reading}</span>
        <span aria-hidden="true">{file.rows ? plural(t.import.ebird.readingRows, file.rows, { n: n(file.rows) }) : t.import.ebird.reading}</span>
      </span>
    )
  } else if (!busy && done) {
    body = <span>{fmt(t.import.toastDone, { result: plural(t.import.summary.first[slotSource(done.slot)], done.species, { n: n(done.species) }) })}</span>
  }
  return (
    <Toast
      show={!!body}
      stay={running ? undefined : DONE_MS}
      restart={running ? 'running' : done?.at}
      onDone={() => setDone(null)}
      testId="import-toast"
    >
      {body}
      {running && inat && <button type="button" className="eb-textbtn" onClick={jobs.cancelInat}>{ti.cancel}</button>}
    </Toast>
  )
}
