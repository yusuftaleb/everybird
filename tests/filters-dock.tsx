import type { ReactNode } from 'react'
import { useFiltersUi } from '@/components/filters/Filters'

type Args = Parameters<typeof useFiltersUi>[0]

/** The dock's Filters button, the chip row and the panel wired as CollageView wires them (tests only). */
export function FiltersDock({ shown = 0, ...args }: Omit<Args, 'shown'> & { shown?: number }): ReactNode {
  const ui = useFiltersUi({ ...args, shown })
  return (
    <div className="eb-dockwrap">
      <div className="eb-dock">{ui.button}</div>
      {ui.below}
    </div>
  )
}
