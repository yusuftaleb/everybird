'use client'
import { memo } from 'react'
import { Switch } from '@/components/app/Switch'
import type { Rules } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'

/** The birder's own counting rules, on top of eBird's defaults. */
export const RulesSwitches = memo(function RulesSwitches({ rules, dispatch }: { rules: Rules; dispatch: (a: Action) => void }) {
  const set = (k: keyof Rules) => (on: boolean) => dispatch({ type: 'rules', rules: { ...rules, [k]: on } })
  return (
    <section className="eb-block" aria-labelledby="eb-rules-h">
      <h2 id="eb-rules-h" className="eb-h2">Your rules</h2>
      <p className="eb-note">Only full species count, as on eBird. Subspecies roll up into their species.</p>
      <div className="eb-rules">
        <Switch label="Hide heard-only birds" checked={rules.hideHeard} onChange={set('hideHeard')} />
        <Switch label="Hide found-dead birds" checked={rules.hideDead} onChange={set('hideDead')} />
        <Switch label="iNaturalist: research grade only" checked={rules.researchOnly} onChange={set('researchOnly')} />
      </div>
    </section>
  )
})
