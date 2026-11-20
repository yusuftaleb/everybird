// The landing sample's guided tour (src/components/app/Tour.tsx): shown once per device, in localStorage, as the welcome
// is (welcome.ts). Ended or skipped, it never shows again; without storage it shows at most once per page load.
export const TOUR_KEY = 'everybird:toured'

let doneThisLoad = false

export function toured(): boolean {
  if (doneThisLoad) return true
  try {
    return localStorage.getItem(TOUR_KEY) === '1'
  } catch {
    return false
  }
}

export function rememberToured(): void {
  doneThisLoad = true
  try {
    localStorage.setItem(TOUR_KEY, '1')
  } catch {
    // Storage blocked or full: the in-memory flag keeps it closed until the next load.
  }
}

/** Tests only: forget the in-memory flag. */
export function resetTouredForTests(): void {
  doneThisLoad = false
}
