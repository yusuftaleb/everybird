// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShareDialog from '@/components/share/ShareDialog'
import type { ListEntry } from '@/lib/list/model'
import { initialState } from '@/lib/list/store'
import { decodeShare } from '@/lib/share/link'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

// The renderer is replaced by a promise the test resolves, so "busy" is under the test's control.
const renders: { resolve: (b: Blob) => void }[] = []
vi.mock('@/lib/share/image', async (orig) => ({
  ...(await orig<typeof import('@/lib/share/image')>()),
  packForImage: vi.fn(async () => ({ boxes: [] })),
  renderShareImage: vi.fn(() => new Promise<Blob>((resolve) => renders.push({ resolve }))),
  clearStickerCache: vi.fn(),
}))

const row = (code: string, to: number) => ({ code, com: code, sci: code, ord: 'Struthioniformes', fam: 'Struthionidae', famCom: 'Ostriches', to, g: 100000, gSrc: 'family', st: true, ar: 1, q: true }) as SpeciesRow
const species = buildSpeciesIndex([row('ostric2', 1), row('emu1', 2)])
const regions = { v: 1 as const, countries: { CA: 'Canada' }, sub1: {} }
const entry = (code: string): ListEntry => ({ code, date: '2020-05', place: { country: 'CA' }, heard: false, dead: false, media: false, sources: ['ebird'] })
const stateWith = (list: ListEntry[]) => ({ ...initialState(), list })

beforeEach(() => {
  renders.length = 0
  URL.createObjectURL = vi.fn(() => 'blob:x')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

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
    const image = await import('@/lib/share/image')
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
})
