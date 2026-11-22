// Light by default (never the OS setting); a per-device choice in localStorage. The inline script in
// app/[lang]/layout.tsx applies it to <html data-theme> before the first paint, so there is no flash.

export type Theme = 'light' | 'dark'
export const THEME_KEY = 'everybird:theme'

/** Runs in <head> before paint: the stored theme, or light. Kept tiny and self-contained (a string). */
export const THEME_SCRIPT = `(function(){var t="light";try{if(localStorage.getItem("${THEME_KEY}")==="dark")t="dark"}catch(e){}document.documentElement.setAttribute("data-theme",t)})()`

/** The theme on the page right now (light on the server). */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

/** On <html> while the theme switches: globals.css turns every transition off, so the colours change at once instead of
 *  each chip, dock label and tree name fading for its own colour transition. */
export const THEME_SWITCHING = 'data-theme-switching'
let unpause = 0

/** Apply a theme and remember it on this device (best effort: private modes may refuse storage). Transitions are paused
 *  for the switch and come back two frames later, once the new colours are painted. */
export function applyTheme(t: Theme): void {
  const html = document.documentElement
  html.setAttribute(THEME_SWITCHING, '')
  html.setAttribute('data-theme', t)
  cancelAnimationFrame(unpause)
  unpause = requestAnimationFrame(() => { unpause = requestAnimationFrame(() => html.removeAttribute(THEME_SWITCHING)) })
  try {
    localStorage.setItem(THEME_KEY, t)
  } catch {
    // storage blocked: the choice lasts for this page only
  }
}

/** Subscribe to theme changes ([data-theme] on <html>), for useSyncExternalStore. */
export function subscribeTheme(onChange: () => void): () => void {
  if (typeof MutationObserver !== 'function') return () => {}
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
