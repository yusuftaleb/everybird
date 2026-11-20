// The Tree view's "Lifers only" (the bar's switch in Tree view; TreeView reads it, and the tree's share image follows
// it): a per-device choice like the lifer marks (lifer-marks.ts), kept in localStorage, off when unset or unreadable,
// the same in every tab. Without storage the choice holds for the page load.
import { useSyncExternalStore } from 'react'

export const TREE_MINE_KEY = 'everybird:tree-mine'

let memory: boolean | null = null
const listeners = new Set<() => void>()

export function treeMine(): boolean {
  if (memory !== null) return memory
  try {
    return localStorage.getItem(TREE_MINE_KEY) === '1'
  } catch {
    return false
  }
}

export function setTreeMine(on: boolean): void {
  try {
    if (on) localStorage.setItem(TREE_MINE_KEY, '1')
    else localStorage.removeItem(TREE_MINE_KEY)
    memory = null
  } catch {
    memory = on
  }
  for (const f of listeners) f()
}

function subscribe(f: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === TREE_MINE_KEY) f() }
  listeners.add(f)
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(f); window.removeEventListener('storage', onStorage) }
}

export function useTreeMine(): boolean {
  return useSyncExternalStore(subscribe, treeMine, () => false)
}
