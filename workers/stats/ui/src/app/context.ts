import { createContext, useContext } from 'react'
import type { DimensionKey, MeasureKey, WorkspaceState } from '@/lib/workspace'

export type Actions = {
  /** Change the state (normalized, pushed to the URL) and load. */
  go: (patch: Partial<WorkspaceState>) => void
  /** Open Explore on a measure and breakdown, with optional Explore-only filters. */
  explore: (measure: MeasureKey, dimension?: DimensionKey, filters?: WorkspaceState['filters']) => void
  /** Refetch the current selection, bypassing every cache. */
  refresh: () => void
  openPalette: () => void
  dark: boolean
  toggleTheme: () => void
}
export const ActionsContext = createContext<Actions | null>(null)
export function useActions(): Actions {
  const a = useContext(ActionsContext)
  if (!a) throw new Error('ActionsContext missing')
  return a
}
