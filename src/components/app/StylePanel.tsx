'use client'
// The Style panel behind the bar's Style button: what changes the look and nothing else (the Arrangement, True size and
// the lifer marks, the list's sort order, the names, and Dark image for the share images and the poster). A control
// that the current view can't use stays in place, disabled, with the reason under it (its aria-describedby), as True
// size has said "Not available by family" since By family. From 600px a popover under the bar (filters.css `.eb-drop`),
// under it the phones' bottom sheet. Esc, a press outside or focus leaving it closes the popover.
import { Palette } from '@phosphor-icons/react'
import { useCallback, useEffect, useId, useRef, type FocusEvent, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon } from '@/components/collage/icons'
import { trapTab, useEscapeCapture, useFocusInAndBack, useHoldTopBar, useIsSheet } from '@/components/dialog-utils'
import { useI18n } from '@/i18n/I18nProvider'
import { setDarkImage, useDarkImage } from '@/lib/dark-image'
import { ARRANGEMENTS, type Arrangement } from '@/lib/layout/arrange'
import { setEnglishNames } from '@/lib/species/names'
import { useEnNames } from '@/lib/species/use-names'
import type { ViewKind } from '@/lib/view-resume'

const ARRANGEMENT_LABEL = { packed: 'packed', oval: 'oval', family: 'byFamily', colour: 'byColour' } as const

export type StyleProps = {
  view: ViewKind
  trueSize: boolean
  onTrueSize: (on: boolean) => void
  /** True size can't apply (By family's rows share one height). */
  trueOff?: boolean
  arrangement?: { value: Arrangement; onChange: (a: Arrangement) => void }
  lightFirst: boolean
  onDirection: () => void
  sci: boolean
  onSci: (on: boolean) => void
  marks?: { newest: boolean; first: boolean; onNewest: (on: boolean) => void; onFirst: (on: boolean) => void }
  /** Offer Dark image (only where the bar has Share). */
  showDark?: boolean
}

/** The bar's Style button. */
export function StyleButton({ open, onOpen, buttonRef, panelId }: { open: boolean; onOpen: (o: boolean) => void; buttonRef: RefObject<HTMLButtonElement | null>; panelId: string }) {
  const { t } = useI18n()
  return (
    <button
      ref={buttonRef}
      type="button"
      className="eb-dock-tab eb-dock-drop"
      aria-expanded={open}
      aria-controls={open ? panelId : undefined}
      aria-haspopup="dialog"
      data-testid="style-button"
      onClick={() => onOpen(!open)}
    >
      <Palette aria-hidden="true" focusable="false" />
      <span className="eb-drop-label">{t.collage.controls.style}</span>
    </button>
  )
}

/** A switch row; `off` is why it can't apply here (it stays focusable and says so). */
function Toggle({ label, checked, onChange, off, testId }: { label: string; checked: boolean; onChange: (on: boolean) => void; off?: string; testId?: string }) {
  const id = useId()
  return (
    <div className="eb-style-field">
      <button
        type="button" role="switch" aria-checked={checked} aria-disabled={off ? true : undefined} aria-describedby={off ? id : undefined}
        className="eb-switch eb-style-switch" data-testid={testId} onClick={() => { if (!off) onChange(!checked) }}
      >
        <span>{label}</span>
        <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
      </button>
      {off && <p id={id} className="eb-note">{off}</p>}
    </div>
  )
}

