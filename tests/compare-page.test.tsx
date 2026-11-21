// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import linkIndex from '../data/link-index.json'
import { ComparePage, forgetCompare } from '@/components/compare/ComparePage'
import * as load from '@/lib/species/load'
import { decodeCompare, encodeCompare, encodeShare, SHARE_ORIGIN, type SharePayload } from '@/lib/share/link'
import { renderShareImage } from '@/lib/share/image'
import { drawCompareCard } from '@/lib/share/compare-image'
import { HANDOFF_KEY } from '@/lib/share/compare-handoff'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'

const codes = linkIndex as string[]
const C = (i: number) => codes[i]
const regions: Regions = { v: 1, countries: {}, sub1: {} }
const ctx = vi.hoisted(() => ({ list: [] as ListEntry[], mineSoon: true as boolean | null }))

vi.mock('@/components/app/EverybirdProvider', async () => {
  const base = (await import('@/lib/list/store')).initialState()
  return {
    useEverybirdContext: () => ({
      state: { ...base, list: ctx.list, saved: { ...base.saved, name: 'Mine' } }, dispatch: () => {},
      data: ctx.list.length ? { species: {}, regions } : null, mineSoon: ctx.mineSoon,
    }),
  }
})
// No canvas or worker in jsdom: the drawings and the download are stand-ins.
vi.mock('@/lib/share/compare-image', () => ({ drawCompareCard: vi.fn(async () => ({ blob: new Blob(['png']), W: 1080, H: 1350 })) }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), renderShareImage: vi.fn(async () => new Blob(['png'])), clearStickerCache: vi.fn() }))
vi.mock('@/lib/download', async (orig) => ({ ...(await orig<typeof import('@/lib/download')>()), downloadBlob: vi.fn() }))
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }))

const payload = (name: string, ...idx: number[]): SharePayload => ({ v: 1, name, titled: true, birds: idx.map((i) => ({ code: C(i) })) })
const link = (name: string, ...idx: number[]) => `${SHARE_ORIGIN}/s/${encodeShare(payload(name, ...idx)).token}`
const comparison = (...lists: SharePayload[]) => `${SHARE_ORIGIN}/c/${encodeCompare(lists).token}`
/** Pastes `text` into row `i`'s link box. */
const paste = (text: string, i = 0) => fireEvent.change(screen.getByTestId(`compare-link-${i}`), { target: { value: text } })
const compare = () => fireEvent.click(screen.getByTestId('compare-submit'))
const names = (el: HTMLElement) => within(el).queryAllByRole('listitem').map((li) => li.querySelector('.eb-compare-tile-name')?.textContent)
const group = (id: string | number) => screen.getByTestId(`compare-group-${id}`)
const pills = () => within(screen.getByTestId('compare-pills')).getAllByRole('listitem').map((li) => li.textContent)
const rowCount = () => screen.queryAllByTestId(/^compare-row-\d+$/).length
const card = () => vi.mocked(drawCompareCard).mock.calls.at(-1)![0]

