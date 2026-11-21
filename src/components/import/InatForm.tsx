'use client'
import { useId, useState, type FormEvent } from 'react'
import { inatMessage, type InatJob } from '@/components/app/use-import-jobs'
import { fmt } from '@/i18n/core'
import { useI18n } from '@/i18n/I18nProvider'
import { countParts, type RowCount } from '@/lib/list/source-counts'
import type { InatDetails, Saved } from '@/lib/list/storage'
import { useAddPanel } from './add-panel'
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
 * ⋯ menu (Change username, Remove; Refresh is the button, never repeated in it); Change username opens the same panel. The field only shows when adding
 * or changing the username, or when a connected account's username isn't known (a list saved before v3). Public wild
 * bird observations are fetched above the routes (survives navigation); the fetch shows in the import toast
 * (ImportToast: "Fetching your observations · 600 of 16,544" over a progress line, with Cancel), never in the grid.
 * Cancel aborts a fetch and leaves the list as it was.
 */
export function InatForm({ job, onFetch, onCancel, disabled, replaces, details, onRemove, saved, counts }: Props) {
  const id = useId()
  const { t } = useI18n()
  const ti = t.import.inat
  const [user, setUser] = useState('')
  // The open Add panel, shared by every source (one at a time; ImportPanel folds this one when a fetch lands under a
  // new username).
  const [panel, setPanel] = useAddPanel()
  const open = panel === 'inat'
  const setOpen = (on: boolean) => setPanel('inat', on)
  const { busyFor, error, note } = job
  const known = replaces ? details?.user : undefined
  // A fetch landed under a new username: the field starts empty again.
  const [lastKnown, setLastKnown] = useState(known)
  if (lastKnown !== known) {
    setLastKnown(known)
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
  const line = inatLine(known ? details : undefined, t)
  const off = disabled || !!busyFor
  const refresh = () => known && onFetch(known)

  let primary
  if (refreshing) primary = <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" onClick={onCancel}>{ti.cancel}</button>
  else if (known) {
    primary = (
      <button type="button" className="eb-btn eb-btn-quiet eb-btn-sm" disabled={off} onClick={refresh} aria-label={fmt(ti.refreshLabel, { user: known })}>
        {ti.refresh}
      </button>
    )
  } else if (!replaces) {
    primary = (
      <button
        type="button"
        className="eb-btn eb-btn-quiet eb-btn-sm"
        aria-expanded={showPanel}
        aria-controls={`${id}-panel`}
        aria-label={fmt(t.import.addLabel, { title: 'iNaturalist' })}
        disabled={disabled || (!!busyFor && !open)}
        onClick={() => setOpen(!open)}
      >
        {t.import.add}
      </button>
    )
  }

  return (
    <SourceRow
      testId={replaces ? 'source-inat' : undefined}
      title="iNaturalist"
      name={replaces ? line.name : undefined}
      parts={replaces ? line.parts : [t.import.notAdded]}
      counts={replaces && counts ? countParts(counts, t) : undefined}
      skipped={replaces && saved ? notCounted(saved, ['inat'], t) ?? undefined : undefined}
      what={replaces ? ti.what : undefined}
      disabled={off}
      onRemove={() => onRemove?.()}
      // Refresh is the row's button, so not in the menu too (round 6 menu audit, item 6: no item repeats a visible button).
      menu={replaces && !unknown ? [{ label: ti.change, keepFocus: true, onSelect: () => setOpen(true) }] : undefined}
      primary={primary}
    >
      <div id={`${id}-panel`} className="eb-src-panel" hidden={!showPanel} role="group" aria-label={known ? ti.change : fmt(t.import.addLabel, { title: 'iNaturalist' })}>
        <p className="eb-note">
          {ti.guide}
          {replaces ? ` ${ti.guideReplaces}` : ''}
        </p>
        {showPanel && (
          <form className="eb-src-form" onSubmit={submit}>
            <label htmlFor={id} className="eb-sr">{ti.username}</label>
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
                placeholder={ti.username}
                // Opened by Add or Change username: straight into the field.
                autoFocus={open}
                value={busyFor && !user && !refreshing ? busyFor : user}
                disabled={disabled}
                onChange={(e) => setUser(e.target.value)}
              />
              {busyFor && !refreshing ? (
                <button type="button" className="eb-btn eb-btn-quiet" onClick={onCancel}>{ti.cancel}</button>
              ) : (
                <button type="submit" className="eb-btn" disabled={disabled || !user.trim() || !!busyFor}>{ti.fetch}</button>
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
                  {fmt(ti.keepUser, { user: known })}
                </button>
              )}
            </div>
          </form>
        )}
        <HowTo label={ti.howTo}>
          <p>{ti.help}</p>
        </HowTo>
      </div>
      <p className="eb-status eb-src-status" role="status">
        {/* The fetch's progress is the import toast's (ImportToast); the row keeps only a cancel's word. */}
        {!busyFor && note === 'cancelled' ? ti.cancelled : ''}
      </p>
      {error && <p className="eb-error eb-src-status" role="alert">{inatMessage(error.code, error.user, t)}</p>}
    </SourceRow>
  )
}
