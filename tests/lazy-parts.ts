// The page's lazily loaded parts (src/lib/lazy-loaded.tsx: the Filters sections, the dock search, the Map, Add birds),
// loaded before a test renders, so they draw at once, as on a page that has fetched them.
export async function loadLazyParts(): Promise<void> {
  const [{ loadFilterSections }, { DockSearchField }, { MapView }, { AddBirdsDialog }] = await Promise.all([
    import('@/components/filters/Filters'), import('@/components/app/ControlsBar'), import('@/components/app/CollageView'), import('@/components/app/Home'),
  ])
  await Promise.all([loadFilterSections(), DockSearchField.load(), MapView.load(), AddBirdsDialog.load()])
}
