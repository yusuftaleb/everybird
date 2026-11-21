// How the collage places the birds, Fit or Oval: a per-device choice kept in localStorage, Packed when unset, unreadable
// or a value no longer offered (the dropped 'family' and 'colour'), the same in every tab. One setting for the collage
// on the page (the Display panel's Arrangement in the Collage view), the share images and the poster (the share
// dialog's Arrangement row): changing it in either changes the other.
import { Circle, Rectangle, type Icon } from '@phosphor-icons/react'
import { useSyncExternalStore } from 'react'

/** 'oval': packed inside the ellipse inscribed in the frame (pack.ts packBest's and packFrame's `oval`). */
export type Arrangement = 'packed' | 'oval'
export const ARRANGEMENTS: readonly Arrangement[] = ['packed', 'oval']

export const ARRANGEMENT_KEY = 'everybird:arrangement'

/** Fit or Oval's icons: the frame the birds fill, or the oval they sit in. */
export const ARRANGE_ICON: Record<Arrangement, Icon> = { packed: Rectangle, oval: Circle }

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
