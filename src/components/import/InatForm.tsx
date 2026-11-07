'use client'
import { useId, useState, type FormEvent } from 'react'
import type { InatJob } from '@/components/app/use-import-jobs'
import type { InatDetails } from '@/lib/list/storage'
import { inatLine, sourceMeta, SourceRow } from './SourceLine'

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
 * iNaturalist's row (Settings > Your list): the username, observations and date, or "Not added". The username field
 * only shows when adding one (Add) or changing it (Change); a connected account has Refresh (fetches the remembered
 * username again, no retyping) and Remove. Public wild bird observations are fetched above the routes (survives
 * navigation). Cancel aborts a fetch and leaves the list as it was.
 */
export function InatForm({ job, onFetch, onCancel, disabled, replaces, details, onRemove }: Props) {
  const id = useId()
  const [user, setUser] = useState('')
  const [open, setOpen] = useState(false)
  const { busyFor, progress, error, note } = job
  const known = replaces ? details?.user : undefined
  // A fetch landed under a new username: fold the form away again.
  const [lastKnown, setLastKnown] = useState(known)
  if (lastKnown !== known) {
    setLastKnown(known)
    setOpen(false)
    setUser('')
  }
  const refreshing = !!busyFor && !!known && busyFor === known && !open
  // The form shows on Add or Change, while a new username is fetched, and when a connected account's username isn't
  // known (a list saved before v3).
  const showForm = open || (!!busyFor && !refreshing) || (!!replaces && !known)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || busyFor) return
    onFetch(user)
  }
  const line = inatLine(known ? details : undefined)
  const toggle = (
    <button
      type="button"
      className="eb-btn eb-btn-quiet eb-btn-sm"
      aria-expanded={showForm}
      aria-controls={showForm ? `${id}-form` : undefined}
      aria-label={known ? 'Change username' : 'Add iNaturalist'}
      disabled={disabled || (!!busyFor && !refreshing && !open)}
      onClick={() => setOpen((o) => !o)}
    >
      {known ? 'Change' : 'Add'}
    </button>
  )

  return (
    <SourceRow
      testId={replaces ? 'source-inat' : undefined}
      title="iNaturalist"
      kind="public, wild observations"
      meta={replaces ? sourceMeta(line) : 'Not added'}
      help={{
        label: 'How do I find my username?',
        body: (
          <>
            <p>Use your username (on your iNaturalist profile, after the @), not your display name. Only public, wild bird observations identified to species count.</p>
            <p>iNaturalist sees the username; your list stays here, and so does the username.{replaces ? ' Refresh replaces only your iNaturalist birds. Your edits stay.' : ''}</p>
          </>
        ),
      }}
      what={replaces ? 'your iNaturalist birds' : undefined}
      disabled={disabled || !!busyFor}
      onRemove={() => onRemove?.()}
      actions={
        <>
          {known && (refreshing ? (
            <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" onClick={onCancel}>Cancel</button>
          ) : (
            <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={disabled || !!busyFor} onClick={() => onFetch(known)} aria-label={`Refresh ${known} from iNaturalist`}>
              Refresh
            </button>
          ))}
          {(known || !replaces) && toggle}
        </>
      }
    >
      {showForm && <form id={`${id}-form`} className="eb-src-form" onSubmit={submit}>
        <label htmlFor={id} className="eb-sr">iNaturalist username</label>
        <div className="eb-row eb-src-formrow">
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
            // Opened by Add or Change: straight into the field.
            autoFocus={open}
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
      </form>}
      <p className="eb-status eb-src-status" role="status">
        {busyFor ? (progress ? `Fetched ${progress.fetched.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}` : `Looking up “${busyFor}”…`) : note ?? ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{error}</p>}
    </SourceRow>
  )
}
