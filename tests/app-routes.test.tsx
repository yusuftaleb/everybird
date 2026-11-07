// @vitest-environment jsdom
// The app's pages (/ Collage, /settings) under one EverybirdProvider and the top bar, end to end in jsdom: the store, storage (fake
// IndexedDB), the importers and the edit flows are real; the eBird worker and the iNaturalist API are mocked, and
// there is no layout worker in jsdom (the stage shows its placeholder; the list view and the stats line carry the
// count). next/navigation and next/link are replaced by a tiny router that swaps the page under the same provider,
// as the (app) layout does.
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/** The tiny router: the current path, and how tests (and the app) move. */
const nav = vi.hoisted(() => ({ go: (path: string) => { void path }, path: '/', replaced: [] as string[] }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (p: string) => nav.go(p), replace: (p: string) => { nav.replaced.push(p); nav.go(p) }, prefetch: () => {}, back: () => {} }),
  usePathname: () => nav.path,
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest} onClick={(e) => { e.preventDefault(); nav.go(href) }}>{children}</a>
  ),
}))

const fx = vi.hoisted(() => {
  const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number, g: number) => ({
    code, com, sci, ord, fam, famCom, to, g, gSrc: 'avonet', st: true, ar: 1, q: true,
  })
  const species = [
    sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 1, 2700),
    sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 'Woodpeckers', 2, 140),
    sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 'Picidae', 'Woodpeckers', 3, 120),
    sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 'Turdidae', 'Thrushes', 4, 77),
    sp('yerwar', 'Yellow-rumped Warbler', 'Setophaga coronata', 'Passeriformes', 'Parulidae', 'New World Warblers', 5, 12),
  ]
  const taxa = [
    ...species.map((s) => ({ code: s.code, sci: s.sci, com: s.com, cat: 'species', to: s.to })),
    { code: 'audwar', sci: 'Setophaga coronata auduboni', com: "Yellow-rumped Warbler (Audubon's)", cat: 'issf', to: 6, reportAs: 'yerwar' },
    { code: 'y00323', sci: 'Colaptes auratus/chrysoides', com: 'Northern/Gilded Flicker', cat: 'slash', to: 7 },
  ]
  return { species, taxa }
})

