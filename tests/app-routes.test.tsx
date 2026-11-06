// @vitest-environment jsdom
// The app's three pages (/, /make, /my) under one EverybirdProvider, end to end in jsdom: the store, storage (fake
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

function stubFetch() {
  vi.stubGlobal('fetch', async (u: string | URL) => {
    const url = String(u)
    const body = url.includes('species.v1')
      ? { v: 1, species: fx.species }
      : url.includes('taxonomy.v1')
        ? { v: 1, taxa: fx.taxa }
        : url.includes('regions.v1')
          ? regionsFile
          : url.includes('sample.v1')
            ? sampleFile
            : url.includes('inat-synonyms')
              ? {}
              : null
    return body ? new Response(JSON.stringify(body)) : new Response('no', { status: 404 })
  })
}

async function mount(opts: { blockStorage?: boolean; failForget?: boolean; path?: string } = {}) {
  vi.resetModules()
  stubFetch()
  if (opts.failForget)
    vi.doMock('@/lib/list/storage', async (orig) => ({ ...(await orig<typeof import('@/lib/list/storage')>()), forget: async () => 'failed' as const }))
  else vi.doUnmock('@/lib/list/storage')
  if (opts.blockStorage) vi.stubGlobal('indexedDB', { open: () => { throw new Error('SecurityError') } })
  else (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  const { EverybirdProvider } = await import('@/components/app/EverybirdProvider')
  const { Landing } = await import('@/components/app/Landing')
  const { MakePage } = await import('@/components/app/MakePage')
  const { MyPage } = await import('@/components/app/MyPage')
  const { SiteFooter } = await import('@/components/app/SiteFooter')
  const storage = await import('@/lib/list/storage')
  const inat = await import('@/lib/import/inat')
  const analytics = await import('@/lib/analytics')
  vi.mocked(analytics.track).mockClear()
  nav.replaced = []
  function App() {
    const [path, setPath] = useState(opts.path ?? '/make')
    nav.path = path
    nav.go = (p) => { nav.path = p; setPath(p) }
    return (
      <EverybirdProvider>
        {path === '/my' ? <MyPage /> : path === '/make' ? <MakePage /> : <Landing />}
        <SiteFooter />
      </EverybirdProvider>
    )
  }
  const utils = render(<App />)
  if ((opts.path ?? '/make') === '/make') await screen.findByTestId('ebird-drop') // the data and the stored list have loaded
  return { storage, inat, analytics, ...utils }
}

/** Move to another page, as a link click does (the provider, and any import in flight, stay). */
const go = (path: string) => act(async () => { nav.go(path) })
/** /make's "See my collage" status: what landed and the collage's count. */
const made = () => screen.getByTestId('see-collage')

const stats = () => screen.getByTestId('collage-stats')

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

describe('the landing page', () => {
  it('shows the hero, the live sample collage, "Make yours" (to /make) and the sticker credit', async () => {
    await mount({ path: '/' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Everybird' })).toBeInTheDocument()
    expect(screen.getByText("Every bird you've ever seen.")).toBeInTheDocument()
    await waitFor(() => expect(stats()).toHaveTextContent('2 species'))
    expect(screen.getByRole('link', { name: 'Make yours' })).toHaveAttribute('href', '/make')
    expect(screen.queryByRole('link', { name: 'Open my collage' })).toBeNull()
    const credit = screen.getByRole('link', { name: 'huashu-bird-sticker' })
    expect(credit).toHaveAttribute('href', 'https://github.com/alchaincyf/huashu-bird-sticker')
    expect(credit.closest('p')).toHaveTextContent('Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(screen.getByRole('switch', { name: 'Dark mode' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('link', { name: 'Make yours' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Make yours' })).toBeInTheDocument()
    for (const h of ['eBird file', 'iNaturalist', 'Tick by hand']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    expect(screen.getByText('Your list never leaves your browser. We count visits anonymously.')).toBeInTheDocument()
  })

  it('a returning birder also gets "Open my collage" (to /my)', async () => {
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/')
    expect(await screen.findByRole('link', { name: 'Open my collage' })).toHaveAttribute('href', '/my')
  })
})

describe('/make and /my', () => {
  it('/my without a list sends people to /make', async () => {
    await mount({ path: '/my' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Make yours' })).toBeInTheDocument()
    expect(nav.replaced).toEqual(['/make'])
  })

  it('dropping a life list download adds its species, says what it lacks, and "See my collage" opens /my', async () => {
    const { storage, analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Added 3 species from your eBird life list. Your collage has 3 species.'))
    // One anonymous event: the source only, no counts, names or places.
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'ebird' }]])
    expect(screen.getByRole('heading', { level: 1, name: 'Add another source' })).toBeInTheDocument()
    expect(screen.getByText("1 sp., slash or hybrid entry doesn't count")).toBeInTheDocument()
    expect(screen.getByTestId('ebird-detail')).toHaveTextContent(/state or province.*Download My Data.*region \(county\)/)
    await waitFor(async () => expect((await storage.load())?.records['ebird-list']).toHaveLength(3), { timeout: 2000 })
    expect((await storage.load())?.records.ebird).toEqual([])
    expect((await storage.load())?.skipped).toEqual({ 'ebird-list': 1 })
    fireEvent.click(within(made()).getByRole('link', { name: 'See my collage' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'My collage' })).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/)
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const list = screen.getByRole('list', { name: 'Life list' })
    for (const n of ['Northern Flicker', 'Gilded Flicker', 'Yellow-rumped Warbler']) expect(within(list).getByText(n)).toBeInTheDocument()
    // Share and the downloads sit in the page head; "Add another source" goes back to /make.
    const head = screen.getByRole('banner')
    for (const b of ['Share', 'Download CSV', 'Download JSON backup']) expect(within(head).getByRole('button', { name: b })).toBeInTheDocument()
    expect(within(head).getByRole('link', { name: 'Add another source' })).toHaveAttribute('href', '/make')
  })

  it('a file that is not an eBird export says so plainly', async () => {
    const { analytics } = await mount()
    await drop(new File(['name,age\nx,1\n'], 'other.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read this file")
    expect(screen.getByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled() // a failed import sends no event
  })

  it('iNat error message is plain and other sources stay', async () => {
    const { inat, analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    vi.mocked(analytics.track).mockClear()
    const cases: [string, RegExp][] = [
      ['unknown-user', /couldn't find an iNaturalist user called “nobody”/i],
      ['no-birds', /“nobody” has no public bird observations/i],
      ['network', /couldn't reach iNaturalist/i],
      ['rate-limited', /iNaturalist is busy/i],
    ]
    for (const [error, message] of cases) {
      vi.mocked(inat.importInat).mockResolvedValueOnce({ error } as never)
      fireEvent.change(screen.getByLabelText('iNaturalist username'), { target: { value: 'nobody' } })
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
      const alert = await screen.findByText(message)
      expect(alert.closest('[role=alert]')).not.toBeNull()
      expect(alert.textContent).not.toMatch(/error|exception|undefined|status/i)
      expect(made()).toHaveTextContent('Your collage has 3 species.')
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
    fireEvent.change(screen.getByLabelText('iNaturalist username'), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(await screen.findByText('Fetched 400 of 576')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(vi.mocked(analytics.track)).not.toHaveBeenCalled()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(made()).toHaveTextContent('Added 1 species from iNaturalist. Your collage has 1 species.'))
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
    fireEvent.change(screen.getByLabelText('iNaturalist username'), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(await screen.findByText('Fetched 400 of 576')).toBeInTheDocument()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
    expect(stats()).toHaveTextContent(/^3 species/)
    await go('/')
    await go('/make')
    expect(screen.getByText('Fetched 400 of 576')).toBeInTheDocument() // the fetch and its progress outlived the pages
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(aborted).toBe(false)
    await go('/my')
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
    fireEvent.change(screen.getByLabelText('iNaturalist username'), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Cancel' })) })
    expect(await screen.findByText('Cancelled. Nothing was added.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fetch my birds' })).toBeInTheDocument()
  })

  it('fixing an unmatched row adds the species (the match report is on /make)', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    expect(screen.getByRole('heading', { name: "1 row couldn't be matched" })).toBeInTheDocument()
    expect(screen.getByText('eBird life list row 5')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use American Robin' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species.'))
    expect(screen.queryByRole('heading', { name: /couldn't be matched/ })).toBeNull()
  })

  it('an unmatched row can be fixed by hand with a search', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    fireEvent.click(screen.getByRole('button', { name: 'Fix by hand' }))
    fireEvent.change(screen.getByLabelText('Find the right species for American Robbin'), { target: { value: 'snow' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snow Goose/ }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species.'))
  })

  it('the counting rules for the current imports are on /make once there is a list', async () => {
    await mount()
    expect(screen.queryByRole('heading', { name: 'Your rules' })).toBeNull()
    await drop(csv(...ROWS))
    expect(await screen.findByRole('heading', { name: 'Your rules' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Hide heard-only birds' })).toBeInTheDocument()
  })

  it('forget my list asks once, clears, and goes back to /make', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await waitFor(async () => expect(await storage.load()).not.toBeNull(), { timeout: 2000 })
    await go('/my')
    fireEvent.click(screen.getByRole('button', { name: 'Forget my list' }))
    expect(screen.getByText(/Forget this list on this device\?/)).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/) // nothing cleared yet
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, forget it' })) })
    expect(await screen.findByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
    await waitFor(async () => expect(await storage.load()).toBeNull())
    expect(screen.queryByText("Couldn't clear this device's copy")).toBeNull()
  })

  it("a failed forget says the device copy couldn't be cleared", async () => {
    await mount({ failForget: true })
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
    fireEvent.click(screen.getByRole('button', { name: 'Forget my list' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, forget it' })) })
    expect(await screen.findByText(/Couldn't clear this device's copy/)).toBeInTheDocument()
    expect(screen.getByText(/Couldn't clear this device's copy/).closest('[role=alert]')).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'Make yours' })).toBeInTheDocument() // memory is cleared either way
    vi.doUnmock('@/lib/list/storage')
  })

  it('works in memory and says so when storage is blocked', async () => {
    await mount({ blockStorage: true })
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
  })
})

describe('editing', () => {
  it('the card edits marks and removes a bird; ticking it by hand brings it back', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
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

    // Tick by hand (on /make): the removed species comes back, with a date and a region.
    await go('/make')
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'northern fl' } })
    fireEvent.click(screen.getByRole('button', { name: /^Northern Flicker/ }))
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-06' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'CA' } })
    fireEvent.change(screen.getByLabelText('Region (optional)'), { target: { value: 'CA-BC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await waitFor(async () => {
      const s = await storage.load()
      expect(s?.edits.removed).toEqual([])
      expect(s?.edits.added).toEqual([{ code: 'norfli', source: 'manual', date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } }])
    }, { timeout: 2000 })
  })

  it('the first bird ticked by hand counts as one collage made (manual); later ticks do not', async () => {
    const { analytics } = await mount()
    for (const [q, name] of [['snow', /^Snow Goose/], ['northern fl', /^Northern Flicker/]] as const) {
      fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: q } })
      fireEvent.click(screen.getByRole('button', { name }))
      fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    }
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 2 species.'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'manual' }]])
  })

  it('ticking a bird onto a list from eBird is an edit, not a new collage', async () => {
    const { analytics } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'snow' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snow Goose/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 4 species.'))
    expect(vi.mocked(analytics.track).mock.calls).toEqual([['collage_made', { source: 'ebird' }]])
  })

  it('tick by hand rejects a malformed date', async () => {
    await mount()
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'snow' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snow Goose/ }))
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-13' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    expect(screen.getByText('Use YYYY-MM-DD, YYYY-MM or YYYY.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
  })

  it('restore from backup (on /make) brings a list back and opens /my; a bad file gets a plain message', async () => {
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

  it('restoring a backup over an existing list (on /my) asks first', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
    const good = { ...storage.emptySaved(), records: { ebird: [], 'ebird-list': [], inat: [], manual: [{ code: 'snogoo', source: 'manual' }] } }
    const file = new File([JSON.stringify(good)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    expect(screen.getByText(/Replace your list with this backup\?/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my list' }))
    expect(stats()).toHaveTextContent(/^3 species/)
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    fireEvent.click(screen.getByRole('button', { name: 'Yes, replace it' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 species/))
  })

  it('downloads the list as CSV and as a JSON backup from the head of /my', async () => {
    const urls: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { urls.push(b); return 'blob:x' }, revokeObjectURL: () => {} }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(made()).toHaveTextContent('Your collage has 3 species.'))
    await go('/my')
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON backup' }))
    expect(click).toHaveBeenCalledTimes(2)
    expect(await urls[0].text()).toMatch(/^eBird code,Common name/)
    expect(JSON.parse(await urls[1].text()).records['ebird-list']).toHaveLength(3)
    click.mockRestore()
  })
})
