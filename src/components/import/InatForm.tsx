'use client'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { importInat, type InatError, type InatProgress } from '@/lib/import/inat'
import { loadRegions } from '@/lib/import/places'
import type { ImportResult } from '@/lib/list/model'
import { loadTaxonomy } from '@/lib/species/load'

type Props = { onImport: (r: ImportResult) => void; disabled?: boolean; replaces?: boolean }

const SYNONYMS_URL = '/data/inat-synonyms.v1.json'
let synonymsP: Promise<Record<string, string>> | null = null
function loadSynonyms(): Promise<Record<string, string>> {
  synonymsP ??= fetch(SYNONYMS_URL)
    .then((r) => {
      if (!r.ok) throw new Error(String(r.status))
      return r.json() as Promise<Record<string, string>>
    })
    .catch((e) => {
      synonymsP = null
      throw e
    })
  return synonymsP
}

/** Plain messages; the rest of the list is untouched whenever one shows. */
export function inatMessage(error: InatError, user: string): string {
  switch (error) {
    case 'unknown-user':
      return `We couldn't find an iNaturalist user called “${user}”. Check the username (not the display name).`
    case 'no-birds':
      return `“${user}” has no public bird observations on iNaturalist yet.`
    case 'network':
      return "Couldn't reach iNaturalist. Check your connection and try again."
    case 'rate-limited':
      return 'iNaturalist is busy right now. Wait a minute, then try again.'
  }
}

/** iNaturalist: a username; public wild bird observations are fetched from the page. Cancel aborts. */
export function InatForm({ onImport, disabled, replaces }: Props) {
  const id = useId()
  const [user, setUser] = useState('')
  const [progress, setProgress] = useState<InatProgress | null>(null)
  const [busyFor, setBusyFor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const login = user.trim().replace(/^@/, '')
    if (!login || busyFor) return
    setError(null)
    setNote(null)
    setProgress(null)
    setBusyFor(login)
    const ctl = new AbortController()
    abort.current = ctl
    try {
      const [taxonomy, synonyms, regions] = await Promise.all([loadTaxonomy(), loadSynonyms(), loadRegions()])
      const res = await importInat(login, { taxonomy, synonyms, regions, signal: ctl.signal, onProgress: setProgress })
      if (ctl.signal.aborted) return
      if ('error' in res) setError(inatMessage(res.error, login))
      else onImport(res)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError' || ctl.signal.aborted) setNote('Cancelled. Nothing was added.')
      else setError(inatMessage('network', login))
    } finally {
      if (abort.current === ctl) abort.current = null
      setBusyFor(null)
      setProgress(null)
    }
  }

  return (
    <form className="eb-way-body" onSubmit={submit}>
      <label htmlFor={id} className="eb-label">iNaturalist username</label>
      <div className="eb-row">
        <input
          id={id}
          className="eb-input"
          type="text"
          inputMode="text"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="username"
          placeholder="your_username"
          value={user}
          disabled={disabled}
          onChange={(e) => setUser(e.target.value)}
        />
        {busyFor ? (
          <button type="button" className="eb-btn eb-btn-quiet" onClick={() => abort.current?.abort()}>Cancel</button>
        ) : (
          <button type="submit" className="eb-btn" disabled={disabled || !user.trim()}>Fetch my birds</button>
        )}
      </div>
      <p className="eb-status" role="status">
        {busyFor ? (progress ? `Fetched ${progress.fetched.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}` : `Looking up “${busyFor}”…`) : note ?? ''}
      </p>
      {error && <p className="eb-error" role="alert">{error}</p>}
      <p className="eb-note">Only public, wild bird observations identified to species. iNaturalist sees the username; your list stays here.</p>
      {replaces && <p className="eb-note">Fetching again replaces your iNaturalist birds. Your edits stay.</p>}
    </form>
  )
}
