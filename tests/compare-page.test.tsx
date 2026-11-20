// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import linkIndex from '../data/link-index.json'
import { ComparePage } from '@/components/compare/ComparePage'
import * as places from '@/lib/import/places'
import * as load from '@/lib/species/load'
import { encodeCompare, encodeShare, SHARE_ORIGIN, type SharePayload } from '@/lib/share/link'
import { renderShareImage } from '@/lib/share/image'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'

const codes = linkIndex as string[]
const C = (i: number) => codes[i]
const regions: Regions = { v: 1, countries: {}, sub1: {} }
const mine: ListEntry[] = [1, 2, 3, 4].map((i) => ({ code: C(i), heard: false, dead: false, media: false, sources: ['ebird'] }))

vi.mock('@/components/app/EverybirdProvider', () => ({
  useEverybirdContext: () => ({ state: { list: mine, saved: { name: 'Mine' } }, data: { species: {}, regions } }),
}))
// The group's collage is SharedView's (tested with the shared view); here it shows how many birds it was given.
vi.mock('@/components/app/SharedView', () => ({
  SharedCollage: ({ payload }: { payload: SharePayload }) => <p data-testid="group-collage">{payload.birds.map((b) => b.code).join(' ')}</p>,
}))
// No canvas or worker in jsdom: the card's drawing and download are stand-ins.
vi.mock('@/lib/share/image', async (orig) => ({ ...(await orig<typeof import('@/lib/share/image')>()), renderShareImage: vi.fn(async () => new Blob(['png'])) }))
vi.mock('@/lib/download', async (orig) => ({ ...(await orig<typeof import('@/lib/download')>()), downloadBlob: vi.fn() }))
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))

const link = (name: string, ...idx: number[]) => `${SHARE_ORIGIN}/s/${encodeShare({ v: 1, name, titled: true, birds: idx.map((i) => ({ code: C(i) })) }).token}`
const paste = (text: string) => {
  fireEvent.change(screen.getByTestId('compare-paste'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('compare-submit'))
}

beforeEach(() => {
  vi.spyOn(places, 'loadRegions').mockResolvedValue(regions)
  // Only what the table reads: each bird's name and taxonomic order.
  const byCode = new Map(codes.slice(0, 20).map((code, i) => [code, { code, com: `Bird ${i}`, to: i }]))
  vi.spyOn(load, 'loadSpecies').mockResolvedValue({ byCode } as unknown as load.SpeciesIndex)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ComparePage', () => {
  it('your list and a pasted link: the birds you still need first, then both of you and only you, each with its count', async () => {
    render(<ComparePage />)
    paste(`Mine is here ${link('Sam', 3, 4, 5)} have a look.`)
    const both = screen.getByTestId('compare-group-all'), you = screen.getByTestId('compare-group-0'), need = screen.getByTestId('compare-group-1')
    const chips = within(screen.getByTestId('compare-groups')).getAllByRole('button')
    expect(chips).toEqual([need, both, you])
    expect(need).toHaveTextContent('Birds you still need1')
    expect(both).toHaveTextContent('Both of you2')
    expect(you).toHaveTextContent('Only you2')
    expect(need).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByTestId('group-collage')).toHaveTextContent(C(5))
    fireEvent.click(both)
    expect(both).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('group-collage').textContent?.split(' ').sort()).toEqual([C(3), C(4)].sort())
    expect(screen.queryByTestId('compare-group-table')).toBeNull()
    // Before a link is made: what it carries, read with the button.
    const copy = screen.getByTestId('compare-copy')
    expect(copy).toBeEnabled()
    expect(screen.getByTestId('compare-consent')).toHaveTextContent('A comparison link carries every list in it, so ask the others before you share it.')
    expect(copy.getAttribute('aria-describedby')).toContain(screen.getByTestId('compare-consent').id)
  })
  it('the card: the titles and every group’s count, by name, drawn and downloaded', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    const card = screen.getByTestId('compare-card')
    await waitFor(() => expect(card).toBeEnabled())
    fireEvent.click(card)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), 'everybird-compare.png'))
    const opts = vi.mocked(renderShareImage).mock.calls[0][0]
    expect(opts.name).toBe('Mine & Sam')
    expect(opts.filterLabel).toBe('Both of you: 2 · Only Mine: 2 · Only Sam: 1')
    expect(opts.entries.map((e) => e.code).sort()).toEqual([C(3), C(4)].sort())
    expect(opts.latest).toBe(false)
  })
  it('a pasted list can be renamed for this comparison; your own list shows its title', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)} ${link('Ada', 6)}`)
    expect(screen.getByText('Your list: Mine')).toBeInTheDocument()
    expect(screen.queryByTestId('compare-name-0')).toBeNull()
    const field = screen.getByLabelText('List 2')
    expect(field).toHaveValue('Sam')
    fireEvent.change(field, { target: { value: 'Samuel' } })
    fireEvent.blur(field)
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Samuel1')
    fireEvent.change(field, { target: { value: '' } })
    fireEvent.blur(field)
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Birder 21')
  })
  it('three lists: every bird in the table, a bird on two of the three included, marked where it is', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)}\n${link('Ada', 5, 6)}`)
    await screen.findByTestId('group-collage')
    const every = screen.getByTestId('compare-group-table')
    expect(every).toHaveTextContent('Every bird6')
    fireEvent.click(every)
    expect(every).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByTestId('group-collage')).toBeNull()
    const table = within(screen.getByTestId('compare-table')).getByRole('table', { name: 'Every bird in this comparison and the lists it is on' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Bird', 'Mine', 'Sam', 'Ada'])
    const rows = within(table).getAllByRole('row').slice(1)
    expect(rows.map((r) => within(r).getByRole('rowheader').textContent)).toEqual(['Bird 1', 'Bird 2', 'Bird 3', 'Bird 4', 'Bird 5', 'Bird 6'])
    // Bird 5 is on Sam's and Ada's lists, not yours: in no group, but in the table.
    expect(within(rows[4]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['', 'On this list', 'On this list'])
  })
  it('a pasted comparison link opens that comparison as shared, without your list', async () => {
    render(<ComparePage />)
    const ada: SharePayload = { v: 1, name: 'Ada', titled: true, birds: [1, 2].map((i) => ({ code: C(i) })) }
    const sam: SharePayload = { v: 1, name: 'Sam', titled: true, birds: [2, 3].map((i) => ({ code: C(i) })) }
    paste(`${SHARE_ORIGIN}/c/${encodeCompare([ada, sam]).token}`)
    expect(screen.getByTestId('compare-group-all')).toHaveTextContent('Both of you1')
    expect(screen.getByTestId('compare-group-0')).toHaveTextContent('Only Ada1')
    expect(screen.getByTestId('compare-group-1')).toHaveTextContent('Only Sam1')
    expect(screen.queryByText(/Your list/)).toBeNull()
    expect(screen.getByLabelText('List 1')).toHaveValue('Ada')
  })
  it('three lists: on every list, and an empty group says so', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 2, 3, 4, 5)}\n${link('Ada', 1, 2, 3, 4, 6)}`)
    expect(screen.getByTestId('compare-group-all')).toHaveTextContent('On every list4')
    await screen.findByTestId('group-collage')
    fireEvent.click(screen.getByTestId('compare-group-0'))
    expect(screen.getByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
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
