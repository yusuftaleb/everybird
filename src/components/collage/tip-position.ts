// Where the hover tooltip goes (LifeList.tsx's card placement): centred on the bird, 14px above it when the screen has
// room there, else 14px below, and kept 4px inside the stage wrapper. Inputs are viewport rects; the result is in
// the wrapper's own coordinates (the tooltip is absolutely placed inside it, so it scrolls with the birds).
type Rect = { left: number; top: number; width: number; height: number }

const GAP = 14
const EDGE = 4

export function tipPosition(
  bird: Rect,
  wrap: { left: number; top: number; width: number },
  tip: { w: number; h: number },
): { left: number; top: number; below: boolean } {
  const cx = bird.left + bird.width / 2 - wrap.left
  const left = Math.max(EDGE, Math.min(cx - tip.w / 2, wrap.width - tip.w - EDGE))
  const above = bird.top - GAP - tip.h >= EDGE
  const top = above ? bird.top - wrap.top - GAP - tip.h : bird.top + bird.height - wrap.top + GAP
  return { left, top, below: !above }
}