beforeEach(() => {
  ctx.list = [1, 2, 3, 4].map((i) => ({ code: C(i), heard: false, dead: false, media: false, sources: ['ebird'] }))
  ctx.mineSoon = true
  // Only what the page reads: each bird's name and taxonomic order.
  const byCode = new Map(codes.slice(0, 20).map((code, i) => [code, { code, com: `Bird ${i}`, to: i }]))
  vi.spyOn(load, 'loadSpecies').mockResolvedValue({ byCode } as unknown as load.SpeciesIndex)
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()
})
afterEach(() => {
  cleanup()
  forgetCompare()
  sessionStorage.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('Compare: the set-up', () => {
  it('your list first, named, with its count; a pasted link fills its row’s name; Compare waits for two lists', () => {
    render(<ComparePage />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Compare with friends')
    expect(screen.getByTestId('compare-setup')).toHaveTextContent('Paste your friends’ Everybird links. Up to 6 lists.')
    expect(screen.getByTestId('compare-name-mine')).toHaveValue('Mine')
    expect(screen.getByTestId('compare-row-mine')).toHaveTextContent('Your list · 4 species')
    expect(screen.queryByTestId('compare-remove-mine')).toBeNull()
    expect(screen.getByTestId('compare-submit')).toBeDisabled()
    expect(screen.getByTestId('compare-submit')).toHaveAccessibleDescription('Comparing needs at least two lists.')
    expect(screen.getByLabelText('Name of list 2')).toHaveAttribute('placeholder', 'Birder 2')
    paste(`Mine is here ${link('Sam', 3, 4, 5)} have a look.`)
    expect(screen.getByTestId('compare-name-0')).toHaveValue('Sam')
    expect(screen.getByLabelText('Link 2')).toBe(screen.getByTestId('compare-link-0'))
    expect(screen.getByTestId('compare-submit')).toBeEnabled()
  })
  it('a link without a name is "Birder N" until one is typed; the typed name is the comparison’s', () => {
    render(<ComparePage />)
    paste(`${SHARE_ORIGIN}/s/${encodeShare({ v: 1, birds: [{ code: C(5) }] }).token}`)
    expect(screen.getByTestId('compare-name-0')).toHaveValue('')
    fireEvent.change(screen.getByTestId('compare-name-mine'), { target: { value: 'Yusuf' } })
    compare()
    expect(pills()).toEqual(['Yusuf4', 'Birder 21'])
    fireEvent.click(screen.getByTestId('compare-edit'))
    fireEvent.change(screen.getByTestId('compare-name-0'), { target: { value: 'Ada' } })
    compare()
    expect(pills()).toEqual(['Yusuf4', 'Ada1'])
  })
  it('several links, or a comparison link, fill a row each, within six lists, with today’s notes', () => {
    render(<ComparePage />)
    paste([1, 2, 3, 4, 5, 6, 7].map((i) => link(`F${i}`, i + 5)).join(' ') + ` ${SHARE_ORIGIN}/s/1broken`)
    expect(rowCount()).toBe(5)
    expect([0, 1, 2, 3, 4].map((i) => (screen.getByTestId(`compare-name-${i}`) as HTMLInputElement).value)).toEqual(['F1', 'F2', 'F3', 'F4', 'F5'])
    expect(screen.getByTestId('compare-status')).toHaveTextContent('1 link didn’t open. Up to 6 lists can be compared, so the rest weren’t added.')
    // Six lists in all: no more rows.
    expect(screen.getByTestId('compare-add')).toBeDisabled()
    fireEvent.click(screen.getByTestId('compare-remove-4'))
    expect(rowCount()).toBe(4)
    expect(screen.getByTestId('compare-add')).toBeEnabled()
    // A comparison link pasted into a new row: a row per list it holds, within the cap.
    fireEvent.click(screen.getByTestId('compare-add'))
    paste(comparison(payload('Ada', 1, 2), payload('Lee', 2, 3)), 4)
    expect(rowCount()).toBe(5)
    expect(screen.getByTestId('compare-name-4')).toHaveValue('Ada')
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Up to 6 lists can be compared')
  })
  it('Add a friend adds a row and removing one takes it out; the last row is emptied instead', () => {
    render(<ComparePage />)
    fireEvent.click(screen.getByTestId('compare-add'))
    expect(rowCount()).toBe(2)
    paste(link('Sam', 5), 1)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }))
    expect(rowCount()).toBe(1)
    paste(link('Ada', 6))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada' }))
    expect(rowCount()).toBe(1)
    expect(screen.getByTestId('compare-link-0')).toHaveValue('')
    expect(screen.getByTestId('compare-add')).toHaveFocus()
  })
  it('with no list of your own yet, says so and keeps the friend’s list for when you have one', () => {
    ctx.list = []
    ctx.mineSoon = false
    sessionStorage.setItem(HANDOFF_KEY, link('Sam', 3, 5))
    const { unmount } = render(<ComparePage />)
    expect(screen.queryByTestId('compare-row-mine')).toBeNull()
    expect(screen.getByTestId('compare-no-list')).toHaveTextContent('To compare with Sam, add your own birds first. Add birds')
    expect(within(screen.getByTestId('compare-no-list')).getByRole('link', { name: 'Add birds' })).toHaveAttribute('href', '/settings')
    unmount()
    ctx.list = [1, 2].map((i) => ({ code: C(i), heard: false, dead: false, media: false, sources: ['ebird'] }))
    ctx.mineSoon = true
    render(<ComparePage />)
    expect(screen.queryByTestId('compare-no-list')).toBeNull()
    expect(group('need')).toHaveTextContent('Yet to see2')
  })
})

