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
import { vennLayout } from '@/lib/share/venn'
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
// No canvas or worker in jsdom: the drawings and the download are stand-ins (the card's Venn is the real geometry).
vi.mock('@/lib/share/compare-image', () => ({
  CARD_STICKERS: 36,
  drawCompareCard: vi.fn(async (o: { counts: { first: number; both: number; other: number } }) => ({
    blob: new Blob(['png']), W: 1080, H: 1350, venn: vennLayout(o.counts, { x: 64, y: 200, w: 952, h: 600 }),
  })),
}))
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), renderShareImage: vi.fn(async () => new Blob(['png'])) }))
vi.mock('@/lib/download', async (orig) => ({ ...(await orig<typeof import('@/lib/download')>()), downloadBlob: vi.fn() }))
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))

const link = (name: string, ...idx: number[]) => `${SHARE_ORIGIN}/s/${encodeShare({ v: 1, name, titled: true, birds: idx.map((i) => ({ code: C(i) })) }).token}`
const paste = (text: string) => {
  fireEvent.change(screen.getByTestId('compare-paste'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('compare-submit'))
}
const names = (el: HTMLElement) => within(el).queryAllByRole('listitem').map((li) => li.querySelector('.eb-compare-bird-name')?.textContent)

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
  it('your list and a pasted link: the birds you still need first, then both and only you, each with its count', async () => {
    render(<ComparePage />)
    expect(screen.getByLabelText('Paste a friend’s Everybird link')).toBe(screen.getByTestId('compare-paste'))
    paste(`Mine is here ${link('Sam', 3, 4, 5)} have a look.`)
    const both = screen.getByTestId('compare-group-all'), you = screen.getByTestId('compare-group-0'), need = screen.getByTestId('compare-group-1')
    expect(within(screen.getByTestId('compare-groups')).getAllByRole('button')).toEqual([need, both, you])
    expect(need).toHaveTextContent('You still need · 1')
    expect(both).toHaveTextContent('Both · 2')
    expect(you).toHaveTextContent('Only you · 2')
    expect(need).toHaveAttribute('aria-pressed', 'true')
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 5'])
    expect(screen.getByTestId('compare-birds')).toHaveTextContent('Sam')
    fireEvent.click(both)
    expect(both).toHaveAttribute('aria-pressed', 'true')
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 3', 'Bird 4'])
    expect(screen.queryByTestId('compare-group-table')).toBeNull()
    // Before a link is made: what it carries, read with the button.
    const copy = screen.getByTestId('compare-copy')
    expect(copy).toBeEnabled()
    expect(screen.getByTestId('compare-consent')).toHaveTextContent('A comparison link carries every list in it, so ask the others before you share it.')
    expect(copy.getAttribute('aria-describedby')).toContain(screen.getByTestId('compare-consent').id)
    // Once a comparison shows, the field adds another friend.
    expect(screen.getByLabelText('Add another friend’s link')).toHaveValue('')
    expect(screen.getByTestId('compare-submit')).toHaveTextContent('Add')
  })
  it('the card on the page: the Venn’s counts as its text, its regions choosing the group, shared or downloaded', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    const img = await screen.findByTestId('compare-card-image')
    expect(img).toHaveAttribute('alt', 'Only Mine: 2. Both: 2. Only Sam: 1.')
    const opts = vi.mocked(drawCompareCard).mock.calls.at(-1)![0]
    expect(opts.title).toBe('Mine & Sam')
    expect(opts.line).toBe('Mine: 4 · Sam: 3')
    expect(opts.names).toEqual(['Mine', 'Sam'])
    expect(opts.counts).toEqual({ first: 2, both: 2, other: 1 })
    // The regions are pointer shortcuts to the segmented control.
    fireEvent.click(screen.getByTestId('compare-venn-both'))
    expect(screen.getByTestId('compare-group-all')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-venn-both')).toHaveAttribute('data-on')
    fireEvent.click(screen.getByTestId('compare-venn-first'))
    expect(screen.getByTestId('compare-group-0')).toHaveAttribute('aria-pressed', 'true')
    // No file sharing in jsdom: Share card downloads the card it shows.
    fireEvent.click(screen.getByTestId('compare-card'))
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-compare.png'))
    expect(await screen.findByTestId('compare-card-status')).toHaveTextContent('Saved everybird-compare.png.')
  })
  it('the wish list: offered with the birds you still need, named for the friend', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5, 6))
    const wish = await screen.findByTestId('compare-wish')
    await waitFor(() => expect(wish).toBeEnabled())
    fireEvent.click(wish)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-wish-list.png'))
    const opts = vi.mocked(renderShareImage).mock.calls[0][0]
    expect(opts.name).toBe('2 birds Sam has that I still need')
    expect(opts.entries.map((e) => e.code).sort()).toEqual([C(5), C(6)].sort())
    expect(opts.countSize).toBe('hide')
    fireEvent.click(screen.getByTestId('compare-group-all'))
    expect(screen.queryByTestId('compare-wish')).toBeNull()
  })
  it('a pasted list is renamed on its name, in place; your own list is marked and keeps its title', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)} ${link('Ada', 6)}`)
    const people = screen.getByTestId('compare-people')
    expect(people).toHaveTextContent('Mine(you)')
    expect(screen.queryByTestId('compare-rename-0')).toBeNull()
    const edit = screen.getByRole('button', { name: 'Rename Sam' })
    fireEvent.click(edit)
    const field = screen.getByTestId('compare-name-1')
    expect(field).toHaveValue('Sam')
    expect(field).toHaveFocus()
    fireEvent.change(field, { target: { value: 'Samuel' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(screen.queryByTestId('compare-name-1')).toBeNull()
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Samuel1')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Rename Samuel' })).toHaveFocus())
    // Escape keeps the name; an empty one falls back to the list's place.
    fireEvent.click(screen.getByRole('button', { name: 'Rename Samuel' }))
    fireEvent.change(screen.getByTestId('compare-name-1'), { target: { value: 'Nope' } })
    fireEvent.keyDown(screen.getByTestId('compare-name-1'), { key: 'Escape' })
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Samuel1')
    fireEvent.click(screen.getByRole('button', { name: 'Rename Samuel' }))
    fireEvent.change(screen.getByTestId('compare-name-1'), { target: { value: '' } })
    fireEvent.blur(screen.getByTestId('compare-name-1'))
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Birder 21')
  })
  it('three lists: a ranking picks the Venn’s other circle; every bird in the table, marked where it is', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)}\n${link('Ada', 5, 6, 7, 8, 9)}`)
    // Most species first: Ada 5, Mine 4, Sam 2; the first list's row picks nothing.
    const rows = within(screen.getByTestId('compare-people')).getAllByRole('listitem')
    expect(rows.map((r) => r.querySelector('.eb-compare-name')?.textContent)).toEqual(['Ada', 'Mine(you)', 'Sam'])
    expect(rows.map((r) => r.querySelector('.eb-compare-count')?.textContent)).toEqual(['5', '4', '2'])
    expect(within(rows[1]).queryByRole('button', { pressed: false })).toBeNull()
    const sam = screen.getByTestId('compare-rank-1'), ada = screen.getByTestId('compare-rank-2')
    expect(sam).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-pair-other')).toHaveTextContent('You still need · 1')
    fireEvent.click(ada)
    expect(ada).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-pair-other')).toHaveTextContent('You still need · 5')
    expect(screen.getByTestId('compare-pair-both')).toHaveTextContent('Both · 0')
    await waitFor(() => expect(vi.mocked(drawCompareCard).mock.calls.at(-1)![0].names).toEqual(['Mine', 'Ada']))
    // The birds only one list has stay reachable, and the table holds every bird.
    expect(screen.getByTestId('compare-group-all')).toHaveTextContent('On every list0')
    const every = screen.getByTestId('compare-group-table')
    expect(every).toHaveTextContent('Every bird9')
    fireEvent.click(every)
    expect(every).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-pair-other')).toHaveAttribute('aria-pressed', 'false')
    const table = within(await screen.findByTestId('compare-table')).getByRole('table', { name: 'Every bird in this comparison and the lists it is on' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Bird', 'Mine', 'Sam', 'Ada'])
    const trs = within(table).getAllByRole('row').slice(1)
    expect(trs.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Bird 1', 'Bird 2', 'Bird 3', 'Bird 4', 'Bird 5', 'Bird 6', 'Bird 7', 'Bird 8', 'Bird 9'])
    // Bird 5 is on Sam's and Ada's lists, not yours.
    expect(within(trs[4]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['', 'On this list', 'On this list'])
    fireEvent.click(screen.getByTestId('compare-group-2'))
    expect(screen.getByTestId('compare-group-2')).toHaveTextContent('Only Ada4')
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 6', 'Bird 7', 'Bird 8', 'Bird 9'])
  })
  it('adds another friend to the comparison showing, and removes one', () => {
    render(<ComparePage />)
    paste(link('Sam', 1, 5))
    paste(link('Ada', 6))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: 'Remove Sam' }))
    expect(within(screen.getByTestId('compare-people')).getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('You still need · 1')
    expect(screen.getByTestId('compare-people')).toHaveTextContent('Ada')
  })
  it('a pasted comparison link opens that comparison as shared, without your list', () => {
    render(<ComparePage />)
    const ada: SharePayload = { v: 1, name: 'Ada', titled: true, birds: [1, 2].map((i) => ({ code: C(i) })) }
    const sam: SharePayload = { v: 1, name: 'Sam', titled: true, birds: [2, 3].map((i) => ({ code: C(i) })) }
    paste(`${SHARE_ORIGIN}/c/${encodeCompare([ada, sam]).token}`)
    expect(screen.getByTestId('compare-group-all')).toHaveTextContent('Both · 1')
    expect(screen.getByTestId('compare-group-0')).toHaveTextContent('Only Ada · 1')
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Sam · 1')
    expect(screen.getByTestId('compare-group-all')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByText('(you)')).toBeNull()
    expect(screen.getByRole('button', { name: 'Rename Ada' })).toBeInTheDocument()
  })
  it('Compare with mine: the handed-over link opens with your list, once', () => {
    sessionStorage.setItem(HANDOFF_KEY, `/s/${link('Sam', 3, 5).split('/s/')[1]}`)
    render(<ComparePage />)
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('You still need · 1')
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
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('You still need · 2')
  })
  it('three lists: on every list, and an empty group says so', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 2, 3, 4, 5)}\n${link('Ada', 1, 2, 3, 4, 6)}`)
    expect(screen.getByTestId('compare-group-all')).toHaveTextContent('On every list4')
    fireEvent.click(screen.getByTestId('compare-group-0'))
    expect(await screen.findByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
  })
  it('a long group shows its first birds, then all of them on one press', async () => {
    render(<ComparePage />)
    paste(link('Sam', ...Array.from({ length: 15 }, (_, i) => i + 5)))
    expect(names(await screen.findByTestId('compare-birds'))).toHaveLength(12)
    fireEvent.click(screen.getByTestId('compare-more'))
    expect(screen.queryByTestId('compare-more')).toBeNull()
    expect(names(screen.getByTestId('compare-birds'))).toHaveLength(15)
  })
  it('over six lists, the comparison still shows but sharing is blocked with the reason', () => {
    render(<ComparePage />)
    paste(Array.from({ length: 6 }, (_, i) => link(`F${i}`, 10 + i)).join(' '))
    expect(screen.getAllByRole('button', { pressed: false }).length).toBeGreaterThan(0)
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
