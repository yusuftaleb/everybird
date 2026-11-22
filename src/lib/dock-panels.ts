// The controls bar's three panels (Yusuf, 2026-11-20, round 6): Taxa (the taxonomy chips), Display (what changes how the
// view looks) and Filters, one open at a time. Pure: which panel a press leaves open, which press closes it (outside the
// dock wrap, or on the dock where it has no control), and which Display controls each view shows (List and Map have no
// Display panel: their few controls stay in the bar).
import type { ViewKind } from './view-resume'

export type DockPanelId = 'taxa' | 'display' | 'filters'
/** The Display panel's controls: the Tree's Layout, the Collage's Arrangement and True size, the Tree's Lifers only and
 *  Time scale, and Scientific names in both. */
type DisplayControl = 'layout' | 'arrange' | 'true' | 'mine' | 'time' | 'sci'

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

/** What counts as one of the dock's controls: a press on one does its own thing (a panel button switches or closes its
 *  panel); a press anywhere else on the dock closes the open panel. */
const DOCK_CONTROL = 'button, a[href], input, select, textarea, label, [role="menu"], [role="switch"], [tabindex]'

/** Whether a press on `target` closes the panel open under the dock wrap `wrap` (`.eb-dockwrap`): a press outside the
 *  wrap, or on the dock itself (`.eb-dock`) but not on one of its controls (round 6, Yusuf, 2026-11-20). The chips and
 *  the panel inside the wrap stay live. */
export function pressCloses(target: Node | null, wrap: Element | null | undefined): boolean {
  const el = target && (target.nodeType === 1 ? (target as Element) : target.parentElement)
  if (!wrap || !el || !wrap.contains(el)) return true
  const dock = el.closest('.eb-dock')
  return !!dock && wrap.contains(dock) && !el.closest(DOCK_CONTROL)
}