/** A labelled group of pressed buttons (the Arrangement, the sort order); `off` as Toggle's. */
function Choice<T extends string>({ label, value, options, onChange, off, testId }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; off?: string; testId?: string }) {
  const id = useId()
  return (
    <div className="eb-style-field">
      <span id={`${id}-l`} className="eb-mono eb-fsec-title">{label}</span>
      <div className="eb-dock-arr" role="group" aria-labelledby={`${id}-l`} aria-describedby={off ? `${id}-n` : undefined} data-testid={testId}>
        {options.map((o) => (
          <button key={o.id} type="button" className="eb-dock-tab" aria-pressed={value === o.id} aria-disabled={off ? true : undefined} onClick={() => { if (!off) onChange(o.id) }}>
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {off && <p id={`${id}-n`} className="eb-note">{off}</p>}
    </div>
  )
}

export function StylePanel({ view, trueSize, onTrueSize, trueOff, arrangement, lightFirst, onDirection, sci, onSci, marks, showDark, id, buttonRef, onClose }: StyleProps & { id: string; buttonRef: RefObject<HTMLButtonElement | null>; onClose: () => void }): ReactNode {
  const { lang, t } = useI18n()
  const c = t.collage.controls
  const sheet = useIsSheet()
  const ref = useRef<HTMLDivElement>(null)
  const enNames = useEnNames()
  const darkOn = useDarkImage()
  useEscapeCapture(onClose)
  useFocusInAndBack(ref, () => buttonRef.current)
  useHoldTopBar(() => (sheet ? null : ref.current?.closest<HTMLElement>('.eb-dockwrap')))
  // A press outside the panel and its button closes the popover (the sheet has its scrim).
  useEffect(() => {
    if (sheet) return
    const down = (e: PointerEvent) => {
      const n = e.target as Node
      if (ref.current?.contains(n) || buttonRef.current?.contains(n)) return
      onClose()
    }
    document.addEventListener('pointerdown', down)
    return () => document.removeEventListener('pointerdown', down)
  }, [sheet, onClose, buttonRef])
  const onBlur = useCallback((e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (sheet || !to || ref.current?.contains(to) || buttonRef.current?.contains(to)) return
    onClose()
  }, [sheet, onClose, buttonRef])

  const collage = view === 'collage'
  const notCollage = collage ? undefined : c.onlyCollage
  const body = (
    <div
      ref={ref}
      id={id}
      className={sheet ? 'eb-sheet eb-drop-sheet' : 'eb-drop'}
      role="dialog"
      aria-modal={sheet ? true : undefined}
      aria-label={c.style}
      tabIndex={-1}
      data-kind="style"
      data-testid="style-panel"
      onBlur={onBlur}
      onKeyDown={sheet ? (e) => trapTab(e, ref.current) : undefined}
    >
      {sheet && (
        <div className="eb-sheet-head">
          <span className="eb-mono">{c.style}</span>
          <button type="button" className="eb-sheet-close" aria-label={t.collage.close} onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
      )}
      <div className="eb-drop-body">
        {arrangement && (
          <Choice
            label={c.arrangement} value={arrangement.value} onChange={arrangement.onChange} off={notCollage} testId="style-arrangement"
            options={ARRANGEMENTS.map((a) => ({ id: a, label: c[ARRANGEMENT_LABEL[a]] }))}
          />
        )}
        <Toggle label={c.trueSize} checked={trueSize && !trueOff} onChange={onTrueSize} off={notCollage ?? (trueOff ? c.trueOff : undefined)} testId="style-true" />
        {marks && <>
          <Toggle label={c.markNewest} checked={marks.newest} onChange={marks.onNewest} off={notCollage} />
          <Toggle label={c.markFirst} checked={marks.first} onChange={marks.onFirst} off={notCollage} />
        </>}
        <Choice
          label={c.sort} value={lightFirst ? 'lightest' : 'heaviest'} onChange={(v) => { if ((v === 'lightest') !== lightFirst) onDirection() }}
          off={view === 'list' ? undefined : c.onlyList} testId="style-sort"
          options={[{ id: 'heaviest', label: c.heaviestFirst }, { id: 'lightest', label: c.lightestFirst }]}
        />
        <Toggle label={c.sciNames} checked={sci} onChange={onSci} off={view === 'map' ? c.noNamesOnMap : undefined} testId="style-sci" />
        {lang !== 'en' && <Toggle label={t.settings.enNames.label} checked={enNames} onChange={setEnglishNames} />}
        {showDark && (
          <div className="eb-style-field">
            <Toggle label={t.share.dark} checked={darkOn} onChange={setDarkImage} testId="style-dark" />
            <p className="eb-note">{c.darkNote}</p>
          </div>
        )}
      </div>
    </div>
  )
  // The sheet goes to <body>, as the Filters sheet: the bar is a size container.
  return sheet
    ? createPortal(<div className="eb-sheet-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose() }}>{body}</div>, document.body)
    : body
}
