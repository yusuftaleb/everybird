// "Compare with mine" (the shared view and a shared comparison): the link they show goes to /compare through
// sessionStorage, never the address (the visit counter reports addresses, and the token is a birder's whole list).
// Written on the press, read once by the Compare page and removed. Every storage access may throw (blocked storage):
// then nothing is handed over and Compare opens empty.

export const HANDOFF_KEY = 'everybird:compare-with:v1'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const session = (): Store | null => {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/** Hand `link` (a /s/ or /c/ link, or its path) to the next Compare page in this tab. */
export function handOff(link: string, store: Store | null = session()): void {
  try {
    store?.setItem(HANDOFF_KEY, link)
  } catch {
    // storage blocked: Compare opens empty
  }
}

/** The link handed over, once: it is removed as it is read. */
export function takeHandOff(store: Store | null = session()): string | null {
  try {
    const link = store?.getItem(HANDOFF_KEY) ?? null
    store?.removeItem(HANDOFF_KEY)
    return link
  } catch {
    return null
  }
}
