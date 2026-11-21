// The controls bar's three panels (Yusuf, 2026-11-20, round 6): Taxa (the taxonomy chips), Display (what changes how the
// view looks) and Filters, one open at a time. Pure: which panel a press leaves open, and which Display controls each
// view shows (List and Map have no Display panel: their few controls stay in the bar).
import type { ViewKind } from './view-resume'

export type DockPanelId = 'taxa' | 'display' | 'filters'
/** The Display panel's controls: the Tree's Layout, the Collage's Arrangement and True size, the Tree's Lifers only and
 *  Time scale, and Scientific names in both. */
export type DisplayControl = 'layout' | 'arrange' | 'true' | 'mine' | 'time' | 'sci'

export const DISPLAY_CONTROLS: Record<ViewKind, readonly DisplayControl[]> = {
  collage: ['arrange', 'true', 'sci'],
  tree: ['layout', 'mine', 'time', 'sci'],
  list: [],
  map: [],
}
/** Whether `view` has a Display panel (and button). */
export const hasDisplay = (view: ViewKind): boolean => DISPLAY_CONTROLS[view].length > 0

/** The panel open after pressing `pressed`'s button with `open` open: it opens, closing the other; pressed again, it closes. */
export const pressPanel = (open: DockPanelId | null, pressed: DockPanelId): DockPanelId | null => (open === pressed ? null : pressed)
