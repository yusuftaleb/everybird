import { WarningIcon } from '@phosphor-icons/react'
import { useState } from 'react'

/** The range's coverage notes as a thin strip under the main card: one line each, folded after two. */
export function Notices({ warnings }: { warnings: string[] }) {
  const [all, setAll] = useState(false)
  if (!warnings.length) return null
  const shown = all ? warnings : warnings.slice(0, 2)
  return (
    <div role="note" aria-label="Notes about this range" className="flex flex-col gap-1 px-1 text-[13px] leading-5 text-muted-foreground">
      <ul className="flex flex-col gap-1">
        {shown.map((w) => (
          <li key={w} className="flex gap-2">
            <WarningIcon size={14} className="mt-[3px] shrink-0 text-warning-fg" aria-hidden />
            <span>{w}</span>
          </li>
        ))}
      </ul>
      {warnings.length > 2 && (
        <button type="button" onClick={() => setAll(!all)} aria-expanded={all} className="self-start pl-[22px] text-foreground underline underline-offset-4">
          {all ? 'Show fewer' : 'Show ' + (warnings.length - 2) + ' more'}
        </button>
      )}
    </div>
  )
}
