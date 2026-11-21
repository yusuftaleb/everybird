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
  const sp = (code: string, com: string, sci: string, ord: string, fam: string, famCom: string, to: number, g: number, iu?: string) => ({
    code, com, sci, ord, fam, famCom, to, g, gSrc: 'avonet', st: true, ar: 1, q: true, ...(iu ? { iu } : {}),
  })
  const species = [
    sp('snogoo', 'Snow Goose', 'Anser caerulescens', 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl', 1, 2700),
    sp('norfli', 'Northern Flicker', 'Colaptes auratus', 'Piciformes', 'Picidae', 'Woodpeckers', 2, 140, 'LC'),
    sp('gilfli', 'Gilded Flicker', 'Colaptes chrysoides', 'Piciformes', 'Picidae', 'Woodpeckers', 3, 120, 'VU'),
    sp('amerob', 'American Robin', 'Turdus migratorius', 'Passeriformes', 'Turdidae', 'Thrushes', 4, 77),
    sp('yerwar', 'Yellow-rumped Warbler', 'Setophaga coronata', 'Passeriformes', 'Parulidae', 'New World Warblers', 5, 12, 'EN'),
  ]
  const taxa = [
    ...species.map((s) => ({ code: s.code, sci: s.sci, com: s.com, cat: 'species', to: s.to })),
    { code: 'audwar', sci: 'Setophaga coronata auduboni', com: "Yellow-rumped Warbler (Audubon's)", cat: 'issf', to: 6, reportAs: 'yerwar' },
    { code: 'y00323', sci: 'Colaptes auratus/chrysoides', com: 'Northern/Gilded Flicker', cat: 'slash', to: 7 },
  ]
  return { species, taxa }
})

vi.mock('@/lib/import/parse-client', async (orig) => {
  const actual = await orig<typeof import('@/lib/import/parse-client')>()
  const { parseEbirdLifeList } = await import('@/lib/import/ebird-lifelist')
  const { parseObsOrgSpecies } = await import('@/lib/import/obsorg')
  const { buildTaxonomyIndex } = await import('@/lib/species/load')
  return {
    ...actual,
    parseInWorker: vi.fn(async (kind: string, file: File, opts?: { onProgress?: (rows: number) => void; synonyms?: Record<string, string> }) => {
      opts?.onProgress?.(4)
      const t = buildTaxonomyIndex(fx.taxa as never)
      if (kind !== 'obsorg-species') return parseEbirdLifeList(await file.text(), t)
      const r = parseObsOrgSpecies(await file.text(), t, opts?.synonyms ?? {})
      if ('error' in r) throw new actual.ParseError(r.error, 'no-birds')
      return r
    }),
  }
})
vi.mock('@/lib/import/inat', async (orig) => ({ ...(await orig<typeof import('@/lib/import/inat')>()), importInat: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn(), trackFilterUsed: vi.fn() }))

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
  // After resetModules: the same I18nProvider module instance the components above read their context from.
  const { withI18n } = await import('./i18n-render')
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
  const utils = render(<App />, { wrapper: withI18n('en') })
  // The data and the stored list have loaded; the source rows are in the page.
  if ((opts.path ?? '/settings') === '/settings') await screen.findByTestId('ebird-drop')
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
/** Settings lays the source rows out in the page, and its "Add by hand" opens the dialog as Add by hand alone;
 *  elsewhere (the collage's head) "Add birds" opens the dialog, at Import a file, and `way` picks one of its two choices. */
async function openAdd(way: 'Import a file' | 'Add by hand') {
  if (document.querySelector('.eb-page-settings') && !screen.queryByRole('dialog')) {
    if (way === 'Add by hand') fireEvent.click(screen.getByRole('button', { name: 'Add by hand' }))
    return
  }
  if (!screen.queryByRole('dialog', { name: 'Add birds' })) fireEvent.click(await screen.findByRole('button', { name: 'Add birds' }))
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Add birds' })).getByRole('button', { name: way }))
}
/** Add by hand: open its list, and find a row in it. */
const openTick = () => openAdd('Add by hand')
const tickOption = (name: RegExp) => within(screen.getByRole('listbox', { name: 'Species to tick' })).getByRole('option', { name })

async function drop(file: File, zoneId = 'ebird-drop') {
  const zone = screen.getByTestId(zoneId)
  await act(async () => {
    fireEvent.dragOver(zone, { dataTransfer: { files: [file], types: ['Files'] } })
    fireEvent.drop(zone, { dataTransfer: { files: [file], types: ['Files'] } })
  })
}

