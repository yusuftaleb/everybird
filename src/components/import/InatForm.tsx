'use client'
import { useId, useState, type FormEvent } from 'react'
import type { InatJob } from '@/components/app/use-import-jobs'
import { countParts, type RowCount } from '@/lib/list/source-counts'
import type { InatDetails, Saved } from '@/lib/list/storage'
import { notCounted } from './NotCounted'
import { HowTo, inatLine, SourceRow } from './SourceLine'

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
  /** For the row's skipped entries. */
  saved?: Saved
  /** The row's species and "only here" (source-counts.ts). */
  counts?: RowCount
}

/**
 * iNaturalist's row (Settings > Your list), one quiet row: "iNaturalist · username" over "220 species · 11 only here ·
 * 10 skipped · Updated 6 Nov", or "Not added". Not added: "Add" opens the panel (what counts, the username field, "How do I find
 * my username?"). Connected: Refresh (fetches the remembered username again, no retyping; Cancel while it runs) and a
 * ⋯ menu (Refresh, Change username, Remove); Change username opens the same panel. The field only shows when adding
 * or changing the username, or when a connected account's username isn't known (a list saved before v3). Public wild
 * bird observations are fetched above the routes (survives navigation). Cancel aborts a fetch and leaves the list as
 * it was.
 */
export function InatForm({ job, onFetch, onCancel, disabled, replaces, details, onRemove, saved, counts }: Props) {
  const id = useId()
  const [user, setUser] = useState('')
  const [open, setOpen] = useState(false)
  const { busyFor, progress, error, note } = job
  const known = replaces ? details?.user : undefined
  // A fetch landed under a new username: fold the panel away again.
  const [lastKnown, setLastKnown] = useState(known)
  if (lastKnown !== known) {
    setLastKnown(known)
    setOpen(false)
    setUser('')
  }
  const refreshing = !!busyFor && !!known && busyFor === known && !open
  // The panel shows on Add or Change username, while a new username is fetched, and when a connected account's
  // username isn't known (a list saved before v3).
  const unknown = !!replaces && !known
  const showPanel = open || (!!busyFor && !refreshing) || unknown

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!user.trim() || busyFor) return
    onFetch(user)
  }
  const line = inatLine(known ? details : undefined)
  const off = disabled || !!busyFor
  const refresh = () => known && onFetch(known)

  let primary
  if (refreshing) primary = <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" onClick={onCancel}>Cancel</button>
  else if (known) {
    primary = (
      <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={refresh} aria-label={`Refresh ${known} from iNaturalist`}>
        Refresh
      </button>
    )
  } else if (!replaces) {
    primary = (
      <button
        type="button"
        className="eb-btn eb-btn-quiet eb-btn-sm"
        aria-expanded={showPanel}
        aria-controls={`${id}-panel`}
        aria-label="Add iNaturalist"
        disabled={disabled || (!!busyFor && !open)}
        onClick={() => setOpen((o) => !o)}
      >
        Add
      </button>
    )
  }

  return (
    <SourceRow
      testId={replaces ? 'source-inat' : undefined}
      title="iNaturalist"
      name={replaces ? line.name : undefined}
      parts={replaces ? line.parts : ['Not added']}
      counts={replaces && counts ? countParts(counts) : undefined}
      skipped={replaces && saved ? notCounted(saved, ['inat']) ?? undefined : undefined}
      what={replaces ? 'your iNaturalist birds' : undefined}
      disabled={off}
      onRemove={() => onRemove?.()}
      menu={
        replaces
          ? [
              ...(known ? [{ label: 'Refresh', onSelect: refresh }] : []),
              ...(unknown ? [] : [{ label: 'Change username', keepFocus: true, onSelect: () => setOpen(true) }]),
            ]
          : undefined
      }
      primary={primary}
    >
      <div id={`${id}-panel`} className="eb-src-panel" hidden={!showPanel} role="group" aria-label={known ? 'Change username' : 'Add iNaturalist'}>
        <p className="eb-note">
          Your public, wild bird observations identified to species. iNaturalist sees the username; your list stays here.
          {replaces ? ' Fetching replaces only your iNaturalist birds. Your edits stay.' : ''}
        </p>
        {showPanel && (
          <form className="eb-src-form" onSubmit={submit}>
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
                // Opened by Add or Change username: straight into the field.
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
              {known && open && !busyFor && (
                // Changing the username, thought better of: fold the panel, focus back on the row's ⋯ menu.
                <button
                  type="button"
                  className="eb-btn eb-btn-quiet"
                  onClick={(e) => {
                    const menu = e.currentTarget.closest('.eb-src')?.querySelector<HTMLButtonElement>('.eb-menubtn')
                    setOpen(false)
                    setUser('')
                    menu?.focus()
                  }}
                >
                  Keep {known}
                </button>
              )}
            </div>
          </form>
        )}
        <HowTo label="How do I find my username?">
          <p>Use your username (on your iNaturalist profile, after the @), not your display name. Only public, wild bird observations identified to species count.</p>
        </HowTo>
      </div>
      <p className="eb-status eb-src-status" role="status">
        {busyFor ? (progress ? `Fetched ${progress.fetched.toLocaleString('en-US')} of ${progress.total.toLocaleString('en-US')}` : `Looking up “${busyFor}”…`) : note ?? ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{error}</p>}
    </SourceRow>
  )
}
