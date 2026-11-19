// The view a birder had (filters, the search and its typed text, the Filters panel, the layout switches) survives a
// language switch. The switch reloads the page (chooseLang, i18n/choose.ts), which would reset all of it. stashResume()
// writes what each owner offered, just before that reload, under one versioned sessionStorage key. The first claims on
// the new page read it once, delete it, and claim each slice once, only within RESUME_TTL_MS of the switch. A normal
// load finds no key and restores nothing.
// Only canonical values go in: filter codes and ids, the typed search text, section ids and booleans. No label is
// stored, so the labels are drawn in the new language. Storage errors are ignored: the page then behaves as it does today.
import { isContinentId } from './places/continents'
import { isRegionPresetId } from './places/presets'
import type { Filter } from './list/filters'
import { STATUS_FILTER_CATS, type StatusFilterCat } from './species/status-filter'

export const RESUME_KEY = 'everybird:resume:v1'
export const RESUME_TTL_MS = 60_000
const VERSION = 1

export type CollageResume = {
  filter: Filter
  mode: 'even' | 'true'
  view: 'collage' | 'list'
  massOrder: 'heaviest' | 'lightest'
  sci: boolean
}
/** The collage search: whether its field is open. The typed text is not carried: it would be read again in the new language. */
export type SearchResume = { open: boolean }
/** The Filters panel: open, and the section it was opened at (absent: the button). */
export type PanelResume = { open: boolean; at?: 'time' | 'places' | 'status' }
export type Resume = { collage: CollageResume; search: SearchResume; panel: PanelResume }
export type Slice = keyof Resume
const SLICES: readonly Slice[] = ['collage', 'search', 'panel']

type Slices = Partial<Resume>
export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const str = (v: unknown, max: number): string | undefined => (typeof v === 'string' ? v.slice(0, max) : undefined)
const bool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
const one = <T extends string>(v: unknown, ok: readonly T[]): T | undefined => (ok.includes(v as T) ? (v as T) : undefined)
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 1000) : [])

/** A stored filter, keeping only the fields and values the filter knows (anything else is dropped). */
function filterOf(v: unknown): Filter {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const f: Filter = {}
  for (const k of ['order', 'family', 'group', 'year', 'from', 'to'] as const) {
    const s = str(r[k], 64)
    if (s) f[k] = s
  }
  for (const k of ['countries', 'provinces', 'counties'] as const) {
    const a = strings(r[k])
    if (a.length) f[k] = a
  }
  const continents = strings(r.continents).filter(isContinentId)
  if (continents.length) f.continents = continents
  const regions = strings(r.regions).filter(isRegionPresetId)
  if (regions.length) f.regions = regions
  const statuses = strings(r.statuses).filter((x): x is StatusFilterCat => (STATUS_FILTER_CATS as readonly string[]).includes(x))
  if (statuses.length) f.statuses = statuses
  const basis = one(r.basis, ['lifer', 'seen'] as const)
  if (basis) f.basis = basis
  return f
}

/** The stored slices, each checked; a slice that does not check is left out. */
function slicesOf(v: unknown): Slices {
  const r = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const out: Slices = {}
  const c = (r.collage ?? undefined) as Record<string, unknown> | undefined
  if (c && typeof c === 'object') {
    const mode = one(c.mode, ['even', 'true'] as const)
    const view = one(c.view, ['collage', 'list'] as const)
    const massOrder = one(c.massOrder, ['heaviest', 'lightest'] as const)
    const sci = bool(c.sci)
    if (mode && view && massOrder && sci !== undefined) out.collage = { filter: filterOf(c.filter), mode, view, massOrder, sci }
  }
  const s = (r.search ?? undefined) as Record<string, unknown> | undefined
  if (s && typeof s === 'object' && bool(s.open) !== undefined) out.search = { open: bool(s.open)! }
  const p = (r.panel ?? undefined) as Record<string, unknown> | undefined
  if (p && typeof p === 'object' && bool(p.open) !== undefined) {
    const at = one(p.at, ['time', 'places', 'status'] as const)
    out.panel = at ? { open: bool(p.open)!, at } : { open: bool(p.open)! }
  }
  return out
}

/** The session's storage, or null where it is blocked or missing. */
export function sessionStore(): Store | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

/** Writes the slices with their time. A failed write is ignored: the switch still happens, without the restore. */
export function writeResume(store: Store | null, slices: Slices, now: number): void {
  if (!store) return
  try {
    store.setItem(RESUME_KEY, JSON.stringify({ v: VERSION, at: now, slices }))
  } catch {
    // Storage full or blocked.
  }
}

/** The stored slices, when a current-version record is there and within the TTL. Always removes the record. */
export function readResume(store: Store | null, now: number): { at: number; slices: Slices } | null {
  if (!store) return null
  try {
    const raw = store.getItem(RESUME_KEY)
    if (raw === null) return null
    store.removeItem(RESUME_KEY)
    const p = JSON.parse(raw) as { v?: unknown; at?: unknown; slices?: unknown } | null
    if (!p || p.v !== VERSION || typeof p.at !== 'number') return null
    if (now < p.at || now - p.at > RESUME_TTL_MS) return null
    return { at: p.at, slices: slicesOf(p.slices) }
  } catch {
    return null
  }
}

type Readers = Record<Slice, (() => unknown) | undefined>
const readers: Readers = { collage: undefined, search: undefined, panel: undefined }

/** Registers how to read one slice when the language changes. Returns the unregister function (on unmount). */
export function offerResume<K extends Slice>(slice: K, read: () => Resume[K] | undefined): () => void {
  readers[slice] = read
  return () => {
    if (readers[slice] === read) readers[slice] = undefined
  }
}

/** Called by chooseLang just before the reload. The search and the Filters panel never open together, so the panel is left out when the search is open. */
export function stashResume(now: number = Date.now(), store: Store | null = sessionStore()): void {
  const slices: Slices = {}
  for (const k of SLICES) {
    try {
      const v = readers[k]?.()
      if (v) (slices as Record<Slice, unknown>)[k] = v
    } catch {
      // This owner's slice is left out; the others still carry over.
    }
  }
  if (slices.search?.open) delete slices.panel
  writeResume(store, slices, now)
}

let loaded: { at: number; slices: Slices } | null | undefined
const claimed = new Set<Slice>()

/**
 * The slice carried over the switch, to the first claimant of it, once per page. The record is read on the first claim
 * and deleted then; a claim after the TTL gets nothing. A normal load has no record, so every claim gets undefined.
 */
export function takeResume<K extends Slice>(slice: K, now: number = Date.now(), store: Store | null = sessionStore()): Resume[K] | undefined {
  if (loaded === undefined) loaded = readResume(store, now)
  if (!loaded || now - loaded.at > RESUME_TTL_MS || claimed.has(slice)) return undefined
  claimed.add(slice)
  return loaded.slices[slice] as Resume[K] | undefined
}

/** Tests: forget the page's record and claims, as a fresh page load would. */
export function resetResumeForTests(): void {
  loaded = undefined
  claimed.clear()
  for (const k of SLICES) readers[k] = undefined
}
