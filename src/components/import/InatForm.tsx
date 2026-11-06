'use client'
import { useId, useState, type FormEvent } from 'react'
import type { InatJob } from '@/components/app/use-import-jobs'
import type { InatDetails } from '@/lib/list/storage'
import { inatLine, SourceLine } from './SourceLine'

type Props = {
  job: InatJob
  onFetch: (login: string) => void
  onCancel: () => void
  disabled?: boolean
  /** iNaturalist birds are on the list. */
  replaces?: boolean
  /** What is known of the account (its username, once fetched by this version). */
  details?: InatDetails
  onRemove?: () => void
}

/**
 * iNaturalist: a username; public wild bird observations are fetched above the routes (survives navigation). Once
 * connected, the account shows with Refresh (fetches the remembered username again, no retyping) and Remove; another
 * username sits behind "Use a different username". Cancel aborts a fetch and leaves the list as it was.
 */
export function InatForm({ job, onFetch, onCancel, disabled, replaces, details, onRemove }: Props) {
  const id = useId()
  const [user, setUser] = useState('')
  const [other, setOther] = useState(false)
  const { busyFor, progress, error, note } = job
  const known = replaces ? details?.user : undefined
  // A fetch landed under a new username: fold the form away again.
  const [lastKnown, setLastKnown] = useState(known)
  if (lastKnown !== known) {
    setLastKnown(known)
    setOther(false)
    setUser('')
  }
  // The form shows when nothing is connected, when the username isn't known (a list saved before v3), or on request.
  const showForm = !replaces || !known || other
  const refreshing = !!busyFor && !!known && busyFor === known && !other

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || busyFor) return
    onFetch(user)
  }
  const line = inatLine(known ? details : undefined)

  return (
    <div className="eb-way-body">
      {replaces && (
        <div className="eb-sources">
          <SourceLine
            testId="source-inat"
            name={line.name}
            meta={line.meta}
            what="your iNaturalist birds"
            disabled={disabled || !!busyFor}
            onRemove={() => onRemove?.()}
            actions={
              known ? (
                refreshing ? (
                  <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" onClick={onCancel}>Cancel</button>
                ) : (
                  <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={disabled || !!busyFor} onClick={() => onFetch(known)} aria-label={`Refresh ${known} from iNaturalist`}>
                    Refresh
                  </button>
                )
              ) : null
            }
          />
        </div>
      )}
      {replaces && known && (
        <button type="button" className="eb-textbtn eb-inat-other" aria-expanded={other} aria-controls={`${id}-form`} onClick={() => setOther((o) => !o)}>
          {other ? 'Keep this username' : 'Use a different username'}
        </button>
      )}
      {showForm && (
        <form id={`${id}-form`} className="eb-inat-form" onSubmit={submit}>
          <label htmlFor={id} className="eb-sr">iNaturalist username</label>
          <div className="eb-way-control eb-row">
            <input
              id={id}
              className="eb-input"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="username"
              placeholder="iNaturalist username"
              value={busyFor && !user && !refreshing ? busyFor : user}
              disabled={disabled}
              onChange={(e) => setUser(e.target.value)}
            />
            {busyFor && !refreshing ? (
              <button type="button" className="eb-btn eb-btn-quiet" onClick={onCancel}>Cancel</button>
            ) : (
              <button type="submit" className="eb-btn" disabled={disabled || !user.trim() || !!busyFor}>Fetch my birds</button>
            )}
          </div>
        </form>
      )}
      <p className="eb-status" role="status">
        {busyFor ? (progress ? `Fetched ${progress.fetched.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}` : `Looking up “${busyFor}”…`) : note ?? ''}
      </p>
      {error && <p className="eb-error" role="alert">{error}</p>}
      <ul className="eb-way-notes">
        <li className="eb-note">Use your username, not your display name. Only public, wild bird observations identified to species count.</li>
        <li className="eb-note">iNaturalist sees the username; your list stays here, and so does the username.</li>
        {replaces && <li className="eb-note">{known ? 'Refresh' : 'Fetching again'} replaces only your iNaturalist birds. Your edits stay.</li>}
      </ul>
    </div>
  )
}
