'use client'
import { useId, useState, type FormEvent } from 'react'
import type { InatJob } from '@/components/app/use-import-jobs'

type Props = {
  job: InatJob
  onFetch: (login: string) => void
  onCancel: () => void
  disabled?: boolean
  replaces?: boolean
}

/** iNaturalist: a username; public wild bird observations are fetched above the routes (survives navigation). Cancel aborts. */
export function InatForm({ job, onFetch, onCancel, disabled, replaces }: Props) {
  const id = useId()
  const [user, setUser] = useState('')
  const { busyFor, progress, error, note } = job

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || busyFor) return
    onFetch(user)
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
          value={busyFor && !user ? busyFor : user}
          disabled={disabled}
          onChange={(e) => setUser(e.target.value)}
        />
        {busyFor ? (
          <button type="button" className="eb-btn eb-btn-quiet" onClick={onCancel}>Cancel</button>
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
