'use client'
import { useI18n } from '@/i18n/I18nProvider'
import type { Everybird } from './EverybirdProvider'

function MemoryNotice() {
  const { t } = useI18n()
  return (
    <p className="eb-notice" role="status">
      {t.collage.notices.memory}
    </p>
  )
}

/** Load failures and a failed forget, shown on every page of the app. */
export function AppNotices({ eb, memory = true, failure = true }: { eb: Everybird; memory?: boolean; failure?: boolean }) {
  const { t } = useI18n()
  return (
    <>
      {eb.meta.forgetOutcome === 'failed' && (
        <p className="eb-error eb-notice" role="alert">{t.collage.notices.forgetFailed}</p>
      )}
      {failure && eb.failed && <p className="eb-error eb-notice" role="alert">{t.collage.notices.loadFailed}</p>}
      {memory && eb.state.persistence === 'memory-only' && <MemoryNotice />}
    </>
  )
}
