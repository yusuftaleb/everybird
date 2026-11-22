// Prefetch on intent (the pointer over a control, its focus, a touch), as IntentLink does for routes: the code and data a
// press on Share, Print, the Tree tab or the Map tab asks for, so the dialog or the view opens without a network wait.
// Each loader is a cached promise (import() and the data loaders), so a repeat costs nothing; a failure is left to the
// press itself, which loads again.
const quiet = (p: Promise<unknown>) => void p.catch(() => {})

/** The share dialog and the link encoder (its link index), which the dialog asks for as it opens. */
export const warmShare = () => {
  quiet(import('@/components/share/ShareDialog'))
  quiet(import('@/lib/share/make-link'))
}
/** Share's, and the poster code print mode loads. */
export const warmPrint = () => {
  warmShare()
  quiet(import('@/lib/share/poster'))
}
/** The Tree view and its tree file (parsed once, cached). */
export const warmTree = () => {
  quiet(import('@/components/tree/TreeView'))
  quiet(import('@/lib/tree/load').then((m) => m.loadTree()))
}
/** The Map view and its country shapes. */
export const warmMap = () => {
  quiet(import('@/components/collage/MapView'))
  quiet(import('@/lib/map/shapes').then((m) => m.loadMapCountries()))
}

/** The Add birds dialog and its import UI. */
export const warmAddBirds = () => quiet(import('@/components/import/AddBirdsDialog'))

/** The handlers that run `warm` on intent; spread them on the control (it must not set these handlers itself). */
export const onIntent = (warm: () => void) => ({ onPointerEnter: warm, onFocus: warm, onTouchStart: warm })
