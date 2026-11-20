// The "Dark image" choice for the share images and the poster (the Style panel): the app's theme until the birder
// sets it, then that choice for the rest of the page load. Never stored, as when the switch lived in the share dialog.
import { useSyncExternalStore } from 'react'
import { currentTheme } from './theme'

let chosen: boolean | null = null
const listeners = new Set<() => void>()

export function darkImage(): boolean {
  return chosen ?? currentTheme() === 'dark'
}

export function setDarkImage(on: boolean): void {
  chosen = on
  for (const f of listeners) f()
}

function subscribe(f: () => void): () => void {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

export function useDarkImage(): boolean {
  return useSyncExternalStore(subscribe, darkImage, () => false)
}

/** Tests only: back to following the theme. */
export function resetDarkImageForTests(): void {
  chosen = null
}
