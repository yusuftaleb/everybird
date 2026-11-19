// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import linkIndex from '../data/link-index.json'
import { ComparePage } from '@/components/compare/ComparePage'
import * as places from '@/lib/import/places'
import * as load from '@/lib/species/load'
import { encodeShare, SHARE_ORIGIN, type SharePayload } from '@/lib/share/link'
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
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))

const link = (name: string, ...idx: number[]) => `${SHARE_ORIGIN}/s/${encodeShare({ v: 1, name, titled: true, birds: idx.map((i) => ({ code: C(i) })) }).token}`
const paste = (text: string) => {
  fireEvent.change(screen.getByTestId('compare-paste'), { target: { value: text } })
  fireEvent.click(screen.getByTestId('compare-submit'))
}

beforeEach(() => {
  vi.spyOn(places, 'loadRegions').mockResolvedValue(regions)
  vi.spyOn(load, 'loadSpecies').mockResolvedValue({} as load.SpeciesIndex)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ComparePage', () => {
  it('your list and a pasted link: both of you, only you, only them, each with its count, as the chosen group', async () => {
    render(<ComparePage />)
    paste(`Mine is here ${link('Sam', 3, 4, 5)} have a look.`)
    const both = screen.getByTestId('compare-group-all'), you = screen.getByTestId('compare-group-0'), sam = screen.getByTestId('compare-group-1')
    expect(both).toHaveTextContent('Both of you2')
    expect(you).toHaveTextContent('Only you2')
    expect(sam).toHaveTextContent('Only Sam1')
    expect(both).toHaveAttribute('aria-pressed', 'true')
    expect((await screen.findByTestId('group-collage')).textContent?.split(' ').sort()).toEqual([C(3), C(4)].sort())
    fireEvent.click(sam)
    expect(sam).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('group-collage')).toHaveTextContent(C(5))
    expect(screen.getByTestId('compare-copy')).toBeEnabled()
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
