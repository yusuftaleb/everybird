// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useImportJobs, type OnImport } from '@/components/app/use-import-jobs'
import { en } from '@/i18n/messages/en'
import { handleParseMessage, type ParseRequest, type ParseResponse, type ParseResult } from '@/lib/import/parse.worker'
import { ParseError, parseErrorCode, parseInWorker } from '@/lib/import/parse-client'
import { loadRegions } from '@/lib/import/places'
import { fixture, regions, taxonomy as t } from './obsorg-helpers'

// The real client by default (its own tests below); the hook tests run the worker's handler in place of a Worker.
vi.mock('@/lib/import/parse-client', async (orig) => {
  const actual = await orig<typeof import('@/lib/import/parse-client')>()
  return { ...actual, parseInWorker: vi.fn(actual.parseInWorker) }
})
vi.mock('@/lib/import/places', async (orig) => ({
  ...(await orig<typeof import('@/lib/import/places')>()),
  loadRegions: vi.fn(async () => (await import('./obsorg-helpers')).regions),
}))
const EBIRD_DAMAGED = 'damaged'
const file = (kind = 'species-observed-nl') => new File([fixture(kind)], 'synthetic.csv')

describe('observation.org worker dispatch', () => {
  it('parses a species list with the supplied synonyms', async () => {
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'obsorg-species', file:file(), synonyms:{ 'Avis inventa':'gilfli' }}, m => posts.push(m), async () => t)
    expect(posts.at(-1)).toMatchObject({type:'done',result:{rows:15}})
    const done = posts.at(-1) as Extract<ParseResponse,{type:'done'}>
    expect(done.result.records).toHaveLength(7)
  })
  it('reports no-birds as an error', async () => {
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'obsorg-species',file:new File([''],'empty.csv'),synonyms:{}},m => posts.push(m),async () => t)
    expect(posts).toEqual([{type:'error',code:'no-birds',message:'no-birds'}])
  })
  it('parses observations with supplied regions and preserves exclusion details', async () => {
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'obsorg-observations',file:file('observations-nl'),synonyms:{},regions},m => posts.push(m),async () => t)
    const done = posts.at(-1) as Extract<ParseResponse,{type:'done'}>
    expect(done).toMatchObject({type:'done',result:{excluded:{escape:1,uncertain:1}}})
    expect(done.result.records.find(x => x.code === 'norfli')?.place).toEqual({country:'BE',sub1:'BE-VLG'})
  })
  it('refuses observations without regions rather than losing every place', async () => {
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'obsorg-observations',file:file('observations-nl'),synonyms:{}} as never,m => posts.push(m),async () => t)
    expect(posts.at(-1)).toEqual({type:'error',code:'missing-options',message:'observation.org regions are required.'})
  })
  it('refuses observation.org files without the synonyms', async () => {
    for (const kind of ['obsorg-species','obsorg-observations'] as const) {
      const posts: ParseResponse[] = []
      await handleParseMessage({kind,file:file(),regions} as never,m => posts.push(m),async () => t)
      expect(posts.at(-1)).toEqual({type:'error',code:'missing-options',message:'observation.org synonyms are required.'})
    }
  })
  it('a damaged file has the code damaged; other failures carry none', async () => {
    for (const kind of ['obsorg-species','obsorg-observations'] as const) {
      const posts: ParseResponse[] = []
      const damaged = new File(['scientific name,species type\nColumba livia,"species'],'synthetic.csv')
      await handleParseMessage({kind,file:damaged,synonyms:{},regions},m => posts.push(m),async () => t)
      expect(posts.at(-1)).toEqual({type:'error',code:'damaged',message:'Malformed observation.org CSV.'})
    }
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'obsorg-species',file:file(),synonyms:{}},m => posts.push(m),async () => { throw new Error('offline') })
    expect(posts).toEqual([{type:'error',message:'offline'}])
  })
  it('anything an eBird file’s reading or parse throws is damaged; the taxonomy failing never is', async () => {
    const unreadable = { text: async () => { throw new Error('NotReadableError') } } as unknown as File
    const posts: ParseResponse[] = []
    await handleParseMessage({kind:'ebird-lifelist',file:unreadable},m => posts.push(m),async () => t)
    expect(posts).toEqual([{type:'error',code:'damaged',message:'NotReadableError'}])
    const offline: ParseResponse[] = []
    await handleParseMessage({kind:'ebird-lifelist',file:unreadable},m => offline.push(m),async () => { throw new Error('offline') })
    expect(offline).toEqual([{type:'error',message:'offline'}])
    const odd: ParseResponse[] = []
    await handleParseMessage({kind:'nope',file:file()} as never,m => odd.push(m),async () => t)
    expect(odd).toEqual([{type:'error',message:'Unsupported import kind.'}])
  })
})

