'use client'
import { FileCsv } from '@/components/phosphor-icons'
import { useState, type DragEvent, type Ref } from 'react'
import { useI18n } from '@/i18n/I18nProvider'

/**
 * Inside a file row's Add panel: the dashed `.eb-dropzone` with the primary picker button (the FileCsv glyph and
 * `label`) and "or drop it here". The drop itself is taken by the whole group (useFileDrop).
 */
export function FileDropzone({ label, disabled, onPick, buttonRef }: { label: string; disabled?: boolean; onPick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  const { t } = useI18n()
  return (
    <div className="eb-dropzone">
      <button ref={buttonRef} type="button" className="eb-btn" disabled={disabled} onClick={onPick}>
        <FileCsv aria-hidden="true" focusable="false" />
        {label}
      </button>
      <span className="eb-note eb-drop-hint">{t.import.ebird.drop}</span>
    </div>
  )
}

/**
 * A file group's drop target (`.eb-filedrop`): `over` while a file is dragged over it (data-over rings it), and the
 * handlers for its dragover, dragleave and drop. A dropped file goes to `onFile` unless `disabled`.
 */
export function useFileDrop(onFile: (file: File | undefined) => void, disabled?: boolean) {
  const [over, setOver] = useState(false)
  const handlers = {
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(true) },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setOver(false)
      if (!disabled) onFile(e.dataTransfer?.files?.[0])
    },
  }
  return { over, handlers }
}
