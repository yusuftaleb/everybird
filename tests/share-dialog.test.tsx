// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useMemo, useReducer } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDay } from '@/lib/file-name'
import ShareDialog from '@/components/share/ShareDialog'
import * as image from '@/lib/share/image'
import { ARRANGEMENT_KEY, arrangement, setArrangement } from '@/lib/arrangement'
import { setTreeLayout, setTreeMine, treeLayout } from '@/lib/tree-mine'
import { track } from '@/lib/analytics'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import { initialState, makeReducer } from '@/lib/list/store'
import { buildSeen } from '@/lib/list/seen'
import { decodeShare } from '@/lib/share/link'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { LANGS } from '@/i18n/langs'
import { MESSAGES, withI18n } from './i18n-render'

/** Today's local date: saved files end with it. */
const D = localDay()

// The renderer is replaced by a promise the test resolves, so "busy" is under the test's control.
const renders: { resolve: (b: Blob) => void }[] = []
vi.mock('@/lib/share/image', async (orig) => ({
  ...(await orig<typeof import('@/lib/share/image')>()),
  packForImage: vi.fn(async () => ({ boxes: [] })),
  renderShareImage: vi.fn(() => new Promise<Blob>((resolve) => renders.push({ resolve }))),
  clearStickerCache: vi.fn(),
}))
vi.mock('@/lib/download', () => ({ downloadBlob: vi.fn() }))
// The Map and Tree views' own images (loaded only from those views).
type TreeFitsCb = { onTreeFits?: (f: Record<'fan' | 'circle', boolean>, byCard?: Record<string, Record<'fan' | 'circle', boolean>>) => void }
const viewRenders = vi.hoisted(() => ({ map: vi.fn(async () => new Blob(['map'])), tree: vi.fn<(o?: TreeFitsCb) => Promise<Blob>>(async () => new Blob(['tree'])) }))
vi.mock('@/lib/share/map-image', () => ({ renderMapImage: viewRenders.map }))
vi.mock('@/lib/share/tree-image', () => ({ renderTreeImage: viewRenders.tree }))

// The poster is made by a promise the test settles; it records the progress callback, the signal and the opts.
type FakePoster = { size: string; landscape: boolean; bytes: number; soft: number; missing: number; namesDropped?: boolean; file: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
const makes: { opts: { size: string; signal?: AbortSignal; pack?: unknown; render?: (scale: number) => Promise<Blob> }; onProgress: (d: number, t: number) => void; resolve: (p: FakePoster) => void; reject: (e: unknown) => void }[] = []
const posterMock = () => ({
  makePoster: vi.fn((opts, onProgress) => new Promise((resolve, reject) => makes.push({ opts, onProgress, resolve, reject }))),
  // The Tree's and the Map's poster: the same record, its opts carrying `render(scale)` instead of a pack.
  makeViewPoster: vi.fn((opts, onProgress) => new Promise((resolve, reject) => makes.push({ opts, onProgress, resolve, reject }))),
})
vi.mock('@/lib/share/poster', () => posterMock()) // called at the first import, once posterMock exists
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))
vi.mock('@/lib/download', () => ({ downloadBlob: vi.fn() }))
const fakePoster = (over: Partial<FakePoster> = {}): FakePoster => ({
  size: 'A2', landscape: false, bytes: 1, soft: 0, missing: 0,
  file: vi.fn(async (kind: string) => new Blob([kind], { type: kind === 'png' ? 'image/png' : 'application/pdf' })),
  dispose: vi.fn(),
  ...over,
})

