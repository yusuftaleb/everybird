// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareDialog from '@/components/share/ShareDialog'
import * as image from '@/lib/share/image'
import { setLiferMark } from '@/lib/lifer-marks'
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

// The poster is made by a promise the test settles; it records the progress callback, the signal and the opts.
type FakePoster = { size: string; landscape: boolean; bytes: number; soft: number; missing: number; file: ReturnType<typeof vi.fn>; dispose: ReturnType<typeof vi.fn> }
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
  it('"Collage title" starts from Settings > Name your collage; editing it changes only this share, never the saved title', async () => {
    const dispatch = vi.fn()
    const state = stateWith([entry('ostric2')])
    state.saved = { ...state.saved, name: "Ada's big year" }
    render(<ShareDialog state={state} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    const field = screen.getByLabelText('Collage title') as HTMLInputElement
    expect(field.value).toBe("Ada's big year")
    fireEvent.change(field, { target: { value: 'Ada B.' } })
    expect(field.value).toBe('Ada B.')
    expect(dispatch).not.toHaveBeenCalled()
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

  it('shows the four actions by name; Print a poster opens print mode, Share images goes back, focus following', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    for (const name of ['Share image', 'Download image', 'Copy link', 'Print a poster']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('group', { name: 'Image format' }).querySelectorAll('button')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    expect(screen.getByRole('group', { name: 'Poster size' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Image format' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Make poster' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Share image' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Print a poster' })).toBeNull()
    const back = screen.getByRole('button', { name: 'Share images' })
    await waitFor(() => expect(back).toHaveFocus())
    fireEvent.click(back)
    expect(screen.getByRole('group', { name: 'Image format' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Poster size' })).toBeNull()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print a poster' })).toHaveFocus())
  })

  it('has no "Image options" heading; the three switches share one row inside one box with the title field', () => {
    const st = { ...stateWith([entry('ostric2')]), filter: { countries: ['CA'] } }
    render(<ShareDialog state={st} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByText('Image options')).toBeNull()
    expect(screen.queryByRole('group', { name: 'Image options' })).toBeNull()
    const field = screen.getByLabelText('Collage title').closest('.eb-share-field')!
    const latest = screen.getByRole('switch', { name: 'Show latest lifer' })
    const dark = screen.getByRole('switch', { name: 'Dark image' })
    const row = screen.getByTestId('share-switches')
    expect(latest.parentElement).toBe(row)
    expect(dark.parentElement).toBe(row)
    expect(field.nextElementSibling).toBe(row)
    expect(row.parentElement).toBe(field.parentElement)
    expect(row.parentElement).toHaveClass('eb-share-box')
    // In print mode the size control sits above the box, outside it.
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    const sizes = screen.getByRole('group', { name: 'Poster size' })
    expect(sizes.compareDocumentPosition(screen.getByLabelText('Collage title')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sizes.closest('.eb-share-box')).toBeNull()
  })

  it('the title label says "(optional)" beside it and the placeholder is an example', () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    const input = screen.getByLabelText('Collage title')
    expect(input).toHaveAttribute('placeholder', 'My 2024 birds')
    expect(screen.getByText('(optional)')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription('(optional)')
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

  it('"Dark image" starts at the app\'s theme (light)', () => {
    render(<ShareDialog state={stateWith([])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Dark image' })).toHaveAttribute('aria-checked', 'false')
  })

  it('"Dark image" starts on when the app is dark, and the first render is dark', async () => {
    document.documentElement.dataset.theme = 'dark'
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.getByRole('switch', { name: 'Dark image' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(image.renderShareImage).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ format: 'story', theme: 'dark' })
  })

  it('toggling "Dark image" re-renders the share preview with the other theme, and the page theme is left alone', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(renders).toHaveLength(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0]).toMatchObject({ theme: 'light' })
    fireEvent.click(screen.getByRole('switch', { name: 'Dark image' }))
    expect(screen.getByRole('switch', { name: 'Dark image' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(renders).toHaveLength(2))
    expect(vi.mocked(image.renderShareImage).mock.calls[1][0]).toMatchObject({ format: 'story', theme: 'dark' })
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('shows "Dark image" even when there is no latest lifer', () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Show latest lifer' })).toBeNull()
    expect(screen.getByRole('switch', { name: 'Dark image' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: /^Post/ }))
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
  const toPrint = () => fireEvent.click(screen.getByRole('button', { name: /^Print/ }))
  const startMakeAgain = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(2))
  }
  const startMake = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
    await waitFor(() => expect(makes).toHaveLength(1))
  }

  it('Print a poster (the row\'s short "Print" by default) shows Poster size A4–A1, A2 pressed, and Make poster', async () => {
    open()
    expect(screen.getByRole('button', { name: 'Print a poster' }).textContent).toBe('Print')
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
    // Share images leaves print mode.
    fireEvent.click(screen.getByRole('button', { name: 'Share images' }))
    expect(screen.queryByRole('group', { name: 'Poster size' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Share image' })).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('button', { name: 'Share images' }))
    expect(makes[0].opts.signal?.aborted).toBe(true)
    first.unmount()

    makes.length = 0
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    await startMake()
    const p = fakePoster()
    await act(async () => makes[0].resolve(p))
    fireEvent.click(screen.getByRole('button', { name: 'Share images' }))
    expect(p.dispose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
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

  it('"Dark image" in print mode re-renders the preview dark and discards a made poster; makePoster gets the theme', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: /^Print/ }))
    await waitFor(() => expect(fail.left).toBe(1))
    // Focus is on Back (print mode's arrival); a real click moves it to Make poster, which fireEvent.click doesn't, and
    // only from there (lost when the button goes) does it follow the one that comes back.
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
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    expect((screen.getByRole('button', { name: 'Horizontal' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('US poster sizes show inches, keep data-size on the preview, name files in inches and track us24x36', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
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
      fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
      fireEvent.click(screen.getByRole('button', { name: 'Make poster' }))
      await waitFor(() => expect(makes).toHaveLength(1))
      expect(makes[0].opts).toMatchObject({ markNewest: true, markFirst: true })
    } finally {
      setLiferMark('newest', false)
      setLiferMark('first', false)
    }
  })

  it('hides Big Year when the list has no dates, and renders/saves the goal when dated', async () => {
    const { unmount } = render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    expect(screen.queryByRole('switch', { name: 'Big Year' })).toBeNull()
    unmount()

    const dispatch = vi.fn()
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={dispatch} species={species} regions={regions} onClose={() => {}} />)
    const sw = screen.getByRole('switch', { name: 'Big Year' })
    fireEvent.click(sw)
    const yearSelect = screen.getByLabelText('Year') as HTMLSelectElement
    const targetInput = screen.getByLabelText('Target') as HTMLInputElement
    expect(targetInput.value).toBe('')
    fireEvent.change(yearSelect, { target: { value: '2026' } })
    fireEvent.change(targetInput, { target: { value: '300' } })
    expect(dispatch).toHaveBeenCalledWith({ type: 'bigYear', bigYear: { year: 2026, target: 300 } })
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)![0]).toMatchObject({
      goal: { year: 2026, target: 300, basis: 'lifer' },
    }))
  })

<<<<<<< HEAD
  it('lets the user pick Count size in Share and Print, repacks, and forwards it to preview and poster PNG/PDF', async () => {
    render(<ShareDialog state={stateWith([entry('ostric2')])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    await waitFor(() => expect(vi.mocked(image.renderShareImage)).toHaveBeenCalledTimes(1))
    expect(vi.mocked(image.renderShareImage).mock.calls[0][0].countSize).toBe('medium')

    const group = screen.getByRole('group', { name: 'Count size' })
    expect(within(group).getByRole('button', { name: 'Medium' }).getAttribute('aria-pressed')).toBe('true')

    fireEvent.click(within(group).getByRole('button', { name: 'Small' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('small'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2]).toMatchObject({
      hole: expect.objectContaining({ pad: expect.any(Number) }),
    })

    fireEvent.click(within(group).getByRole('button', { name: 'Hide' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0].countSize).toBe('hide'))
    expect(vi.mocked(image.packForImage).mock.calls.at(-1)?.[2].hole.pad).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    await waitFor(() => expect(vi.mocked(image.renderShareImage).mock.calls.at(-1)?.[0]).toMatchObject({ format: 'print', countSize: 'hide' }))
    fireEvent.click(within(group).getByRole('button', { name: 'Large' }))
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
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bulk export (ZIP)' }))

    fireEvent.click(within(screen.getByRole('group', { name: 'Count size' })).getByRole('button', { name: 'Small' }))

    const split = screen.getByLabelText('Split by') as HTMLSelectElement
    fireEvent.change(split, { target: { value: 'family' } })
    expect(screen.getByTestId('bulk-count').textContent).toBe('2 posters')

    fireEvent.click(screen.getByRole('button', { name: 'Download PNG ZIP' }))
    await waitFor(() => expect(makes).toHaveLength(1))
    expect(makes[0].opts).toMatchObject({ countSize: 'small' })
    expect(screen.getByTestId('bulk-progress').textContent).toContain('Group 1 of 2')
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

  it('disables bulk ZIP buttons with a note when a split has zero groups', async () => {
    render(<ShareDialog state={stateWith([{ ...entry('ostric2'), date: undefined }])} dispatch={() => {}} species={species} regions={regions} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    fireEvent.click(screen.getByRole('button', { name: 'Bulk export (ZIP)' }))
    fireEvent.change(screen.getByLabelText('Split by'), { target: { value: 'year' } })

    expect(screen.getByTestId('bulk-count').textContent).toBe('No groups match this split.')
    expect((screen.getByRole('button', { name: 'Download PNG ZIP' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: 'Download PDF ZIP' }) as HTMLButtonElement).disabled).toBe(true)
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

    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(sw.disabled).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: 'A4' }))
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('A4 supports up to 40 species with names. Choose a larger paper size or filter your list.')

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
    fireEvent.click(screen.getByRole('button', { name: 'Print a poster' }))
    const sw = screen.getByRole('switch', { name: 'Show species names' }) as HTMLButtonElement
    expect(sw.disabled).toBe(true)
    expect(screen.getByTestId('share-print-names-note')).toHaveTextContent('Species names can’t fit on A2 without clipping. Choose a larger paper size or filter your list.')
  })
})
