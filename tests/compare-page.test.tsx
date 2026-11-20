// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import linkIndex from '../data/link-index.json'
import { ComparePage, forgetCompare } from '@/components/compare/ComparePage'
import * as load from '@/lib/species/load'
import { encodeCompare, encodeShare, SHARE_ORIGIN, type SharePayload } from '@/lib/share/link'
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

vi.mock('@/components/app/EverybirdProvider', () => ({
  useEverybirdContext: () => ({
    state: { list: ctx.list, saved: { name: 'Mine' } }, data: ctx.list.length ? { species: {}, regions } : null, mineSoon: ctx.mineSoon,
  }),
}))
// No canvas or worker in jsdom: the drawings and the download are stand-ins.
vi.mock('@/lib/share/compare-image', () => ({ drawCompareCard: vi.fn(async () => ({ blob: new Blob(['png']), W: 1080, H: 1350 })) }))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), renderShareImage: vi.fn(async () => new Blob(['png'])) }))
vi.mock('@/lib/download', async (orig) => ({ ...(await orig<typeof import('@/lib/download')>()), downloadBlob: vi.fn() }))

const link = (name: string, ...idx: number[]) => `${SHARE_ORIGIN}/s/${encodeShare({ v: 1, name, titled: true, birds: idx.map((i) => ({ code: C(i) })) }).token}`
const paste = (text: string) => {
  fireEvent.change(screen.getByTestId('compare-paste'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('compare-submit'))
}
const names = (el: HTMLElement) => within(el).queryAllByRole('listitem').map((li) => li.querySelector('.eb-compare-tile-name')?.textContent)
const chip = (id: string | number) => screen.getByTestId(`compare-group-${id}`)
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
})

