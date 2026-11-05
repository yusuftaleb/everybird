// @vitest-environment jsdom
// The landing page and the collage page, end to end in jsdom: the store, storage (fake IndexedDB), the
// importers and the edit flows are real; the eBird worker and the iNaturalist API are mocked, and there is
// no layout worker in jsdom (the stage shows its placeholder; the list view and the stats line carry the count).
import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

async function mount(opts: { blockStorage?: boolean } = {}) {
  vi.resetModules()
  stubFetch()
  if (opts.blockStorage) vi.stubGlobal('indexedDB', { open: () => { throw new Error('SecurityError') } })
  else (globalThis as { indexedDB: IDBFactory }).indexedDB = new IDBFactory()
  const { Home } = await import('@/components/app/Home')
  const storage = await import('@/lib/list/storage')
  const inat = await import('@/lib/import/inat')
  const utils = render(<Home />)
  await screen.findByRole('heading', { name: 'Make yours' })
  return { storage, inat, ...utils }
}

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

describe('landing and the three ways in', () => {
  it('the landing page shows the sample collage, the three ways in, the privacy line and the sticker credit', async () => {
    await mount()
    expect(screen.getByRole('heading', { level: 1, name: 'Everybird' })).toBeInTheDocument()
    expect(screen.getByText("Every bird you've ever seen.")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('collage-stats')).toHaveTextContent('2 species'))
    for (const h of ['eBird file', 'iNaturalist', 'Tick by hand']) expect(screen.getByRole('heading', { name: h })).toBeInTheDocument()
    expect(screen.getByText('Your list never leaves your browser. We count visits anonymously.')).toBeInTheDocument()
    const credit = screen.getByRole('link', { name: 'huashu-bird-sticker' })
    expect(credit).toHaveAttribute('href', 'https://github.com/alchaincyf/huashu-bird-sticker')
    expect(credit.closest('p')).toHaveTextContent('Stickers: huashu-bird-sticker, CC BY 4.0')
    expect(screen.getByRole('button', { name: 'Make yours' })).toBeInTheDocument()
  })

  it('dropping a lifelist CSV adds its species', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    expect(screen.getByRole('heading', { name: 'Add another source' })).toBeInTheDocument()
    expect(screen.getByText("1 sp., slash or hybrid entry doesn't count")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    const list = screen.getByRole('region', { name: 'Life list' })
    for (const n of ['Northern Flicker', 'Gilded Flicker', 'Yellow-rumped Warbler']) expect(within(list).getByText(n)).toBeInTheDocument()
    await waitFor(async () => expect((await storage.load())?.records.ebird).toHaveLength(3), { timeout: 2000 })
    expect((await storage.load())?.skipped).toEqual({ ebird: 1 })
  })

  it('a file that is not an eBird export says so plainly', async () => {
    await mount()
    await drop(new File(['name,age\nx,1\n'], 'other.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read this file")
    expect(screen.getByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
  })

  it('iNat error message is plain and other sources stay', async () => {
    const { inat } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
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
      expect(stats()).toHaveTextContent(/^3 species/)
    }
    expect(vi.mocked(inat.importInat).mock.calls[0][0]).toBe('nobody')
  })

  it('iNat import shows progress and adds its birds as another source', async () => {
    const { inat } = await mount()
    let finish: (v: unknown) => void = () => {}
    vi.mocked(inat.importInat).mockImplementationOnce(async (_u, opts) => {
      opts.onProgress?.({ fetched: 400, total: 576 })
      return new Promise((done) => { finish = done }) as never
    })
    fireEvent.change(screen.getByLabelText('iNaturalist username'), { target: { value: 'birder' } })
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fetch my birds' })) })
    expect(await screen.findByText('Fetched 400 of 576')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await act(async () => { finish({ records: [{ code: 'amerob', source: 'inat', date: '2024-05-01' }], unmatched: [], skipped: 0 }) })
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 species/))
  })

  it('fixing an unmatched row adds the species', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    expect(screen.getByRole('heading', { name: "1 row couldn't be matched" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use American Robin' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^4 species/))
    expect(screen.queryByRole('heading', { name: /couldn't be matched/ })).toBeNull()
  })

  it('an unmatched row can be fixed by hand with a search', async () => {
    await mount()
    await drop(csv(...ROWS, ROBIN_TYPO))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    fireEvent.click(screen.getByRole('button', { name: 'Fix by hand' }))
    fireEvent.change(screen.getByLabelText('Find the right species for American Robbin'), { target: { value: 'snow' } })
    fireEvent.click(screen.getByRole('button', { name: /^Snow Goose/ }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^4 species/))
  })

  it('forget my list asks once then clears', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    await waitFor(async () => expect(await storage.load()).not.toBeNull(), { timeout: 2000 })
    fireEvent.click(screen.getByRole('button', { name: 'Forget my list' }))
    expect(screen.getByText(/Forget this list on this device\?/)).toBeInTheDocument()
    expect(stats()).toHaveTextContent(/^3 species/) // nothing cleared yet
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Yes, forget it' })) })
    expect(await screen.findByRole('heading', { name: 'Make yours' })).toBeInTheDocument()
    await waitFor(async () => expect(await storage.load()).toBeNull())
    expect(screen.queryByText("Couldn't clear this device's copy")).toBeNull()
  })

  it('works in memory and says so when storage is blocked', async () => {
    await mount({ blockStorage: true })
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    expect(screen.getByText("This list won't be saved on this device.", { exact: false })).toBeInTheDocument()
  })
})

describe('editing', () => {
  it('the card edits marks and removes a bird; ticking it by hand brings it back', async () => {
    const { storage } = await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    fireEvent.click(screen.getByRole('button', { name: 'List' }))
    fireEvent.click(within(screen.getByRole('region', { name: 'Life list' })).getByRole('button', { name: /Northern Flicker/ }))
    const card = screen.getByRole('dialog', { name: 'Northern Flicker' })
    const heard = within(card).getByRole('button', { name: /Heard only/ })
    expect(heard).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(heard)
    expect(within(screen.getByRole('dialog', { name: 'Northern Flicker' })).getByText('* heard only')).toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: /Heard only/ })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Heard only/ }))
    expect(within(screen.getByRole('dialog')).queryByText('* heard only')).toBeNull()

    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove from my list' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^2 species/))
    expect(screen.queryByRole('dialog')).toBeNull()

    // Tick by hand: the removed species comes back, with a date and a region.
    fireEvent.change(screen.getByLabelText('Search birds'), { target: { value: 'northern fl' } })
    fireEvent.click(screen.getByRole('button', { name: /^Northern Flicker/ }))
    fireEvent.change(screen.getByLabelText('Date (optional)'), { target: { value: '2019-06' } })
    fireEvent.change(screen.getByLabelText('Country (optional)'), { target: { value: 'CA' } })
    fireEvent.change(screen.getByLabelText('Region (optional)'), { target: { value: 'CA-BC' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add to my list' }))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    await waitFor(async () => {
      const s = await storage.load()
      expect(s?.edits.removed).toEqual([])
      expect(s?.edits.added).toEqual([{ code: 'norfli', source: 'manual', date: '2019-06', place: { country: 'CA', sub1: 'CA-BC' } }])
    }, { timeout: 2000 })
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

  it('restore from backup brings a list back; a bad file gets a plain message', async () => {
    const { storage } = await mount()
    const bad = new File(['not json'], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [bad] } }) })
    expect(await screen.findByText(/Couldn't restore this backup. This file is not valid JSON./)).toBeInTheDocument()
    const good = { ...storage.emptySaved(), records: { ebird: [], inat: [], manual: [{ code: 'snogoo', source: 'manual' }] } }
    const file = new File([JSON.stringify(good)], 'backup.json', { type: 'application/json' })
    await act(async () => { fireEvent.change(screen.getByLabelText('Restore from backup'), { target: { files: [file] } }) })
    await waitFor(() => expect(stats()).toHaveTextContent(/^1 species/))
  })

  it('downloads the list as CSV and as a JSON backup', async () => {
    const urls: Blob[] = []
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: (b: Blob) => { urls.push(b); return 'blob:x' }, revokeObjectURL: () => {} }))
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await mount()
    await drop(csv(...ROWS))
    await waitFor(() => expect(stats()).toHaveTextContent(/^3 species/))
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON backup' }))
    expect(click).toHaveBeenCalledTimes(2)
    expect(await urls[0].text()).toMatch(/^eBird code,Common name/)
    expect(JSON.parse(await urls[1].text()).records.ebird).toHaveLength(3)
    click.mockRestore()
  })
})