const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([row('ostric2', 1), row('emu1', 2)])
const regions = { v: 1 as const, countries: { CA: 'Canada' }, sub1: {} }
const entry = (code: string): ListEntry => ({ code, date: '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })
const stateWith = (list: ListEntry[]) => ({ ...initialState(), list })
/** Picks `option` in the dropdown whose name starts with `label` (MenuSelect: the row's label, then the current choice). */
const pickMenu = (label: string, option: string) => {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} `) }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: option }))
}
/** Presses `name` in the segmented control named `group` (Arrangement, Appearance, Count). */
const pickSeg = (group: string, name: string) => fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name }))
/** Opens Export in batches (collapsed to start). */
const openBulk = () => fireEvent.click(screen.getByRole('button', { name: 'Export in batches' }))
/** A click as a pointer gives it: the button takes focus first (fireEvent.click alone leaves focus where it was). */
const pressFocused = (name: string) => {
  const b = screen.getByRole('button', { name })
  b.focus()
  fireEvent.click(b)
}

beforeEach(() => {
  renders.length = 0
  makes.length = 0
  vi.mocked(track).mockClear()
  vi.mocked(downloadBlob).mockClear()
  vi.mocked(image.packForImage).mockClear()
  vi.mocked(image.renderShareImage).mockClear()
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); history.replaceState(null, '', '/'); delete document.documentElement.dataset.theme })

describe('share dialog', () => {
  it('"Card title" starts from the saved title and saves as it is typed (it names the collage page too)', async () => {
    const dispatch = vi.fn()
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, name: "Ada's big year" }
    render(<ShareDialog state={state} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    const field = screen.getByLabelText('Card title') as HTMLInputElement
    expect(field.value).toBe("Ada's big year")
    fireEvent.change(field, { target: { value: 'Ada B.' } })
    expect(field.value).toBe('Ada B.')
    expect(dispatch).toHaveBeenCalledWith({ type: 'name', name: 'Ada B.' })
  })

  it('disables Share image and Download image while the image renders', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const shareBtn = screen.getByRole('button', { name: 'Share image' }) as HTMLButtonElement
    const dlBtn = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
    expect(shareBtn.disabled).toBe(true)
    expect(dlBtn.disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Copy link' }) as HTMLButtonElement).disabled).toBe(false)
    await waitFor(() => expect(renders).toHaveLength(1))
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    await waitFor(() => expect(shareBtn.disabled).toBe(false))
    expect(dlBtn.disabled).toBe(false)
  })

  it('Share image hands the share sheet the image and the full sticker credit as its text', async () => {
    const share = vi.fn<(d: ShareData) => Promise<void>>(async () => {})
    vi.stubGlobal('navigator', { ...navigator, share, canShare: () => true })
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    const btn = screen.getByRole('button', { name: 'Share image' }) as HTMLButtonElement
    await waitFor(() => expect(btn.disabled).toBe(false))
    fireEvent.click(btn)
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1))
    const data = share.mock.calls[0][0]
    expect(data.text).toBe('Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker')
    expect(data.files?.[0].type).toBe('image/png')
  })

  it('copies a link without the birds the link index does not know, and says so', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('notabird1'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const url = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(url).toMatch(/\/s\/1/)
    expect(decodeShare(url.split('/s/')[1]).birds.map((b) => b.code)).toEqual(['ostric2', 'emu1'])
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Link copied. 1 bird is too new for links and left out.'))
  })

  it('the image and the link carry the collage title verbatim, trimmed (no "\'s birds" added)', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, name: 'Birds of 2026' }
    render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Card title'), { target: { value: '  Kenya, 2026  ' } })
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].name).toBe('Kenya, 2026'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const url = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(decodeShare(url.split('/s/')[1])).toMatchObject({ name: 'Kenya, 2026', titled: true })
  })

  it('hands the clipboard a promised item inside the click where ClipboardItem exists (iOS keeps the gesture)', async () => {
    class FakeItem { constructor(readonly items: Record<string, Promise<Blob>>) {} }
    const write = vi.fn(async (items: FakeItem[]) => { await items[0].items['text/plain'] })
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('ClipboardItem', FakeItem)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { write, writeText } })
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    expect(write).toHaveBeenCalledTimes(1) // synchronously, before anything is awaited
    const blob = await (write.mock.calls[0][0][0] as FakeItem).items['text/plain']
    expect(await blob.text()).toMatch(/\/s\/1/)
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Link copied.'))
    expect(writeText).not.toHaveBeenCalled()
  })

  it('"Show latest lifer" is a switch, on by default; off re-renders without the row, with the same pack spec (the with-row frame)', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Show latest lifer' })
    expect(sw).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0].latest).toBe(true)
    await act(async () => renders[0].resolve(new Blob(['on'], { type: 'image/png' })))
    const dl = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
    await waitFor(() => expect(dl.disabled).toBe(false))
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(dl.disabled).toBe(true) // the old image is never downloaded for the new state
    await waitFor(() => expect(renders).toHaveLength(2))
    expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0].latest).toBe(false)
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2]).toEqual(
      image.imagePackSpec('story', { name: false, filter: false, latest: false, count: 1 }))
  })

  it('turning the switch off packs for the taller frame the row leaves (no empty bands); on again reuses the first pack', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    const sw = screen.getByRole('switch', { name: 'Show latest lifer' })
    fireEvent.click(sw)
    await waitFor(() => expect(renders).toHaveLength(2))
    fireEvent.click(sw)
    await waitFor(() => expect(renders).toHaveLength(3))
    expect(vi.mocked(image.packForImage)).toHaveBeenCalledTimes(2)
    const [on, off] = vi.mocked(image.packForImage).mock.calls.map((c) => c[2])
    expect(off.aspect).toBeLessThan(on.aspect) // the same width, taller
    const calls = vi.mocked(image.renderShareImage).mock.calls.map((c) => c[0])
    expect(calls.map((o) => o.latest)).toEqual([true, false, true])
    expect(calls[1].pack).not.toBe(calls[0].pack)
    expect(calls[2].pack).toBe(calls[0].pack)
  })

  it('with no dated bird in view there is no latest lifer, so no switch', () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Show latest lifer' })).toBeNull()
  })

  it('each open starts with the switch on', () => {
    const { unmount } = render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Show latest lifer' }))
    unmount()
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Show latest lifer' })).toHaveAttribute('aria-checked', 'true')
  })

  it('ends with Buy Me a Coffee\'s static button, self-hosted, linking to the page in a new tab', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const link = screen.getByRole('link', { name: 'Buy me a coffee' })
    expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/yusuftaleb')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const img = link.querySelector('img')!
    expect(img).toHaveAttribute('src', '/buy-me-a-coffee.png')
    expect(img).toHaveAttribute('alt', 'Buy me a coffee')
    expect(img).toHaveAttribute('height', '32')
    expect(link.parentElement!.lastElementChild).toBe(link) // last in the controls column
  })

  it('is one screen: Share makes images only (no Print poster in it); Print opens the same dialog on the poster, with no way back', async () => {
    const first = render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Share your collage' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'What to share' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Big Year' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Image format' }).querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Orientation' })).toBeInTheDocument()
    // Share image first, then the quiet ones; no poster options.
    const actions = screen.getByRole('button', { name: 'Share image' }).parentElement!
    expect([...actions.querySelectorAll('.eb-share-row button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Download image', 'Copy link'])
    expect(screen.queryByRole('button', { name: /^Print/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Poster size / })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Make poster' })).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Show species names' })).toBeNull()
    // Export in batches is offered for images too, collapsed, PNGs only.
    const toggle = within(screen.getByTestId('share-bulk')).getByRole('button', { name: 'Export in batches' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('button', { name: 'Download PNGs (ZIP)' })).toBeNull()
    openBulk()
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('region', { name: 'Export in batches' })).toHaveTextContent('A ZIP with one image, or one poster, for each group.')
    expect(screen.getByRole('button', { name: 'Download PNGs (ZIP)' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PDFs (ZIP)' })).toBeNull()
    first.unmount()

    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Print your collage' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Poster size / })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Image format' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Back to image' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Show species names' })).toBeInTheDocument()
    expect(screen.getByTestId('share-bulk')).toBeInTheDocument()
    openBulk()
    expect(screen.getByRole('button', { name: 'Download PDFs (ZIP)' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
  })

  it('the share image and the poster draw the Map or Tree view they were opened from, at its level; other views draw the collage', async () => {
    viewRenders.map.mockClear()
    viewRenders.tree.mockClear()
    const st = stateWith([entry('ostric2')])
    const { unmount } = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="map" at={{ place: 'c:CA' }} onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.map).toHaveBeenCalledTimes(1))
    expect(viewRenders.map.mock.calls[0]).toMatchObject([{ format: 'story', at: { place: 'c:CA' }, latest: false, state: { list: st.list } }])
    expect(image.renderShareImage).not.toHaveBeenCalled()
    expect(image.packForImage).not.toHaveBeenCalled()
    // Titled for what it shares. No sticker options for a map: no latest lifer switch, Fit or Oval, Count or goal; Totals
    // (Species, Countries, each on at every open), Appearance and Transparent.
    expect(screen.getByRole('heading', { name: 'Share your map' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Show latest lifer' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Arrangement' })).toBeNull()
    expect(screen.queryByTestId('share-goal')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Count' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Transparent background' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Hide totals' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeInTheDocument()
    expect(screen.queryByTestId('share-bulk')).toBeNull()
    expect(viewRenders.map.mock.calls[0]).toMatchObject([{ totals: ['species', 'countries'] }])
    const mapTotals = within(screen.getByRole('group', { name: 'Totals' }))
    expect(mapTotals.getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([['Species', 'true'], ['Countries', 'true']])
    // Pick several (round 6, item 25): the site's chips, not joined segments; a check before the word while on.
    expect(screen.getByTestId('share-totals')).toHaveClass('eb-share-chips')
    expect(screen.getByTestId('share-totals')).not.toHaveClass('eb-seg')
    for (const b of mapTotals.getAllByRole('button')) {
      expect(b).toHaveClass('eb-chip')
      expect(b).toHaveAttribute('data-selected')
      expect(b.querySelector('svg.eb-chip-icon')).not.toBeNull()
    }
    fireEvent.click(mapTotals.getByRole('button', { name: 'Species' }))
    expect(mapTotals.getByRole('button', { name: 'Species' })).toHaveAttribute('aria-pressed', 'false')
    expect(mapTotals.getByRole('button', { name: 'Species' })).not.toHaveAttribute('data-selected')
    expect(mapTotals.getByRole('button', { name: 'Species' }).querySelector('svg')).toBeNull()
    await waitFor(() => expect(viewRenders.map).toHaveBeenLastCalledWith(expect.objectContaining({ totals: ['countries'] })))
    fireEvent.click(mapTotals.getByRole('button', { name: 'Countries' }))
    await waitFor(() => expect(viewRenders.map).toHaveBeenLastCalledWith(expect.objectContaining({ totals: [] })))
    unmount()

    // Print from the Map: the map at the poster's size, with the poster's sizes and only the map's options.
    viewRenders.map.mockClear()
    const poster = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="map" at={{ place: 'c:CA' }} print onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.map).toHaveBeenCalledTimes(1))
    expect(viewRenders.map.mock.calls[0]).toMatchObject([{ format: 'print', printSize: 'A2', at: { place: 'c:CA' } }])
    expect(image.renderShareImage).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Print your map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Poster size A2' })).toBeInTheDocument()
    for (const name of ['Show latest lifer', 'Show species names', 'Lifers only']) expect(screen.queryByRole('switch', { name })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Count' })).toBeNull()
    expect(screen.queryByTestId('share-bulk')).toBeNull()
    // All on again at this open (not stored).
    expect(within(screen.getByRole('group', { name: 'Totals' })).getAllByRole('button').map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'true'])
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ size: 'A2', landscape: false, transparent: false })
    expect(makes[0].opts.pack).toBeUndefined()
    // The poster's drawing is the map image at the scale the poster gives it.
    await makes[0].opts.render!(2.296)
    expect(viewRenders.map).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'print', printSize: 'A2', scale: 2.296, at: { place: 'c:CA' } }))
    await act(async () => makes[0].resolve(fakePoster()))
    expect(await screen.findByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download PDF' })).toBeInTheDocument()
    poster.unmount()
    makes.length = 0

    viewRenders.map.mockClear()
    const tree = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: { fam: 'Struthionidae' } }} onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenCalledTimes(1))
    // Inside a family: only Species and Genera are offered, both on (round 6).
    expect(viewRenders.tree.mock.calls[0]).toMatchObject([{ at: { tree: { fam: 'Struthionidae' }, mine: false }, totals: ['species', 'genera'] }])
    expect(viewRenders.map).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: 'Share your tree' })).toBeInTheDocument()
    // The Tree image: no Count row; Totals (its four ranks), Lifers only (the bar's switch), with Appearance and Transparent.
    expect(screen.queryByRole('group', { name: 'Count' })).toBeNull()
    for (const name of ['Lifers only', 'Transparent background']) expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false')
    const treeTotals = within(screen.getByRole('group', { name: 'Totals' }))
    expect(treeTotals.getAllByRole('button').map((b) => b.textContent)).toEqual(['Species', 'Genera'])
    fireEvent.click(treeTotals.getByRole('button', { name: 'Species' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ totals: ['genera'] })))
    fireEvent.click(screen.getByRole('switch', { name: 'Lifers only' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: { tree: { fam: 'Struthionidae' }, mine: true, layout: 'rows', time: true } })))
    act(() => setTreeMine(false))
    // Round 6, item 12: Time scale starts as the screen's switch (on unless at.time is false); off, the image has no ages.
    const time = screen.getByRole('switch', { name: 'Time scale' })
    expect(time).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(time)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: expect.objectContaining({ time: false }) })))
    fireEvent.click(time)
    // Round 6: Show oldest lineage (on at first, as Show latest lifer) and the Arrangement row, the dock's Layout menu.
    const oldest = screen.getByRole('switch', { name: 'Show oldest lineage' })
    expect(oldest).toHaveAttribute('aria-checked', 'true')
    expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ oldest: true }))
    fireEvent.click(oldest)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ oldest: false })))
    expect(within(screen.getByTestId('share-tree-layout')).getByRole('button', { name: 'Rectangular' })).toHaveAttribute('aria-pressed', 'true')
    tree.unmount()

    // Print from the Tree: the tree as on screen, its switches beside the poster's size.
    viewRenders.tree.mockClear()
    const treePoster = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: { fam: 'Struthionidae' }, layout: 'rows' }} print onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenCalledTimes(1))
    expect(viewRenders.tree.mock.calls[0]).toMatchObject([{ format: 'print', at: { tree: { fam: 'Struthionidae' }, layout: 'rows', mine: false } }])
    expect(screen.getByRole('heading', { name: 'Print your tree' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Lifers only' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Totals' })).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Show species names' })).toBeNull()
    expect(screen.queryByTestId('share-bulk')).toBeNull()
    treePoster.unmount()

    vi.mocked(image.renderShareImage).mockClear()
    render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="list" onClose={() => {}} />)
    await waitFor(() => expect(image.renderShareImage).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story' })
    expect(screen.getByRole('switch', { name: 'Show latest lifer' })).toBeInTheDocument()
  })

  it('the options are one plain list under the title field, in the layout\'s order; Export in batches a row in its own panel under it', () => {
    const first = render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const label = (el: Element): string => (el.getAttribute('role') === 'switch' ? el.textContent! : el.querySelector('.eb-share-optlabel')!.textContent!)
    let list = screen.getByTestId('share-options')
    // The title: its label above the field (round 2), then the list.
    const title = screen.getByLabelText('Card title')
    expect(title.previousElementSibling).toHaveClass('eb-share-labelrow')
    expect(title.closest('.eb-share-field')!.nextElementSibling).toBe(list)
    expect([...list.children].map(label)).toEqual(['Arrangement', 'Appearance', 'Count', 'Show latest lifer', 'Transparent background', 'Goal'])
    // One row each, nothing paired: a switch is its row (its label, then its track at the right edge).
    for (const el of list.children) expect(el).toHaveClass('eb-share-opt')
    const transparent = screen.getByRole('switch', { name: 'Transparent background' })
    expect(transparent.parentElement).toBe(list)
    expect([...transparent.children].map((c) => c.className)).toEqual(['', 'eb-track'])
    // The choices are small segmented controls named by their row; Count's sizes show S, M, L, named in full.
    expect(within(screen.getByRole('group', { name: 'Arrangement' })).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Fit', 'Oval', 'Free'])
    expect(within(screen.getByRole('group', { name: 'Appearance' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Light', 'Dark'])
    const count = within(screen.getByRole('group', { name: 'Count' })).getAllByRole('button')
    expect(count.map((b) => b.textContent)).toEqual(['Hide', 'S', 'M', 'L', 'Beside title'])
    expect(count.map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Hide', 'Small', 'Medium', 'Large', 'Beside title'])
    for (const g of ['Arrangement', 'Appearance', 'Count']) expect(screen.getByRole('group', { name: g })).toHaveClass('eb-seg', 'eb-share-seg')
    // Export in batches: a row in its own panel right under the list, collapsed.
    expect(list.nextElementSibling).toBe(screen.getByTestId('share-bulk'))
    expect(within(screen.getByTestId('share-bulk')).getByRole('button', { name: 'Export in batches' })).toHaveClass('eb-share-opt')
    // The format and the orientation share the top row.
    expect(screen.getByRole('group', { name: 'Image format' }).parentElement).toBe(screen.getByRole('group', { name: 'Orientation' }).parentElement)
    expect(screen.queryByRole('switch', { name: /^Mark / })).toBeNull()
    first.unmount()
    // In the poster the size is the list's first row (a dropdown, its line under the label), and the names switch joins.
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    list = screen.getByTestId('share-options')
    // No Goal: posters never draw one.
    expect([...list.children].map(label)).toEqual(['Poster size', 'Arrangement', 'Appearance', 'Count', 'Show latest lifer', 'Show species names', 'Transparent background'])
    expect(list.nextElementSibling).toBe(screen.getByTestId('share-bulk'))
    expect(list.firstElementChild).toHaveTextContent('A2 · 42 × 59.4 cm · 2480 × 3508 px at 150 dpi')
    expect(screen.getByRole('button', { name: 'Poster size A2' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('the Tree: Fan, Radial or Rectangular in one control; no orientation control, the arrangement picks it (a Fan horizontal) in Share and Print', async () => {
    const st = stateWith([entry('ostric2')])
    viewRenders.tree.mockClear()
    const first = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: {}, layout: 'rows' }} onClose={() => {}} />)
    const arrange = () => within(screen.getByRole('group', { name: 'Arrangement' }))
    expect(arrange().getAllByRole('button').map((b) => b.textContent)).toEqual(['Fan', 'Radial', 'Rectangular'])
    expect(arrange().getByRole('button', { name: 'Rectangular' })).toHaveAttribute('aria-pressed', 'true')
    // No orientation control for the Tree (round 6, item 23): Rectangular is vertical, so the formats are Story, Post, Square.
    expect(screen.queryByRole('group', { name: 'Orientation' })).toBeNull()
    const formats = () => within(screen.getByRole('group', { name: 'Image format' })).getAllByRole('button')
    expect(formats().map((b) => b.textContent)).toEqual(['Story', 'Post', 'Square'])
    expect(formats().map((b) => b.getAttribute('aria-label'))).toEqual(['Story, 9:16', 'Post, 4:5', 'Square, 1:1'])
    // A Fan turns the image horizontal: Desktop, Post 5:4 and Square (the story becomes the desktop); never a Fan drawn as rows.
    fireEvent.click(arrange().getByRole('button', { name: 'Fan' }))
    expect(treeLayout()).toBe('fan')
    expect(formats().map((b) => b.getAttribute('aria-label'))).toEqual(['Desktop, 16:9', 'Post, 5:4', 'Square, 1:1'])
    expect(screen.queryByRole('group', { name: 'Orientation' })).toBeNull()
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'desktop', at: expect.objectContaining({ layout: 'fan' }) })))
    fireEvent.click(formats()[1])
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'wide', at: expect.objectContaining({ layout: 'fan' }) })))
    fireEvent.click(formats()[0])
    // Radial is vertical again.
    fireEvent.click(arrange().getByRole('button', { name: 'Radial' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'story', at: expect.objectContaining({ layout: 'circle' }) })))
    act(() => setTreeLayout(null))
    first.unmount()

    // It opens with the arrangement drawn on screen (round 6), not a stored pick the screen had no room for.
    act(() => setTreeLayout('circle'))
    const third = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: {}, layout: 'rows' }} onClose={() => {}} />)
    expect(arrange().getByRole('button', { name: 'Rectangular' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: expect.objectContaining({ layout: 'rows' }) })))
    act(() => setTreeLayout(null))
    third.unmount()

    // A layout the image's render says can't name every tip on its card is off with that reason; Rectangular is drawn.
    viewRenders.tree.mockImplementation(async (o) => { o?.onTreeFits?.({ fan: false, circle: true }); return new Blob(['tree']) })
    const second = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: {}, layout: 'fan' }} onClose={() => {}} />)
    await waitFor(() => expect(arrange().getByRole('button', { name: 'Fan' })).toHaveAttribute('aria-disabled', 'true'))
    expect(arrange().getByRole('button', { name: 'Fan' })).toHaveAccessibleDescription('Not enough room for every name')
    expect(arrange().getByRole('button', { name: 'Rectangular' })).toHaveAttribute('aria-pressed', 'true')
    expect(arrange().getByRole('button', { name: 'Radial' })).not.toHaveAttribute('aria-disabled')
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'story', at: expect.objectContaining({ layout: 'rows' }) })))
    fireEvent.click(arrange().getByRole('button', { name: 'Fan' }))
    expect(treeLayout()).toBeNull()
    viewRenders.tree.mockImplementation(async () => new Blob(['tree']))
    second.unmount()

    // Round 6, item 11: a render on the vertical card reports the horizontal card's fit too, so a Fan the desktop image
    // can't draw is off before it is ever picked (and the Radial the story can draw stays on).
    viewRenders.tree.mockClear()
    viewRenders.tree.mockImplementation(async (o) => { o?.onTreeFits?.({ fan: true, circle: true }, { story: { fan: true, circle: true }, desktop: { fan: false, circle: true } }); return new Blob(['tree']) })
    const fourth = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: {}, layout: 'circle' }} onClose={() => {}} />)
    await waitFor(() => expect(arrange().getByRole('button', { name: 'Fan' })).toHaveAttribute('aria-disabled', 'true'))
    expect(arrange().getByRole('button', { name: 'Radial' })).toHaveAttribute('aria-pressed', 'true')
    expect(viewRenders.tree).not.toHaveBeenCalledWith(expect.objectContaining({ at: expect.objectContaining({ layout: 'fan' }) }))
    viewRenders.tree.mockImplementation(async () => new Blob(['tree']))
    act(() => setTreeLayout(null))
    fourth.unmount()

    // Print from the Tree: no orientation row (and no format control, so no top row at all); Rectangular prints portrait,
    // a Fan landscape.
    render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: {}, layout: 'rows' }} print onClose={() => {}} />)
    expect(screen.queryByRole('group', { name: 'Orientation' })).toBeNull()
    expect(document.querySelector('.eb-share-formats')).toHaveAttribute('hidden')
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'print', at: expect.objectContaining({ layout: 'rows' }) })))
    fireEvent.click(arrange().getByRole('button', { name: 'Fan' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'printLandscape', at: expect.objectContaining({ layout: 'fan' }) })))
    act(() => setTreeLayout(null))
  })

  it('the title label says "(optional)" beside it and the placeholder is an example', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const input = screen.getByLabelText('Card title')
    expect(input).toHaveAttribute('placeholder', 'My 2024 birds')
    expect(screen.getByText('(optional)')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription('(optional) Shown as your collage’s title and on shares.')
  })

  it('the filters line shows only with a filter, and Clear filters dispatches the empty filter', () => {
    const dispatch = vi.fn()
    const { unmount } = render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByTestId('share-filters')).toBeNull()
    unmount()
    const st = { ...stateWith([entry('ostric2')]), filter: { countries: ['CA'] } }
    render(<ShareDialog state={st} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByTestId('share-filters')).toHaveTextContent(/^Showing your filters: .*Canada/)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(dispatch).toHaveBeenCalledWith({ type: 'filter', filter: {} })
  })

  it('after Clear filters, the preview, the count, the label and the downloads use the whole list', async () => {
    // A live store around the dialog, as CollagePage gives it: the Canada filter hides the emu (seen in Australia).
    const list = [entry('ostric2'), { ...entry('emu1'), place: { country: 'AU' } }]
    function Live() {
      const reducer = useMemo(() => makeReducer({ species }), [])
      const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...stateWith(list), filter: { countries: ['CA'] } }))
      return <ShareDialog state={state} dispatch={dispatch} species={species} regions={{ ...regions, countries: { CA: 'Canada', AU: 'Australia' } }} onClose={() => {}} />
    }
    render(<Live />)
    await waitFor(() => expect(renders).toHaveLength(1))
    const first = vi.mocked(image.renderShareImage).mock.calls[0][0]
    expect(first.entries.map((e) => e.code)).toEqual(['ostric2'])
    expect(first.filterLabel).toBe('Canada')
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.queryByTestId('share-filters')).toBeNull()
    await waitFor(() => expect(renders).toHaveLength(2))
    const after = vi.mocked(image.renderShareImage).mock.calls[1][0]
    expect(after.entries.map((e) => e.code).sort()).toEqual(['emu1', 'ostric2'])
    expect(after.filterLabel).toBeUndefined()
    // The pack the image draws is made from the whole list too.
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![0].map((e) => e.code).sort()).toEqual(['emu1', 'ostric2'])
  })

  it("Print from the Tree: no rank of its own; the poster draws the screen's rank, its Level, as the share image does", async () => {
    // Round 6, item 22: Print's Down to went; the Tree's Display panel's Level picks the rank for both.
    const st = stateWith([entry('ostric2')])
    viewRenders.tree.mockClear()
    viewRenders.tree.mockImplementation(async () => new Blob(['tree']))
    const at = { tree: { ord: 'Struthioniformes' }, rank: 'families' as const, layout: 'rows' as const }
    const poster = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={at} print onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ format: 'print', printSize: 'A2', at: expect.objectContaining({ rank: 'families' }) })))
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull()
    expect([...document.querySelectorAll('.eb-share-optlabel')].map((l) => l.textContent)).not.toContain('Level')
    // A size changes nothing about the rank.
    pickMenu('Poster size', 'A4')
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ printSize: 'A4', at: expect.objectContaining({ rank: 'families' }) })))
    for (const [o] of viewRenders.tree.mock.calls) {
      expect(o).not.toHaveProperty('deeper')
      expect(o).not.toHaveProperty('onDeeper')
    }
    poster.unmount()
    viewRenders.tree.mockClear()
    render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={at} onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: expect.objectContaining({ rank: 'families' }) })))
    expect(screen.queryByRole('group', { name: 'Level' })).toBeNull()
  })

  it('in the Tree, Clear filters draws the level the tree then shows (the page passes it live), in the image and in Print', async () => {
    // As CollagePage: the store, and the tree's level from its taxonomy filter (the chip row is the tree's path).
    function Live({ print }: { print?: boolean }) {
      const reducer = useMemo(() => makeReducer({ species }), [])
      const [state, dispatch] = useReducer(reducer, undefined, () => ({ ...stateWith([entry('ostric2'), entry('emu1')]), filter: { order: 'Struthioniformes' } }))
      const at = { tree: state.filter.order ? { ord: state.filter.order } : {}, layout: 'rows' as const }
      return <ShareDialog state={state} dispatch={dispatch} species={species} regions={regions} view="tree" at={at} print={print} onClose={() => {}} />
    }
    viewRenders.tree.mockClear()
    const { unmount } = render(<Live />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenCalledTimes(1))
    expect(viewRenders.tree.mock.calls[0]).toMatchObject([{ at: { tree: { ord: 'Struthioniformes' } }, filterLabel: expect.any(String) }])
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: { tree: {}, layout: 'rows', mine: false, time: true }, filterLabel: undefined })))
    expect((viewRenders.tree.mock.lastCall as unknown as [{ entries: ListEntry[] }])[0].entries).toHaveLength(2)
    unmount()
    // Print: the poster is made for the level after Clear filters, not the one the dialog opened on.
    makes.length = 0
    render(<Live print />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    viewRenders.tree.mockClear()
    await makes[0].opts.render!(2)
    expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: { tree: {}, layout: 'rows', mine: false, time: true }, filterLabel: undefined }))
  })

  it('Appearance starts at the app\'s theme (Dark here), then the dialog\'s own; the page theme is left alone', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story', theme: 'dark' })
    const colours = within(screen.getByRole('group', { name: 'Appearance' }))
    expect(colours.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(colours.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(colours.getByRole('button', { name: 'Light' }))
    await waitFor(() => expect(renders).toHaveLength(2))
    expect(vi.mocked(image.renderShareImage).mock.calls[1][0]).toMatchObject({ format: 'story', theme: 'light' })
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('"Transparent background" re-renders the share image without its background; off by default', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ transparent: false })
    fireEvent.click(screen.getByRole('switch', { name: 'Transparent background' }))
    await waitFor(() => expect(renders).toHaveLength(2))
    expect(vi.mocked(image.renderShareImage).mock.calls[1][0]).toMatchObject({ format: 'story', transparent: true })
  })


  it('has no note about what the link carries (About explains it)', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByText(/The link opens your whole collage/)).toBeNull()
    expect(screen.queryByText(/never towns or coordinates/)).toBeNull()
  })

  it("the preview box takes the rendered image's format, so it hugs the image", async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const box = screen.getByTestId('share-preview')
    expect(box).toHaveAttribute('data-format', 'story')
    await waitFor(() => expect(renders).toHaveLength(1))
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    fireEvent.click(screen.getByRole('button', { name: 'Post, 4:5' }))
    // Until the post image is ready the box keeps the story's shape around the story image.
    expect(box).toHaveAttribute('data-format', 'story')
    await waitFor(() => expect(renders).toHaveLength(2))
    await act(async () => renders[1].resolve(new Blob(['png'], { type: 'image/png' })))
    await waitFor(() => expect(box).toHaveAttribute('data-format', 'post'))
  })

  it('the link is the same in every language (a link carries no language, its places stay English)', async () => {
    const urls: string[] = []
    for (const lang of LANGS) {
      const writeText = vi.fn(async () => {})
      vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
      const state = stateWith([entry('ostric2'), entry('emu1')])
      state.saved = { ...state.saved, name: 'Aves de 2026' }
      render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />, { wrapper: withI18n(lang) })
      fireEvent.click(screen.getByRole('button', { name: MESSAGES[lang].ui.share.copyLink }))
      await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
      urls.push((writeText.mock.calls[0] as unknown as [string])[0])
      cleanup()
      vi.unstubAllGlobals()
    }
    expect(new Set(urls).size).toBe(1)
    expect(decodeShare(urls[0].split('/s/')[1]).places).toEqual(['Canada'])
  })

  it('in Spanish: the labels, the image strings, the filter label, and an English download name', async () => {
    const es = MESSAGES.es.ui
    const state = stateWith([entry('ostric2')])
    state.filter = { countries: ['CA'] }
    render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />, { wrapper: withI18n('es') })
    expect(screen.getByRole('heading', { name: 'Comparte tu collage' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Formato de imagen' })).toBeInTheDocument()
    for (const label of ['Historia', 'Post', 'Cuadrado']) expect(screen.getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Última especie nueva' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copiar enlace' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título de la tarjeta')).toBeInTheDocument()
    expect(screen.getByText(/Mostrando tus filtros: /)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: es.share.clearFilters })).toBeInTheDocument()
    await waitFor(() => expect(renders).toHaveLength(1))
    const opts = vi.mocked(image.renderShareImage).mock.calls[0][0]
    expect(opts.strings).toBe(es)
    expect(opts.filterLabel).toBe('Canadá')
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    const dl = screen.getByRole('button', { name: 'Descargar imagen' }) as HTMLButtonElement
    await waitFor(() => expect(dl.disabled).toBe(false))
    fireEvent.click(dl)
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-story-${D}.png`)
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe(`Se guardó everybird-story-${D}.png.`))
  })

  it('in Spanish: the copied note, with a bird left out', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('notabird1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />, { wrapper: withI18n('es') })
    fireEvent.click(screen.getByRole('button', { name: 'Copiar enlace' }))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Enlace copiado. 1 ave es demasiado nueva para los enlaces y se dejó fuera.'))
  })
})

