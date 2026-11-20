// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareDialog from '@/components/share/ShareDialog'
import * as image from '@/lib/share/image'
import { ARRANGEMENT_KEY, arrangement, setArrangement } from '@/lib/arrangement'
import { MARK_NEWEST_KEY, setLiferMark } from '@/lib/lifer-marks'
import { setTreeMine } from '@/lib/tree-mine'
import { track } from '@/lib/analytics'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import { initialState } from '@/lib/list/store'
import { decodeShare } from '@/lib/share/link'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'
import { LANGS } from '@/i18n/langs'
import { MESSAGES, withI18n } from './i18n-render'

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
const viewRenders = vi.hoisted(() => ({ map: vi.fn(async () => new Blob(['map'])), tree: vi.fn(async () => new Blob(['tree'])) }))
vi.mock('@/lib/share/map-image', () => ({ renderMapImage: viewRenders.map }))
vi.mock('@/lib/share/tree-image', () => ({ renderTreeImage: viewRenders.tree }))

// The poster is made by a promise the test settles; it records the progress callback, the signal and the opts.
type FakePoster = { size: string; landscape: boolean; bytes: number; soft: number; missing: number; namesDropped?: boolean; file: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
const makes: { opts: { size: string; signal?: AbortSignal; pack?: unknown }; onProgress: (d: number, t: number) => void; resolve: (p: FakePoster) => void; reject: (e: unknown) => void }[] = []
const posterMock = () => ({
  makePoster: vi.fn((opts, onProgress) => new Promise((resolve, reject) => makes.push({ opts, onProgress, resolve, reject }))),
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
  it('"Collage title" starts from the saved title and saves as it is typed (it names the collage page too)', async () => {
    const dispatch = vi.fn()
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, name: "Ada's big year" }
    render(<ShareDialog state={state} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    const field = screen.getByLabelText('Collage title') as HTMLInputElement
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
    fireEvent.change(screen.getByLabelText('Collage title'), { target: { value: '  Kenya, 2026  ' } })
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

  it('turning the switch off and on again never makes another pack: one pack, the same object, for both', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    const sw = screen.getByRole('switch', { name: 'Show latest lifer' })
    fireEvent.click(sw)
    await waitFor(() => expect(renders).toHaveLength(2))
    fireEvent.click(sw)
    await waitFor(() => expect(renders).toHaveLength(3))
    expect(vi.mocked(image.packForImage)).toHaveBeenCalledTimes(1)
    const calls = vi.mocked(image.renderShareImage).mock.calls.map((c) => c[0])
    expect(calls.map((o) => o.latest)).toEqual([true, false, true])
    expect(calls[1].pack).toBe(calls[0].pack)
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

  it('is one screen: no parts; Print poster shows the poster\'s options and Back to image returns', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('group', { name: 'What to share' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Big Year' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Image format' }).querySelectorAll('button')).toHaveLength(3)
    expect(screen.getByRole('group', { name: 'Orientation' })).toBeInTheDocument()
    // Share image first, then the three quiet ones; no poster options yet.
    const actions = screen.getByRole('button', { name: 'Share image' }).parentElement!
    expect([...actions.querySelectorAll('.eb-share-row button')].map((b) => b.getAttribute('aria-label') ?? b.textContent)).toEqual(['Download image', 'Copy link', 'Print poster'])
    expect(screen.queryByRole('group', { name: 'Poster size' })).toBeNull()
    expect(screen.queryByTestId('share-bulk')).toBeNull()
    expect(screen.queryByRole('switch', { name: 'Show species names' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    expect(screen.getByRole('group', { name: 'Poster size' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Image format' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Show species names' })).toBeInTheDocument()
    expect(screen.getByTestId('share-bulk')).toBeInTheDocument()
    // Focus moves to the way back, which returns to the image and puts focus on Print poster.
    expect(screen.getByRole('button', { name: 'Back to image' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Back to image' }))
    expect(screen.getByRole('group', { name: 'Image format' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print poster' })).toHaveFocus()
    expect(screen.getByRole('switch', { name: 'Dark image' })).toBeInTheDocument()
  })

  it('the share image draws the Map or Tree view it was opened from, at its level; other views and the poster draw the collage', async () => {
    viewRenders.map.mockClear()
    viewRenders.tree.mockClear()
    const st = stateWith([entry('ostric2')])
    const { unmount } = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="map" at={{ place: 'c:CA' }} onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.map).toHaveBeenCalledTimes(1))
    expect(viewRenders.map.mock.calls[0]).toMatchObject([{ format: 'story', at: { place: 'c:CA' }, latest: false, state: { list: st.list } }])
    expect(image.renderShareImage).not.toHaveBeenCalled()
    expect(image.packForImage).not.toHaveBeenCalled()
    // No sticker options for a map: no latest lifer switch, Fit or Oval, or goal; Dark and Transparent stay. The poster is
    // the collage again, with them.
    expect(screen.queryByRole('switch', { name: 'Show latest lifer' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Arrangement' })).toBeNull()
    expect(screen.queryByTestId('share-goal')).toBeNull()
    expect(screen.getByRole('switch', { name: 'Dark image' })).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: 'Transparent background' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Count / })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    await waitFor(() => expect(image.renderShareImage).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'print' })
    expect(screen.getByRole('switch', { name: 'Show latest lifer' })).toBeInTheDocument()
    unmount()

    const tree = render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="tree" at={{ tree: { fam: 'Struthionidae' } }} onClose={() => {}} />)
    await waitFor(() => expect(viewRenders.tree).toHaveBeenCalledTimes(1))
    expect(viewRenders.tree.mock.calls[0]).toMatchObject([{ at: { tree: { fam: 'Struthionidae' }, mine: false }, hideTotals: false }])
    expect(viewRenders.map).toHaveBeenCalledTimes(1)
    // The Tree image: no Count row; Lifers only (the bar's switch) and Hide totals, with Dark and Transparent.
    expect(screen.queryByRole('button', { name: /^Count / })).toBeNull()
    for (const name of ['Lifers only', 'Hide totals', 'Dark image', 'Transparent background']) expect(screen.getByRole('switch', { name })).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(screen.getByRole('switch', { name: 'Hide totals' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ hideTotals: true })))
    fireEvent.click(screen.getByRole('switch', { name: 'Lifers only' }))
    await waitFor(() => expect(viewRenders.tree).toHaveBeenLastCalledWith(expect.objectContaining({ at: { tree: { fam: 'Struthionidae' }, mine: true } })))
    act(() => setTreeMine(false))
    tree.unmount()

    vi.mocked(image.renderShareImage).mockClear()
    render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} view="list" onClose={() => {}} />)
    await waitFor(() => expect(image.renderShareImage).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story' })
    expect(screen.getByRole('switch', { name: 'Show latest lifer' })).toBeInTheDocument()
  })

  it('the options are one row each under the title field: Count, Goal, the switches, then Dark and Transparent', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const rows = screen.getByTestId('share-switches')
    expect(screen.getByLabelText('Collage title').closest('.eb-share-field')!.nextElementSibling).toBe(rows)
    const names = [...rows.children].map((el) => el.getAttribute('role') === 'switch' ? el.textContent : el.querySelector('.eb-share-optlabel')!.textContent)
    expect(names).toEqual(['Count', 'Goal', 'Show latest lifer', 'Mark latest lifer', 'Mark first lifer', 'Dark image', 'Transparent background'])
    for (const el of rows.children) expect(el).toHaveClass('eb-share-opt')
    // In the poster the size control sits above the title, and the names switch joins the rows.
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const sizes = screen.getByRole('group', { name: 'Poster size' })
    expect(sizes.compareDocumentPosition(screen.getByLabelText('Collage title')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Show species names' }).parentElement).toBe(screen.getByTestId('share-switches'))
  })

  it('the title label says "(optional)" beside it and the placeholder is an example', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const input = screen.getByLabelText('Collage title')
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

  it('"Dark image" starts at the app\'s theme, then the dialog\'s own; the page theme is left alone', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story', theme: 'dark' })
    const dark = screen.getByRole('switch', { name: 'Dark image' })
    expect(dark).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(dark)
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
    expect(screen.getByLabelText('Título del collage')).toBeInTheDocument()
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
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('everybird-story.png')
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Se guardó everybird-story.png.'))
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
  const open = () => render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
  const toPrint = () => fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
  const startMakeAgain = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
  }
  const startMake = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
  }

  it('Poster shows Poster size A4–A1, A2 pressed, and Make poster', async () => {
    open()
    expect(screen.getByRole('button', { name: 'Download image' }).textContent).toBe('Download')
    expect(screen.queryByRole('group', { name: 'Poster size' })).toBeNull()
    toPrint()
    const sizes = screen.getByRole('group', { name: 'Poster size' })
    expect([...sizes.querySelectorAll('button')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual(
      [['A4', 'false'], ['A3', 'false'], ['A2', 'true'], ['A1', 'false'], ['12 × 18 in', 'false'], ['18 × 24 in', 'false'], ['24 × 36 in', 'false']])
    expect(screen.getByText('A2 · 42 × 59.4 cm · 2480 × 3508 px at 150 dpi')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Download image' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'A4' }))
    expect(screen.getByText('A4 · 21 × 29.7 cm · 1240 × 1754 px at 150 dpi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'A2' }))
    // The preview is the poster's, in the dialog's theme, at the chosen size.
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', printSize: 'A2', theme: 'light' }))
    await act(async () => renders.at(-1)!.resolve(new Blob(['png'], { type: 'image/png' })))
    await waitFor(() => expect(screen.getByTestId('share-preview')).toHaveAttribute('data-format', 'print'))
    const img = screen.getByAltText('Preview of the A2 poster')
    expect(img).toHaveAttribute('width', '1080')
    expect(img).toHaveAttribute('height', String(Math.round(1080 * 3508 / 2480)))
    // Back to image leaves the poster.
    fireEvent.click(screen.getByRole('button', { name: 'Back to image' }))
    expect(screen.queryByRole('group', { name: 'Poster size' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Share image' })).toBeInTheDocument()
  })

  it('"Transparent background" is off at first; on, the poster is made transparent and offers the PNG only', async () => {
    open()
    toPrint()
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

  it('Make poster shows a progressbar with Cancel; when done, Download PNG and Download PDF save everybird-a2.png/.pdf at once', async () => {
    open()
    toPrint()
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
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('everybird-a2.png')
    expect(screen.getByTestId('share-note').textContent).toBe('Saved everybird-a2.png.')
    fireEvent.click(pdf)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledTimes(2))
    expect(vi.mocked(downloadBlob).mock.calls[1][1]).toBe('everybird-a2.pdf')
    expect(p.file.mock.calls.map((c) => c[0])).toEqual(['png', 'pdf'])
  })

  it('Cancel aborts the make and shows Make poster again', async () => {
    open()
    toPrint()
    await startMake()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(makes[0].opts.signal?.aborted).toBe(true)
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    await act(async () => makes[0].reject(Object.assign(new Error('cancelled'), { name: 'AbortError' })))
    expect(screen.getByTestId('share-note').textContent).toBe('') // a cancel stays quiet
  })

  it('changing the size during a make aborts it (signal aborted) and shows Make poster again; no stale poster downloads', async () => {
    open()
    toPrint()
    await startMake()
    fireEvent.click(screen.getByRole('button', { name: 'A3' }))
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
    fireEvent.change(screen.getByLabelText('Collage title'), { target: { value: 'Kenya' } })
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

  it('leaving print mode aborts a make and drops a finished poster', async () => {
    const first = open()
    toPrint()
    await startMake()
    fireEvent.click(screen.getByRole('button', { name: 'Back to image' }))
    expect(makes[0].opts.signal?.aborted).toBe(true)
    first.unmount()

    makes.length = 0
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    await startMake()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    fireEvent.click(screen.getByRole('button', { name: 'Back to image' }))
    expect(p.dispose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
  })

  it('closing the dialog aborts the make and disposes the poster', async () => {
    const first = open()
    toPrint()
    await startMake()
    first.unmount()
    expect(makes[0].opts.signal?.aborted).toBe(true)

    makes.length = 0
    const second = open()
    toPrint()
    await startMake()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(p.dispose).not.toHaveBeenCalled()
    second.unmount()
    expect(p.dispose).toHaveBeenCalledTimes(1)
  })

  it('soft > 0 shows the smaller-files note; missing > 0 the outlines note; a poster-memory error the try-a-smaller-size note', async () => {
    open()
    toPrint()
    await startMake()
    await act(async () => makes[0].resolve(fakePoster({ soft: 3, missing: 1 })))
    expect(screen.getByTestId('share-note').textContent).toBe(
      'Your A2 poster is ready. Some stickers come from smaller files for now, so the biggest birds may print a little soft. '
      + '1 sticker didn’t load and is drawn as an outline. Make the poster again to retry.')

    fireEvent.click(screen.getByRole('button', { name: 'A3' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    await act(async () => makes[1].resolve(fakePoster({ size: 'A3', missing: 5 })))
    expect(screen.getByTestId('share-note').textContent).toBe(
      'Your A3 poster is ready. 5 stickers didn’t load and are drawn as outlines. Make the poster again to retry.')

    fireEvent.click(screen.getByRole('button', { name: 'A1' }))
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
    toPrint()
    await startMake()
    expect(screen.getByTestId('share-note').textContent).toBe('Making the poster.')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByTestId('share-note').textContent).toBe('')
  })

  it('a make that finishes after the dialog closed is disposed', async () => {
    const view = open()
    toPrint()
    await startMake()
    view.unmount()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(p.dispose).toHaveBeenCalledTimes(1)
  })

  it('a poster whose file fails is dropped: the error note and Make poster come back, focused', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    open()
    toPrint()
    await startMake()
    const p = fakePoster({ file: vi.fn(async () => { throw new Error('encoder gone') }) })
    await act(async () => makes[0].resolve(p))
    // Focus is still on Back (fireEvent.click never moves it, so the make's focus moves had nothing to follow); a real
    // click puts it on Download PNG, and only from there (lost when the button goes) does it follow Make poster back.
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
    toPrint()
    await startMake()
    await act(async () => makes[0].resolve(fakePoster()))
    expect(screen.queryByRole('button', { name: 'Make again' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'A3' }))
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
    toPrint()
    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Link copied.'))
    expect(track).not.toHaveBeenCalled()
  })

  it('in share mode Download image is still counted', async () => {
    open()
    await waitFor(() => expect(renders).toHaveLength(1))
    await act(async () => renders[0].resolve(new Blob(['png'], { type: 'image/png' })))
    const dl = screen.getByRole('button', { name: 'Download image' }) as HTMLButtonElement
    await waitFor(() => expect(dl.disabled).toBe(false))
    fireEvent.click(dl)
    await waitFor(() => expect(track).toHaveBeenCalledWith('image_downloaded', { format: 'story' }))
  })

  it('print mode ignores the share format: switching to print renders once, in the dialog\'s theme', async () => {
    open()
    await waitFor(() => expect(renders).toHaveLength(1))
    toPrint()
    await waitFor(() => expect(renders).toHaveLength(2))
    expect(vi.mocked(image.renderShareImage).mock.calls[1][0]).toMatchObject({ format: 'print', theme: 'light' })
  })

  it('Dark image in print mode re-renders the preview dark and discards a made poster; makePoster gets the theme', async () => {
    open()
    toPrint()
    await startMake()
    expect(makes[0].opts).toMatchObject({ theme: 'light' })
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('switch', { name: 'Dark image' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', theme: 'dark' }))
    expect(p.dispose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Download PNG' })).toBeNull()
    await startMakeAgain()
    expect(makes[1].opts).toMatchObject({ theme: 'dark', size: 'A2' })
  })

  it('print mode counts the poster made and each download, never the share image events', async () => {
    open()
    toPrint()
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
    // The poster module fails twice, as a chunk that didn't load would: the load when print mode opens, then the one
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
    render(<FreshDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    await waitFor(() => expect(fail.left).toBe(1))
    // Focus is on Back to image (where Print poster sends it); a real click moves it to Make poster, which fireEvent.click
    // doesn't, and only from there (lost when the button goes) does it follow the one that comes back.
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
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('everybird-desktop.png')
    expect(vi.mocked(track)).toHaveBeenCalledWith('image_downloaded', { format: 'desktop' })
  })

  it('print mode follows the orientation: a landscape poster, sizes swapped, its file named -landscape', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Horizontal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'printLandscape', printSize: 'A2' }))
    expect(screen.getByText('A2 · 59.4 × 42 cm · 3508 × 2480 px at 150 dpi')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ size: 'A2', landscape: true })
    await act(async () => makes[0].resolve(fakePoster({ landscape: true })))
    fireEvent.click(await screen.findByRole('button', { name: 'Download PNG' }))
    await waitFor(() => expect(vi.mocked(downloadBlob)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('everybird-a2-landscape.png')
    // Counted by size: the landscape A2 is a2-l, never the portrait a2.
    expect(vi.mocked(track)).toHaveBeenCalledWith('poster_made', { size: 'a2-l' })
  })

  it('in print mode the switch is on whatever the share format (a poster has no square)', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Square, 1:1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('US poster sizes show inches, keep data-size on the preview, name files in inches and track us24x36', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    fireEvent.click(screen.getByRole('button', { name: '24 × 36 in' }))
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
    expect(vi.mocked(downloadBlob).mock.calls[0][1]).toBe('everybird-24x36in-landscape.png')
    expect(vi.mocked(track)).toHaveBeenCalledWith('poster_made', { size: 'us24x36-l' })
  })

  it('forwards remembered lifer marks to renderShareImage and makePoster', async () => {
    setLiferMark('newest', true)
    setLiferMark('first', true)
    try {
      render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
      await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ markNewest: true, markFirst: true }))
      fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
      fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
      await waitFor(() => expect(makes).toHaveLength(1))
      expect(makes[0].opts).toMatchObject({ markNewest: true, markFirst: true })
    } finally {
      setLiferMark('newest', false)
      setLiferMark('first', false)
    }
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

    expect(screen.getByRole('button', { name: 'Count Medium' })).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(screen.getByRole('button', { name: 'Count Medium' }))
    expect(screen.getAllByRole('menuitemradio').map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual(
      [['Small', 'false'], ['Medium', 'true'], ['Large', 'false'], ['Hide', 'false']])
    // The menu's keyboard: the current choice has focus; arrows move, wrapping.
    expect(screen.getByRole('menuitemradio', { name: 'Medium' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'Large' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'End' })
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitemradio', { name: 'Small' })).toHaveFocus()
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Small' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('small'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2]).toMatchObject({
      hole: expect.objectContaining({ pad: expect.any(Number) }),
    })

    pickMenu('Count', 'Hide')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('hide'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2].hole.pad).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', countSize: 'hide' }))
    pickMenu('Count', 'Large')
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
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={bulkSpecies} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const bulk = screen.getByRole('region', { name: 'Several posters at once' })
    expect(bulk).toHaveTextContent('One poster per group, downloaded together as a ZIP.')
    pickMenu('Count', 'Small')

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
    expect(filename).toBe('everybird-a2-bulk.zip')
    expect(blob.type).toBe('application/zip')
    expect(screen.getByTestId('share-note').textContent).toBe('Saved everybird-a2-bulk.zip (2 posters).')
  })

  it('says when names were asked for but a poster has none, for one poster and for a ZIP', async () => {
    const bulkSpecies = buildSpeciesIndex([row('ostric2', 1), { ...row('emu1', 2), fam: 'Casuariidae', famCom: 'Cassowaries and Emu' }])
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={bulkSpecies} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    await act(async () => makes[0].resolve(fakePoster({ namesDropped: true })))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Your A2 poster is ready. The names didn’t fit, so this poster has none.'))

    pickMenu('Split by', 'Family')
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(makes).toHaveLength(2))
    await act(async () => makes[1].resolve(fakePoster({ namesDropped: true })))
    await waitFor(() => expect(makes).toHaveLength(3))
    await act(async () => makes[2].resolve(fakePoster()))
    await waitFor(() => expect(screen.getByTestId('share-note').textContent).toBe('Saved everybird-a2-bulk.zip (2 posters). 1 poster has no names: they didn’t fit.'))
  })

  it('bulk posters keep a year\'s goal: its line before the group and its target in the count', async () => {
    const dispatch = vi.fn()
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    // The poster follows the same goal as the image.
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add a goal' }))
    pickMenu('Goal period', '2020')
    fireEvent.change(screen.getByRole('textbox', { name: 'Goal in species' }), { target: { value: '300' } })
    fireEvent.click(screen.getByRole('button', { name: 'Download PNGs (ZIP)' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ goal: { year: 2020, target: 300 }, filterLabel: expect.stringMatching(/^Big Year 2020 · .*Part 1$/) })
    const bulkSpec = vi.mocked(image.packForImage).mock.calls.at(-1)![2]
    const plainSpec = image.imagePackSpec('print', { name: false, filter: true, latest: true, count: 2, countSize: 'medium' }, 'A2')
    expect(bulkSpec.hole.num[2]).toBeGreaterThan(plainSpec.hole.num[2])
  })

  it('keeps keyboard focus as the ZIP buttons swap: on Cancel while it runs, back on the button that started it', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
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
    const manyRows = Array.from({ length: 41 }, (_, i) => ({ ...row(`b${i}`, i + 1), com: `Bird ${i + 1}` }))
    render(<ShareDialog state={stateWith(manyRows.map((r) => entry(r.code)))} dispatch={() => {}} species={buildSpeciesIndex(manyRows)} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'A4' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' })
    expect(sw).toBeDisabled()
    expect(sw).toHaveAccessibleDescription('A4 fits up to 40 species with names. Pick a larger size or filter your list.')
    fireEvent.click(screen.getByRole('button', { name: 'A3' }))
    expect(sw).not.toHaveAttribute('aria-describedby')
  })

  it('splitting by number of birds: the most per poster is a number box, 1,000 to start, with the count beside it', () => {
    const manyRows = Array.from({ length: 25 }, (_, i) => ({ ...row(`b${i}`, i + 1), com: `Bird ${i + 1}` }))
    render(<ShareDialog state={stateWith(manyRows.map((r) => entry(r.code)))} dispatch={() => {}} species={buildSpeciesIndex(manyRows)} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    expect(screen.getByRole('button', { name: 'Split by Number of birds' })).toBeInTheDocument()
    const box = screen.getByRole('textbox', { name: 'Birds per poster' }) as HTMLInputElement
    expect(box.value).toBe('1000')
    expect(screen.getByTestId('bulk-count').textContent).toBe('1 poster')
    fireEvent.change(box, { target: { value: '10' } })
    expect(screen.getByTestId('bulk-count').textContent).toBe('3 posters')
    // Out of bounds: the count waits; leaving the box keeps it in bounds.
    fireEvent.change(box, { target: { value: '4' } })
    expect(screen.getByTestId('bulk-count').textContent).toBe('3 posters')
    fireEvent.blur(box)
    expect(box.value).toBe('10')
    // Another split has no box.
    pickMenu('Split by', 'Family')
    expect(screen.queryByRole('textbox', { name: 'Birds per poster' })).toBeNull()
  })

  it('disables bulk ZIP buttons with a note when a split has zero groups', async () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    pickMenu('Split by', 'Year')

    expect(screen.getByTestId('bulk-count').textContent).toBe('No posters to make for this choice.')
    expect((screen.getByRole('button', { name: 'Download PNGs (ZIP)' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Download PDFs (ZIP)' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Show species names is off by default in Print, disables over A4 cap (41), enables at 40 and on A3, and forwards showNames', async () => {
    const manyRows = Array.from({ length: 41 }, (_, i) => ({
      ...row(`b${i}`, i + 1),
      com: `Bird ${i + 1}`,
    }))
    const manySpecies = buildSpeciesIndex(manyRows)
    const manyList = manyRows.map((r) => entry(r.code))

    render(<ShareDialog state={stateWith(manyList)} dispatch={() => {}} species={manySpecies} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Show species names' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'A4' }))
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('A4 fits up to 40 species with names. Pick a larger size or filter your list.')

    fireEvent.click(screen.getByRole('button', { name: 'A3' }))
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
    render(<ShareDialog state={stateWith([entry('long1')])} dispatch={() => {}} species={longSpecies} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('Names won’t fit cleanly on A2. Pick a larger size or filter your list.')
  })

  it('packs names again for each paper size: the caption font follows the paper, so an A2 pack never serves A4', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const named = () => vi.mocked(image.packForImage).mock.calls.filter((c) => c[2].captionBoxes).map((c) => c[2].captionBoxes!.ostric2.h)
    await waitFor(() => expect(named()).toHaveLength(1))
    fireEvent.click(screen.getByRole('button', { name: 'A4' }))
    await waitFor(() => expect(named()).toHaveLength(2))
    // A4's minimum caption size is larger in design units than A2's, so its name box is taller.
    expect(named()[1]).toBeGreaterThan(named()[0])
  })

  it('with names off, the poster\'s pack is not made again when only the names\' inputs change (the lifer rings)', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2'), entry('emu1')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const plainPrint = () => vi.mocked(image.packForImage).mock.calls.filter((c) => !c[2].captionBoxes && c[2].aspect < 1).length
    await waitFor(() => expect(plainPrint()).toBe(1))
    await waitFor(() => expect(vi.mocked(image.packForImage).mock.calls.some((c) => c[2].captionBoxes)).toBe(true))
    act(() => setLiferMark('newest', true))
    await waitFor(() => expect(vi.mocked(image.packForImage).mock.calls.filter((c) => c[2].captionBoxes?.emu1?.ring).length).toBe(1))
    // The preview renders again with the rings (after its debounce), from the same names-off pack.
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', markNewest: true }))
    expect(plainPrint()).toBe(1)
    act(() => setLiferMark('newest', false))
  })

  it('disables Show species names when caption pack check rejects', async () => {
    vi.mocked(image.packForImage).mockImplementation(async (_entries, _species, spec) => {
      if (spec.captionBoxes) throw new Error('packBest: does not fit')
      return { W: 100, H: 100, boxes: new Map() }
    })
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print poster' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    await waitFor(() => expect(sw.disabled).toBe(true))
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('Names won’t fit cleanly on A2. Pick a larger size or filter your list.')
  })
})

describe('share dialog: Packed / Oval and the lifer marks', () => {
  beforeEach(() => {
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) } })
  })
  afterEach(() => { setArrangement('packed'); setLiferMark('newest', false); setLiferMark('first', false) })
  it('Fit to start (stored as packed); Oval packs the images inside the ellipse, is kept on the device, and re-renders', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.packForImage)).toHaveBeenCalled())
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2].oval).toBeUndefined()
    const group = screen.getByRole('group', { name: 'Arrangement' })
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fit', 'Oval'])
    expect(within(group).getByRole('button', { name: 'Fit' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(within(group).getByRole('button', { name: 'Oval' }))
    expect(within(group).getByRole('button', { name: 'Oval' })).toHaveAttribute('aria-pressed', 'true')
    expect(localStorage.getItem(ARRANGEMENT_KEY)).toBe('oval')
    await waitFor(() => expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2]).toEqual(
      image.imagePackSpec('story', { name: false, filter: false, latest: true, count: 1 }, undefined, undefined, 'oval')))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)![2].oval).toBe(true)
  })

  it('a stored By family or By colour reads as Packed', () => {
    localStorage.setItem(ARRANGEMENT_KEY, 'family')
    expect(arrangement()).toBe('packed')
    localStorage.setItem(ARRANGEMENT_KEY, 'colour')
    expect(arrangement()).toBe('packed')
  })

  it('the two lifer-mark switches, off to start, ring the image\'s birds and are kept on the device', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    const newest = screen.getByRole('switch', { name: 'Mark latest lifer' })
    const first = screen.getByRole('switch', { name: 'Mark first lifer' })
    expect(newest).toHaveAttribute('aria-checked', 'false')
    expect(first).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(newest)
    expect(newest).toHaveAttribute('aria-checked', 'true')
    expect(localStorage.getItem(MARK_NEWEST_KEY)).toBe('1')
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ markNewest: true, markFirst: false }))
    fireEvent.click(first)
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ markNewest: true, markFirst: true }))
  })
})
