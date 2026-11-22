'use client'
import { createContext, useCallback, useContext, useState, type Dispatch, type SetStateAction } from 'react'

/** Which source's Add panel is open, by its slot ('ebird-list', 'ebird', 'inat', 'sheet', …), or none. ImportPanel
 *  holds it, so one panel is open at a time across every source; it also folds it when an import lands. */
export const AddPanels = createContext<[string | null, Dispatch<SetStateAction<string | null>>] | null>(null)

/** The open panel after `key`'s is opened (`on`) or closed: opening one closes any other; closing one leaves another
 *  source's open panel alone. */
const nextPanel = (open: string | null, key: string, on: boolean): string | null => (on ? key : open === key ? null : open)

/** The open Add panel's key and the way to open or close one. Outside ImportPanel (a source on its own), its own. */
export function useAddPanel(): [string | null, (key: string, on: boolean) => void] {
  const shared = useContext(AddPanels)
  const own = useState<string | null>(null)
  const [open, set] = shared ?? own
  const setPanel = useCallback((key: string, on: boolean) => set((o) => nextPanel(o, key, on)), [set])
  return [open, setPanel]
}
