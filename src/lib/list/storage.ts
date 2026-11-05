import { createStore, del, get, set, type UseStore } from 'idb-keyval'
import { DEFAULT_RULES } from './model'
import type { Edits, ImportResult, Rules, Source, SourceRecord, Unmatched } from './model'

export type Saved = {
  v: 1
  records: Record<Source, SourceRecord[]>
  unmatched: Unmatched[]
  edits: Edits
  rules: Rules
  name?: string
  savedAt: string
}

export const STORAGE_KEY = 'everybird:v1'

export function emptySaved(): Saved {
  return {
    v: 1,
    records: { ebird: [], inat: [], manual: [] },
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

export async function load(): Promise<Saved | null> {
  if (memoryOnly) return memory
  try {
    const got = (await get(STORAGE_KEY, getStore())) as Saved | undefined
    if (got) memory = got
    return got ?? null
  } catch {
    memoryOnly = true
    return memory
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
 * Re-import of one source: replaces records[source] and that source's unmatched rows.
 * Other sources, edits, rules and name are untouched. Caveat: edits.fixes keys
 * ("source:row") are kept, but row numbers can differ in the new file, so a fix may now
 * point at a different row. We keep them rather than silently dropping user edits.
 */
export function replaceSource(saved: Saved, source: Source, result: ImportResult): Saved {
  return {
    ...saved,
    records: { ...saved.records, [source]: result.records },
    unmatched: [...saved.unmatched.filter((u) => u.source !== source), ...result.unmatched],
    savedAt: new Date().toISOString(),
  }
}