describe('ComparePage', () => {
  it('your list and a pasted link: one row of chips, yet to see first, each with its count; the birds as a grid', async () => {
    render(<ComparePage />)
    expect(screen.getByLabelText('Paste a friend’s Everybird link')).toBe(screen.getByTestId('compare-paste'))
    expect(screen.getByTestId('compare-limit')).toHaveTextContent('Compare up to 6 lists: yours and 5 friends’.')
    paste(`Mine is here ${link('Sam', 3, 4, 5)} have a look.`)
    expect(within(screen.getByTestId('compare-groups')).getAllByRole('button')).toEqual([chip('need'), chip('all'), chip(0), chip(1), chip('every')])
    expect(chip('need')).toHaveTextContent('Yet to see1')
    expect(chip('all')).toHaveTextContent('Both2')
    expect(chip(0)).toHaveTextContent('Only you2')
    expect(chip(1)).toHaveTextContent('Only Sam1')
    expect(chip('every')).toHaveTextContent('Every bird5')
    expect(chip('need')).toHaveAttribute('aria-pressed', 'true')
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 5'])
    fireEvent.click(chip('all'))
    expect(chip('all')).toHaveAttribute('aria-pressed', 'true')
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 3', 'Bird 4'])
    // The head's buttons work now; what a comparison link carries, read with them.
    const copy = screen.getByTestId('compare-copy')
    expect(copy).toBeEnabled()
    expect(screen.getByTestId('compare-consent')).toHaveTextContent('A comparison link carries every list in it, so ask the others before you share it.')
    expect(copy.getAttribute('aria-describedby')).toContain(screen.getByTestId('compare-consent').id)
    // Once a comparison shows, the field adds another friend.
    expect(screen.getByLabelText('Add another friend’s link')).toHaveValue('')
    expect(screen.getByTestId('compare-submit')).toHaveTextContent('Add')
    expect(screen.queryByTestId('compare-add-more')).toBeNull()
  })
  it('before a comparison: the buttons wait with the reason, and Add more takes a link a field, up to five', () => {
    render(<ComparePage />)
    for (const id of ['compare-copy', 'compare-wish', 'compare-card']) expect(screen.getByTestId(id)).toBeDisabled()
    expect(screen.getByTestId('compare-consent')).toHaveTextContent('Compare two lists to share them.')
    for (let i = 1; i < 5; i++) {
      fireEvent.click(screen.getByTestId('compare-add-more'))
      expect(screen.getByTestId(`compare-paste-${i}`)).toHaveFocus()
    }
    // Five friends and yours: six lists, so Add more is off, read with the limit.
    expect(screen.getByTestId('compare-add-more')).toBeDisabled()
    expect(screen.getByTestId('compare-add-more')).toHaveAccessibleDescription('Compare up to 6 lists: yours and 5 friends’.')
    expect(screen.getByLabelText('Link 5')).toBe(screen.getByTestId('compare-paste-4'))
    fireEvent.change(screen.getByTestId('compare-paste-1'), { target: { value: link('Sam', 3) } })
    fireEvent.change(screen.getByTestId('compare-paste-3'), { target: { value: link('Ada', 6) } })
    fireEvent.click(screen.getByTestId('compare-submit'))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.queryByTestId('compare-paste-1')).toBeNull()
  })
  it('six lists at most: links past the cap are not added, with a note', () => {
    render(<ComparePage />)
    paste([1, 2, 3, 4, 5, 6, 7].map((i) => link(`F${i}`, i + 5)).join(' '))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Up to 6 lists can be compared, so the rest weren’t added.')
    // A full comparison takes no more.
    paste(link('Ada', 15))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Up to 6 lists can be compared')
  })
  it('a comparison link of six lists stands alone: a seventh is not added', () => {
    render(<ComparePage />)
    const six = [1, 2, 3, 4, 5, 6].map((i): SharePayload => ({ v: 1, name: `F${i}`, titled: true, birds: [{ code: C(i) }] }))
    paste(`${SHARE_ORIGIN}/c/${encodeCompare(six).token}`)
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('')
    paste(link('Ada', 15))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(6)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Up to 6 lists can be compared')
  })
  it('the card on the page: every number of the diagram as its text, the chosen chip as its caption, shared or downloaded', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    const img = await screen.findByTestId('compare-card-image')
    expect(img).toHaveAttribute('alt', 'Only Mine: 2. Both: 2. Only Sam: 1.')
    expect(card().names).toEqual(['Mine', 'Sam'])
    expect(card().sizes).toEqual([4, 3])
    expect(card().counts).toEqual([0, 2, 1, 2])
    expect(card().caption).toBe('1 of Sam’s birds you’ve yet to see')
    expect(card().codes).toEqual([C(5)])
    fireEvent.click(chip(0))
    // The card travels: never "you" there.
    await waitFor(() => expect(card().caption).toBe('Only Mine: 2'))
    // No file sharing in jsdom: Share card downloads the card it shows.
    fireEvent.click(screen.getByTestId('compare-card'))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-compare.png'))
    expect(await screen.findByTestId('compare-card-status')).toHaveTextContent('Saved everybird-compare.png.')
  })
  it('the wish list: the birds you’ve yet to see, named for the friend, whichever chip is chosen', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5, 6))
    fireEvent.click(chip('all'))
    const wish = screen.getByTestId('compare-wish')
    await waitFor(() => expect(wish).toBeEnabled())
    fireEvent.click(wish)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-wish-list.png'))
    const opts = vi.mocked(renderShareImage).mock.calls[0][0]
    expect(opts.name).toBe('2 of Sam’s birds you’ve yet to see')
    expect(opts.entries.map((e) => e.code).sort()).toEqual([C(5), C(6)].sort())
    expect(opts.countSize).toBe('hide')
  })
  it('every list is renamed on its name, in place, yours too; your chip stays "Only you"', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)} ${link('Ada', 6)}`)
    expect(screen.getByTestId('compare-people')).toHaveTextContent('Mine(you)')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Mine' }))
    fireEvent.change(screen.getByTestId('compare-name-0'), { target: { value: 'Yusuf' } })
    fireEvent.keyDown(screen.getByTestId('compare-name-0'), { key: 'Enter' })
    expect(screen.getByTestId('compare-people')).toHaveTextContent('Yusuf(you)')
    expect(chip(0)).toHaveTextContent('Only you')
    await waitFor(() => expect(card().names).toEqual(['Yusuf', 'Sam', 'Ada']))
    expect(screen.queryByTestId('compare-remove-0')).toBeNull()
    const edit = screen.getByRole('button', { name: 'Rename Sam' })
    fireEvent.click(edit)
    const field = screen.getByTestId('compare-name-1')
    expect(field).toHaveValue('Sam')
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'Samuel' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.queryByTestId('compare-name-1')).toBeNull()
    expect(chip(1)).toHaveTextContent('Only Samuel1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Samuel' })).toHaveFocus())
    // Escape keeps the name; an empty one falls back to the list's place.
    fireEvent.click(screen.getByRole('button', { name: 'Rename Samuel' }))
    fireEvent.change(screen.getByTestId('compare-name-1'), { target: { value: 'Nope' } })
    fireEvent.keyDown(screen.getByTestId('compare-name-1'), { key: 'Escape' })
    expect(chip(1)).toHaveTextContent('Only Samuel1')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Samuel' }))
    fireEvent.change(screen.getByTestId('compare-name-1'), { target: { value: '' } })
    fireEvent.blur(screen.getByTestId('compare-name-1'))
    expect(chip(1)).toHaveTextContent('Only Birder 21')
  })
  it('three lists: a bar per list, most first, each picking its own birds; the diagram’s seven numbers in the text', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)}\n${link('Ada', 5, 6, 7, 8, 9)}`)
    const rows = within(screen.getByTestId('compare-people')).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.eb-compare-name')?.textContent)).toEqual(['Ada', 'Mine(you)', 'Sam'])
    expect(rows.map((r) => r.querySelector('.eb-compare-count')?.textContent)).toEqual(['5', '4', '2'])
    expect(chip('all')).toHaveTextContent('On every list0')
    expect(chip('need')).toHaveTextContent('Yet to see5')
    fireEvent.click(screen.getByTestId('compare-rank-2'))
    expect(screen.getByTestId('compare-rank-2')).toHaveAttribute('aria-pressed', 'true')
    expect(chip(2)).toHaveAttribute('aria-pressed', 'true')
    expect(chip(2)).toHaveTextContent('Only Ada4')
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 6', 'Bird 7', 'Bird 8', 'Bird 9'])
    fireEvent.click(screen.getByTestId('compare-rank-0'))
    expect(chip(0)).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByTestId('compare-card-image')).toHaveAttribute('alt',
      'Only Mine: 3. Only Sam: 0. Only Ada: 4. Only Mine and Sam: 1. Only Mine and Ada: 0. Only Sam and Ada: 1. On every list: 0.')
    expect(chip('every')).toHaveTextContent('Every bird9')
    // With several friends, the wish list is all of theirs.
    fireEvent.click(screen.getByTestId('compare-wish'))
    await waitFor(() => expect(renderShareImage).toHaveBeenCalled())
    expect(vi.mocked(renderShareImage).mock.calls[0][0].name).toBe('5 of your friends’ birds you’ve yet to see')
  })
  it('adds another friend to the comparison showing, and removes one', () => {
    render(<ComparePage />)
    paste(link('Sam', 1, 5))
    paste(link('Ada', 6))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(2)
    expect(chip('need')).toHaveTextContent('Yet to see1')
    expect(screen.getByTestId('compare-people')).toHaveTextContent('Ada')
  })
  it('a pasted comparison link opens that comparison as shared, without your list', () => {
    render(<ComparePage />)
    const ada: SharePayload = { v: 1, name: 'Ada', titled: true, birds: [1, 2].map((i) => ({ code: C(i) })) }
    const sam: SharePayload = { v: 1, name: 'Sam', titled: true, birds: [2, 3].map((i) => ({ code: C(i) })) }
    paste(`${SHARE_ORIGIN}/c/${encodeCompare([ada, sam]).token}`)
    expect(screen.queryByTestId('compare-group-need')).toBeNull()
    expect(chip('all')).toHaveTextContent('Both1')
    expect(chip(0)).toHaveTextContent('Only Ada1')
    expect(chip(1)).toHaveTextContent('Only Sam1')
    expect(chip('all')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('(you)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename Ada' })).toBeInTheDocument()
    expect(screen.getByTestId('compare-wish')).toBeDisabled()
    expect(screen.getByTestId('compare-consent')).toHaveTextContent('Add your own birds for a wish list.')
  })
  it('Compare with mine: the handed-over link opens with your list, once', () => {
    sessionStorage.setItem(HANDOFF_KEY, `/s/${link('Sam', 3, 5).split('/s/')[1]}`)
    render(<ComparePage />)
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
    expect(chip('need')).toHaveTextContent('Yet to see1')
    cleanup()
    forgetCompare()
    // A shared comparison's lists, with yours added first.
    const ada: SharePayload = { v: 1, name: 'Ada', titled: true, birds: [{ code: C(1) }] }
    const sam: SharePayload = { v: 1, name: 'Sam', titled: true, birds: [{ code: C(9) }] }
    sessionStorage.setItem(HANDOFF_KEY, `/c/${encodeCompare([ada, sam]).token}`)
    render(<ComparePage />)
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByTestId('compare-people')).toHaveTextContent('Mine(you)')
  })
  it('with no list of your own yet, says so and keeps the friend’s list for when you have one', () => {
    ctx.list = []
    ctx.mineSoon = false
    sessionStorage.setItem(HANDOFF_KEY, link('Sam', 3, 5))
    const { unmount } = render(<ComparePage />)
    expect(screen.getByTestId('compare-no-list')).toHaveTextContent('To compare with Sam, add your own birds first. Add birds')
    expect(within(screen.getByTestId('compare-no-list')).getByRole('link', { name: 'Add birds' })).toHaveAttribute('href', '/settings')
    expect(screen.getByTestId('compare-status')).toHaveTextContent('')
    unmount()
    ctx.list = [1, 2].map((i) => ({ code: C(i), heard: false, dead: false, media: false, sources: ['ebird'] }))
    ctx.mineSoon = true
    render(<ComparePage />)
    expect(screen.queryByTestId('compare-no-list')).toBeNull()
    expect(chip('need')).toHaveTextContent('Yet to see2')
  })
  it('an empty group says so', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 2, 3, 4, 5)}\n${link('Ada', 1, 2, 3, 4, 6)}`)
    expect(chip('all')).toHaveTextContent('On every list4')
    fireEvent.click(chip(0))
    expect(await screen.findByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
  })
  it('a long group shows its first rows, then all of them on one press', async () => {
    render(<ComparePage />)
    paste(link('Sam', ...Array.from({ length: 15 }, (_, i) => i + 5)))
    // No ResizeObserver in jsdom: four across, three rows.
    expect(names(await screen.findByTestId('compare-birds'))).toHaveLength(12)
    fireEvent.click(screen.getByTestId('compare-more'))
    expect(screen.queryByTestId('compare-more')).toBeNull()
    expect(names(screen.getByTestId('compare-birds'))).toHaveLength(15)
  })
  it('over six lists, the comparison still shows but the link is blocked with the reason', () => {
    render(<ComparePage />)
    paste(Array.from({ length: 6 }, (_, i) => link(`F${i}`, 10 + i)).join(' '))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(7)
    expect(screen.getByTestId('compare-copy')).toBeDisabled()
    expect(screen.getByTestId('compare-share-status')).toHaveTextContent('A comparison link holds up to 6 lists.')
  })
  it('a paste with no link that opens says so', () => {
    render(<ComparePage />)
    paste('hello there')
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Comparing needs at least two lists.')
    expect(screen.queryByTestId('compare-groups')).toBeNull()
    paste(`${SHARE_ORIGIN}/s/1broken`)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('1 link didn’t open. Comparing needs at least two lists.')
  })
})
