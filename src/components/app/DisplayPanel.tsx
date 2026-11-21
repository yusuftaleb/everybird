'use client'
// The controls bar's Display panel (Yusuf, 2026-11-20, round 6): what changes how the view on screen looks, in the
// Filters panel's frame (DockPanel) at a menu's width, at the bar's right end. Only what applies (dock-panels.ts
// DISPLAY_CONTROLS): in the Tree, Layout (Fan | Radial | Rectangular, a segmented control TreeView renders into
// `layoutSlot`, since it knows which layouts can name every tip; one that can't stays listed, aria-disabled, its reason
// its tooltip and accessible description), then Lifers only, Time scale and Scientific names; in the Collage,
// Arrangement (Fit | Oval, with their glyphs), True size and Scientific names. List and Map have none. The switches are
// compact rows: the label at the left, the switch at the right, 32px with a mouse and 44px for touch, no rules or boxes.
// Every setting keeps its stored value and behaviour (arrangement.ts, tree-mine.ts; True size and Scientific are the
// list store's).
import { useId, type ReactNode, type RefObject } from 'react'
import type { Icon } from '@phosphor-icons/react'
import { DockPanel } from '@/components/filters/Filters'
import { useI18n } from '@/i18n/I18nProvider'
import { ARRANGEMENTS, ARRANGE_ICON, setArrangement, useArrangement } from '@/lib/arrangement'
import { DISPLAY_CONTROLS } from '@/lib/dock-panels'
import { setTreeMine, setTreeTime, useTreeMine, useTreeTime } from '@/lib/tree-mine'
import type { ViewKind } from '@/lib/view-resume'

type Segment<V extends string> = { value: V; label: string; icon?: Icon; off?: string }

/** A labelled segmented control in the share dialog's style (`.eb-seg`): one button per choice, the chosen one pressed;
 *  a choice with `off` stays listed, aria-disabled, its reason its tooltip and accessible description. */
export function DisplaySegments<V extends string>({ label, value, options, onChange, testId }: {
  label: string; value: V; options: readonly Segment<V>[]; onChange: (v: V) => void; testId?: string
}): ReactNode {
  const id = useId()
  return (
    <div className="eb-disp-seg">
      <span id={`${id}-label`} className="eb-disp-label">{label}</span>
      <div className="eb-seg" role="group" aria-labelledby={`${id}-label`} data-testid={testId}>
        {options.map((o) => (
          <button
            key={o.value} type="button" className="eb-seg-btn" aria-pressed={value === o.value}
            aria-disabled={o.off ? true : undefined} aria-describedby={o.off ? `${id}-${o.value}` : undefined} title={o.off}
            data-value={o.value} onClick={() => { if (!o.off && o.value !== value) onChange(o.value) }}
          >
            {o.icon && <o.icon aria-hidden="true" focusable="false" />}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {options.map((o) => o.off && <span key={o.value} id={`${id}-${o.value}`} hidden>{o.off}</span>)}
    </div>
  )
}

/** One compact switch row: the label at the left, the switch at the right; the whole row is the switch. */
function DisplaySwitch({ on, onChange, label, title, testId }: { on: boolean; onChange: (on: boolean) => void; label: string; title?: string; testId?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="eb-setrow-btn eb-disp-sw" title={title} data-testid={testId} onClick={() => onChange(!on)}>
      <span className="eb-setrow-label">{label}</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
}

type Props = {
  view: ViewKind
  id: string
  buttonRef: RefObject<HTMLButtonElement | null>
  onClose: () => void
  trueSize: boolean
  onTrueSize: (on: boolean) => void
  sci: boolean
  onSci: (on: boolean) => void
  /** The Tree's Layout goes here (TreeView renders it through a portal). */
  layoutSlot?: (el: HTMLDivElement | null) => void
}

export function DisplayPanel({ view, id, buttonRef, onClose, trueSize, onTrueSize, sci, onSci, layoutSlot }: Props): ReactNode {
  const { t } = useI18n()
  const c = t.collage.controls
  const arrangement = useArrangement()
  const mine = useTreeMine()
  const time = useTreeTime()
  const control = (k: (typeof DISPLAY_CONTROLS)[ViewKind][number]) => {
    switch (k) {
      case 'layout': return <div key={k} ref={layoutSlot} className="eb-disp-slot" />
      case 'arrange': return (
        <DisplaySegments
          key={k} label={t.share.arrange.label} value={arrangement} onChange={setArrangement} testId="dock-arrange"
          options={ARRANGEMENTS.map((a) => ({ value: a, label: t.share.arrange[a], icon: ARRANGE_ICON[a] }))}
        />
      )
      case 'true': return <DisplaySwitch key={k} on={trueSize} onChange={onTrueSize} label={c.trueSize} title={c.trueTitle} testId="dock-true" />
      case 'mine': return <DisplaySwitch key={k} on={mine} onChange={setTreeMine} label={c.lifersOnly} testId="tree-mine" />
      case 'time': return <DisplaySwitch key={k} on={time} onChange={setTreeTime} label={c.timeScale} testId="tree-time" />
      case 'sci': return <DisplaySwitch key={k} on={sci} onChange={onSci} label={c.sciNames} testId="dock-sci" />
    }
  }
  const all = DISPLAY_CONTROLS[view]
  const segs = all.filter((k) => k === 'layout' || k === 'arrange')
  const switches = all.filter((k) => k !== 'layout' && k !== 'arrange')
  return (
    <DockPanel id={id} label={c.displayPanel} kind="display" testId="display-panel" buttonRef={buttonRef} onClose={onClose} sheetHead={<span className="eb-mono">{c.display}</span>}>
      <div className="eb-disp">
        {segs.map(control)}
        {switches.length > 0 && <div className="eb-disp-switches">{switches.map(control)}</div>}
      </div>
    </DockPanel>
  )
}
