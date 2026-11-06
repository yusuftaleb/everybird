// The first-visit welcome on / (src/components/app/Welcome.tsx): dismissed once per device, in localStorage. Every access
// is guarded; without storage the welcome shows once per page load (the in-memory flag below), and nothing breaks.
export const WELCOME_KEY = 'everybird:welcomed'

let dismissedThisLoad = false

/** Whether this device (or, without storage, this page load) has already seen and closed the welcome. */
export function welcomed(): boolean {
  if (dismissedThisLoad) return true
  try {
    return localStorage.getItem(WELCOME_KEY) === '1'
  } catch {
    return false
  }
}

/** Remember the welcome as seen: "Make mine", "Explore the sample", ✕, Esc or a press outside. */
export function rememberWelcomed(): void {
  dismissedThisLoad = true
  try {
    localStorage.setItem(WELCOME_KEY, '1')
  } catch {
    // Storage blocked or full: the in-memory flag keeps it closed until the next load.
  }
}

/** Tests only: forget the in-memory flag. */
export function resetWelcomedForTests(): void {
  dismissedThisLoad = false
}
