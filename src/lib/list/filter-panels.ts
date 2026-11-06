// The filters' panels: taxonomy (orders, then families) is always on show; Places and Time are toggles that open their
// panel (one at a time; tapping the open one closes it). Opening or closing a panel never changes the filter.
import type { Filter, FilterLevel } from './filters'

export type Panel = 'places' | 'time'
/** What a panel can choose: Places a country; Time a range of months (`from`/`to`) or a trip (with its months). */
export type PanelKey = Exclude<FilterLevel, 'year'> | 'range'
export const PANEL_LEVELS: Record<Panel, PanelKey[]> = { places: ['country'], time: ['range', 'trip'] }

/** The open panel after tapping `p`'s toggle. */
export function togglePanel(open: Panel | null, p: Panel): Panel | null {
  return open === p ? null : p
}

const isSet = (f: Filter, k: PanelKey) => (k === 'range' ? !!(f.from || f.to) && !f.trip : !!f[k]) // a trip names its own months

/** What closed (and not hidden) panels have chosen: they show as removable chips. */
export function closedPanelLevels(f: Filter, open: Panel | null, hidden: readonly Panel[] = []): PanelKey[] {
  return (Object.keys(PANEL_LEVELS) as Panel[])
    .filter((p) => p !== open && !hidden.includes(p))
    .flatMap((p) => PANEL_LEVELS[p].filter((k) => isSet(f, k)))
}