vi.mock('@/lib/import/parse-client', async () => {
  const { parseEbirdLifeList } = await import('@/lib/import/ebird-lifelist')
  const { buildTaxonomyIndex } = await import('@/lib/species/load')
  return {
    parseInWorker: vi.fn(async (_kind: string, file: File, onProgress?: (rows: number) => void) => {
      onProgress?.(4)
      return parseEbirdLifeList(await file.text(), buildTaxonomyIndex(fx.taxa as never))
    }),
  }
})
vi.mock('@/lib/import/inat', async (orig) => ({ ...(await orig<typeof import('@/lib/import/inat')>()), importInat: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const HEADER = 'Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable'
const ROWS = [
  '1,2,species,Northern Flicker,Colaptes auratus,1,Test Park,CA-BC,3 Mar 2026,L1,S1,,1',
  '2,3,species,Gilded Flicker,Colaptes chrysoides,1,Test Park,US-AZ,12 Aug 2025,L2,S2,,1',
  "3,6,issf,Yellow-rumped Warbler (Audubon's),Setophaga coronata auduboni,1,Test Park,CA-BC,06 Sep 2026,L1,S3,,1",
  '4,7,slash,Northern/Gilded Flicker,Colaptes auratus/chrysoides,1,Test Park,US-AZ,12 Aug 2026,L2,S2,,0',
]
const ROBIN_TYPO = '5,4,species,American Robbin,Turdus migratorioos,1,Test Park,CA-BC,1 Apr 2026,L1,S4,,1'
const csv = (...rows: string[]) => new File([[HEADER, ...rows].join('\n') + '\n'], 'ebird_world_life_list.csv', { type: 'text/csv' })

const regionsFile = { v: 1, countries: { CA: 'Canada', US: 'United States' }, sub1: { 'CA-BC': 'British Columbia', 'US-AZ': 'Arizona' } }
const sampleFile = { v: 1, note: 'synthetic', birds: [{ code: 'snogoo', date: '2020-01' }, { code: 'amerob', date: '2021-05', place: { country: 'CA' } }] }
// The landing's pre-packed sample (no layouts: jsdom has no stage to show them on).
const samplePack = { ...sampleFile, species: fx.species.filter((s) => s.code === 'snogoo' || s.code === 'amerob'), regions: { v: 1, countries: { CA: 'Canada' }, sub1: {} }, layouts: [] }

function stubFetch(failSpecies = false) {
  vi.stubGlobal('fetch', async (u: string | URL) => {
    const url = String(u)
    if (failSpecies && url.includes('species.v1')) throw new TypeError('Failed to fetch')
    const body = url.includes('species.v1')
      ? { v: 1, species: fx.species }
      : url.includes('taxonomy.v1')
        ? { v: 1, taxa: fx.taxa }
        : url.includes('regions.v1')
          ? regionsFile
          : url.includes('sample-pack.v1')
            ? samplePack
            : url.includes('sample.v1')
            ? sampleFile
            : url.includes('inat-synonyms')
              ? {}
              : null
    return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
  })
}

async function mount(opts: { blockStorage?: boolean; failForget?: boolean; path?: string; failSpecies?: boolean; stored?: (s: import('@/lib/list/storage').Saved) => void } = {}) {
  vi.resetModules()
  stubFetch(opts.failSpecies)
  if (opts.failForget)
    vi.doMock('@/lib/list/storage', async (orig) => ({ ...(await orig<typeof import('@/lib/list/storage')>()), forget: async () => 'failed' as const }))
  else vi.doUnmock('@/lib/list/storage')
  if (opts.blockStorage) vi.stubGlobal('indexedDB', { open: () => { throw new Error('SecurityError') } })
  else (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  const { EverybirdProvider } = await import('@/components/app/EverybirdProvider')
  const { Home } = await import('@/components/app/Home')
  const { SettingsPage } = await import('@/components/app/SettingsPage')
  const { SiteFooter } = await import('@/components/app/SiteFooter')
  const { TopBar } = await import('@/components/app/TopBar')
  const storage = await import('@/lib/list/storage')
  if (opts.stored) { const s = storage.emptySaved(); opts.stored(s); await storage.save(s) }
  const inat = await import('@/lib/import/inat')
  const analytics = await import('@/lib/analytics')
  vi.mocked(analytics.track).mockClear()
  nav.replaced = []
  function App() {
    const [path, setPath] = useState(opts.path ?? '/settings')
    nav.path = path
    nav.go = (p) => { nav.path = p; setPath(p) }
    return (
      <EverybirdProvider>
        <TopBar />
        {path === '/settings' ? <SettingsPage /> : <Home />}
        <SiteFooter />
      </EverybirdProvider>
    )
  }
  const utils = render(<App />)
  if ((opts.path ?? '/settings') === '/settings') await screen.findByTestId('ebird-drop') // the data and the stored list have loaded
  return { storage, inat, analytics, ...utils }
}

/** Move to another page, as a link click does (the provider, and any import in flight, stay). */
const go = (path: string) => act(async () => { nav.go(path) })
/** Settings' "See my collage" status: what landed and the collage's count. */
const made = () => screen.getByTestId('see-collage')
/** iNaturalist's username field: Add opens it when nothing is connected (it only shows when adding or changing). */
function inatField() {
  const add = screen.queryByRole('button', { name: 'Add iNaturalist' })
  if (add?.getAttribute('aria-expanded') === 'false') fireEvent.click(add)
  return screen.getByLabelText('iNaturalist username')
}

const stats = () => screen.getByTestId('collage-stats')
/** Tick by hand: open the page-wide list, and find a row in it. */
const openTick = () => fireEvent.click(screen.getByRole('button', { name: 'Tick birds off a list' }))
const tickOption = (name: RegExp) => within(screen.getByRole('listbox', { name: 'Species to tick' })).getByRole('option', { name })

async function drop(file: File) {
  const zone = screen.getByTestId('ebird-drop')
  await act(async () => {
    fireEvent.dragOver(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
  })
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('scrollTo', () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the Collage page (/)', () => {
  it('without a list: one line of what Everybird is, the pre-packed sample collage, "Make yours" (to /settings), the top bar and the footer credits link', async () => {
    await mount({ path: '/' })
    expect(await screen.findByRole('heading', { level: 1, name: "A lifetime of birds." })).toBeInTheDocument()
    await waitFor(() => expect(stats()).toHaveTextContent("Sample: a demo birder's life list · 2 species"))
    expect(screen.getByRole('link', { name: /^Make yours/ })).toHaveAttribute('href', '/settings')
    // The footer reaches every credit (About's, with the sticker licence) by one link; no inline sticker line.
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'All credits' })).toHaveAttribute('href', '/about#credits')
    expect(within(footer).queryByRole('link', { name: 'huashu-bird-sticker' })).toBeNull()
    // The top bar: the wordmark home, the three pages (this one current) and the theme switch.
    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('link', { name: 'Everybird' })).toHaveAttribute('href', '/')
    expect(within(bar).getByRole('link', { name: 'Collage' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
    expect(within(bar).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(within(bar).getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
    // Places and Time are dropdowns in the controls bar (closed); the order chips wrap under it, as /lifelist's. No Birds
    // button, no sideways strip.
    const filters = screen.getByTestId('filter-bar')
    expect(screen.getByTestId('filter-tab-places')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('filter-tab-time')).toHaveAttribute('aria-expanded', 'false')
    expect(filters).not.toContainElement(screen.getByTestId('filter-tab-places'))
    expect(within(filters).getByRole('group', { name: 'Orders' })).toBeInTheDocument()
    expect(screen.queryByTestId('filter-strip')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Birds' })).toBeNull()
    expect(screen.queryByTestId('filter-bar-folded')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    fireEvent.click(screen.getByRole('link', { name: /^Make yours/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(within(screen.getByRole('banner')).getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 2, name: 'Your list' })).toBeInTheDocument()
    // One row per source, each "Not added" yet.
    for (const h of [/^eBird life list/, /^MyEBirdData/, /^iNaturalist/, /^Ticked by hand/]) expect(screen.getByRole('heading', { level: 3, name: h })).toBeInTheDocument()
    expect(screen.getAllByText('Not added')).toHaveLength(3)
    expect(screen.getByText('Your list never leaves your browser. We count visits anonymously.')).toBeInTheDocument()
  })

  it('with a list: the birder\'s own collage, with Share and "Add birds" (to /settings) in its head', async () => {
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/)
    expect(screen.getByRole('button', { name: 'Share' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Add birds' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull() // the downloads live on Settings
  })
})

describe('when the bird data fails to load', () => {
  it('a visitor without a list still gets the pre-packed sample on /, and no failure notice there', async () => {
    await mount({ path: '/', failSpecies: true })
    await waitFor(() => expect(stats()).toHaveTextContent("Sample: a demo birder's life list · 2 species"))
    expect(screen.queryByText(/Couldn't load the bird data/)).toBeNull()
  })

  it('a birder with a list on this device gets their collage page with the "couldn\'t load" notice', async () => {
    await mount({ path: '/', failSpecies: true, stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
    expect(await screen.findByText(/Couldn't load the bird data/)).toBeInTheDocument()
  })
})

describe('Settings and the collage', () => {
  it('dropping a life list download adds its species, says what it lacks, and "See my collage" opens the collage', async () => {
    const { storage, analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species, all from eBird. See my collage'))
    // One anonymous event: the source only, no counts, names or places.
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'ebird' }]])
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    // In the eBird row's status, "· 1 skipped", and "why?" says in plain words that the slash entry isn't a species.
    const row = screen.getByTestId('source-ebird-list')
    expect(row).toHaveTextContent('1 skipped')
    const why = within(row).getByRole('button', { name: 'Why 1 skipped?' })
    const notCounted = within(row).getByTestId('not-counted')
    expect(notCounted).not.toBeVisible()
    fireEvent.click(why)
    expect(why).toHaveAttribute('aria-expanded', 'true')
    expect(why).toHaveAttribute('aria-controls', notCounted.id)
    expect(notCounted).toBeVisible()
    expect(notCounted).toHaveTextContent(/^1 entry isn't a species: birds only identified to a group \(like “duck sp\.”\), either\/or IDs/)
    expect(screen.getByTestId('ebird-detail')).toHaveTextContent(/state or province.*Download My Data.*region \(county\)/)
    await waitFor(async () => expect((await storage.load())?.records['ebird-list']).toHaveLength(3), { timeout: 2000 })
    expect((await storage.load())?.records.ebird).toEqual([])
    expect((await storage.load())?.skipped).toEqual({ 'ebird-list': 1 })
    fireEvent.click(within(made()).getByRole('link', { name: 'See my collage' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/)
    expect(screen.queryByTestId('unmatched-note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const list = screen.getByRole('list', { name: 'Life list' })
    for (const n of ['Northern Flicker', 'Gilded Flicker', 'Yellow-rumped Warbler']) expect(within(list).getByText(n)).toBeInTheDocument()
  })

  it('a file that is not an eBird export says so plainly', async () => {
    const { analytics } = await mount()
    await drop(new File(['name,age\nx,1\n'], 'other.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read this file")
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled() // a failed import sends no event
  })

  it('iNat error message is plain and other sources stay', async () => {
    const { inat, analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    vi.mocked(analytics.track).mockClear()
    const cases: [string, RegExp][] = [
      ['unknown-user', /couldn't find an iNaturalist user called “nobody”/i],
      ['no-birds', /“nobody” has no public bird observations/i],
      ['network', /couldn't reach iNaturalist/i],
      ['rate-limited', /iNaturalist is busy/i],
    ]
    for (const [error, message] of cases) {
      vi.mocked(inat.importInat).mockResolvedValueOnce({ error } as never)
      fireEvent.change(inatField(), { target: { value: 'nobody' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
      const alert = await screen.findByText(message)
      expect(alert.closest('[role=alert]')).not.toBeNull()
      expect(alert.textContent).not.toMatch(/error|exception|undefined|status/i)
      expect(made()).toHaveTextContent('Your collage has 3 species')
    }
    expect(vi.mocked(inat.importInat).mock.calls[0][0]).toBe('nobody')
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled() // failed iNat imports send no event
  })

  it('iNat import shows progress and adds its birds as another source', async () => {
    const { inat, analytics } = await mount()
    let finish: (v: unknown) => void = () => {}
    vi.mocked(inat.importInat).mockImplementationOnce(async (_u, opts) => {
      opts.onProgress?.({ fetched: 400, total: 576 })
      return new Promise((done) => { finish = done }) as never
    })
    fireEvent.change(inatField(), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(await screen.findByText('Fetched 400 of 576')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species, all from iNaturalist. See my collage'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'inat' }]])
  })

  it('an iNat fetch keeps running, with its progress, while the birder moves between the pages', async () => {
    const { inat } = await mount()
    let finish: (v: unknown) => void = () => {}
    let aborted = false
    vi.mocked(inat.importInat).mockImplementationOnce(async (_u, opts) => {
      opts.signal?.addEventListener('abort', () => { aborted = true })
      opts.onProgress?.({ fetched: 400, total: 576 })
      return new Promise((done) => { finish = done }) as never
    })
    fireEvent.change(inatField(), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(await screen.findByText('Fetched 400 of 576')).toBeInTheDocument()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(stats()).toHaveTextContent(/^3 species/)
    await go('/settings')
    expect(screen.getByText('Fetched 400 of 576')).toBeInTheDocument() // the fetch and its progress outlived the pages
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(aborted).toBe(false)
    await go('/')
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(stats()).toHaveTextContent(/^4 species/))
  })

  it('cancelling an iNat fetch adds nothing and says so', async () => {
    const { inat } = await mount()
    vi.mocked(inat.importInat).mockImplementationOnce(
      (_u, opts) =>
        new Promise((_done, fail) => {
          opts.signal?.addEventListener('abort', () => fail(Object.assign(new Error('aborted'), { name: 'AbortError' })))
        }) as never,
    )
    fireEvent.change(inatField(), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })) })
    expect(await screen.findByText('Cancelled. Nothing was changed.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fetch my birds' })).toBeInTheDocument()
  })

  it('the collage says when rows went unmatched; fixing one on Settings adds the species', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(await screen.findByTestId('unmatched-note')).toHaveTextContent("1 row couldn't be matched · Fix it")
    expect(within(screen.getByTestId('unmatched-note')).getByRole('link', { name: 'Fix it' })).toHaveAttribute('href', '/settings#match')
    await go('/settings')
    expect(screen.getByRole('heading', { name: "1 row couldn't be matched" })).toBeInTheDocument()
    // One line under the sources; "Fix it" opens the row (it opens by itself at /settings#match).
    expect(screen.queryByRole('button', { name: 'Use American Robin' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }))
    expect(screen.getByText('eBird life list row 5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use American Robin' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species'))
    expect(screen.queryByRole('heading', { name: /couldn't be matched/ })).toBeNull()
  })

  it('an unmatched row can be fixed by hand with a search', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    fireEvent.click(screen.getByRole('button', { name: 'Fix it' }))
    fireEvent.click(screen.getByRole('button', { name: 'Fix by hand' }))
    fireEvent.change(screen.getByLabelText('Find the right species for American Robbin'), { target: { value: 'snow' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snow Goose/ }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species'))
  })

  it('the counting rules for the current imports are on Settings once there is a list', async () => {
    await mount()
    expect(screen.queryByRole('heading', { name: 'Counting' })).toBeNull()
    await drop(csv(...ROWS))
    expect(await screen.findByRole('heading', { name: 'Counting' })).toBeInTheDocument()
    const heard = screen.getByRole('switch', { name: 'Hide heard-only birds' })
    expect(heard).toHaveAccessibleDescription('* Birds you only heard. 0 on your list.')
    expect(screen.getByRole('switch', { name: 'Hide found-dead birds' })).toHaveAccessibleDescription('† Birds you found dead. 0 on your list.')
    // No iNaturalist source yet: the research-grade rule waits, and says why.
    expect(screen.getByRole('switch', { name: 'Research-grade iNaturalist only' })).toBeDisabled()
    fireEvent.click(heard)
    expect(heard).toHaveAttribute('aria-checked', 'true')
  })

  it('forget my list (in "Your data" on Settings) asks once, clears, and the collage page shows the sample again', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await waitFor(async () => expect(await storage.load()).not.toBeNull(), { timeout: 2000 })
    expect(screen.getByRole('heading', { name: 'Your data' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Forget my list' }))
    expect(screen.getByText(/Forget this list on this device\?/)).toBeInTheDocument()
    expect(made()).toHaveTextContent('Your collage has 3 species') // nothing cleared yet
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, forget it' })) })
    await waitFor(() => expect(screen.queryByTestId('see-collage')).toBeNull())
    // Without a list, Your data keeps only Restore from backup.
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull()
    expect(screen.getByLabelText('Restore from backup')).toBeInTheDocument()
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: "A lifetime of birds." })).toBeInTheDocument()
    await waitFor(async () => expect(await storage.load()).toBeNull())
    expect(screen.queryByText("Couldn't clear this device's copy")).toBeNull()
  })

  it("a failed forget says the device copy couldn't be cleared", async () => {
    await mount({ failForget: true })
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    fireEvent.click(screen.getByRole('button', { name: 'Forget my list' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, forget it' })) })
    expect(await screen.findByText(/Couldn't clear this device's copy/)).toBeInTheDocument()
    expect(screen.getByText(/Couldn't clear this device's copy/).closest('[role=alert]')).not.toBeNull()
    expect(screen.queryByTestId('see-collage')).toBeNull() // memory is cleared either way
    vi.doUnmock('@/lib/list/storage')
  })

  it('works in memory and says so when storage is blocked', async () => {
    await mount({ blockStorage: true })
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
  })
})

describe('editing', () => {
  it('the card edits marks and removes a bird; ticking it by hand brings it back', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    fireEvent.click(within(screen.getByRole('list', { name: 'Life list' })).getByRole('button', { name: /Northern Flicker/ }))
    const card = screen.getByRole('dialog', { name: 'Northern Flicker' })
    const heard = within(card).getByRole('button', { name: /Heard only/ })
    expect(heard).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heard)
    expect(screen.getByRole('dialog', { name: 'Northern Flicker' }).querySelector('.eb-card-date')).toHaveTextContent('Heard only')
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Heard only/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Heard only/ }))
    expect(screen.getByRole('dialog').querySelector('.eb-card-date')).not.toHaveTextContent('Heard only')

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from my list' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 species/))
    expect(screen.queryByRole('dialog')).toBeNull()
    // A few seconds to undo it.
    expect(screen.getByText('Removed Northern Flicker.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()) // keyboard users land on it
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    expect(screen.queryByText('Removed Northern Flicker.')).toBeNull()
    fireEvent.click(within(screen.getByRole('list', { name: 'Life list' })).getByRole('button', { name: /Northern Flicker/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from my list' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 species/))

    // Tick by hand (on Settings): the removed species comes back, with a date and a region.
    await go('/settings')
    openTick()
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'northern fl' } })
    fireEvent.click(tickOption(/^Northern Flicker/))
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-06' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'CA' } })
    fireEvent.change(screen.getByLabelText('Region (optional)'), { target: { value: 'CA-BC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await waitFor(async () => {
      const s = await storage.load()
      expect(s?.edits.removed).toEqual([])
      expect(s?.edits.added).toEqual([{ code: 'norfli', source: 'manual', date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } }])
    }, { timeout: 2000 })
  })

  it('Tick by hand: a page-wide list of every species; tick several (click or Space), one date and place for the batch', async () => {
    const { storage, analytics } = await mount()
    openTick()
    const list = screen.getByRole('listbox', { name: 'Species to tick' })
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(within(list).getAllByRole('option')).toHaveLength(5) // the whole (synthetic) taxonomy, windowed
    fireEvent.click(tickOption(/^Snow Goose/))
    // Keyboard: the arrows move the active row, Space ticks it.
    list.focus()
    fireEvent.keyDown(list, { key: 'ArrowDown' }) // the Northern Flicker
    fireEvent.keyDown(list, { key: ' ' })
    expect(tickOption(/^Northern Flicker/)).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: ' ' }) // untick, tick again
    expect(tickOption(/^Northern Flicker/)).toHaveAttribute('aria-selected', 'false')
    fireEvent.keyDown(list, { key: ' ' })
    expect(screen.getByText('2 selected')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2018' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'US' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species'))
    expect(screen.getByText('Added 2 birds to your list.')).toBeInTheDocument()
    // Now on the list: shown ticked.
    expect(tickOption(/^Snow Goose, Anser caerulescens, already on your list/)).toHaveAttribute('aria-selected', 'true')
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'manual' }]]) // one, for the first batch
    await waitFor(async () => expect((await storage.load())?.edits.added).toEqual([
      { code: 'snogoo', source: 'manual', date: '2018', place: { country: 'US' } },
      { code: 'norfli', source: 'manual', date: '2018', place: { country: 'US' } },
    ]), { timeout: 2000 })
    // Search narrows by word prefixes of either name, accent-insensitive; the order picker browses.
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'colaptes' } })
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Northern Flicker, Colaptes auratus, already on your list', 'Gilded Flicker, Colaptes chrysoides'])
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: 'Passeriformes' } })
    expect(within(list).getAllByRole('option')).toHaveLength(2)
    // Un-ticking a bird already on the list takes it off, as the card's Remove does.
    fireEvent.change(screen.getByLabelText('Order'), { target: { value: '' } })
    fireEvent.click(tickOption(/^Snow Goose, Anser caerulescens, already on your list/))
    expect(tickOption(/^Snow Goose/)).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByText(/1 to remove/)).toBeInTheDocument()
    const beforeRemove = (await storage.load())!.edits
    fireEvent.click(screen.getByRole('button', { name: 'Remove 1 from my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species'))
    // The card's "Removed … · Undo" toast, with focus on Undo; Undo puts back exactly what was there (the dated hand
    // record, not a fresh one).
    expect(screen.getByText('Removed Snow Goose.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus())
    await waitFor(async () => expect((await storage.load())?.edits.removed).toEqual(['snogoo']), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species'))
    expect(screen.queryByText('Removed Snow Goose.')).toBeNull()
    expect(tickOption(/^Snow Goose, Anser caerulescens, already on your list/)).toHaveAttribute('aria-selected', 'true')
    await waitFor(async () => expect((await storage.load())?.edits).toEqual(beforeRemove), { timeout: 2000 })
    // Two at once: "Removed 2 birds.", and the toast leaves by itself after about 6 s.
    fireEvent.click(tickOption(/^Snow Goose, Anser caerulescens, already on your list/))
    fireEvent.click(tickOption(/^Northern Flicker, Colaptes auratus, already on your list/))
    fireEvent.click(screen.getByRole('button', { name: 'Remove 2 from my list' }))
    expect(screen.getByText('Removed 2 birds.')).toBeInTheDocument()
    await waitFor(async () => expect((await storage.load())?.edits.removed).toEqual(['snogoo', 'norfli']), { timeout: 2000 })
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus())
    screen.getByRole('button', { name: 'Undo' }).blur()
    await waitFor(() => expect(screen.queryByText('Removed 2 birds.')).toBeNull(), { timeout: 8000 })
    // Ticking it again brings it back.
    fireEvent.click(tickOption(/^Snow Goose/))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species'))  }, 20_000) // the Undo toast's ~6 s

  it('ticking a bird onto a list from eBird is an edit, not a new collage', async () => {
    const { analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    openTick()
    fireEvent.click(tickOption(/^Snow Goose/))
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'ebird' }]])
  })

  it('tick by hand rejects a malformed date', async () => {
    await mount()
    openTick()
    fireEvent.click(tickOption(/^Snow Goose/))
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 to my list' }))
    expect(screen.getByText('Use YYYY-MM-DD, YYYY-MM or YYYY.')).toBeInTheDocument()
    expect(screen.queryByTestId('see-collage')).toBeNull()
  })

  it('restore from backup (on Settings, without a list) brings a list back and opens the collage; a bad file gets a plain message', async () => {
    const { storage } = await mount()
    const bad = new File(['not json'], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [bad] } }) })
    expect(await screen.findByText(/Couldn't restore this backup. This file is not valid JSON./)).toBeInTheDocument()
    const good = { ...storage.emptySaved(), records: { ebird: [], inat: [], manual: [{ code: 'snogoo', source: 'manual' }] } } // a backup from before the second eBird slot
    const file = new File([JSON.stringify(good)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 species/))
  })

  it('restoring a backup over an existing list (in "Your data") asks first', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    const good = { ...storage.emptySaved(), records: { ebird: [], 'ebird-list': [], inat: [], manual: [{ code: 'snogoo', source: 'manual' }] } }
    const file = new File([JSON.stringify(good)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    expect(screen.getByText(/Replace your list with this backup\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my list' }))
    expect(made()).toHaveTextContent('Your collage has 3 species')
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, replace it' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species'))
  })

  it('downloads the list as CSV and as a JSON backup from "Your data" on Settings', async () => {
    const urls: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { urls.push(b); return 'blob:x' }, revokeObjectURL: () => {} }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON backup' }))
    expect(click).toHaveBeenCalledTimes(2)
    expect(await urls[0].text()).toMatch(/^eBird code,Common name/)
    expect(JSON.parse(await urls[1].text()).records['ebird-list']).toHaveLength(3)
    click.mockRestore()
  })
})

describe('Name your collage (Settings > Your data)', () => {
  it('is the collage title verbatim, is saved with the list and its backup, and empty means "My collage"', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    const field = screen.getByLabelText('Name your collage')
    expect(field).toHaveValue('')
    expect(field).toHaveAttribute('maxLength', '40')
    expect(field).toHaveAttribute('placeholder', 'e.g. Yusuf’s life list')
    expect(field).toHaveAccessibleDescription('Shown as your collage’s title and on shares.')
    fireEvent.change(field, { target: { value: 'Birds of 2026 ' } })
    expect(field).toHaveValue('Birds of 2026 ') // the field keeps the space being typed; the list saves it trimmed
    await waitFor(async () => expect((await storage.load())?.name).toBe('Birds of 2026'), { timeout: 2000 })
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Birds of 2026' })).toBeInTheDocument() // no "'s birds"
    await go('/settings')
    expect(screen.getByLabelText('Name your collage')).toHaveValue('Birds of 2026')
    fireEvent.change(screen.getByLabelText('Name your collage'), { target: { value: '' } })
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
  })

  it('a list saved with an old bare name shows the title it always had', async () => {
    await mount({ path: '/', stored: (s) => { ;(s as { v: number }).v = 3; s.name = 'Ada'; s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: "Ada's birds" })).toBeInTheDocument()
  })

  it('a restored backup brings its title into the field', async () => {
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    const { emptySaved } = await import('@/lib/list/storage')
    const { toJson } = await import('@/lib/list/export')
    const backup = { ...emptySaved(), name: 'Sam', records: { ...emptySaved().records, manual: [{ code: 'snogoo', source: 'manual' as const }] } }
    const file = new File([toJson(backup)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, replace it' })) })
    await waitFor(() => expect(screen.getByLabelText('Name your collage')).toHaveValue('Sam'))
  })
})

describe('remembered sources', () => {
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) // this year: no year

  it('an eBird file is remembered by name, kind and rows, with Replace and Remove', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    const line = await screen.findByTestId('source-ebird-list')
    expect(line).toHaveTextContent('ebird_world_life_list.csv')
    expect(within(line).getByRole('heading', { level: 3 })).toHaveTextContent('eBird life list · ebird_world_life_list.csv')
    expect(line).toHaveTextContent(`3 species · 1 skipped why? · Imported ${today}`)
    expect(within(line).getByRole('button', { name: 'Replace ebird_world_life_list.csv' })).toBeInTheDocument()
    await waitFor(async () => expect((await storage.load())?.sources?.['ebird-list']).toMatchObject({ kind: 'life-list', file: 'ebird_world_life_list.csv', rows: 4 }), { timeout: 2000 })
    // Remove is in the row's ⋯ menu, after Replace; it asks once, and "Keep it" changes nothing (focus back on ⋯).
    const more = within(line).getByRole('button', { name: 'More for eBird life list' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(more)
    expect(within(screen.getByRole('menu', { name: 'More for eBird life list' })).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Replace', 'Remove'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(more).toHaveFocus()
    expect(made()).toHaveTextContent('Your collage has 3 species')
    fireEvent.click(more)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(screen.getByRole('group', { name: 'Remove your eBird life list download' })).toHaveTextContent('Your edits stay.')
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    expect(screen.queryByTestId('source-ebird-list')).toBeNull()
    await waitFor(async () => {
      const s = await storage.load()
      expect(s?.records['ebird-list']).toEqual([])
      expect(s?.sources?.['ebird-list']).toBeUndefined()
    }, { timeout: 2000 })
  })

  it('iNaturalist is remembered by username; Refresh fetches it again without retyping; Remove takes only its birds', async () => {
    const { inat, storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    vi.mocked(inat.importInat).mockImplementationOnce(async (_u, opts) => {
      opts.onProgress?.({ fetched: 576, total: 576 })
      return { records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }
    })
    fireEvent.change(inatField(), { target: { value: '@sam_birds' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    const line = await screen.findByTestId('source-inat')
    expect(within(line).getByRole('heading', { level: 3 })).toHaveTextContent('iNaturalist · sam_birds')
    expect(line).toHaveTextContent(`1 species · 1 only here · Updated ${today}`)
    expect(screen.queryByLabelText('iNaturalist username')).toBeNull() // the form folds away behind the menu's Change username
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species'))
    await waitFor(async () => expect((await storage.load())?.sources?.inat?.user).toBe('sam_birds'), { timeout: 2000 })

    let finish: (v: unknown) => void = () => {}
    vi.mocked(inat.importInat).mockImplementationOnce(async (_u, opts) => {
      opts.onProgress?.({ fetched: 10, total: 600 })
      return new Promise((done) => { finish = done }) as never
    })
    await act(async () => { fireEvent.click(within(line).getByRole('button', { name: 'Refresh sam_birds from iNaturalist' })) })
    expect(vi.mocked(inat.importInat).mock.calls.at(-1)![0]).toBe('sam_birds')
    expect(await screen.findByText('Fetched 10 of 600')).toBeInTheDocument()
    expect(within(screen.getByTestId('source-inat')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }, { code: 'snogoo', source: 'inat', date: '2024-06-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 5 species'))

    fireEvent.click(within(screen.getByTestId('source-inat')).getByRole('button', { name: 'More for iNaturalist' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Refresh', 'Change username', 'Remove'])
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    expect(screen.queryByTestId('source-inat')).toBeNull()
    expect(screen.queryByLabelText('iNaturalist username')).toBeNull() // back to "Not added" and Add
    expect(screen.getByRole('button', { name: 'Add iNaturalist' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('a list saved before v3 shows its sources with details unknown, and asks for the username to refresh', async () => {
    await mount({
      stored: (s) => {
        ;(s as { v: number }).v = 2
        s.records.ebird = [{ code: 'norfli', source: 'ebird', date: '2020-01-01' }]
        s.records.inat = [{ code: 'amerob', source: 'inat', date: '2021-01-01' }]
      },
    })
    expect(screen.getByTestId('source-ebird')).toHaveTextContent('eBird full export')
    expect(screen.getByTestId('source-ebird')).toHaveTextContent('MyEBirdData · eBird full export1 species · 1 only here · Details unknown')
    expect(screen.getByTestId('source-inat')).toHaveTextContent('Username unknown: enter it again to refresh')
    expect(screen.queryByRole('button', { name: /^Refresh/ })).toBeNull()
    expect(screen.getByLabelText('iNaturalist username')).toBeInTheDocument()
  })

  it('the iNaturalist username is stored and shown trimmed', async () => {
    const { inat, storage } = await mount()
    vi.mocked(inat.importInat).mockResolvedValueOnce({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 })
    fireEvent.change(inatField(), { target: { value: '  @ sam_birds  ' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(vi.mocked(inat.importInat).mock.calls.at(-1)![0]).toBe('sam_birds')
    expect(within(await screen.findByTestId('source-inat')).getByRole('heading', { level: 3 })).toHaveTextContent('iNaturalist · sam_birds')
    await waitFor(async () => expect((await storage.load())?.sources?.inat?.user).toBe('sam_birds'), { timeout: 2000 })
  })

  it('Tick by hand is a disclosure: aria-expanded and aria-controls, hidden when closed', async () => {
    await mount()
    const btn = screen.getByRole('button', { name: 'Tick birds off a list' })
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    expect(btn).toHaveAttribute('aria-controls', 'tick')
    // The controlled panel exists from the start (hidden, the list not yet mounted).
    expect(document.getElementById('tick')).toHaveAttribute('hidden')
    expect(screen.queryByRole('listbox', { name: 'Species to tick' })).toBeNull()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('tick')).toBeVisible()
    expect(screen.getByRole('listbox', { name: 'Species to tick' })).toBeInTheDocument()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'false')
    await waitFor(() => expect(document.getElementById('tick')).toHaveAttribute('hidden'), { timeout: 2000 })
  })
})