describe('parse client', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('forwards synonyms and regions, returns excluded counts, and terminates the worker', async () => {
    const postMessage = vi.fn(), terminate = vi.fn()
    const instances: FakeWorker[] = []
    class FakeWorker {
      onmessage?: (e:{data:ParseResponse}) => void
      postMessage = postMessage
      terminate = terminate
      constructor() { instances.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    const clientRegions = {v:1 as const,countries:{NL:'Netherlands'},sub1:{'NL-NH':'North Holland'}}
    const f = file('observations-nl'), synonyms = { 'Avis inventa':'gilfli' }
    const progress = vi.fn()
    const result = parseInWorker('obsorg-observations',f,{onProgress:progress,synonyms,regions:clientRegions})
    expect(postMessage).toHaveBeenCalledWith({kind:'obsorg-observations',file:f,synonyms,regions:clientRegions})
    instances[0].onmessage!({data:{type:'progress',rows:5000}})
    const parsed = {records:[],unmatched:[],skipped:0,excluded:{escape:1,uncertain:1}}
    instances[0].onmessage!({data:{type:'done',result:parsed}})
    expect(await result).toEqual(parsed)
    expect(progress).toHaveBeenCalledWith(5000)
    expect(terminate).toHaveBeenCalledOnce()
  })
  it('rejects with a ParseError carrying the worker’s code', async () => {
    const instances: { onmessage?: (e:{data:ParseResponse}) => void; onerror?: (e:{message:string}) => void }[] = []
    class FakeWorker {
      onmessage?: (e:{data:ParseResponse}) => void
      onerror?: (e:{message:string}) => void
      postMessage = vi.fn()
      terminate = vi.fn()
      constructor() { instances.push(this) }
    }
    vi.stubGlobal('Worker', FakeWorker)
    const noBirds = parseInWorker('obsorg-species',file(),{synonyms:{}})
    instances[0].onmessage!({data:{type:'error',code:'no-birds',message:'no-birds'}})
    const e = await noBirds.catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ParseError)
    expect(parseErrorCode(e)).toBe('no-birds')
    const crashed = parseInWorker('ebird-mydata',file())
    instances[1].onerror!({message:''})
    const e2 = await crashed.catch((x: unknown) => x)
    expect(e2).toBeInstanceOf(ParseError)
    expect(parseErrorCode(e2)).toBeUndefined()
    expect(parseErrorCode(new Error('x'))).toBeUndefined()
  })
})

