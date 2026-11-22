// The stats dashboard's page for the Worker tests. page.generated.ts embeds the Geist fonts, so it is git-ignored and built
// (`npm --prefix workers/stats/ui ci`, then `run build`); a checkout that hasn't built it gets a stand-in, so the routes,
// Access and /e still run, and the tests of the built HTML are skipped (vi.mock('../workers/stats/src/page', pageModule)).
import { existsSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const GENERATED = path.resolve('workers/stats/src/page.generated.ts')
export const PAGE_BUILT = existsSync(GENERATED)
export async function pageModule(): Promise<{ PAGE: string }> {
  if (PAGE_BUILT) return (await import(/* @vite-ignore */ pathToFileURL(GENERATED).href)) as { PAGE: string }
  return { PAGE: '<!doctype html><html lang="en"><title>Everybird stats</title><p>The dashboard is not built in this checkout.</p></html>' }
}
