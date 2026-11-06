// The filters' panels: taxonomy (orders, then families) is always on show; Places and Time are toggles that open their
// panel (one at a time; tapping the open one closes it). Opening or closing a panel never changes the filter.
import type { Filter, FilterLevel } from './filters'

export type Panel = 'places' | 'time'
export const PANEL_LEVELS: Record<Panel, FilterLevel[]> = { places: ['country'], time: ['year', 'trip'] }

/** The open panel after tapping `p`'s toggle. */
export function togglePanel(open: Panel | null, p: Panel): Panel | null {
  return open === p ? null : p
}

/** The levels chosen in panels that are closed (and not hidden): they show as removable chips. */
export function closedPanelLevels(f: Filter, open: Panel | null, hidden: readonly Panel[] = []): FilterLevel[] {
  return (Object.keys(PANEL_LEVELS) as Panel[])
    .filter((p) => p !== open && !hidden.includes(p))
    .flatMap((p) => PANEL_LEVELS[p].filter((l) => f[l]))
}
