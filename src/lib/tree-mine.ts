// The Tree view's per-device choices, kept in localStorage, the same in every tab; without storage a choice holds for
// the page load. "Lifers only" (the Display panel's switch; TreeView reads it, and the tree's share image follows it),
// off when unset or unreadable; "Time scale" (the Display panel's switch, round 6: branches at their true ages, or the
// splits spaced evenly by branching order), on unless turned off; Down to (round 6, the Display panel's: the rank the
// tree draws at the least, under every branch), unset until one is picked (the one step under the open branch); and the Layout choice (the Display panel's) (also the share dialog's Arrangement row), unset until one is picked, when the view draws the fan from
// FAN_FROM px wide (where it names every tip) and rows under it. The stored values keep their first names: 'fan' is the
// Fan, 'circle' the Radial and 'rows' the Rectangular layout.
import { useSyncExternalStore } from 'react'
import { RANKS, type TipRank } from '@/lib/tree/levels'

export const TREE_MINE_KEY = 'everybird:tree-mine'
export const TREE_LAYOUT_KEY = 'everybird:tree-layout'
export const TREE_TIME_KEY = 'everybird:tree-time'
export const TREE_DOWN_KEY = 'everybird:tree-down'

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
const timeStore = stored(TREE_TIME_KEY)
const downStore = stored(TREE_DOWN_KEY)

export const treeMine = (): boolean => mineStore.get() === '1'
export const setTreeMine = (on: boolean): void => mineStore.set(on ? '1' : null)
export function useTreeMine(): boolean {
  return useSyncExternalStore(mineStore.subscribe, treeMine, () => false)
}

/** Whether the tree is drawn on its time scale: on unless turned off ('0' stored; on removes the key). */
const treeTime = (): boolean => timeStore.get() !== '0'
export const setTreeTime = (on: boolean): void => timeStore.set(on ? null : '0')
export function useTreeTime(): boolean {
  return useSyncExternalStore(timeStore.subscribe, treeTime, () => true)
}

/** The Down to rank picked on this device, or null (none yet, or a value this version doesn't know): the tree draws the
 *  deeper of it and the one step under the open branch. */
export function treeDown(): TipRank | null {
  const v = downStore.get()
  return RANKS.includes(v as TipRank) ? (v as TipRank) : null
}
export const setTreeDown = (v: TipRank | null): void => downStore.set(v)
export function useTreeDown(): TipRank | null {
  return useSyncExternalStore(downStore.subscribe, treeDown, () => null)
}

/** The layout picked on this device, or null (none yet, or a value this version doesn't know). */
export function treeLayout(): TreeLayout | null {
  const v = layoutStore.get()
  return TREE_LAYOUTS.includes(v as TreeLayout) ? (v as TreeLayout) : null
}
/** null forgets the pick (the view's default again). */
export const setTreeLayout = (v: TreeLayout | null): void => layoutStore.set(v)
export function useTreeLayout(): TreeLayout | null {
  return useSyncExternalStore(layoutStore.subscribe, treeLayout, () => null)
}
