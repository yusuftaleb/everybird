'use client'
import { memo, useId, useMemo } from 'react'
import { fmt, plural } from '@/i18n/core'
import { formatInt } from '@/i18n/format'
import { useI18n } from '@/i18n/I18nProvider'
import type { Rules } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { ruleCounts, type Action } from '@/lib/list/store'
import '@/components/collage/collage.css'

/** One settings row: the label and a one-line explanation on the left, the switch at the row's end; the whole row toggles. */
export function SettingRow({ label, note, checked, onChange, disabled }: { label: string; note: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const id = useId()
  return (
    <li className="eb-setrow">
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={`${id}-l`} aria-describedby={`${id}-n`} className="eb-setrow-btn" disabled={disabled} onClick={() => onChange(!checked)}>
        <span className="eb-setrow-text">
          <span id={`${id}-l`} className="eb-setrow-label">{label}</span>
          <span id={`${id}-n`} className="eb-setrow-note">{note}</span>
        </span>
        <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
      </button>
    </li>
  )
}

/** Settings > "Counting": the birder's own rules on top of eBird's, each with how many birds on the list it touches. */
export const RulesSwitches = memo(function RulesSwitches({ saved, dispatch }: { saved: Saved; dispatch: (a: Action) => void }) {
  const { t } = useI18n()
  const tr = t.rules
  const n = (x: number) => formatInt(x, t.num)
  const rules = saved.rules
  const counts = useMemo(() => ruleCounts(saved), [saved])
  const hasInat = saved.records.inat.length > 0
  const set = (k: keyof Rules) => (on: boolean) => dispatch({ type: 'rules', rules: { ...rules, [k]: on } })
  return (
    <section className="eb-block" aria-labelledby="eb-rules-h">
      <div className="eb-block-head">
        <h2 id="eb-rules-h" className="eb-h2">{tr.head}</h2>
        <p className="eb-note">{tr.note}</p>
      </div>
      <ul className="eb-setgroup" data-testid="rules">
        <SettingRow label={tr.heard} note={fmt(tr.heardNote, { n: n(counts.heard) })} checked={rules.hideHeard} onChange={set('hideHeard')} />
        <SettingRow label={tr.dead} note={fmt(tr.deadNote, { n: n(counts.dead) })} checked={rules.hideDead} onChange={set('hideDead')} />
        <SettingRow
          label={tr.research}
          note={hasInat ? plural(tr.researchNote, counts.casual, { n: n(counts.casual) }) : tr.researchOff}
          checked={rules.researchOnly}
          onChange={set('researchOnly')}
          disabled={!hasInat}
        />
      </ul>
    </section>
  )
})
