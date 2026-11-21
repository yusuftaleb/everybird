'use client'
import { UploadSimple } from '@/components/phosphor-icons'
import { useId, useState } from 'react'
import { useI18n } from '@/i18n/I18nProvider'
import { BackupError, fromJson } from '@/lib/list/export'
import type { Saved } from '@/lib/list/storage'

/** "Restore from backup": reads a JSON backup made by "Download JSON backup". Bad files get a plain message: the lead,
 *  then why (English: fromJson's own message, which names the malformed part; other languages word the reason). */
export function RestoreBackup({ onRestore, disabled }: { onRestore: (s: Saved) => void; disabled?: boolean }) {
  const id = useId()
  const { lang, t } = useI18n()
  const d = t.settings.data
  const [error, setError] = useState<string | null>(null)
  const read = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    try {
      onRestore(fromJson(await file.text()))
    } catch (e) {
      // English shows BackupError's own, more specific message (what the restore tests pin); the other languages show
      // restoreWhy, whose English strings are the translators' source text and are never rendered in English.
      const why = e instanceof BackupError && lang !== 'en'
        ? { json: d.restoreWhy.json, 'not-backup': d.restoreWhy.notBackup, version: d.restoreWhy.version, damaged: d.restoreWhy.damaged }[e.reason]
        : lang === 'en' && e instanceof Error ? e.message : ''
      setError(`${d.restoreFailed} ${why}`.trim())
    } finally {
      input.value = ''
    }
  }
  return (
    <>
      <label htmlFor={id} className="eb-btn eb-btn-quiet" data-disabled={disabled || undefined}>
        <UploadSimple aria-hidden="true" focusable="false" />
        {d.restore}
      </label>
      <input id={id} className="eb-sr" type="file" accept=".json,application/json" disabled={disabled} onChange={(e) => void read(e.currentTarget)} />
      {error && <p className="eb-error eb-tools-msg" role="alert">{error}</p>}
    </>
  )
}
