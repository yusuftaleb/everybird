// The Tree view's per-device choices, kept in localStorage, the same in every tab; without storage a choice holds for
// the page load. "Lifers only" (the bar's switch; TreeView reads it, and the tree's share image follows it), off when
// unset or unreadable; and the Layout menu's choice, unset until one is picked, when the view draws the fan from
// FAN_FROM px wide (where it names every tip) and rows under it. The stored values keep their first names: 'fan' is the
// Fan, 'circle' the Radial and 'rows' the Rectangular layout.
import { useSyncExternalStore } from 'react'

export const TREE_MINE_KEY = 'everybird:tree-mine'
export const TREE_LAYOUT_KEY = 'everybird:tree-layout'

export type TreeLayout = 'fan' | 'circle' | 'rows'
export const TREE_LAYOUTS: readonly TreeLayout[] = ['fan', 'circle', 'rows']

/** One stored string: read, written (null removes it) and watched. */
function stored(key: string) {
  let memory: string | null | undefined
  const listeners = new Set<() => void>()
  const get = (): string | null => {
    if (memory !== undefined) return memory
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  }
  const set = (v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(key)
      else localStorage.setItem(key, v)
      memory = undefined
    } catch {
      memory = v
    }
    for (const f of listeners) f()
  }
  const subscribe = (f: () => void) => {
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === key) f() }
    listeners.add(f)
    window.addEventListener('storage', onStorage)
    return () => { listeners.delete(f); window.removeEventListener('storage', onStorage) }
  }
  return { get, set, subscribe }
}

const mineStore = stored(TREE_MINE_KEY)
const layoutStore = stored(TREE_LAYOUT_KEY)

export const treeMine = (): boolean => mineStore.get() === '1'
export const setTreeMine = (on: boolean): void => mineStore.set(on ? '1' : null)
export function useTreeMine(): boolean {
  return useSyncExternalStore(mineStore.subscribe, treeMine, () => false)
}

/** The layout picked on this device, or null (none yet, or a value this version doesn't know). */
export function treeLayout(): TreeLayout | null {
  const v = layoutStore.get()
  return TREE_LAYOUTS.includes(v as TreeLayout) ? (v as TreeLayout) : null
}
export const setTreeLayout = (v: TreeLayout): void => layoutStore.set(v)
export function useTreeLayout(): TreeLayout | null {
  return useSyncExternalStore(layoutStore.subscribe, treeLayout, () => null)
}