describe('useImportJobs: one readFile for both file groups', () => {
  const real = vi.mocked(parseInWorker).getMockImplementation()!
  const named = (text: string, name: string) => new File([text], name, { type: 'text/csv' })
  const speciesFile = () => named(fixture('species-observed-nl'), 'o.csv')
  const observationsFile = () => named(fixture('observations-nl'), 'obs.csv')
  const ebirdLifeList = () => named(readFileSync('tests/fixtures/ebird/lifelist-basic.csv', 'utf8'), 'ebird_world_life_list.csv')
  /** The worker's own handler, in place: resolves or rejects as parseInWorker does. */
  const inPlace = (kind: string, file: File, opts?: Record<string, unknown>) =>
    new Promise<ParseResult>((resolve, reject) => {
      const { onProgress, ...extra } = (opts ?? {}) as { onProgress?: (rows: number) => void }
      void handleParseMessage({ kind, file, ...extra } as ParseRequest, (m) => {
        if (m.type === 'progress') onProgress?.(m.rows)
        else if (m.type === 'done') resolve(m.result)
        else reject(new ParseError(m.message, m.code))
      }, async () => t)
    })
  beforeEach(() => {
    vi.mocked(parseInWorker).mockImplementation(inPlace as never)
    vi.stubGlobal('fetch', async (u: string | URL) =>
      String(u).includes('inat-synonyms') ? new Response('{}') : new Response('no', { status: 404 }))
  })
  afterEach(() => {
    vi.mocked(parseInWorker).mockImplementation(real)
    vi.unstubAllGlobals()
  })
  const setup = () => {
    const onImport = vi.fn<OnImport>()
    const hook = renderHook(() => useImportJobs(onImport))
    return { onImport, hook }
  }

  it('the observation.org life list lands in obsorg-list with its details', async () => {
    const { onImport, hook } = setup()
    await act(() => hook.result.current.readObsOrg(speciesFile()))
    expect(onImport).toHaveBeenCalledOnce()
    const [slot, result, details] = onImport.mock.calls[0]
    expect(slot).toBe('obsorg-list')
    expect(result.records.length).toBeGreaterThan(0)
    expect(details).toEqual({ kind: 'species-list', file: 'o.csv', rows: 15, at: expect.any(String) })
    expect(vi.mocked(parseInWorker)).toHaveBeenCalledWith('obsorg-species', expect.any(File), expect.objectContaining({ synonyms: {} }))
    expect(hook.result.current.obsorg).toEqual({ busy: false, rows: 0, error: null })
  })
  it('the observations export lands in obsorg with its excluded counts, read with the regions', async () => {
    const { onImport, hook } = setup()
    await act(() => hook.result.current.readObsOrg(observationsFile()))
    const [slot, , details] = onImport.mock.calls[0]
    expect(slot).toBe('obsorg')
    expect(details).toMatchObject({ kind: 'observations', file: 'obs.csv', excluded: { escape: 1, uncertain: 1 }, at: expect.any(String) })
    expect(vi.mocked(parseInWorker)).toHaveBeenCalledWith('obsorg-observations', expect.any(File), expect.objectContaining({ synonyms: {}, regions }))
  })
  it('the kind decides the slot; the status shows where the file was given', async () => {
    const { onImport, hook } = setup()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    vi.mocked(parseInWorker).mockImplementationOnce((async (...a: Parameters<typeof inPlace>) => { await gate; return inPlace(...a) }) as never)
    let read!: Promise<void>
    act(() => { read = hook.result.current.readEbird(speciesFile()) })
    await vi.waitFor(() => expect(hook.result.current.ebird.busy).toBe(true))
    expect(hook.result.current.obsorg.busy).toBe(false)
    open()
    await act(() => read)
    expect(onImport.mock.calls[0][0]).toBe('obsorg-list')
    await act(() => hook.result.current.readObsOrg(ebirdLifeList()))
    expect(onImport.mock.calls[1][0]).toBe('ebird-list')
    expect(onImport.mock.calls[1][2]).toMatchObject({ kind: 'life-list', file: 'ebird_world_life_list.csv' })
  })
  it('an unsupported spreadsheet file is refused plainly, in the same neutral words on any group', async () => {
    const { onImport, hook } = setup()
    const xls = () => new File(['\u00d0\u00cf\u0011\u00e0rest'], 'observation-2026-species_observed.xls')
    await act(() => hook.result.current.readObsOrg(xls()))
    expect(hook.result.current.obsorg.error).toBe('unsupported-sheet')
    expect(en.ui.import.sheet.errors.unsupported).toBe('This spreadsheet format is not supported. Save it as .xlsx or CSV and add that file instead.')
    await act(() => hook.result.current.readEbird(xls()))
    expect(hook.result.current.ebird.error).toBe('unsupported-sheet')
    await act(() => hook.result.current.readSheet(new File(['PK\u0003\u0004rest'], 'list.ods')))
    expect(hook.result.current.sheet.error).toBe('unsupported-sheet')
    expect(onImport).not.toHaveBeenCalled()
  })
  it('a file without birds says to choose Birds; an unknown file names the exports, by the group it was given to', async () => {
    const { onImport, hook } = setup()
    const amphibians = 'name,scientific name,group,date first observed,date last observed,number of observations,number of individuals,number of photos,number of sounds,species type\nToad,Bufo bufo,Amfibieën,2020-01-01,,1,1,0,0,soort\n'
    await act(() => hook.result.current.readObsOrg(named(amphibians, 'o.csv')))
    expect(hook.result.current.obsorg.error).toBe('obsorg-no-birds')
    await act(() => hook.result.current.readObsOrg(named('name,age\nx,1\n', 'other.csv')))
    expect(hook.result.current.obsorg.error).toBe('obsorg-unknown')
    await act(() => hook.result.current.readEbird(named('name,age\nx,1\n', 'other.csv')))
    expect(hook.result.current.ebird.error).toBe('unknown-file')
    expect(hook.result.current.obsorg.error).toBeNull()
    const damaged = 'name,scientific name,group,date first observed,species type\nX,"Columba livia,Vogels,,soort\n'
    await act(() => hook.result.current.readObsOrg(named(damaged, 'o.csv')))
    expect(hook.result.current.obsorg.error).toBe('obsorg-damaged')
    // A damaged file is named by its kind, wherever it was given: an eBird file in eBird's words, an observation.org
    // file in observation.org's.
    vi.mocked(parseInWorker).mockRejectedValueOnce(new ParseError('broken', 'damaged'))
    await act(() => hook.result.current.readObsOrg(ebirdLifeList()))
    expect(hook.result.current.obsorg.error).toBe(EBIRD_DAMAGED)
    vi.mocked(parseInWorker).mockRejectedValueOnce(new ParseError('broken', 'damaged'))
    await act(() => hook.result.current.readEbird(ebirdLifeList()))
    expect(hook.result.current.ebird.error).toBe(EBIRD_DAMAGED)
    await act(() => hook.result.current.readEbird(named(damaged, 'o.csv')))
    expect(hook.result.current.ebird.error).toBe('obsorg-damaged')
    await act(() => hook.result.current.readEbird(named(amphibians, 'o.csv')))
    expect(hook.result.current.ebird.error).toBe('obsorg-no-birds')
    expect(onImport).not.toHaveBeenCalled()
  })
  it("Everybird's own data not loading is never the file's fault", async () => {
    const { onImport, hook } = setup()
    expect(en.ui.import.obsorg.errors.data).toBe("Couldn't load Everybird's bird data. Check your connection and try again.")
    // The synonyms fail (offline; a fresh module, since a loaded copy is kept): both groups say so, and the worker is
    // never started.
    vi.resetModules()
    const fresh = await import('@/components/app/use-import-jobs')
    const freshClient = await import('@/lib/import/parse-client')
    const calls = vi.mocked(freshClient.parseInWorker).mock.calls.length
    vi.stubGlobal('fetch', async () => { throw new TypeError('offline') })
    const offline = renderHook(() => fresh.useImportJobs(onImport))
    await act(() => offline.result.current.readObsOrg(speciesFile()))
    expect(offline.result.current.obsorg.error).toBe('data')
    await act(() => offline.result.current.readEbird(observationsFile()))
    expect(offline.result.current.ebird.error).toBe('data')
    expect(vi.mocked(freshClient.parseInWorker).mock.calls.length).toBe(calls)
    offline.unmount()
    vi.stubGlobal('fetch', async (u: string | URL) =>
      String(u).includes('inat-synonyms') ? new Response('{}') : new Response('no', { status: 404 }))
    // The regions fail.
    vi.mocked(loadRegions).mockRejectedValueOnce(new Error('offline'))
    await act(() => hook.result.current.readObsOrg(observationsFile()))
    expect(hook.result.current.obsorg.error).toBe('data')
    // The worker fails without a code (the taxonomy didn't load, or it crashed), on either kind and group.
    vi.mocked(parseInWorker).mockRejectedValueOnce(new ParseError('offline'))
    await act(() => hook.result.current.readEbird(ebirdLifeList()))
    expect(hook.result.current.ebird.error).toBe('data')
    vi.mocked(parseInWorker).mockRejectedValueOnce(new ParseError('offline'))
    await act(() => hook.result.current.readObsOrg(speciesFile()))
    expect(hook.result.current.obsorg.error).toBe('data')
    expect(onImport).not.toHaveBeenCalled()
    // Back online: the same file reads.
    await act(() => hook.result.current.readObsOrg(speciesFile()))
    expect(onImport).toHaveBeenCalledOnce()
    expect(hook.result.current.obsorg.error).toBeNull()
  })
  it('one file at a time: a second read while one is busy is ignored', async () => {
    const { onImport, hook } = setup()
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    vi.mocked(parseInWorker).mockImplementationOnce((async (...a: Parameters<typeof inPlace>) => { await gate; return inPlace(...a) }) as never)
    let first!: Promise<void>
    act(() => { first = hook.result.current.readObsOrg(speciesFile()) })
    await vi.waitFor(() => expect(hook.result.current.obsorg.busy).toBe(true))
    await act(() => hook.result.current.readEbird(ebirdLifeList()))
    open()
    await act(() => first)
    expect(onImport).toHaveBeenCalledOnce()
    expect(onImport.mock.calls[0][0]).toBe('obsorg-list')
  })
})
