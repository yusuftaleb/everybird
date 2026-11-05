'use client'

/**
 * The True size switch (LifeList's `.yt-ll-sci` toggle): a labelled switch with a sliding knob. On, stickers
 * are sized by mass^(1/3); off, they are "evened out" (mass^0.2). The collage morphs in place either way.
 */
export function TrueSizeSwitch({ checked, onChange, className }: { checked: boolean; onChange: (on: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={className ? `eb-switch ${className}` : 'eb-switch'}
      title="Size by body mass at true scale (big birds dwarf small ones)"
      onClick={() => onChange(!checked)}
    >
      <span>True size</span>
      <span className="eb-track" aria-hidden="true"><span className="eb-knob" /></span>
    </button>
  )
}
