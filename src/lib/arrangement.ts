// The collage's arrangement (Packed, By family, By colour; src/lib/layout/arrange.ts), a per-device choice like the
// lifer marks (lifer-marks.ts): kept in localStorage, Packed when unset or unreadable, the same in every tab. The
// collage, the share images and the poster all follow it.
import { useSyncExternalStore } from 'react'
import { ARRANGEMENTS, type Arrangement } from './layout/arrange'

export const ARRANGEMENT_KEY = 'everybird:arrangement'

let memory: Arrangement | null = null
const listeners = new Set<() => void>()
const bump = () => { for (const f of listeners) f() }

export function arrangement(): Arrangement {
  if (memory) return memory
  try {
    const v = localStorage.getItem(ARRANGEMENT_KEY)
    return (ARRANGEMENTS as readonly string[]).includes(v ?? '') ? (v as Arrangement) : 'packed'
  } catch {
    return 'packed'
  }
}

export function setArrangement(a: Arrangement): void {
  try {
    if (a === 'packed') localStorage.removeItem(ARRANGEMENT_KEY)
    else localStorage.setItem(ARRANGEMENT_KEY, a)
    memory = null
  } catch {
    memory = a
  }
  bump()
}

function subscribe(f: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === ARRANGEMENT_KEY) f() }
  listeners.add(f)
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(f); window.removeEventListener('storage', onStorage) }
}

export function useArrangement(): Arrangement {
  return useSyncExternalStore(subscribe, arrangement, () => 'packed')
}
