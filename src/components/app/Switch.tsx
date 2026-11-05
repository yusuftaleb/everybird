'use client'
import '@/components/collage/collage.css'

/** A labelled on/off switch with a sliding knob (the True size switch's look). */
export function Switch({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} className="eb-switch eb-switch-row" disabled={disabled} onClick={() => onChange(!checked)}>
      <span>{label}</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
}
