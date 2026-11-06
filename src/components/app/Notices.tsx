'use client'
import type { Everybird } from './EverybirdProvider'

export function MemoryNotice() {
  return (
    <p className="eb-notice" role="status">
      This list won&apos;t be saved on this device. Your browser is blocking storage (private browsing does this), so download a backup before you leave.
    </p>
  )
}

/** Load failures and a failed forget, shown on every page of the app. */
export function AppNotices({ eb, memory = true, failure = true }: { eb: Everybird; memory?: boolean; failure?: boolean }) {
  return (
    <>
      {eb.meta.forgetOutcome === 'failed' && (
        <p className="eb-error eb-notice" role="alert">Couldn&apos;t clear this device&apos;s copy. Clear this site&apos;s data in your browser settings to remove it.</p>
      )}
      {failure && eb.failed && <p className="eb-error eb-notice" role="alert">Couldn&apos;t load the bird data. Check your connection and reload the page.</p>}
      {memory && eb.state.persistence === 'memory-only' && <MemoryNotice />}
    </>
  )
}
