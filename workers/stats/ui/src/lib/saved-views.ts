// Saved Explore views: up to 20 { name, hash } pairs, stored by the UI under VIEWS_KEY in browser storage.
// Parsing is defensive: a corrupt or oversized value reads as no views.
export type SavedView = { name: string; hash: string }
export const VIEWS_KEY = 'everybird:analytics-views'
export const MAX_VIEWS = 20

/** The saved views in a stored value, dropping anything malformed; at most MAX_VIEWS. */
export function parseViews(raw: string | null): SavedView[] {
  try {
    const text = raw || '[]'
    if (text.length > 100000) return []
    const a: unknown = JSON.parse(text)
    return Array.isArray(a) ? a.filter((v): v is SavedView => !!v && typeof v.name === 'string' && typeof v.hash === 'string').slice(0, MAX_VIEWS) : []
  } catch { return [] }
}
/** The list after saving a view under a name: a view of the same name is replaced; the oldest drop past MAX_VIEWS. */
export function withView(views: SavedView[], name: string, hash: string): SavedView[] {
  return [...views.filter((v) => v.name !== name), { name, hash }].slice(-MAX_VIEWS)
}
