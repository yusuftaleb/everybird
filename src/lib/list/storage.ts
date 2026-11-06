import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import { DEFAULT_RULES } from './model'
import { SLOTS, slotSource } from './model'
import type { Edits, ImportResult, Rules, Slot, SourceRecord, Unmatched } from './model'

/** Where an eBird file came from (the slot says it too: 'ebird' is the full export, 'ebird-list' the life list). */
export type EbirdDetails = {
  kind: 'full-export' | 'life-list'
  /** The file's name, as the browser gave it. Stays on this device. */
  file?: string
  /** Data rows read from the file. */
  rows?: number
  /** When it was imported (ISO). */
  at?: string
}
/** The iNaturalist account fetched. The username stays on this device (it was sent to iNaturalist by the birder). */
export type InatDetails = { user?: string; observations?: number; at?: string }
/**
 * What each connected source is, for "Your sources" on a return visit and its Refresh. A slot with records but no
 * entry here was imported before v3: its details are unknown.
 */
export type SourceDetails = { ebird?: EbirdDetails; 'ebird-list'?: EbirdDetails; inat?: InatDetails }
/** The details an import into `slot` carries. */
export type DetailsFor<S extends Slot> = S extends 'inat' ? InatDetails : S extends 'ebird' | 'ebird-list' ? EbirdDetails : never

/**
 * The stored list. v2 (Task PL) added seen-here (`SourceRecord.seen`, `Unmatched.seen`); a v1 list is the same shape
 * without it. v3 added `sources` (each source's details); v1 and v2 lists migrate by their version number alone and
 * have no details until a source is imported again. The IndexedDB key keeps its v1 name.
 */
export type Saved = {
  v: 3
  /** Records per slot (model.ts `Slot`): the two eBird files side by side, then iNaturalist and manual. */
  records: Record<Slot, SourceRecord[]>
  unmatched: Unmatched[]
  edits: Edits
  rules: Rules
  name?: string
  /** Rows per source that are not countable species (sp., slash, hybrid, domestic), for the match report. */
  skipped?: Partial<Record<Slot, number>>
  /** Each source's details (v3). Absent for lists saved before v3 and for sources not connected. */
  sources?: SourceDetails
  savedAt: string
}

export const STORAGE_KEY = 'everybird:v1'

export function emptySaved(): Saved {
  return {
    v: 3,
    records: { ebird: [], 'ebird-list': [], inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { ...DEFAULT_RULES },
    savedAt: new Date().toISOString(),
  }
}

// Session-wide fallback. Once IndexedDB fails (Safari private mode, quota), we stay
// memory-only until the page reloads, so the UI never flip-flops between states.
// Created lazily so a throwing indexedDB.open surfaces inside save/load, where we can catch it.
let store: UseStore | null = null
function getStore(): UseStore {
  return (store ??= createStore('everybird', 'kv'))
}

let memory: Saved | null = null
let memoryOnly = false

/** True when this session's list can't be written to the device ("This list won't be saved on this device"). */
export function isMemoryOnly(): boolean {
  return memoryOnly
}

export async function save(s: Saved): Promise<'saved' | 'memory-only'> {
  memory = s
  if (memoryOnly) return 'memory-only'
  try {
    await set(STORAGE_KEY, s, getStore())
    return 'saved'
  } catch {
    memoryOnly = true
    return 'memory-only'
  }
}

/** Pause before load()'s one retry: long enough for a transient IndexedDB hiccup (a blocked open, a busy tab). */
export const LOAD_RETRY_MS = 150

/**
 * Bring a list saved by an older Everybird up to the current shape. v1 -> v2: the version only (v2 added seen-here,
 * which a v1 list lacks until its files are imported again; until then its lifer places stand in). v2 -> v3: the
 * version only (v3 added `sources`; an older list's sources show "details unknown" until imported again). Lists saved
 * before the second eBird slot have no records['ebird-list']; it is added empty. Their eBird records stay in
 * 'ebird' and their fix keys ("ebird:12") still match. Returns the same object when nothing needed changing.
 */
export function migrateSaved(s: Saved): Saved {
  const missing = SLOTS.filter((k) => !Array.isArray((s.records as Partial<Saved['records']>)[k]))
  if (!missing.length && s.v === 3) return s
  const records = { ...s.records }
  for (const k of missing) records[k] = []
  return { ...s, v: 3, records }
}

export async function load(): Promise<Saved | null> {
  if (memoryOnly) return memory
  for (let attempt = 0; ; attempt++) {
    try {
      const raw = (await get(STORAGE_KEY, getStore())) as Saved | undefined
      const got = raw ? migrateSaved(raw) : undefined
      // Migrate in place: write the new shape back (best effort; the next save writes it anyway).
      if (got && got !== raw) void set(STORAGE_KEY, got, getStore()).catch(() => {})
      if (got) memory = got
      return got ?? null
    } catch {
      if (attempt === 0) {
        // One retry with a fresh connection (idb-keyval keeps a failed open's promise) before giving up.
        store = null
        await new Promise((r) => setTimeout(r, LOAD_RETRY_MS))
        continue
      }
      memoryOnly = true
      return memory
    }
  }
}

/**
 * Clears memory and the device copy. 'failed' means the device copy may still exist
 * (the UI says "Couldn't clear this device's copy"); memory is cleared either way.
 * The delete is attempted even when memory-only, since an earlier copy may still be on the device.
 */
export async function forget(): Promise<'forgotten' | 'failed'> {
  memory = null
  try {
    await del(STORAGE_KEY, getStore())
    return 'forgotten'
  } catch {
    memoryOnly = true
    return 'failed'
  }
}

/**
 * Re-import into one slot: replaces records[slot] and that slot's unmatched rows (stamped with the slot when it
 * differs from their source, so "ebird-list:12" and "ebird:12" never collide). Other slots, edits, rules and name
 * are untouched. Caveat: edits.fixes keys ("slot:row") are kept, but row numbers can differ in the new file, so a
 * fix may now point at a different row. We keep them rather than silently dropping user edits.
 */
export function replaceSource<S extends Slot>(saved: Saved, slot: S, result: ImportResult, details?: DetailsFor<S>): Saved {
  const stamped = slot === slotSource(slot) ? result.unmatched : result.unmatched.map((u) => ({ ...u, slot }))
  const out: Saved = {
    ...migrateSaved(saved),
    records: { ...migrateSaved(saved).records, [slot]: result.records },
    unmatched: [...saved.unmatched.filter((u: Unmatched) => (u.slot ?? u.source) !== slot), ...stamped],
    skipped: { ...saved.skipped, [slot]: result.skipped },
    savedAt: new Date().toISOString(),
  }
  if (details && slot !== 'manual') out.sources = { ...saved.sources, [slot]: details }
  return out
}

/**
 * Disconnect one source: its records, its unmatched rows, its skipped count and its details go; every other slot,
 * edits (marks, removals, hand-added birds, fixes), rules and name stay. A fix whose row is gone simply matches
 * nothing.
 */
export function removeSource(saved: Saved, slot: Slot): Saved {
  const m = migrateSaved(saved)
  const out: Saved = {
    ...m,
    records: { ...m.records, [slot]: [] },
    unmatched: m.unmatched.filter((u) => (u.slot ?? u.source) !== slot),
    savedAt: new Date().toISOString(),
  }
  if (m.skipped) {
    const { [slot]: _gone, ...rest } = m.skipped
    void _gone
    out.skipped = rest
  }
  if (m.sources) {
    const { [slot as keyof SourceDetails]: _gone, ...rest } = m.sources
    void _gone
    out.sources = rest
  }
  return out
}