beforeEach(() => {
  vi.stubGlobal('innerWidth', 1024)
  vi.stubGlobal('scrollTo', () => {})
  vi.stubGlobal('scrollBy', () => {})
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('the top bar under a language prefix', () => {
  it('TopBar marks the current page from the unprefixed path', async () => {
    const { TopBar } = await import('@/components/app/TopBar')
    const { withI18n } = await import('./i18n-render')
    // The server prerenders /es/settings, the browser shows /settings: the same aria-current both times (no mismatch).
    const current = (path: string) => {
      nav.path = path
      const { unmount } = render(<TopBar />, { wrapper: withI18n('en') })
      const bar = screen.getByRole('banner')
      const marked = within(bar).getAllByRole('link').filter((a) => a.getAttribute('aria-current') === 'page').map((a) => a.textContent)
      const html = bar.outerHTML
      unmount()
      return { marked, html }
    }
    const prefixed = current('/es/settings')
    const plain = current('/settings')
    expect(prefixed.marked).toEqual(['Settings'])
    expect(plain).toEqual(prefixed)
    expect(current('/nl').marked).toEqual(['My birds'])
    expect(current('/').marked).toEqual(['My birds'])
  }, 15_000)
})

describe('the Collage page (/)', () => {
  it('without a list: one line of what Everybird is, the pre-packed sample collage, "Make yours" (the Add birds dialog), the top bar and the footer credits link', async () => {
    await mount({ path: '/' })
    expect(await screen.findByRole('heading', { level: 1, name: "A lifetime of birds." })).toBeInTheDocument()
    await waitFor(() => expect(stats()).toHaveTextContent(/^Sample · 2 species/))
    expect(screen.getByRole('button', { name: /^Make yours/ })).toHaveAttribute('aria-haspopup', 'dialog')
    // A demo: no Share or Print on the sample.
    expect(screen.queryByTestId('share-open')).toBeNull()
    expect(screen.queryByTestId('print-open')).toBeNull()
    // The footer reaches every credit (About's, with the sticker licence) by one link; no inline sticker line.
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: 'All credits' })).toHaveAttribute('href', '/about#credits')
    expect(within(footer).queryByRole('link', { name: 'huashu-bird-sticker' })).toBeNull()
    const coffee = within(footer).getByRole('link', { name: 'Buy me a coffee' })
    expect(coffee).toHaveAttribute('href', 'https://buymeacoffee.com/yusuftaleb')
    expect(coffee).toHaveAttribute('target', '_blank')
    expect(coffee).toHaveAttribute('rel', 'noopener noreferrer')
    const gh = within(footer).getByRole('link', { name: 'Everybird on GitHub' })
    expect(gh).toHaveAttribute('href', 'https://github.com/yusuftaleb/everybird')
    expect(gh).toHaveAttribute('target', '_blank')
    expect(gh).toHaveAttribute('rel', 'noopener noreferrer')
    // The top bar: the wordmark home, the three pages (this one current) and the theme switch.
    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('link', { name: 'Everybird' })).toHaveAttribute('href', '/')
    expect(within(bar).getByRole('link', { name: 'My birds' })).toHaveAttribute('aria-current', 'page')
    expect(within(bar).getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current')
    expect(within(bar).getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about')
    expect(within(bar).getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
    // The Taxa, Display and Filters buttons in the controls bar (closed); with no taxon picked nothing sits under the
    // dock (round 6): the order chips wrap in the Taxa panel. No Birds button, no sideways strip.
    expect(screen.getByTestId('filters-button')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('display-button')).toHaveAttribute('aria-expanded', 'false')
    const taxa = screen.getByTestId('taxa-button')
    expect(taxa).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('filter-bar')).toBeNull()
    fireEvent.click(taxa)
    expect(within(screen.getByTestId('taxa-panel')).getByRole('group', { name: 'Orders' })).toBeInTheDocument()
    fireEvent.click(taxa)
    expect(screen.queryByTestId('taxa-panel')).toBeNull()
    expect(screen.queryByTestId('filter-strip')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Birds' })).toBeNull()
    expect(screen.queryByTestId('filter-bar-folded')).toBeNull()
    expect(screen.queryByRole('tab')).toBeNull()
    // The first visit's welcome covers the page; "Explore the sample" closes it.
    fireEvent.click(within(screen.getByTestId('welcome')).getByRole('button', { name: 'Explore the sample' }))
    // "Make yours" opens the Add birds dialog on the page, at Import a file with its rows showing; Add by hand is the other choice.
    const cta = screen.getByRole('button', { name: /^Make yours/ })
    cta.focus()
    fireEvent.click(cta)
    const dialog = screen.getByRole('dialog', { name: 'Add birds' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveFocus()
    expect(within(dialog).getByRole('group', { name: 'Ways to add birds' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Import a file' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('button', { name: 'Add by hand' })).toHaveAttribute('aria-pressed', 'false')
    // One row per source, each "Not added" yet (the species load at an idle moment on the landing).
    await within(dialog).findByTestId('ebird-drop')
    for (const h of [/^eBird life list/, /^MyEBirdData/, /^iNaturalist/, /^observation\.org life list/, /^observation\.org observations/, /^Spreadsheet or list/, /^Scythebill/, /^iGoTerra/]) expect(within(dialog).getByRole('heading', { level: 3, name: h })).toBeInTheDocument()
    expect(within(dialog).getAllByText('Not added')).toHaveLength(8)
    // The privacy line is Settings' alone (round 6: the dialog fits the screen without it).
    expect(within(dialog).queryByText('Your list never leaves your browser. We count visits anonymously.')).toBeNull()
    // Esc closes it, and focus goes back to "Make yours".
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Add birds' })).toBeNull()
    expect(cta).toHaveFocus()
  })

  it('with a list: the birder\'s own collage, with Share and "Add birds" (the Add birds dialog) in its head', async () => {
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/)
    // Share is the head's main action, beside Add birds, in every view; the bar has no Share of its own.
    const share = screen.getByRole('button', { name: 'Share' })
    expect(share).toHaveAttribute('data-testid', 'share-open')
    expect(share).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getAllByTestId('share-open')).toHaveLength(1)
    const add = screen.getByRole('button', { name: 'Add birds' })
    expect(add).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.queryByRole('button', { name: 'Download CSV' })).toBeNull() // the downloads live on Settings
    add.focus()
    fireEvent.click(add)
    const dialog = screen.getByRole('dialog', { name: 'Add birds' })
    // At Import a file, its rows showing; the summary line, as on Settings; ✕ closes, focus back on "Add birds".
    expect(within(dialog).getByRole('button', { name: 'Import a file' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByTestId('ebird-drop')).toBeInTheDocument()
    expect(within(dialog).getByTestId('add-summary')).toHaveTextContent('Your collage has 3 species, all from eBird.')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(add).toHaveFocus()
  })
})

describe('the conservation status on /', () => {
  const stored = (s: import('@/lib/list/storage').Saved) => {
    s.records.ebird = ['snogoo', 'norfli', 'gilfli', 'amerob', 'yerwar'].map((code) => ({ code, source: 'ebird' as const, date: '2020-01-01', place: { country: 'CA' } }))
  }

  it('the stats line counts the threatened species (VU + EN + CR); the Status panel filters; the layout resolves the same birds', async () => {
    await mount({ path: '/', stored })
    await waitFor(() => expect(stats()).toHaveTextContent(/^5 species/))
    // gilfli VU + yerwar EN; norfli LC and the two without a status don't count.
    expect(stats()).toHaveTextContent('2 threatened (Vulnerable, Endangered or Critically Endangered)')
    fireEvent.click(screen.getByTestId('filters-button'))
    const panel = screen.getByRole('group', { name: 'Conservation status' })
    expect(within(panel).getAllByRole('checkbox').map((c) => c.getAttribute('data-testid'))).toEqual(['status-LC', 'status-VU', 'status-EN', 'status-NE'])
    fireEvent.click(within(panel).getByTestId('status-VU'))
    fireEvent.click(within(panel).getByTestId('status-EN'))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 of 5 species · 2 families$/))
    expect(stats()).not.toHaveTextContent('threatened') // only on the unfiltered line
    expect(within(screen.getByTestId('filter-chips')).getByTestId('chip-status-VU')).toBeInTheDocument()
    expect(within(screen.getByTestId('filter-chips')).getByTestId('chip-status-EN')).toBeInTheDocument()
    expect(screen.getByTestId('filters-button')).toHaveAccessibleName(/^Filters, 1 in use: Conservation status: /)
    // The list view shows what applyFilter (the layout client's resolve) returns for the same filter.
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const shown = Array.from(document.querySelectorAll<HTMLElement>('.eb-lrow [data-code]')).map((b) => b.dataset.code).sort()
    const { applyFilter } = await import('@/lib/list/filters')
    const { buildSpeciesIndex } = await import('@/lib/species/load')
    const index = buildSpeciesIndex(fx.species as never)
    const entries = ['snogoo', 'norfli', 'gilfli', 'amerob', 'yerwar'].map((code) => ({ code, date: '2020-01-01', place: { country: 'CA' } }))
    const resolved = applyFilter(entries as never, { statuses: ['VU', 'EN'] }, index).map((e) => e.code).sort()
    expect(resolved).toEqual(['gilfli', 'yerwar'])
    expect(shown).toEqual(resolved)
  })

  it('a list without a threatened species has no count on its stats line', async () => {
    await mount({ path: '/', stored: (s) => { s.records.ebird = [{ code: 'norfli', source: 'ebird', date: '2020-01-01', place: { country: 'CA' } }] } })
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 species/))
    expect(stats()).not.toHaveTextContent('threatened')
    expect(screen.getByTestId('filters-button')).toBeInTheDocument() // LC is a status
  })
})

describe('when the bird data fails to load', () => {
  it('a visitor without a list still gets the pre-packed sample on /, and no failure notice there', async () => {
    await mount({ path: '/', failSpecies: true })
    await waitFor(() => expect(stats()).toHaveTextContent(/^Sample · 2 species/))
    expect(screen.queryByText(/Couldn't load the bird data/)).toBeNull()
  })

  it('a birder with a list on this device gets their collage page with the "couldn\'t load" notice', async () => {
    await mount({ path: '/', failSpecies: true, stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    expect(await screen.findByText(/Couldn't load the bird data/)).toBeInTheDocument()
  })
})

describe('Settings and the collage', () => {
  it("a MyEBirdData import saved before seen-here: Settings says what the Places panel says, with the same words", async () => {
    await mount({ path: '/settings', stored: (s) => { s.records.ebird = [{ code: 'snogoo', source: 'ebird', date: '2020-01-01', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Capital' } }] } })
    // Counties, but no seen-here: placesNoteFor says 'reimport', and so does Settings (counties used to hide it).
    expect(await screen.findByTestId('ebird-detail')).toHaveTextContent('Places only knows where you first recorded each bird. Import MyEBirdData again to filter by every place you recorded each bird.')
  })
  it('a MyEBirdData import with seen-here: no reimport line', async () => {
    await mount({ path: '/settings', stored: (s) => { s.records.ebird = [{ code: 'snogoo', source: 'ebird', date: '2020-01-01', place: { country: 'CA' }, seen: ['2020-01-01|CA'] }] } })
    expect(await screen.findByTestId('source-ebird')).toBeInTheDocument()
    expect(screen.queryByTestId('ebird-detail')).toBeNull()
  })
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
    expect(screen.getByTestId('places-lifer-note')).toHaveTextContent(/only says where you first recorded each bird.*Add MyEBirdData to filter by every place you recorded each bird, down to the county/)
    await waitFor(async () => expect((await storage.load())?.records['ebird-list']).toHaveLength(3), { timeout: 2000 })
    expect((await storage.load())?.records.ebird).toEqual([])
    expect((await storage.load())?.skipped).toEqual({ 'ebird-list': 1 })
    fireEvent.click(within(made()).getByRole('link', { name: 'See my collage' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/)
    expect(screen.queryByTestId('unmatched-note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const list = screen.getByRole('list', { name: 'Life list' })
    for (const n of ['Northern Flicker', 'Gilded Flicker', 'Yellow-rumped Warbler']) expect(within(list).getByText(n)).toBeInTheDocument()
  })

  it('an observation.org life list imported on Settings shows its row, the summary and its unmatched rows', async () => {
    const { readFileSync } = await import('node:fs')
    const { analytics } = await mount()
    const name = 'observation-2026-01-02-03-04-species_observed_testbirder.csv'
    await drop(new File([readFileSync('tests/fixtures/obsorg/species-observed-nl.csv', 'utf8')], name, { type: 'text/csv' }), 'obsorg-drop')
    // In the test taxonomy: Colaptes auratus (and its subspecies), Setophaga coronata auduboni, and Milvus aegyptius
    // through observation.org's own synonym (Black Kite).
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species, all from observation.org. See my collage'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'obsorg' }]])
    const row = screen.getByTestId('source-obsorg-list')
    expect(row).toHaveTextContent(`observation.org life list · ${name}`)
    expect(row).toHaveTextContent(/3 species · 10 skipped/) // 5 not species, 5 unmatched
    // Only the life list: the note under the observation.org rows; the eBird rows have none.
    expect(screen.getByTestId('places-obsorg-note')).toBeInTheDocument()
    expect(screen.queryByTestId('places-lifer-note')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Fix them' }))
    expect(screen.getByText('observation.org life list row 13')).toBeInTheDocument()
    // Remove takes only this file, and focus goes to the observation.org group.
    fireEvent.click(within(row).getByRole('button', { name: 'More for observation.org life list' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    fireEvent.click(within(row).getByRole('button', { name: 'Yes, remove it' }))
    await waitFor(() => expect(screen.getByRole('group', { name: 'observation.org files' })).toHaveFocus())
    expect(screen.queryByTestId('source-obsorg-list')).toBeNull()
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
      // In the row (an alert) and, for DONE_MS, in the import toast (C10: the fetch outlives the dialog).
      const shown = await screen.findAllByText(message)
      const alert = shown.find((el) => el.closest('[role=alert]'))!
      expect(alert).toBeDefined()
      expect(screen.getByTestId('import-toast')).toHaveTextContent(message)
      expect(alert.textContent).not.toMatch(/error|exception|undefined|status/i)
      expect(made()).toHaveTextContent('Your collage has 3 species')
    }
    expect(vi.mocked(inat.importInat).mock.calls[0][0]).toBe('nobody')
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled() // failed iNat imports send no event
  })

  it('until the first page gives the total, the import toast looks the user up with a spinner, no bar (round 6 item 7)', async () => {
    const { inat } = await mount()
    vi.mocked(inat.importInat).mockImplementationOnce(async () => new Promise(() => {}) as never)
    fireEvent.change(inatField(), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    const toast = await screen.findByTestId('import-toast')
    expect(toast).toHaveTextContent('Looking up “birder”…')
    expect(toast.querySelector('.eb-toast-spin')).not.toBeNull()
    expect(screen.queryByRole('progressbar')).toBeNull()
    // Nothing of the fetch's progress in the sources grid: the toast's line is the only one.
    expect(screen.getAllByText(/Looking up/)).toEqual([within(toast).getByText(/Looking up/)])
    expect(toast.closest('.eb-srclist')).toBeNull()
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
    expect(await screen.findByRole('progressbar', { name: 'Fetching your observations' })).toHaveAttribute('aria-valuetext', '400 of 576')
    const toast = screen.getByTestId('import-toast')
    expect(toast).toHaveTextContent('Fetching your observations · 400 of 576')
    expect(toast).toContainElement(screen.getByRole('progressbar'))
    expect(within(toast).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species, all from iNaturalist. See my collage'))
    // The first birds into an empty list: the milestone (D1).
    expect(screen.getByTestId('import-toast')).toHaveTextContent(/^Your collage has 1 species$/)
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
    expect(await screen.findByRole('progressbar', { name: 'Fetching your observations' })).toHaveAttribute('aria-valuetext', '400 of 576')
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await go('/')
    expect(stats()).toHaveTextContent(/^3 species/)
    await go('/settings')
    await openAdd('Import a file')
    expect(screen.getByRole('progressbar', { name: 'Fetching your observations' })).toHaveAttribute('aria-valuenow', '400') // the fetch and its progress outlived the pages
    expect(within(screen.getByTestId('import-toast')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
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
    // The buttons pressed are gone: focus on Your data, and a toast says it's done (AU2).
    await waitFor(() => expect(screen.getByRole('region', { name: 'Your data' })).toHaveFocus())
    expect(screen.getByTestId('data-toast')).toHaveTextContent('This device no longer holds your list.')
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

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 species/))
    expect(screen.queryByRole('dialog')).toBeNull()
    // A few seconds to undo it.
    expect(screen.getByText('Removed Northern Flicker.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus()) // keyboard users land on it
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    expect(screen.queryByText('Removed Northern Flicker.')).toBeNull()
    fireEvent.click(within(screen.getByRole('list', { name: 'Life list' })).getByRole('button', { name: /Northern Flicker/ }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 species/))

    // Add by hand (Settings' Add birds): the removed species comes back at once, with a date and a region.
    await go('/settings')
    await openTick()
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'northern fl' } })
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-06-15' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'CA' } })
    fireEvent.change(screen.getByLabelText('Region (optional)'), { target: { value: 'CA-BC' } })
    fireEvent.click(tickOption(/^Northern Flicker/))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await waitFor(async () => {
      const s = await storage.load()
      expect(s?.edits.removed).toEqual([])
      expect(s?.edits.added).toEqual([{ code: 'norfli', source: 'manual', date: '2019-06-15', place: { country: 'CA', sub1: 'CA-BC' } }])
    }, { timeout: 2000 })
  })

  it('Add by hand: the orders as a list that opens in place, the search instead of it; a tap (or Space) adds a bird at once, a tap on one on the list takes it off, each with Undo', async () => {
    const { storage, analytics } = await mount()
    await openTick()
    const search = screen.getByLabelText('Search birds')
    expect(search).toHaveFocus() // Settings' Add by hand opens the Add birds dialog on it, the search focused
    // With the search empty: the orders in taxonomic order, each a closed compact disclosure row (no sticker) with its
    // name, its scientific name after it and its count.
    const tree = screen.getByRole('list', { name: 'Species to tick' })
    const rowsOf = (el: HTMLElement) => within(el).getAllByRole('button').map((b) => `${b.getAttribute('aria-label')} ${b.getAttribute('aria-expanded')}`)
    expect(rowsOf(tree)).toEqual(['Waterfowl, 1 species false', 'Woodpeckers, 2 species false', 'Perching birds, 2 species false'])
    expect(screen.queryByRole('listbox')).toBeNull() // no species rows until a genus is open
    const order = screen.getByTestId('tick-group-Piciformes')
    expect(order.querySelector('.eb-tickchev svg')).not.toBeNull()
    expect(order.querySelector('.eb-tickthumb')).toBeNull()
    expect(within(order).getByText('Woodpeckers')).not.toHaveAttribute('lang')
    expect(within(order).getByText('Piciformes')).toHaveAttribute('lang', 'la')
    expect(within(order).getByText('Piciformes')).toHaveClass('eb-ticksub')
    expect(within(order).getByText('2')).toBeInTheDocument()
    // An order of 12 species or fewer opens straight on its species, in place (no lone family or genus rows).
    fireEvent.click(order)
    expect(order).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByTestId('tick-group-Piciformes/Picidae')).toBeNull()
    const colaptes = screen.getByRole('listbox', { name: 'Woodpeckers, 2 species' })
    expect(document.getElementById(order.getAttribute('aria-controls')!)).toContainElement(colaptes)
    expect(colaptes).toHaveAttribute('aria-multiselectable', 'true')
    expect(within(colaptes).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Northern Flicker, Colaptes auratus', 'Gilded Flicker, Colaptes chrysoides'])
    // "When and where" is always there, under the list (no button to open it); empty, a bird gets no date and no place.
    expect(screen.queryByRole('button', { name: 'When and where' })).toBeNull()
    expect(screen.getByRole('group', { name: 'When and where' })).toContainElement(screen.getByLabelText('Date (optional)'))
    expect(screen.getByLabelText('Date (optional)')).toBeVisible()
    // A tap in an open genus adds the bird: selected, and says so in words; announced with Undo, focus left on its list.
    fireEvent.click(within(colaptes).getByRole('option', { name: /^Northern Flicker/ }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species, all ticked by hand.'))
    // The first bird into an empty list: the collage it starts, too (D1).
    expect(screen.getByText('Added Northern Flicker. Your collage has 1 species.')).toBeInTheDocument()
    expect(screen.getByText('Added Northern Flicker. Your collage has 1 species.').closest('[role=status]')).not.toBeNull()
    const flicker = within(colaptes).getByRole('option', { name: /^Northern Flicker, Colaptes auratus, already on your list/ })
    expect(flicker).toHaveAttribute('aria-selected', 'true')
    expect(within(flicker).getByText('On your list')).toBeInTheDocument()
    expect(colaptes).toHaveFocus()
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'manual' }]])
    // Typing shows the search's matches instead of the list; clearing it brings the list back, the same rows open.
    fireEvent.change(search, { target: { value: 'goose' } })
    expect(screen.queryByRole('list', { name: 'Species to tick' })).toBeNull()
    const list = screen.getByRole('listbox', { name: 'Species to tick' })
    expect(within(list).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Snow Goose, Anser caerulescens'])
    fireEvent.change(search, { target: { value: '' } })
    expect(screen.queryByRole('listbox', { name: 'Species to tick' })).toBeNull()
    expect(screen.getByTestId('tick-group-Piciformes')).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('listbox', { name: 'Woodpeckers, 2 species' })).toBeInTheDocument()
    // Keyboard, in the search, with a year and a country set: the arrows move the active row, Space adds it with them.
    fireEvent.change(screen.getByLabelText('Or a year'), { target: { value: '2018' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'US' } })
    fireEvent.change(search, { target: { value: 'flicker' } })
    const flickers = screen.getByRole('listbox', { name: 'Species to tick' })
    expect(within(flickers).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Northern Flicker, Colaptes auratus, already on your list', 'Gilded Flicker, Colaptes chrysoides'])
    flickers.focus()
    fireEvent.keyDown(flickers, { key: 'ArrowDown' }) // the Gilded Flicker
    fireEvent.keyDown(flickers, { key: ' ' })
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species'))
    // The year and country the bar gave it, named (C8).
    expect(screen.getByText('Added Gilded Flicker · 2018 · United States.')).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).toHaveBeenCalledTimes(1) // only the first bird starts a collage
    await waitFor(async () => expect((await storage.load())?.edits.added).toEqual([
      { code: 'norfli', source: 'manual' },
      { code: 'gilfli', source: 'manual', date: '2018', place: { country: 'US' } },
    ]), { timeout: 2000 })
    // Undo takes it off again, focus back on the list it was ticked in.
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species'))
    expect(tickOption(/^Gilded Flicker/)).toHaveAttribute('aria-selected', 'false')
    expect(flickers).toHaveFocus()
    // Cleared again, When and where gives the next bird nothing.
    fireEvent.change(screen.getByLabelText('Or a year'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: '' } })
    fireEvent.click(tickOption(/^Gilded Flicker/))
    await waitFor(async () => expect((await storage.load())?.edits.added.at(-1)).toEqual({ code: 'gilfli', source: 'manual' }), { timeout: 2000 })
    // The search matches word prefixes of either name.
    // No match: the note alone, no empty listbox (P13).
    fireEvent.change(search, { target: { value: 'zzzz' } })
    expect(screen.queryByRole('listbox', { name: 'Species to tick' })).toBeNull()
    expect(screen.getByText("No bird by that name in eBird's taxonomy.")).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'colaptes aur' } })
    expect(within(screen.getByRole('listbox', { name: 'Species to tick' })).getAllByRole('option').map((o) => o.getAttribute('aria-label'))).toEqual(['Northern Flicker, Colaptes auratus, already on your list'])
    // A tap on a bird on the list takes it off at once, as the card's Remove does; Undo puts back exactly what was there.
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species'))
    const before = (await storage.load())!.edits
    fireEvent.click(tickOption(/^Northern Flicker, Colaptes auratus, already on your list/))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 1 species'))
    expect(screen.getByText('Removed Northern Flicker.')).toBeInTheDocument()
    expect(tickOption(/^Northern Flicker/)).toHaveAttribute('aria-selected', 'false')
    await waitFor(async () => expect((await storage.load())?.edits.removed).toEqual(['norfli']), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species'))
    expect(screen.queryByText('Removed Northern Flicker.')).toBeNull()
    await waitFor(async () => expect((await storage.load())?.edits).toEqual(before), { timeout: 2000 })
    // The notice leaves by itself after about 6 s.
    fireEvent.click(tickOption(/^Northern Flicker, Colaptes auratus, already on your list/))
    expect(screen.getByText('Removed Northern Flicker.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('Removed Northern Flicker.')).toBeNull(), { timeout: 8000 })
  }, 20_000) // the Undo toast's ~6 s

  it('Add by hand with Scientific on leads every group with its scientific name, the common one after it', async () => {
    await mount({ path: '/', stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    // Scientific names is the Collage's Display panel's (round 6).
    fireEvent.click(await screen.findByTestId('display-button'))
    fireEvent.click(screen.getByRole('switch', { name: /Scientific/ }))
    fireEvent.click(screen.getByTestId('display-button'))
    await openTick()
    // Add by hand's groups keep the common name first, the scientific one after it (round 6).
    const tree = screen.getByRole('list', { name: 'Species to tick' })
    expect(within(tree).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Waterfowl, 1 species', 'Woodpeckers, 2 species', 'Perching birds, 2 species'])
    const order = screen.getByTestId('tick-group-Piciformes')
    expect(within(order).getByText('Piciformes')).toHaveAttribute('lang', 'la')
    expect(within(order).getByText('Piciformes')).toHaveClass('eb-ticksub')
    expect(within(order).getByText('Woodpeckers')).not.toHaveAttribute('lang')
  })

  it('adding a bird by hand to a list from eBird is an edit, not a new collage; taking an eBird bird off puts it in removed', async () => {
    const { analytics, storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await openTick()
    const search = screen.getByLabelText('Search birds')
    fireEvent.change(search, { target: { value: 'snow' } })
    fireEvent.click(tickOption(/^Snow Goose/))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'ebird' }]])
    fireEvent.change(search, { target: { value: 'northern' } })
    fireEvent.click(tickOption(/^Northern Flicker, Colaptes auratus, already on your list/))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    await waitFor(async () => expect((await storage.load())?.edits.removed).toEqual(['norfli']), { timeout: 2000 })
    expect((await storage.load())?.records['ebird-list'].some((r) => r.code === 'norfli')).toBe(true) // the file's record stays
  })

  it('add by hand refuses a year it cannot use', async () => {
    await mount()
    await openTick()
    const year = screen.getByLabelText('Or a year')
    fireEvent.change(year, { target: { value: '20x9' } })
    expect(screen.getByText('Use a year from 1800 to this year.')).toBeInTheDocument()
    expect(year).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'snow' } })
    fireEvent.click(tickOption(/^Snow Goose/))
    expect(year).toHaveFocus()
    expect(screen.queryByTestId('see-collage')).toBeNull()
    expect(screen.queryByText('Added Snow Goose.')).toBeNull()
  })

  it('restore from backup (on Settings, without a list) brings a list back and opens the collage; a bad file gets a plain message', async () => {
    const { storage } = await mount()
    const bad = new File(['not json'], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [bad] } }) })
    expect(await screen.findByText(/Couldn't restore this backup. This file is not valid JSON./)).toBeInTheDocument()
    const good = { ...storage.emptySaved(), records: { ebird: [], inat: [], manual: [{ code: 'snogoo', source: 'manual' }] } } // a backup from before the second eBird slot
    const file = new File([JSON.stringify(good)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
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
    expect(screen.getByTestId('data-toast')).toHaveTextContent('Your backup is restored.')
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

describe('the collage title (set in the share dialog, no longer on Settings; the page is always "My birds")', () => {
  it('Settings has no title field; a saved title is kept for the share card, the page still reads "My birds"', async () => {
    const { storage } = await mount({ path: '/', stored: (s) => { s.name = 'Birds of 2026'; s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Birds of 2026' })).toBeNull()
    expect((await storage.load())?.name).toBe('Birds of 2026') // no "'s birds"
    await go('/settings')
    expect(screen.queryByLabelText('Name your collage')).toBeNull()
  })

  it('a list with no title is "My birds"', async () => {
    await mount({ path: '/', stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
  })

  it('a list saved with an old bare name keeps the title it always had', async () => {
    const { storage } = await mount({ path: '/', stored: (s) => { ;(s as { v: number }).v = 3; s.name = 'Ada'; s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    await waitFor(async () => expect((await storage.load())?.name).toBe("Ada's birds"))
  })

  it('a restored backup brings its title to the collage', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species'))
    const { emptySaved } = await import('@/lib/list/storage')
    const { toJson } = await import('@/lib/list/export')
    const backup = { ...emptySaved(), name: 'Sam', records: { ...emptySaved().records, manual: [{ code: 'snogoo', source: 'manual' as const }] } }
    const file = new File([toJson(backup)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Yes, replace it' })) })
    await go('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'My birds' })).toBeInTheDocument()
    await waitFor(async () => expect((await storage.load())?.name).toBe('Sam'))
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
    // Remove is the row's ⋯ menu's one item (Replace is the button beside it, never repeated: round 6 item 6); it asks once, and "Keep it" changes nothing (focus back on ⋯).
    const more = within(line).getByRole('button', { name: 'More for eBird life list' })
    expect(more).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(more)
    expect(within(screen.getByRole('menu', { name: 'More for eBird life list' })).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Remove'])
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
    expect(await screen.findByRole('progressbar', { name: 'Fetching your observations' })).toHaveAttribute('aria-valuetext', '10 of 600')
    expect(within(screen.getByTestId('source-inat')).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }, { code: 'snogoo', source: 'inat', date: '2024-06-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 5 species'))

    fireEvent.click(within(screen.getByTestId('source-inat')).getByRole('button', { name: 'More for iNaturalist' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Change username', 'Remove']) // Refresh is the row's button, not repeated
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

  it('Settings lays out the sources; its Add by hand, at the end of their heading row, opens the dialog as Add by hand alone', async () => {
    await mount({ stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add birds' })).toBeNull()
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings.slice(0, 2)).toEqual(['Your list', 'Counting'])
    expect(document.getElementById('tick')).toBeNull()
    expect(screen.getByTestId('ebird-drop')).toBeVisible()
    expect(screen.getByText('Your list never leaves your browser. We count visits anonymously.')).toBeInTheDocument()
    const hand = screen.getByRole('button', { name: 'Add by hand' })
    expect(hand.closest('.eb-block-headrow')).toContainElement(screen.getByRole('heading', { level: 2, name: 'Your list' }))
    expect(hand).toHaveAttribute('aria-haspopup', 'dialog')
    hand.focus()
    fireEvent.click(hand)
    // Adding by hand alone: titled "Add by hand", no switch to Import a file (Settings has its own import rows).
    const dialog = screen.getByRole('dialog', { name: 'Add by hand' })
    expect(within(dialog).queryByRole('group', { name: /ways/i })).toBeNull()
    expect(within(dialog).queryByRole('button', { name: 'Import a file' })).toBeNull()
    expect(within(dialog).getByRole('list', { name: 'Species to tick' })).toBeInTheDocument()
    expect(within(dialog).getByText(/^Ticked by hand · 1 species/)).toBeInTheDocument()
    // Esc closes it, focus back on Add by hand.
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(hand).toHaveFocus()
  })

  it('in the dialog Add by hand is one press away, Tab stays inside, and Esc closes it with focus back on Add birds', async () => {
    await mount({ path: '/', stored: (s) => { s.records.manual = [{ code: 'snogoo', source: 'manual' }] } })
    const add = await screen.findByRole('button', { name: 'Add birds' })
    add.focus()
    fireEvent.click(add)
    const dialog = screen.getByRole('dialog', { name: 'Add birds' })
    expect(dialog).toHaveFocus()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add by hand' }))
    await waitFor(() => expect(screen.getByLabelText('Search birds')).toHaveFocus())
    // Tab from the last control wraps to the first (the close button).
    const close = within(dialog).getByRole('button', { name: 'Close' })
    // In document order (jsdom returns a selector list's matches grouped by selector): the last is When and where's.
    const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      .sort((x, y) => (x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    expect(focusables.at(-1)).toHaveAccessibleName('Country (optional)')
    focusables.at(-1)!.focus()
    fireEvent.keyDown(focusables.at(-1)!, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(add).toHaveFocus()
  })

})
