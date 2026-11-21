// The Map view's zoom and pan (MapView), as yusuftaleb.com's places map has them: a view is a centre and a zoom on the
// world layer's fixed box (w × h units), clamped so the whole world is the farthest out, the zoom never past the point
// where the outlines start to show their corners (maxZoom), and the view never leaves the world.

export type View = { cx: number; cy: number; zoom: number }

/**
 * The typical coast edge of the map's source, Natural Earth's 1:50m countries, in map units (Equal Earth, 2000 units
 * wide): its median segment is 0.50 units, about 10 km. tests/map-data.test.ts checks the committed file stays this fine.
 */
export const MAP_EDGE = 0.5
/** How long, in CSS px, that edge may get at the deepest zoom: a few pixels, past which the coasts look like polygons. */
export const EDGE_PX = 3

/** The deepest zoom for a world `w` units wide drawn `px` CSS px wide at zoom 1: where MAP_EDGE reaches EDGE_PX (at least 1). */
export function maxZoom(px: number, w: number): number {
  return px > 0 ? Math.max(1, (EDGE_PX * w) / (MAP_EDGE * px)) : 1
}

/** The whole world. */
export const worldView = (w: number, h: number): View => ({ cx: w / 2, cy: h / 2, zoom: 1 })

/** `v` kept between the whole world and `max`, its centre moved so the view stays inside the world. */
export function clampView(v: View, w: number, h: number, max: number): View {
  const zoom = Math.min(Math.max(1, max), Math.max(1, v.zoom))
  const hw = w / zoom / 2, hh = h / zoom / 2
  return { zoom, cx: Math.min(w - hw, Math.max(hw, v.cx)), cy: Math.min(h - hh, Math.max(hh, v.cy)) }
}

/** `v` at `zoom`, the point `f` (map units) staying where it is on screen: a pinch or a trackpad zooms where it is. */
export function zoomAt(v: View, zoom: number, f: { x: number; y: number }): View {
  const k = v.zoom / zoom
  return { zoom, cx: f.x + (v.cx - f.x) * k, cy: f.y + (v.cy - f.y) * k }
}

/** The svg view box of `v`. */
export function viewBoxOf(v: View, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const bw = w / v.zoom, bh = h / v.zoom
  return { x: v.cx - bw / 2, y: v.cy - bh / 2, w: bw, h: bh }
}