describe('share dialog: print mode', () => {
  const open = () => render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
  const openShare = () => render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  const startMakeAgain = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
  }
  const startMake = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
  }

  it('Print shows the Poster size dropdown (A4–A1 and the inch sizes, A2 to start) and Make poster', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Poster size A2' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual(
      [['A4', 'false'], ['A3', 'false'], ['A2', 'true'], ['A1', 'false'], ['12 × 18 in', 'false'], ['18 × 24 in', 'false'], ['24 × 36 in', 'false']])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'A2' }))
    expect(screen.getByText('A2 · 42 × 59.4 cm · 2480 × 3508 px at 150 dpi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download image' })).toBeNull()
    pickMenu('Poster size', 'A4')
    expect(screen.getByText('A4 · 21 × 29.7 cm · 1240 × 1754 px at 150 dpi')).toBeInTheDocument()
    pickMenu('Poster size', 'A2')
    // The preview is the poster's, in the dialog's theme, at the chosen size.
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', printSize: 'A2', theme: 'light' }))
    await act(async () => renders.at(-1)!.resolve(new Blob(['png'], { type: 'image/png' })))
    await waitFor(() => expect(screen.getByTestId('share-preview')).toHaveAttribute('data-format', 'print'))
    const img = screen.getByAltText('Preview of the A2 poster')
    expect(img).toHaveAttribute('width', '1080')
    expect(img).toHaveAttribute('height', String(Math.round(1080 * 3508 / 2480)))
  })

  it('"Transparent background" is off at first; on, the poster is made transparent and offers the PNG only', async () => {
    open()
    const sw = screen.getByRole('switch', { name: 'Transparent background' })
    expect(sw).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(sw)
    expect(sw).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('share-preview')).toHaveAttribute('data-transparent')
    await startMake()
    expect(makes[0].opts).toMatchObject({ transparent: true })
    await act(async () => makes[0].resolve(fakePoster()))
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull()
  })

  it('puts Make poster and Copy link on one row; once made, Download PNG and Download PDF, Copy link under them', async () => {
    open()
    const duo = () => screen.getByRole('button', { name: 'Make poster' }).parentElement!
    expect(duo()).toHaveClass('eb-share-duo')
    expect([...duo().children].map((b) => b.textContent)).toEqual(['Make poster', 'Copy link'])
    await startMake()
    await act(async () => makes[0].resolve(fakePoster()))
    const png = screen.getByRole('button', { name: 'Download PNG' })
    expect(png.parentElement).toHaveClass('eb-share-duo')
    expect([...png.parentElement!.children].map((b) => b.textContent)).toEqual(['Download PNG', 'Download PDF'])
    expect(screen.getByRole('button', { name: 'Copy link' }).parentElement).toHaveClass('eb-share-row')
  })

  it('Make poster shows a progressbar with Cancel; when done, Download PNG and Download PDF save everybird-a2-<date>.png/.pdf at once', async () => {
    open()
    await startMake()
    expect(makes[0].opts.size).toBe('A2')
    expect(makes[0].opts.pack).toEqual({ boxes: [] }) // the dialog's print pack, so makePoster doesn't pack again
    const bar = screen.getByRole('progressbar', { name: 'Making the poster' })
    expect(bar).toHaveAttribute('aria-valuemin', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '100')
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Make poster' })).toBeNull()
    act(() => makes[0].onProgress(1, 4))
    expect(bar).toHaveAttribute('aria-valuenow', '25')
    expect(screen.getByText('25%')).toBeInTheDocument()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByTestId('share-note').textContent).toBe('Your A2 poster is ready.')
    const png = screen.getByRole('button', { name: 'Download PNG' }) as HTMLButtonElement
    const pdf = screen.getByRole('button', { name: 'Download PDF' }) as HTMLButtonElement
    expect(png.disabled).toBe(false)
    expect(pdf.disabled).toBe(false)
    fireEvent.click(png)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-a2-${D}.png`)
    expect(screen.getByTestId('share-note').textContent).toBe(`Saved everybird-a2-${D}.png.`)
    fireEvent.click(pdf)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2))
    expect(vi.mocked(downloadBlob).mock.calls[1][1]).toBe(`everybird-a2-${D}.pdf`)
    expect(p.file.mock.calls.map((c) => c[0])).toEqual(['png', 'pdf'])
  })

  it('Cancel aborts the make and shows Make poster again', async () => {
    open()
    await startMake()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(makes[0].opts.signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    await act(async () => makes[0].reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })))
    expect(screen.getByTestId('share-note').textContent).toBe('') // a cancel stays quiet
  })

  it('changing the size during a make aborts it (signal aborted) and shows Make poster again; no stale poster downloads', async () => {
    open()
    await startMake()
    pickMenu('Poster size', 'A3')
    expect(makes[0].opts.signal?.aborted).toBe(true)
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    // The old make finishing anyway is dropped, never offered.
    const stale = fakePoster()
    await act(async () => makes[0].resolve(stale))
    expect(stale.dispose).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
    // A finished poster is dropped by a new title too.
    await startMakeAgain()
    const p = fakePoster({ size: 'A3' })
    await act(async () => makes[1].resolve(p))
    expect(screen.getByTestId('share-note').textContent).toBe('Your A3 poster is ready.')
    fireEvent.change(screen.getByLabelText('Poster title'), { target: { value: 'Kenya' } })
    expect(p.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
    expect(screen.getByTestId('share-note').textContent).toBe('')
    expect(downloadBlob).not.toHaveBeenCalled()

    async function startMakeAgain() {
      fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
      await waitFor(() => expect(makes).toHaveLength(2))
      expect(makes[1].opts.size).toBe('A3')
    }
  })

  it('closing the dialog aborts the make and disposes the poster', async () => {
    const first = open()
    await startMake()
    first.unmount()
    expect(makes[0].opts.signal?.aborted).toBe(true)

    makes.length = 0
    const second = open()
    await startMake()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(p.dispose).not.toHaveBeenCalled()
    second.unmount()
    expect(p.dispose).toHaveBeenCalledTimes(1)
  })

  it('soft > 0 shows the smaller-files note; missing > 0 the outlines note; a poster-memory error the try-a-smaller-size note', async () => {
    open()
    await startMake()
    await act(async () => makes[0].resolve(fakePoster({ soft: 3, missing: 1 })))
    expect(screen.getByTestId('share-note').textContent).toBe(
      'Your A2 poster is ready. Some stickers come from smaller files for now, so the biggest birds may print a little soft. '
      + '1 sticker didn’t load and is drawn as an outline. Make the poster again to retry.')

    pickMenu('Poster size', 'A3')
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    await act(async () => makes[1].resolve(fakePoster({ size: 'A3', missing: 5 })))
    expect(screen.getByTestId('share-note').textContent).toBe(
      'Your A3 poster is ready. 5 stickers didn’t load and are drawn as outlines. Make the poster again to retry.')

    pickMenu('Poster size', 'A1')
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(3))
    await act(async () => makes[2].reject(new Error('poster-memory')))
    const note = screen.getByTestId('share-note')
    expect(note.textContent).toBe('Couldn’t make the poster. Try a smaller size.')
    expect(note).toHaveClass('eb-error')
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()

    // Any other failure says to try again.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(4))
    await act(async () => makes[3].reject(new Error('worker died')))
    expect(screen.getByTestId('share-note').textContent).toBe('Couldn’t make the poster. Try again.')
    warn.mockRestore()
  })

  it('announces the make in the status note, and a cancel clears it', async () => {
    open()
    await startMake()
    expect(screen.getByTestId('share-note').textContent).toBe('Making the poster.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('share-note').textContent).toBe('')
  })

  it('a make that finishes after the dialog closed is disposed', async () => {
    const view = open()
    await startMake()
    view.unmount()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(p.dispose).toHaveBeenCalledTimes(1)
  })

  it('a poster whose file fails is dropped: the error note and Make poster come back, focused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    open()
    await startMake()
    const p = fakePoster({ file: vi.fn(async () => { throw new Error('encoder gone') }) })
    await act(async () => makes[0].resolve(p))
    // Focus is still where the dialog put it (fireEvent.click never moves it, so the make's focus moves had nothing to
    // follow); a real click puts it on Download PNG, and only from there (lost when the button goes) does it follow Make
    // poster back.
    const png = screen.getByRole('button', { name: 'Download PNG' })
    pressFocused('Download PNG')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Make poster' })).toHaveFocus())
    expect(png.isConnected).toBe(false) // a new button (its own key), not Download PNG renamed under the focus
    expect(p.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
    const note = screen.getByTestId('share-note')
    expect(note.textContent).toBe('Couldn’t make the poster. Try again.')
    expect(note).toHaveClass('eb-error')
    expect(downloadBlob).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('Make again shows only when stickers are missing, and starts a new make', async () => {
    open()
    await startMake()
    await act(async () => makes[0].resolve(fakePoster()))
    expect(screen.queryByRole('button', { name: 'Make again' })).toBeNull()
    pickMenu('Poster size', 'A3')
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    const p = fakePoster({ size: 'A3', missing: 2 })
    await act(async () => makes[1].resolve(p))
    fireEvent.click(screen.getByRole('button', { name: 'Make again' }))
    expect(p.dispose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(makes).toHaveLength(3))
    expect(makes[2].opts.size).toBe('A3')
    expect(screen.getByRole('progressbar', { name: 'Making the poster' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
  })

  it('Copy link in print mode sends nothing', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Link copied.'))
    expect(track).not.toHaveBeenCalled()
  })

  it('in share mode Download image is still counted', async () => {
    openShare()
    await waitFor(() => expect(renders).toHaveLength(1))
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    const dl = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
    await waitFor(() => expect(dl.disabled).toBe(false))
    fireEvent.click(dl)
    await waitFor(() => expect(track).toHaveBeenCalledWith('image_downloaded', { format: 'story' }))
  })

  it('Print renders the poster once, in the dialog\'s theme', async () => {
    open()
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'print', theme: 'light' })
  })

  it('Appearance: Dark in print mode re-renders the preview dark and discards a made poster; makePoster gets the theme', async () => {
    open()
    await startMake()
    expect(makes[0].opts).toMatchObject({ theme: 'light' })
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
    pickSeg('Appearance', 'Dark')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', theme: 'dark' }))
    expect(p.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
    await startMakeAgain()
    expect(makes[1].opts).toMatchObject({ theme: 'dark', size: 'A2' })
  })

  it('print mode counts the poster made and each download, never the share image events', async () => {
    open()
    await startMake()
    act(() => makes[0].onProgress(1, 1))
    await act(async () => makes[0].resolve(fakePoster()))
    fireEvent.click(screen.getByRole('button', { name: 'Download PNG' }))
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2))
    const names = vi.mocked(track).mock.calls.map((c) => c[0])
    expect(names.filter((n) => n === 'poster_made')).toHaveLength(1)
    expect(track).toHaveBeenCalledWith('poster_downloaded', { format: 'png' })
    expect(track).toHaveBeenCalledWith('poster_downloaded', { format: 'pdf' })
    expect(names.every((n) => n.startsWith('poster_'))).toBe(true)
  })
})

describe('share dialog: the poster module fails to load', () => {
  it('a failed import of the poster module shows the error, and Make poster retries it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // The poster module fails twice, as a chunk that didn't load would: the load when the poster opens, then the one
    // Make poster retries. A fresh dialog module picks the factory up.
    const fail = { left: 2 }
    vi.doMock('@/lib/share/poster', () => {
      if (fail.left > 0) {
        fail.left--
        throw new Error('chunk failed to load')
      }
      return posterMock()
    })
    vi.resetModules()
    const { default: FreshDialog } = await import('@/components/share/ShareDialog')
    render(<FreshDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    await waitFor(() => expect(fail.left).toBe(1))
    // A real click moves focus to Make poster, which fireEvent.click doesn't, and only from there (lost when the button
    // goes) does it follow the one that comes back.
    pressFocused('Make poster')
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Couldn’t make the poster. Try again.'))
    expect(makes).toHaveLength(0)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Make poster' })).toHaveFocus())
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(screen.getByTestId('share-note').textContent).toBe('Making the poster.')
    warn.mockRestore()
    vi.doMock('@/lib/share/poster', posterMock)
  })
})

describe('the orientation switch', () => {
  it('starts Vertical; Horizontal turns the story into Desktop (16:9) and the post into 5:4', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Vertical' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story' })
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    expect(screen.getByRole('button', { name: 'Horizontal' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Desktop, 16:9' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Post, 5:4' })).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({ format: 'desktop' }))
    fireEvent.click(screen.getByRole('button', { name: 'Post, 5:4' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({ format: 'wide' }))
  })

  it('Square keeps the switch on; the chosen orientation holds while the dialog is open', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Square, 1:1' }))
    const horizontal = screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement
    expect(horizontal.disabled).toBe(false)
    expect(horizontal).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({ format: 'square' }))
    fireEvent.click(screen.getByRole('button', { name: 'Desktop, 16:9' }))
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({ format: 'desktop' }))
  })

  it('Download image names the landscape file and counts it as desktop', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({ format: 'desktop' }))
    await act(async () => renders.at(-1)!.resolve(new Blob(['png'], { type: 'image/png' })))
    const dl = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
    await waitFor(() => expect(dl.disabled).toBe(false))
    fireEvent.click(dl)
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-desktop-${D}.png`)
    expect(vi.mocked(track)).toHaveBeenCalledWith('image_downloaded', { format: 'desktop' })
  })

  it('print mode follows the orientation: a landscape poster, sizes swapped, its file named -landscape', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'printLandscape', printSize: 'A2' }))
    expect(screen.getByText('A2 · 59.4 × 42 cm · 3508 × 2480 px at 150 dpi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ size: 'A2', landscape: true })
    await act(async () => makes[0].resolve(fakePoster({ landscape: true })))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-a2-landscape-${D}.png`)
    // Counted by size: the landscape A2 is a2-l, never the portrait a2.
    expect(vi.mocked(track)).toHaveBeenCalledWith('poster_made', { size: 'a2-l' })
  })

  it('in print mode the switch is on (a poster has no square)', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('US poster sizes show inches, keep data-size on the preview, name files in inches and track us24x36', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    pickMenu('Poster size', '24 × 36 in')
    expect(screen.getByText('24 × 36 in · 3600 × 5400 px at 150 dpi')).toBeInTheDocument()
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', printSize: 'US24x36' }))
    await act(async () => renders.at(-1)!.resolve(new Blob(['png'], { type: 'image/png' })))
    await waitFor(() => expect(screen.getByTestId('share-preview')).toHaveAttribute('data-size', 'US24x36'))
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    expect(screen.getByText('36 × 24 in · 5400 × 3600 px at 150 dpi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ size: 'US24x36', landscape: true })
    await act(async () => makes[0].resolve(fakePoster({ size: 'US24x36', landscape: true })))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-24x36in-landscape-${D}.png`)
    expect(vi.mocked(track)).toHaveBeenCalledWith('poster_made', { size: 'us24x36-l' })
  })

  it('Goal: "Add a goal" until one is set; a year draws that year\'s birds against the target, and saves it', async () => {
    const dispatch = vi.fn()
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('textbox', { name: 'Goal in species' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    const target = screen.getByRole('textbox', { name: 'Goal in species' }) as HTMLInputElement
    expect(target).toHaveFocus()
    expect(target).toHaveAttribute('inputmode', 'numeric')
    expect(target.value).toBe('')
    // The site's text field, with an example while it is empty.
    expect(target).toHaveClass('eb-input')
    expect(target).toHaveAttribute('placeholder', '150')
    // The year menu: All time, this year, then each year with birds, newest first.
    fireEvent.click(screen.getByRole('button', { name: /^Goal period / }))
    const year = new Date().getFullYear()
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['All time', ...(year === 2020 ? ['2020'] : [String(year), '2020'])])
    fireEvent.click(screen.getByRole('menuitemradio', { name: '2020' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Goal period 2020' })).toHaveFocus()
    fireEvent.change(target, { target: { value: '300' } })
    fireEvent.blur(target)
    expect(dispatch).toHaveBeenCalledWith({ type: 'bigYear', bigYear: { year: 2020, target: 300 } })
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({
      goal: { year: 2020, target: 300, basis: 'lifer' }, filterLabel: undefined,
    }))
    // All time: the birds on screen against the target, saved without a year.
    pickMenu('Goal period', 'All time')
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'bigYear', bigYear: { target: 300 } })
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0].goal).toEqual({ target: 300, basis: 'lifer' }))
    // Remove: the goal goes, from the image and the list, and focus is back on Add a goal.
    fireEvent.click(screen.getByRole('button', { name: 'Remove goal' }))
    expect(screen.getByRole('button', { name: 'Add a goal' })).toHaveFocus()
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0].goal).toBeUndefined())
  })

  it('a saved goal opens the row as saved (an old Big Year, or All time), and Escape closes the year menu, not the dialog', () => {
    const onClose = vi.fn()
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, bigYear: { target: 120 } }
    const { unmount } = render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} onClose={onClose} />)
    expect((screen.getByRole('textbox', { name: 'Goal in species' }) as HTMLInputElement).value).toBe('120')
    expect(screen.getByRole('button', { name: 'Goal period All time' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Goal period All time' }))
    expect(screen.getByRole('menu', { name: 'Goal period' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Goal period All time' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    unmount()
    state.saved = { ...state.saved, bigYear: { year: 2020, target: 300 } }
    render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Goal period 2020' })).toBeInTheDocument()
  })

  it('a list without dates offers All time only', () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Goal period All time' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['All time'])
  })

  it('saves the goal on blur, keeps the saved goal for anything but a whole number in range, and says why', () => {
    const dispatch = vi.fn()
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, bigYear: { year: 2020, target: 300 } }
    render(<ShareDialog state={state} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    const target = screen.getByRole('textbox', { name: 'Goal in species' }) as HTMLInputElement
    expect(target.value).toBe('300')
    // Typing saves nothing until the box is left.
    fireEvent.change(target, { target: { value: '25' } })
    expect(dispatch).not.toHaveBeenCalled()
    for (const v of ['0', '-5', '1e3', '100000']) {
      fireEvent.change(target, { target: { value: v } })
      fireEvent.blur(target)
    }
    expect(dispatch).not.toHaveBeenCalled()
    expect(target).toHaveAttribute('aria-invalid', 'true')
    expect(target).toHaveAccessibleDescription('Enter a whole number from 1 to 99,999.')
    fireEvent.change(target, { target: { value: '250' } })
    fireEvent.blur(target)
    expect(dispatch).toHaveBeenCalledWith({ type: 'bigYear', bigYear: { year: 2020, target: 250 } })
    expect(target).not.toHaveAttribute('aria-invalid')
    // An emptied box clears the saved goal (the row stays, on its year).
    fireEvent.change(target, { target: { value: '' } })
    fireEvent.blur(target)
    expect(dispatch).toHaveBeenLastCalledWith({ type: 'bigYear', bigYear: undefined })
  })

  it('lets the user pick the Count size in the image and the poster, repacks, and forwards it to preview and poster PNG/PDF', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.renderShareImage)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0].countSize).toBe('medium')

    // Hide | S | M | L | Beside title, Medium at every open.
    const count = within(screen.getByRole('group', { name: 'Count' }))
    expect(count.getAllByRole('button').map((b) => [b.getAttribute('aria-label') ?? b.textContent, b.getAttribute('aria-pressed')])).toEqual(
      [['Hide', 'false'], ['Small', 'false'], ['Medium', 'true'], ['Large', 'false'], ['Beside title', 'false']])
    pickSeg('Count', 'Small')
    expect(count.getByRole('button', { name: 'Small' })).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('small'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2]).toMatchObject({
      hole: expect.objectContaining({ pad: expect.any(Number) }),
    })

    pickSeg('Count', 'Hide')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('hide'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2].hole.pad).toBe(0)
    // Beside title: the count on the title's line, so no hole in the pack either.
    pickSeg('Count', 'Beside title')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('title'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2].hole.pad).toBe(0)

    cleanup()
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', countSize: 'medium' }))
    pickSeg('Count', 'Large')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', countSize: 'large' }))

    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ countSize: 'large' })
    await act(async () => makes[0].resolve(fakePoster({ size: 'A2', landscape: false })))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(2))
  })

  it('bulk export in Print mode splits the list, runs makePoster sequentially, and downloads a ZIP', async () => {
    const bulkSpecies = buildSpeciesIndex([
      row('ostric2', 1),
      { ...row('emu1', 2), fam: 'Casuariidae', famCom: 'Cassowaries and Emu' },
    ])
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={bulkSpecies} regions={regions} print onClose={() => {}} />)
    openBulk()
    const bulk = screen.getByRole('region', { name: 'Export in batches' })
    expect(bulk).toHaveTextContent('A ZIP with one image, or one poster, for each group.')
    pickSeg('Count', 'Small')

    pickMenu('Split by', 'Family')
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 posters')

    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ countSize: 'small' })
    expect(screen.getByTestId('bulk-progress').textContent).toContain('Poster 1 of 2')
    const p1 = fakePoster()
    await act(async () => makes[0].resolve(p1))

    await waitFor(() => expect(makes).toHaveLength(2))
    expect(p1.dispose).toHaveBeenCalledTimes(1)
    const p2 = fakePoster()
    await act(async () => makes[1].resolve(p2))

    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(p2.dispose).toHaveBeenCalledTimes(1)
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0]
    expect(filename).toBe(`everybird-a2-by-family-${D}.zip`)
    expect(blob.type).toBe('application/zip')
    expect(screen.getByTestId('share-note').textContent).toBe(`Saved everybird-a2-by-family-${D}.zip (2 posters).`)
  })

  it('says when names were asked for but a poster has none, for one poster and for a ZIP', async () => {
    const bulkSpecies = buildSpeciesIndex([row('ostric2', 1), { ...row('emu1', 2), fam: 'Casuariidae', famCom: 'Cassowaries and Emu' }])
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={bulkSpecies} regions={regions} print onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    await act(async () => makes[0].resolve(fakePoster({ namesDropped: true })))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Your A2 poster is ready. The names didn’t fit, so this poster has none.'))

    openBulk()
    pickMenu('Split by', 'Family')
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    await act(async () => makes[1].resolve(fakePoster({ namesDropped: true })))
    await waitFor(() => expect(makes).toHaveLength(3))
    await act(async () => makes[2].resolve(fakePoster()))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe(`Saved everybird-a2-by-family-${D}.zip (2 posters). 1 poster has no names: they didn’t fit.`))
  })

  it('Print has no Goal, and a saved goal reaches neither the poster nor the ZIP', async () => {
    const state = stateWith([entry('ostric2'), entry('emu1')])
    state.saved = { ...state.saved, bigYear: { year: 2020, target: 300 } }
    render(<ShareDialog state={state} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    expect(screen.queryByTestId('share-goal')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add a goal' })).toBeNull()
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', goal: undefined }))
    // Every bird on screen, not the goal year's.
    expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0].entries.map((e) => e.code)).toEqual(['ostric2', 'emu1'])
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ goal: undefined })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    openBulk()
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    expect(makes[1].opts).toMatchObject({ goal: undefined, filterLabel: 'Part 1' })
  })

  it('keeps keyboard focus as the ZIP buttons swap: on Cancel while it runs, back on the button that started it', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    openBulk()
    pressFocused('Download PDFs (ZIP)')
    await waitFor(() => expect(makes).toHaveLength(1))
    const progress = screen.getByTestId('bulk-progress')
    expect(within(progress).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    within(progress).getByRole('button', { name: 'Cancel' }).focus()
    fireEvent.click(within(progress).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PDFs (ZIP)' })).toHaveFocus())

    pressFocused('Download PNGs (ZIP)')
    await waitFor(() => expect(makes).toHaveLength(2))
    await act(async () => makes[1].resolve(fakePoster()))
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download PNGs (ZIP)' })).toHaveFocus())
  })

  it('the disabled Show species names switch is described by the note that says why', () => {
    const manyRows = Array.from({ length: 21 }, (_, i) => ({ ...row(`b${i}`, i + 1), com: `Bird ${i + 1}` }))
    render(<ShareDialog state={stateWith(manyRows.map((r) => entry(r.code)))} dispatch={() => {}} species={buildSpeciesIndex(manyRows)} regions={regions} print onClose={() => {}} />)
    pickMenu('Poster size', 'A4')
    const sw = screen.getByRole('switch', { name: 'Show species names' })
    expect(sw).toBeDisabled()
    // Described by the note (its words checked as text: jsdom's description puts a space around the inline button).
    expect(document.getElementById(sw.getAttribute('aria-describedby')!)).toHaveTextContent('A4 fits up to 20 species with names. Pick a larger size, filter your list or export in batches.')
    // Its "export in batches" opens Export in batches and takes the focus there.
    const toggle = screen.getByRole('button', { name: 'Export in batches' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(within(screen.getByTestId('share-print-names-note')).getByRole('button', { name: 'export in batches' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveFocus()
    expect(screen.getByRole('button', { name: /^Split by / })).toBeInTheDocument()
    pickMenu('Poster size', 'A3')
    expect(sw).not.toHaveAttribute('aria-describedby')
  })

  it('splitting by number of birds: Birds per poster is a dropdown (All, 1,000, 500, 250, 100), All to start', () => {
    const manyRows = Array.from({ length: 260 }, (_, i) => ({ ...row(`b${i}`, i + 1), com: `Bird ${i + 1}` }))
    render(<ShareDialog state={stateWith(manyRows.map((r) => entry(r.code)))} dispatch={() => {}} species={buildSpeciesIndex(manyRows)} regions={regions} print onClose={() => {}} />)
    openBulk()
    expect(screen.getByRole('button', { name: 'Split by Number of birds' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Birds per poster' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Birds per poster All' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['All', '1,000', '500', '250', '100'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All' }))
    expect(screen.getByTestId('bulk-count').textContent).toBe('1 poster')
    pickMenu('Birds per poster', '100')
    expect(screen.getByTestId('bulk-count').textContent).toBe('3 posters')
    pickMenu('Birds per poster', '250')
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 posters')
    // Another split has no Birds per poster row.
    pickMenu('Split by', 'Family')
    expect(screen.queryByRole('button', { name: /^Birds per poster / })).toBeNull()
  })

  it('Export in batches in Share makes a ZIP of PNG images, one per group, in the dialog\'s format; never counted', async () => {
    const bulkSpecies = buildSpeciesIndex([row('ostric2', 1), { ...row('emu1', 2), fam: 'Casuariidae', famCom: 'Cassowaries and Emu' }])
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={bulkSpecies} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'Post, 4:5' }))
    openBulk()
    // The same Split by as Print's, Number of birds first, with Birds per image.
    expect(screen.getByRole('button', { name: 'Birds per image All' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Split by Number of birds' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['Number of birds', 'Family', 'Order', 'Country', 'Continent', 'State or province', 'Year'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Family' }))
    expect(screen.queryByRole('button', { name: /^Birds per / })).toBeNull()
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 images')
    vi.mocked(track).mockClear()
    const before = renders.length
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(screen.getByTestId('bulk-progress').textContent).toContain('Image 1 of 2'))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.some((c) => c[0].filterLabel === 'Ostriches')).toBe(true))
    const bulkCall = vi.mocked(image.renderShareImage).mock.calls.find((c) => c[0].filterLabel === 'Ostriches')![0]
    expect(bulkCall).toMatchObject({ format: 'post', theme: 'light' })
    expect(bulkCall.entries.map((e) => e.code)).toEqual(['ostric2'])
    expect(makes).toHaveLength(0)
    for (let k = before; k < before + 2; k++) {
      await waitFor(() => expect(renders.length).toBeGreaterThan(k))
      await act(async () => renders[k].resolve(new Blob(['png'], { type: 'image/png' })))
    }
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0]
    expect(filename).toBe(`everybird-post-by-family-${D}.zip`)
    expect(blob.type).toBe('application/zip')
    expect(screen.getByTestId('share-note').textContent).toBe(`Saved everybird-post-by-family-${D}.zip (2 images).`)
    expect(track).not.toHaveBeenCalled()
  })

  it('Export in batches in Share splits by number of birds: Birds per image (All, 1,000, 500, 250, 100), one image per batch', async () => {
    const manyRows = Array.from({ length: 260 }, (_, i) => ({ ...row(`b${i}`, i + 1), com: `Bird ${i + 1}` }))
    render(<ShareDialog state={stateWith(manyRows.map((r) => entry(r.code)))} dispatch={() => {}} species={buildSpeciesIndex(manyRows)} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    openBulk()
    expect(screen.getByRole('button', { name: 'Split by Number of birds' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Birds per image All' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => b.textContent)).toEqual(['All', '1,000', '500', '250', '100'])
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'All' }))
    expect(screen.getByTestId('bulk-count').textContent).toBe('1 image')
    pickMenu('Birds per image', '100')
    expect(screen.getByTestId('bulk-count').textContent).toBe('3 images')
    const before = renders.length
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.some((c) => c[0].filterLabel === 'Part 1')).toBe(true))
    const first = vi.mocked(image.renderShareImage).mock.calls.find((c) => c[0].filterLabel === 'Part 1')![0]
    expect(first).toMatchObject({ format: 'story' })
    expect(first.entries).toHaveLength(100)
    for (let k = before; k < before + 3; k++) {
      await waitFor(() => expect(renders.length).toBeGreaterThan(k))
      await act(async () => renders[k].resolve(new Blob(['png'], { type: 'image/png' })))
    }
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe(`everybird-story-100-birds-each-${D}.zip`)
    expect(vi.mocked(image.renderShareImage).mock.calls.filter((c) => /^Part \d$/.test(c[0].filterLabel ?? '')).map((c) => c[0].entries.length)).toEqual([100, 100, 60])
  })

  it('disables bulk ZIP buttons with a note when a split has zero groups', async () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    openBulk()
    pickMenu('Split by', 'Year')

    expect(screen.getByTestId('bulk-count').textContent).toBe('Nothing to make for this choice.')
    expect((screen.getByRole('button', { name: 'Download PNGs (ZIP)' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Download PDFs (ZIP)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Show species names is off by default in Print, disables over A4 cap (21), enables on A3, and forwards showNames', async () => {
    const manyRows = Array.from({ length: 21 }, (_, i) => ({
      ...row(`b${i}`, i + 1),
      com: `Bird ${i + 1}`,
    }))
    const manySpecies = buildSpeciesIndex(manyRows)
    const manyList = manyRows.map((r) => entry(r.code))

    const share = render(<ShareDialog state={stateWith(manyList)} dispatch={() => {}} species={manySpecies} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Show species names' })).toBeNull()
    share.unmount()

    render(<ShareDialog state={stateWith(manyList)} dispatch={() => {}} species={manySpecies} regions={regions} print onClose={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.disabled).toBe(false)

    pickMenu('Poster size', 'A4')
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('A4 fits up to 20 species with names. Pick a larger size, filter your list or export in batches.')

    pickMenu('Poster size', 'A3')
    expect(sw.disabled).toBe(false)
    expect(screen.queryByTestId('share-print-names-note')).toBeNull()

    fireEvent.click(sw)
    expect(sw.getAttribute('aria-checked')).toBe('true')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', printSize: 'A3', showNames: true }))

    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ size: 'A3', showNames: true })
  })

  it('disables Show species names when a species name cannot fit without clipping', async () => {
    const longSpecies = buildSpeciesIndex([{ ...row('long1', 1), com: 'Superlongunbreakablebirdspeciesnamethatcannotpossiblyfitintwolines' }])
    render(<ShareDialog state={stateWith([entry('long1')])} dispatch={() => {}} species={longSpecies} regions={regions} print onClose={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('Names won’t fit cleanly on A2. Pick a larger size or filter your list.')
  })

  it('packs names again for each paper size: the caption font follows the paper, so an A2 pack never serves A4', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    const named = () => vi.mocked(image.packForImage).mock.calls.filter((c) => c[2].captionBoxes).map((c) => c[2].captionBoxes!.ostric2.h)
    await waitFor(() => expect(named()).toHaveLength(1))
    pickMenu('Poster size', 'A4')
    await waitFor(() => expect(named()).toHaveLength(2))
    // A4's minimum caption size is larger in design units than A2's, so its name box is taller.
    expect(named()[1]).toBeGreaterThan(named()[0])
  })

  it('disables Show species names when caption pack check rejects', async () => {
    vi.mocked(image.packForImage).mockImplementation(async (_entries, _species, spec) => {
      if (spec.captionBoxes) throw new Error('packBest: does not fit')
      return { W: 100, H: 100, boxes: new Map() }
    })
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    await waitFor(() => expect(sw.disabled).toBe(true))
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('Names won’t fit cleanly on A2. Pick a larger size or filter your list.')
  })
})

describe('share dialog: Fit / Oval / Free', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) } })
  })
  afterEach(() => { setArrangement('packed') })
  it('Fit to start (stored as packed); Oval packs the images inside the ellipse, is kept on the device, and re-renders', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.packForImage)).toHaveBeenCalled())
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2].oval).toBeUndefined()
    const group = screen.getByRole('group', { name: 'Arrangement' })
    // Three icon buttons, named and titled Fit, Oval and Free: no words to wrap.
    expect(within(group).getAllByRole('button').map((b) => [b.getAttribute('aria-label'), b.getAttribute('title'), b.textContent])).toEqual([['Fit', 'Fit', ''], ['Oval', 'Oval', ''], ['Free', 'Free', '']])
    expect(within(group).getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: 'Oval' }))
    expect(within(group).getByRole('button', { name: 'Oval' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBe('oval')
    await waitFor(() => expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2]).toEqual(
      image.imagePackSpec('story', { name: false, filter: false, latest: true, count: 1 }, undefined, undefined, 'oval')))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2].oval).toBe(true)
  })

  it('Free packs the images as Fit did before it filled the rectangle, and is kept on the device', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.packForImage)).toHaveBeenCalled())
    const group = screen.getByRole('group', { name: 'Arrangement' })
    fireEvent.click(within(group).getByRole('button', { name: 'Free' }))
    expect(within(group).getByRole('button', { name: 'Free' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBe('free')
    await waitFor(() => expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2]).toEqual(
      image.imagePackSpec('story', { name: false, filter: false, latest: true, count: 1 }, undefined, undefined, 'free')))
    const spec = vi.mocked(image.packForImage).mock.calls.at(-1)![2]
    expect([spec.free, spec.oval]).toEqual([true, undefined])
  })

  it('a stored Free reads back; an unknown value reads as Fit', () => {
    localStorage.setItem(ARRANGEMENT_KEY, 'free')
    expect(arrangement()).toBe('free')
    localStorage.setItem(ARRANGEMENT_KEY, 'cloud')
    expect(arrangement()).toBe('packed')
  })

  it('a stored By family or By colour reads as Packed', () => {
    localStorage.setItem(ARRANGEMENT_KEY, 'family')
    expect(arrangement()).toBe('packed')
    localStorage.setItem(ARRANGEMENT_KEY, 'colour')
    expect(arrangement()).toBe('packed')
  })
})

