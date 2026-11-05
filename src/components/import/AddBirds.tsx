'use client'
import { useId, useMemo, useState, type FormEvent } from 'react'
import { track } from '@/lib/analytics'
import { stripBracket } from '@/lib/import/places'
import type { Edits, Place, SourceRecord } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import type { SpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { SpeciesSearch } from './SpeciesSearch'

type Props = {
  species: SpeciesIndex
  regions: Regions
  edits: Edits
  dispatch: (a: Action) => void
  disabled?: boolean
  /** No records from any source and nothing added by hand yet: this tick starts a hand-made collage. */
  listEmpty?: boolean
}

const DATE_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/

/** 'YYYY-MM-DD' | 'YYYY-MM' | 'YYYY', a real calendar date not in the future; else null. Empty is ''. */
export function parseManualDate(raw: string): string | null {
  const s = raw.trim()
  if (!s) return ''
  const m = DATE_RE.exec(s)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), m[2] ? Number(m[2]) : 1, m[3] ? Number(m[3]) : 1]
  if (y < 1800 || mo < 1 || mo > 12) return null
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  if (dt.getTime() > Date.now()) return null
  return s
}

/** Tick by hand: search a bird, add a date and a region if you like. Writes edits.added and un-removes it. */
export function AddBirds({ species, regions, edits, dispatch, disabled, listEmpty }: Props) {
  const ids = useId()
  const [bird, setBird] = useState<SpeciesRow | null>(null)
  const [date, setDate] = useState('')
  const [country, setCountry] = useState('')
  const [sub1, setSub1] = useState('')
  const [dateError, setDateError] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const countries = useMemo(
    () => Object.entries(regions.countries).map(([iso, name]) => [iso, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1])),
    [regions],
  )
  const subs = useMemo(
    () => (country ? Object.entries(regions.sub1).filter(([c]) => c.startsWith(`${country}-`)).map(([c, name]) => [c, stripBracket(name)] as const).sort((a, b) => a[1].localeCompare(b[1])) : []),
    [regions, country],
  )

  const reset = () => { setBird(null); setDate(''); setCountry(''); setSub1(''); setDateError(false) }

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!bird) return
    const d = parseManualDate(date)
    if (d === null) { setDateError(true); return }
    const rec: SourceRecord = { code: bird.code, source: 'manual' }
    if (d) rec.date = d
    if (country) {
      const place: Place = { country }
      if (sub1) place.sub1 = sub1
      rec.place = place
    }
    dispatch({
      type: 'edit',
      edits: { ...edits, removed: edits.removed.filter((c) => c !== bird.code), added: [...edits.added.filter((r) => r.code !== bird.code), rec] },
    })
    // Only a tick into an empty list starts a hand-made collage; ticks onto an existing list are edits.
    if (listEmpty) track('collage_made', { source: 'manual' })
    setDone(`Added ${bird.com}.`)
    reset()
  }

  return (
    <div className="eb-way-body">
      {!bird ? (
        <SpeciesSearch species={species} label="Search birds" onPick={(r) => { setBird(r); setDone(null) }} />
      ) : (
        <form className="eb-tick" onSubmit={add} aria-label={`Add ${bird.com}`}>
          <p className="eb-tick-bird"><span className="eb-hit-com">{bird.com}</span> <i className="eb-hit-sci">{bird.sci}</i></p>
          <label htmlFor={`${ids}-d`} className="eb-label">Date (optional)</label>
          <input
            id={`${ids}-d`}
            className="eb-input"
            inputMode="numeric"
            placeholder="YYYY-MM-DD, YYYY-MM or YYYY"
            value={date}
            aria-invalid={dateError || undefined}
            aria-describedby={dateError ? `${ids}-de` : undefined}
            onChange={(e) => { setDate(e.target.value); setDateError(false) }}
          />
          {dateError && <p id={`${ids}-de`} className="eb-error">Use YYYY-MM-DD, YYYY-MM or YYYY.</p>}
          <label htmlFor={`${ids}-c`} className="eb-label">Country (optional)</label>
          <select id={`${ids}-c`} className="eb-input" value={country} onChange={(e) => { setCountry(e.target.value); setSub1('') }}>
            <option value="">None</option>
            {countries.map(([iso, name]) => <option key={iso} value={iso}>{name}</option>)}
          </select>
          {subs.length > 0 && (
            <>
              <label htmlFor={`${ids}-s`} className="eb-label">Region (optional)</label>
              <select id={`${ids}-s`} className="eb-input" value={sub1} onChange={(e) => setSub1(e.target.value)}>
                <option value="">Whole country</option>
                {subs.map(([c, name]) => <option key={c} value={c}>{name}</option>)}
              </select>
            </>
          )}
          <div className="eb-row">
            <button type="submit" className="eb-btn" disabled={disabled}>Add to my list</button>
            <button type="button" className="eb-btn eb-btn-quiet" onClick={reset}>Cancel</button>
          </div>
        </form>
      )}
      <p className="eb-status" role="status">{done ?? ''}</p>
      <p className="eb-note">No upload, no account. Birds you add here join any file or username you bring.</p>
    </div>
  )
}