describe('Compare: the comparison', () => {
  it('the pills, Edit lists and Share; the groups as rows with counts, Yet to see first; the birds as a grid', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    compare()
    expect(screen.queryByTestId('compare-setup')).toBeNull()
    expect(screen.getByTestId('compare-edit')).toHaveFocus()
    expect(pills()).toEqual(['Mine4', 'Sam3'])
    expect(screen.getByTestId('compare-summary')).toHaveTextContent('2 lists · 5 species')
    expect(within(screen.getByTestId('compare-groups')).getAllByRole('button')).toEqual([group('need'), group('all'), group(0), group(1), group('every')])
    expect(group('need')).toHaveTextContent('Yet to see1')
    expect(group('all')).toHaveTextContent('Both2')
    expect(group(0)).toHaveTextContent('Only you2')
    expect(group(1)).toHaveTextContent('Only Sam1')
    expect(group('every')).toHaveTextContent('Every bird5')
    expect(group('need')).toHaveAttribute('aria-pressed', 'true')
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 5'])
    fireEvent.click(group('all'))
    expect(group('all')).toHaveAttribute('aria-pressed', 'true')
    expect(group('need')).toHaveAttribute('aria-pressed', 'false')
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 3', 'Bird 4'])
    expect(screen.getByTestId('compare-diagram')).toHaveAttribute('aria-label', 'Only Mine: 2. Both: 2. Only Sam: 1.')
  })
  it('pressing a part of the diagram chooses its group; Bars instead of circles, a bar choosing its list', () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    compare()
    const svg = screen.getByTestId('compare-diagram')
    // The drawing box is 320 × 260 units; the page shows it at that size here.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 260, right: 320, bottom: 260, x: 0, y: 0, toJSON: () => ({}) })
    const circles = svg.querySelectorAll('circle')
    const [a, b] = [...circles].map((c) => ({ x: +c.getAttribute('cx')!, y: +c.getAttribute('cy')!, r: +c.getAttribute('r')! }))
    fireEvent.click(svg, { clientX: a.x - a.r * 0.8, clientY: a.y })
    expect(group(0)).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(svg, { clientX: (a.x + a.r + b.x - b.r) / 2, clientY: a.y })
    expect(group('all')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(svg, { clientX: 1, clientY: 1 })
    expect(group('all')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByTestId('compare-view-bars'))
    expect(screen.getByTestId('compare-view-bars')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('compare-diagram')).toBeNull()
    fireEvent.click(screen.getByTestId('compare-rank-1'))
    expect(group(1)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-rank-1')).toHaveAttribute('aria-pressed', 'true')
  })
  it('three lists: the diagram’s seven numbers in its text; Edit lists keeps the rows', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)}\n${link('Ada', 5, 6, 7, 8, 9)}`)
    compare()
    expect(screen.getByTestId('compare-diagram')).toHaveAttribute('aria-label',
      'Only Mine: 3. Only Sam: 0. Only Ada: 4. Only Mine and Sam: 1. Only Mine and Ada: 0. Only Sam and Ada: 1. On every list: 0.')
    expect(group('all')).toHaveTextContent('On every list0')
    fireEvent.click(screen.getByTestId('compare-edit'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect([0, 1].map((i) => (screen.getByTestId(`compare-name-${i}`) as HTMLInputElement).value)).toEqual(['Sam', 'Ada'])
  })
  it('Compare with mine: the handed-over link opens the comparison with your list, once', () => {
    sessionStorage.setItem(HANDOFF_KEY, `/s/${link('Sam', 3, 5).split('/s/')[1]}`)
    render(<ComparePage />)
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
    expect(group('need')).toHaveTextContent('Yet to see1')
    cleanup()
    forgetCompare()
    sessionStorage.setItem(HANDOFF_KEY, `/c/${comparison(payload('Ada', 1), payload('Sam', 9)).split('/c/')[1]}`)
    render(<ComparePage />)
    expect(pills()).toEqual(['Mine4', 'Ada1', 'Sam1'])
  })
  it('an empty group says so; a long one shows its first rows, then all on one press', async () => {
    render(<ComparePage />)
    paste(link('Sam', 1, 2, 3, 4, ...Array.from({ length: 15 }, (_, i) => i + 5)))
    compare()
    fireEvent.click(group(0))
    expect(await screen.findByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
    fireEvent.click(group(1))
    // No ResizeObserver in jsdom: four across, three rows.
    expect(names(await screen.findByTestId('compare-birds'))).toHaveLength(12)
    fireEvent.click(screen.getByTestId('compare-more'))
    expect(names(screen.getByTestId('compare-birds'))).toHaveLength(15)
  })
})

describe('Compare: Share opens the Share dialog in its Compare mode', () => {
  const open = async () => {
    // Share waits for the species file (the drawings need it).
    await waitFor(() => expect(screen.getByTestId('compare-share')).toBeEnabled())
    fireEvent.click(screen.getByTestId('compare-share'))
    return screen.findByRole('dialog')
  }
  it('What (Comparison | Wish list), the formats, Colours and Transparent only; Download draws the chosen one', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5, 6))
    compare()
    const dialog = await open()
    const opts = within(dialog).getByTestId('share-options')
    expect(within(opts).getAllByRole('group').map((g) => g.getAttribute('data-testid'))).toEqual(['share-what', 'share-colours'])
    expect(within(opts).getAllByRole('switch').map((s) => s.textContent)).toEqual(['Transparent background'])
    expect(within(dialog).queryByLabelText('Collage title')).toBeNull()
    expect(within(dialog).queryByRole('group', { name: 'Orientation' })).toBeNull()
    expect(within(within(dialog).getByRole('group', { name: 'Image format' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Story', 'Post', 'Square'])
    await waitFor(() => expect(drawCompareCard).toHaveBeenCalled())
    expect(card()).toMatchObject({ names: ['Mine', 'Sam'], sizes: [4, 4], counts: [0, 2, 2, 2], format: 'post', caption: '2 of Sam’s birds you’ve yet to see' })
    fireEvent.click(within(dialog).getByRole('button', { name: /^Square/ }))
    await waitFor(() => expect(card().format).toBe('square'))
    const download = within(dialog).getByRole('button', { name: 'Download image' })
    await waitFor(() => expect(download).toBeEnabled())
    fireEvent.click(download)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-compare.png'))
    fireEvent.click(within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Wish list' }))
    await waitFor(() => expect(renderShareImage).toHaveBeenCalled())
    const wish = vi.mocked(renderShareImage).mock.calls.at(-1)![0]
    expect(wish).toMatchObject({ format: 'square', name: '2 of Sam’s birds you’ve yet to see', countSize: 'hide', latest: false })
    expect(wish.entries.map((e) => e.code).sort()).toEqual([C(5), C(6)].sort())
    await waitFor(() => expect(download).toBeEnabled())
    fireEvent.click(download)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-wish-list.png'))
    expect(within(dialog).getByRole('button', { name: 'Share image' })).toBeInTheDocument()
  })
  it('Copy link copies the comparison link, its consent note beside it', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    render(<ComparePage />)
    paste(link('Sam', 3, 4))
    fireEvent.change(screen.getByTestId('compare-name-0'), { target: { value: 'Samuel' } })
    compare()
    const dialog = await open()
    const copy = within(dialog).getByRole('button', { name: 'Copy link' })
    expect(copy).toHaveAccessibleDescription('A comparison link carries every list in it, so ask the others before you share it.')
    fireEvent.click(copy)
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const url = (writeText.mock.calls[0] as unknown as [string])[0]
    expect(decodeCompare(url.split('/c/')[1]).map((p) => p.name)).toEqual(['Mine', 'Samuel'])
    await waitFor(() => expect(within(dialog).getByTestId('share-note')).toHaveTextContent('Link copied.'))
  })
  it('without your own list the wish list is off, with the reason as its tooltip', async () => {
    ctx.list = []
    ctx.mineSoon = false
    render(<ComparePage />)
    paste(comparison(payload('Ada', 1, 2), payload('Sam', 2, 3)))
    compare()
    expect(screen.queryByTestId('compare-group-need')).toBeNull()
    expect(group('all')).toHaveAttribute('aria-pressed', 'true')
    const dialog = await open()
    const wish = within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Wish list' })
    expect(wish).toHaveAttribute('aria-disabled', 'true')
    expect(wish).toHaveAttribute('title', 'Add your own birds for a wish list.')
    fireEvent.click(wish)
    expect(within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Comparison' })).toHaveAttribute('aria-pressed', 'true')
  })
})
