// How the share images and the poster place the birds (the share dialog's Packed / Oval), a per-device choice like the
// lifer marks (lifer-marks.ts): kept in localStorage, Packed when unset, unreadable or a value no longer offered (the
// dropped 'family' and 'colour'), the same in every tab. The collage on the page is always packed.
import { useSyncExternalStore } from 'react'

/** 'oval': Packed inside the ellipse inscribed in the frame (pack.ts packFrame's `oval`). */
export type Arrangement = 'packed' | 'oval'
export const ARRANGEMENTS: readonly Arrangement[] = ['packed', 'oval']

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
