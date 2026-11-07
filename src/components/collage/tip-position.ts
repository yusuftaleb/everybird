// Where the hover tooltip goes (LifeList.tsx's card placement): centred on the bird, 14px above it when the screen has
// room there (below the shown top bar), else 14px below, and kept 4px inside the stage wrapper. Inputs are viewport rects; the result is in
// the wrapper's own coordinates (the tooltip is absolutely placed inside it, so it scrolls with the birds).
type Rect = { left: number; top: number; width: number; height: number }

const GAP = 14
const EDGE = 4

export function tipPosition(
  bird: Rect,
  wrap: { left: number; top: number; width: number; height?: number },
  tip: { w: number; h: number },
  /** The viewport's usable top: the shown top bar's bottom (headroom), so a tip never slides under it. */
  viewTop = 0,
): { left: number; top: number; below: boolean } {
  const cx = bird.left + bird.width / 2 - wrap.left
  const left = Math.max(EDGE, Math.min(cx - tip.w / 2, wrap.width - tip.w - EDGE))
  const above = bird.top - GAP - tip.h >= viewTop + EDGE
  const raw = above ? bird.top - wrap.top - GAP - tip.h : bird.top + bird.height - wrap.top + GAP
  // Inside the stage vertically too (when its height is known): a bird at the bottom edge keeps its tip on the stage.
  const top = wrap.height === undefined ? raw : Math.max(EDGE, Math.min(raw, wrap.height - tip.h - EDGE))
  return { left, top, below: !above }
}