// Round 6, item 20: opening a dialog menu or choosing from it never resizes the dialog. jsdom lays nothing out, so the
// heights are modelled from the content (each element 20px plus its text, so the column's height follows what a choice
// writes in it; the card a fixed 600) and the ResizeObserver is fired by hand after each step: the dialog's size
// inputs (--scroll-h, the closed column; --top-h; --pv-h, the card) must not move.
describe('a menu never resizes the dialog (round 6, item 20)', () => {
  const observers: { cb: () => void }[] = []
  const offset = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')!
  beforeEach(() => {
    observers.length = 0
    vi.stubGlobal('ResizeObserver', class { cb: () => void; constructor(cb: () => void) { this.cb = cb; observers.push(this) } observe() {} disconnect() {} })
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get(this: HTMLElement) { return this.dataset.testid === 'share-preview' ? 600 : 20 * (this.querySelectorAll('*').length + 1) + (this.textContent ?? '').length },
    })
  })
  afterEach(() => { Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offset) })
  const settle = () => act(() => { for (const o of observers) o.cb() })
  const inputs = () => {
    const d = screen.getByRole('dialog')
    return ['--scroll-h', '--top-h', '--pv-h'].map((p) => d.style.getPropertyValue(p))
  }
  /** Opens the dropdown named `label`, then picks `option`: the size inputs after each step as before. */
  const openAndPick = async (label: string, option: string) => {
    const before = inputs()
    expect(before[0]).toMatch(/px$/)
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label} `) }))
    await settle()
    expect(inputs(), `${label} open`).toEqual(before)
    fireEvent.click(screen.getByRole('menuitemradio', { name: option }))
    await settle()
    expect(inputs(), `${label}: ${option}`).toEqual(before)
  }

  it('Share: Split by, Birds per image and the goal\'s year', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    openBulk()
    await settle()
    await openAndPick('Birds per image', '100')
    await openAndPick('Split by', 'Family')
    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    await settle()
    await openAndPick('Goal period', '2020')
    await openAndPick('Goal period', 'All time')
  })

  it('Print: the poster size, whose choice rewrites the column (its size line), held until another control is used', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} print onClose={() => {}} />)
    await settle()
    const [closed] = inputs()
    await openAndPick('Poster size', 'A4')
    await openAndPick('Poster size', '24 × 36 in')
    // The hold is what kept it: another control releases it, and the column's next change is measured, its longer
    // size line and button included.
    openBulk()
    await settle()
    expect(inputs()[0]).not.toBe(closed)
  })
})

// Round 6, item 21: Export in batches' "Count repeat sightings", for the place and year splits.
describe('Export in batches: Count repeat sightings (round 6, item 21)', () => {
  const rules = { hideHeard: false, hideDead: false, researchOnly: false }
  const edits = { added: [], removed: [], fixes: {}, marks: {} }
  // An Ostrich seen in Canada in 2020 (its lifer) and in Kenya in 2023.
  const list = [entry('ostric2')]
  const seen = buildSeen([{ code: 'ostric2', source: 'ebird', date: '2020-05', place: { country: 'CA' }, seen: ['2020-05|CA', '2023-02|KE'], seenMonths: ['2020-05|CA', '2023-02|KE'] }], edits, rules, list)
  const withRegions = { ...regions, countries: { CA: 'Canada', KE: 'Kenya' } }
  const open = (basis?: 'seen') => {
    render(<ShareDialog state={{ ...stateWith(list), seen, filter: { ...initialState().filter, ...(basis ? { basis } : {}) } }} dispatch={() => {}} species={species} regions={withRegions} onClose={() => {}} />)
    openBulk()
  }
  const sw = () => screen.queryByRole('switch', { name: 'Count repeat sightings' })

  it('shows for Country, Continent, State or province and Year only, starting as the page\'s switch (off)', () => {
    open()
    expect(sw()).toBeNull() // Number of birds
    pickMenu('Split by', 'Family')
    expect(sw()).toBeNull()
    pickMenu('Split by', 'Country')
    expect(sw()).toHaveAttribute('aria-checked', 'false')
    // Off: the Ostrich once, in Canada, where it was first recorded.
    expect(screen.getByTestId('bulk-count').textContent).toBe('1 image')
    fireEvent.click(sw()!)
    expect(sw()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 images')
    for (const split of ['Continent', 'State or province', 'Year']) {
      pickMenu('Split by', split)
      expect(sw(), split).toBeInTheDocument()
    }
  })

  it('starts on when the page counts repeat sightings', () => {
    open('seen')
    pickMenu('Split by', 'Year')
    expect(sw()).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 images')
    fireEvent.click(sw()!)
    expect(screen.getByTestId('bulk-count').textContent).toBe('1 image')
  })

  it('is not shown for a list with no repeat sightings to count', () => {
    render(<ShareDialog state={stateWith(list)} dispatch={() => {}} species={species} regions={withRegions} onClose={() => {}} />)
    openBulk()
    pickMenu('Split by', 'Country')
    expect(sw()).toBeNull()
  })
})
