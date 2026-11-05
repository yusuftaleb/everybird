'use client'
import { UploadSimple } from '@phosphor-icons/react'
import { useId, useState } from 'react'
import { fromJson } from '@/lib/list/export'
import type { Saved } from '@/lib/list/storage'

/** "Restore from backup": reads a JSON backup made by "Download JSON backup". Bad files get a plain message. */
export function RestoreBackup({ onRestore, disabled }: { onRestore: (s: Saved) => void; disabled?: boolean }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const read = async (input: HTMLInputElement) => {
    const file = input.files?.[0]
    if (!file) return
    setError(null)
    try {
      onRestore(fromJson(await file.text()))
    } catch (e) {
      setError(`Couldn't restore this backup. ${e instanceof Error ? e.message : ''}`.trim())
    } finally {
      input.value = ''
    }
  }
  return (
    <>
      <label htmlFor={id} className="eb-btn eb-btn-quiet" data-disabled={disabled || undefined}>
        <UploadSimple aria-hidden="true" focusable="false" />
        Restore from backup
      </label>
      <input id={id} className="eb-sr" type="file" accept=".json,application/json" disabled={disabled} onChange={(e) => void read(e.currentTarget)} />
      {error && <p className="eb-error eb-tools-msg" role="alert">{error}</p>}
    </>
  )
}
