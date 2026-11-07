'use client'
import { memo, useId, useMemo } from 'react'
import type { Rules } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'
import { ruleCounts, type Action } from '@/lib/list/store'
import '@/components/collage/collage.css'

const birds = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'bird' : 'birds'}`

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
  const rules = saved.rules
  const counts = useMemo(() => ruleCounts(saved), [saved])
  const hasInat = saved.records.inat.length > 0
  const set = (k: keyof Rules) => (on: boolean) => dispatch({ type: 'rules', rules: { ...rules, [k]: on } })
  return (
    <section className="eb-block" aria-labelledby="eb-rules-h">
      <div className="eb-block-head">
        <h2 id="eb-rules-h" className="eb-h2">Counting</h2>
        <p className="eb-note">Only full species count, as on eBird; subspecies roll up into their species.</p>
      </div>
      <ul className="eb-setgroup" data-testid="rules">
        <SettingRow label="Hide heard-only birds" note={`* Birds you only heard. ${counts.heard.toLocaleString('en-US')} on your list.`} checked={rules.hideHeard} onChange={set('hideHeard')} />
        <SettingRow label="Hide found-dead birds" note={`† Birds you found dead. ${counts.dead.toLocaleString('en-US')} on your list.`} checked={rules.hideDead} onChange={set('hideDead')} />
        <SettingRow
          label="Research-grade iNaturalist only"
          note={hasInat ? `Count iNaturalist sightings only once the community agrees on the ID. Affects ${birds(counts.casual)}.` : 'For iNaturalist sightings. Add iNaturalist above to use it.'}
          checked={rules.researchOnly}
          onChange={set('researchOnly')}
          disabled={!hasInat}
        />
      </ul>
    </section>
  )
})
