import { useSyncExternalStore } from 'react'

export const MARK_NEWEST_KEY = 'everybird:mark-newest'
export const MARK_FIRST_KEY = 'everybird:mark-first'

export type LiferMark = 'newest' | 'first'
export type LiferMarks = { readonly newest: boolean; readonly first: boolean }

const KEYS: Record<LiferMark, string> = { newest: MARK_NEWEST_KEY, first: MARK_FIRST_KEY }
const OFF: LiferMarks = { newest: false, first: false }
const memory: Partial<Record<LiferMark, boolean>> = {}
let cache: LiferMarks | null = null
const listeners = new Set<() => void>()
const bump = () => { cache = null; for (const f of listeners) f() }

function read(mark: LiferMark): boolean {
  const kept = memory[mark]
  if (kept !== undefined) return kept
  try {
    return localStorage.getItem(KEYS[mark]) === '1'
  } catch {
    return false
  }
}

export function liferMarks(): LiferMarks {
  if (!cache) {
    const newest = read('newest'), first = read('first')
    cache = newest || first ? { newest, first } : OFF
  }
  return cache
}

export function setLiferMark(mark: LiferMark, on: boolean): void {
  try {
    if (on) localStorage.setItem(KEYS[mark], '1')
    else localStorage.removeItem(KEYS[mark])
    delete memory[mark]
  } catch {
    memory[mark] = on
  }
  bump()
}

let stopStorage: (() => void) | null = null

export function subscribeLiferMarks(f: () => void): () => void {
  if (listeners.size === 0) {
    cache = null
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === MARK_NEWEST_KEY || e.key === MARK_FIRST_KEY) bump() }
    window.addEventListener('storage', onStorage)
    stopStorage = () => window.removeEventListener('storage', onStorage)
  }
  listeners.add(f)
  return () => {
    listeners.delete(f)
    if (listeners.size === 0) { stopStorage?.(); stopStorage = null }
  }
}

export function useLiferMarks(): LiferMarks {
  return useSyncExternalStore(subscribeLiferMarks, liferMarks, () => OFF)
}
