'use client'
import { X } from '@phosphor-icons/react'
import { useId, useRef, type ReactNode } from 'react'
import { trapTab, useEscapeCapture, useFocusInAndBack } from '@/components/dialog-utils'
import './filters.css'

type Props = { title: string; onClose: () => void; children: ReactNode }

/** Phone bottom sheet for a list of chips. Modal: Esc and the scrim close it, Tab stays inside, focus returns to the opener. */
export function PickerSheet({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEscapeCapture(onClose)
  useFocusInAndBack(ref)
  return (
    <div className="eb-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div
        ref={ref}
        className="eb-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => trapTab(e, ref.current)}
      >
        <div className="eb-sheet-head">
          <h2 id={titleId} className="eb-sheet-title">{title}</h2>
          <button type="button" className="eb-sheet-close" aria-label="Close" onClick={onClose}>
            <X aria-hidden="true" focusable="false" weight="bold" />
          </button>
        </div>
        <div className="eb-sheet-body">{children}</div>
      </div>
    </div>
  )
}
