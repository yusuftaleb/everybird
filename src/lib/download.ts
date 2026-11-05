const REVOKE_AFTER_MS = 40_000

/** Save text as a file through a temporary object URL (nothing leaves the browser). */
export function downloadText(text: string, filename: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Some browsers (Safari, Firefox on Android) read the blob after click() returns: keep it alive a while.
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_AFTER_MS)
}

/** "2026-11-05", for file names. */
export const today = () => new Date().toISOString().slice(0, 10)
