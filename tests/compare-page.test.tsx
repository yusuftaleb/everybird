// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { localDay } from '@/lib/file-name'
import linkIndex from '../data/link-index.json'
import { ComparePage, forgetCompare } from '@/components/compare/ComparePage'
import * as load from '@/lib/species/load'
import { decodeCompare, decodeShare, encodeCompare, encodeShare, SHARE_ORIGIN, type SharePayload } from '@/lib/share/link'
import { renderShareImage } from '@/lib/share/image'
import { drawCompareCard } from '@/lib/share/compare-image'
import { HANDOFF_KEY } from '@/lib/share/compare-handoff'
import { COMPARE_KEY, readCompare } from '@/lib/share/compare-store'
import { downloadBlob } from '@/lib/download'
import type { ListEntry } from '@/lib/list/model'
import type { Regions } from '@/lib/species/types'

/** Today's local date: saved files end with it. */
const D = localDay()

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
const chip = (id: string | number) => screen.getByTestId(`compare-chip-${id}`)
/** The people's chips: each name and its count. */
const pills = () => screen.getAllByTestId(/^compare-chip-\d+$/).map((b) => `${b.querySelector('.eb-compare-chip-name')!.textContent}${b.querySelector('.eb-count')!.textContent}`)
const pressed = () => screen.getAllByRole('button', { pressed: true }).map((b) => b.getAttribute('data-testid'))
const shown = () => screen.getByTestId('compare-shown').textContent
const rowCount = () => screen.queryAllByTestId(/^compare-row-\d+$/).length
const card = () => vi.mocked(drawCompareCard).mock.calls.at(-1)![0]
/** localStorage, in memory (jsdom's isn't there under this Node). */
const memoryStorage = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, String(v)) }, removeItem: (k: string) => { m.delete(k) } }
}

beforeEach(() => {
  ctx.list = [1, 2, 3, 4].map((i) => ({ code: C(i), heard: false, dead: false, media: false, sources: ['ebird'] }))
  ctx.mineSoon = true
  // Only what the page reads: each bird's name and taxonomic order.
  const byCode = new Map(codes.slice(0, 20).map((code, i) => [code, { code, com: `Bird ${i}`, to: i }]))
  vi.spyOn(load, 'loadSpecies').mockResolvedValue({ byCode } as unknown as load.SpeciesIndex)
  URL.createObjectURL = vi.fn(() => 'blob:card')
  URL.revokeObjectURL = vi.fn()
  vi.stubGlobal('localStorage', memoryStorage())
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
    // The same page head as the comparison's (and My birds'): the title, the line under it, Compare at its right.
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('Compare life lists')
    expect(title).toHaveClass('eb-pagehead-title')
    expect(title.closest('.eb-pagehead')!.querySelector('.eb-lede-sm')).toHaveTextContent('Paste your friends’ Everybird links to see which birds you share. Up to 6 lists.')
    expect(title.closest('.eb-pagehead')!.querySelector('.eb-pagehead-actions')).toContainElement(screen.getByTestId('compare-submit'))
    expect(screen.getByTestId('compare-link-0')).toHaveAccessibleDescription('Paste your friends’ Everybird links to see which birds you share. Up to 6 lists.')
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
    expect(shown()).toBe('Yet to see · 2')
  })
})

describe('Compare: the comparison', () => {
  it('the page head (title, line, Edit lists, Share), the chips with counts, Yet to see first; its birds under a heading', async () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    compare()
    expect(screen.queryByTestId('compare-setup')).toBeNull()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Compare life lists')
    expect(screen.getByText(/^See which birds your lists share and which you’re yet to see\./)).toBeInTheDocument()
    expect(screen.getByTestId('compare-edit')).toHaveFocus()
    expect(screen.getByTestId('compare-edit')).toHaveAccessibleName('Edit lists')
    // Share last in the head's actions, where My birds has it.
    expect(screen.getByTestId('compare-share').parentElement!.lastElementChild).toBe(screen.getByTestId('compare-share'))
    expect(pills()).toEqual(['Mine4', 'Sam3'])
    expect(within(screen.getByTestId('compare-chips')).getAllByRole('button')).toEqual([chip(0), chip(1), chip('need'), chip('every')])
    expect(chip('need')).toHaveTextContent('Yet to see1')
    expect(chip('every')).toHaveTextContent('Every bird5')
    expect(chip('need')).toHaveAttribute('aria-pressed', 'true')
    expect(shown()).toBe('Yet to see · 1')
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 5'])
    // Both people: the birds on both lists.
    fireEvent.click(chip(0))
    expect(chip(0)).toHaveAttribute('aria-pressed', 'true')
    expect(chip('need')).toHaveAttribute('aria-pressed', 'false')
    expect(shown()).toBe('Only you · 2')
    fireEvent.click(chip(1))
    expect(shown()).toBe('Both · 2')
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 3', 'Bird 4'])
    fireEvent.click(chip(0))
    expect(shown()).toBe('Only Sam · 1')
    // The last person off: every bird.
    fireEvent.click(chip(1))
    expect(pressed()).toEqual(['compare-chip-every'])
    expect(shown()).toBe('Every bird · 5')
    expect(screen.getByTestId('compare-region-1')).toHaveAccessibleName('Only Mine: 2.')
    expect(screen.getByTestId('compare-region-3')).toHaveAccessibleName('Both: 2.')
  })
  it('every region presses: its people chosen and marked; outside the circles every bird; the keyboard too; the bars beside, marked the same', () => {
    render(<ComparePage />)
    paste(link('Sam', 3, 4, 5))
    compare()
    const svg = screen.getByTestId('compare-diagram')
    // The drawing box is 320 × 260 units; the page shows it at that size here.
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 260, right: 320, bottom: 260, x: 0, y: 0, toJSON: () => ({}) })
    const circles = svg.querySelectorAll('circle.eb-compare-circle')
    const [a, b] = [...circles].map((c) => ({ x: +c.getAttribute('cx')!, y: +c.getAttribute('cy')!, r: +c.getAttribute('r')! }))
    const off = () => [1, 2, 3].filter((m) => screen.getByTestId(`compare-part-${m}`).hasAttribute('data-off'))
    fireEvent.click(svg, { clientX: a.x - a.r * 0.8, clientY: a.y })
    expect(pressed()).toEqual(['compare-chip-0', 'compare-region-1', 'compare-rank-0'])
    expect(off()).toEqual([2, 3])
    fireEvent.click(svg, { clientX: (a.x + a.r + b.x - b.r) / 2, clientY: a.y })
    expect(pressed()).toEqual(['compare-chip-0', 'compare-chip-1', 'compare-region-3'])
    expect(off()).toEqual([1, 2])
    fireEvent.click(svg, { clientX: b.x + b.r * 0.8, clientY: b.y })
    expect(shown()).toBe('Only Sam · 1')
    fireEvent.click(svg, { clientX: 1, clientY: 1 })
    expect(pressed()).toEqual(['compare-chip-every'])
    expect(off()).toEqual([])
    // The keyboard: each region's number is a button.
    fireEvent.keyDown(screen.getByTestId('compare-region-3'), { key: 'Enter' })
    expect(shown()).toBe('Both · 2')
    fireEvent.keyDown(screen.getByTestId('compare-region-1'), { key: ' ' })
    expect(shown()).toBe('Only you · 2')
    // The bars, beside the circles (no switch): a bar chooses its person; the bars outside the choice fade.
    expect(screen.queryByTestId('compare-view')).toBeNull()
    fireEvent.click(screen.getByTestId('compare-rank-1'))
    expect(chip(1)).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('compare-rank-0')).toHaveAttribute('data-off')
    expect(screen.getByTestId('compare-rank-1')).not.toHaveAttribute('data-off')
    expect(screen.getByTestId('compare-rank-1')).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(chip('need'))
    expect(screen.getByTestId('compare-rank-0')).toHaveAttribute('data-off')
    expect(off()).toEqual([1, 3])
  })
  it('three lists: seven regions, each named; a pair of people, all three; Edit lists keeps the rows', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 1, 5)}\n${link('Ada', 5, 6, 7, 8, 9)}`)
    compare()
    expect([1, 2, 4, 3, 5, 6, 7].map((m) => screen.getByTestId(`compare-region-${m}`).getAttribute('aria-label')).join(' ')).toBe(
      'Only Mine: 3. Only Sam: 0. Only Ada: 4. Only Mine and Sam: 1. Only Mine and Ada: 0. Only Sam and Ada: 1. On every list: 0.')
    fireEvent.click(chip(1))
    fireEvent.click(chip(2))
    expect(shown()).toBe('Sam & Ada · 1')
    fireEvent.click(chip(0))
    expect(shown()).toBe('On every list · 0')
    fireEvent.keyDown(screen.getByTestId('compare-region-3'), { key: 'Enter' })
    expect(shown()).toBe('Mine & Sam · 1')
    fireEvent.click(screen.getByTestId('compare-edit'))
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus()
    expect([0, 1].map((i) => (screen.getByTestId(`compare-name-${i}`) as HTMLInputElement).value)).toEqual(['Sam', 'Ada'])
  })
  it('Compare with mine: the handed-over link opens the comparison with your list, once', () => {
    sessionStorage.setItem(HANDOFF_KEY, `/s/${link('Sam', 3, 5).split('/s/')[1]}`)
    render(<ComparePage />)
    expect(sessionStorage.getItem(HANDOFF_KEY)).toBeNull()
    expect(chip('need')).toHaveTextContent('Yet to see1')
    cleanup()
    forgetCompare()
    sessionStorage.setItem(HANDOFF_KEY, `/c/${comparison(payload('Ada', 1), payload('Sam', 9)).split('/c/')[1]}`)
    render(<ComparePage />)
    expect(pills()).toEqual(['Mine4', 'Ada1', 'Sam1'])
  })
  it('an empty choice says so; a long one shows its first rows, then all on one press', async () => {
    render(<ComparePage />)
    paste(link('Sam', 1, 2, 3, 4, ...Array.from({ length: 15 }, (_, i) => i + 5)))
    compare()
    fireEvent.click(chip(0))
    expect(await screen.findByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
    fireEvent.click(chip(0))
    fireEvent.click(chip(1))
    // No ResizeObserver in jsdom: four across, three rows.
    expect(names(await screen.findByTestId('compare-birds'))).toHaveLength(12)
    fireEvent.click(screen.getByTestId('compare-more'))
    expect(names(screen.getByTestId('compare-birds'))).toHaveLength(15)
  })
})

describe('Compare: kept on this device (a language switch reloads the page)', () => {
  /** A reload: the page gone, its memory with it; localStorage stays. */
  const reload = () => { cleanup(); forgetCompare(); render(<ComparePage />) }
  /** Each kept row's list by its name, as a reload would read it. */
  const keptRows = () => readCompare()?.rows.map((r) => decodeShare(r.text.split('/s/')[1]).name)
  it('the rows, the names, the comparison and the chips come back after a reload', async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 3, 5)} ${link('Ada', 1, 9)} ${SHARE_ORIGIN}/s/1broken`)
    fireEvent.change(screen.getByTestId('compare-name-1'), { target: { value: 'Ada L' } })
    fireEvent.change(screen.getByTestId('compare-name-mine'), { target: { value: 'Yusuf' } })
    compare()
    fireEvent.click(chip(1))
    fireEvent.click(chip(2))
    expect(shown()).toBe('Sam & Ada L · 0')
    reload()
    expect(await screen.findByTestId('compare-shown')).toHaveTextContent('Sam & Ada L · 0')
    expect(pills()).toEqual(['Yusuf4', 'Sam2', 'Ada L2'])
    expect(pressed()).toEqual(expect.arrayContaining(['compare-chip-1', 'compare-chip-2']))
    // The set-up as left, a link that didn't open included.
    fireEvent.click(screen.getByTestId('compare-edit'))
    reload()
    await waitFor(() => expect(screen.getByTestId('compare-name-1')).toHaveValue('Ada L'))
    expect(screen.getByTestId('compare-name-mine')).toHaveValue('Yusuf')
    expect(screen.getByTestId('compare-name-0')).toHaveValue('Sam')
    expect(screen.queryByTestId('compare-shown')).toBeNull()
  })
  it('a link that didn’t open is kept as pasted', async () => {
    render(<ComparePage />)
    paste(`${SHARE_ORIGIN}/s/1broken`)
    reload()
    await waitFor(() => expect(screen.getByTestId('compare-link-0')).toHaveValue(`${SHARE_ORIGIN}/s/1broken`))
  })
  it('a removed row is removed from storage too; no rows left, nothing kept', () => {
    render(<ComparePage />)
    paste(`${link('Sam', 3)} ${link('Ada', 1)}`)
    expect(keptRows()).toEqual(['Sam', 'Ada'])
    fireEvent.click(screen.getByTestId('compare-remove-0'))
    expect(keptRows()).toEqual(['Ada'])
    fireEvent.click(screen.getByTestId('compare-remove-0'))
    expect(localStorage.getItem(COMPARE_KEY)).toBeNull()
  })
  it('Compare with mine replaces what was kept', async () => {
    render(<ComparePage />)
    paste(link('Ada', 1, 9))
    cleanup()
    forgetCompare()
    sessionStorage.setItem(HANDOFF_KEY, `/s/${link('Sam', 3, 5).split('/s/')[1]}`)
    render(<ComparePage />)
    expect(pills()).toEqual(['Mine4', 'Sam2'])
    expect(keptRows()).toEqual(['Sam'])
    reload()
    expect(await screen.findByTestId('compare-shown')).toBeInTheDocument()
    expect(pills()).toEqual(['Mine4', 'Sam2'])
  })
  it('unreadable storage is ignored: Compare opens empty and still works', () => {
    localStorage.setItem(COMPARE_KEY, '{"v":1,"rows":[{"text":3}],"open":true}')
    render(<ComparePage />)
    expect(rowCount()).toBe(1)
    expect(screen.getByTestId('compare-link-0')).toHaveValue('')
    cleanup()
    forgetCompare()
    const blocked = () => { throw new Error('blocked') }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked })
    render(<ComparePage />)
    paste(link('Sam', 3))
    compare()
    expect(pills()).toEqual(['Mine4', 'Sam1'])
  })
  it('readCompare reads only its own version and shape', () => {
    for (const bad of ['nope', '{"v":2,"rows":[{"text":""}],"open":false}', '{"v":1,"rows":[],"open":false}', '{"v":1,"rows":[{"text":"a","name":1}],"open":false}']) {
      localStorage.setItem(COMPARE_KEY, bad)
      expect(readCompare()).toBeNull()
    }
    localStorage.setItem(COMPARE_KEY, '{"v":1,"rows":[{"text":"a"}],"open":true,"pick":{"key":"k","choice":-1}}')
    expect(readCompare()).toEqual({ rows: [{ text: 'a' }], open: true })
  })
})

describe('Compare: Share opens the Share dialog in its Compare mode', () => {
  const open = async () => {
    // Share waits for the species file (the drawings need it).
    await waitFor(() => expect(screen.getByTestId('compare-share')).toBeEnabled())
    fireEvent.click(screen.getByTestId('compare-share'))
    return screen.findByRole('dialog')
  }
  it('What (Comparison | Wish list), the formats, Appearance and Transparent only; Download draws the chosen one', async () => {
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
    expect(card()).toMatchObject({ names: ['Mine', 'Sam'], sizes: [4, 4], counts: [0, 2, 2, 2], format: 'post' })
    expect(card()).not.toHaveProperty('codes')
    fireEvent.click(within(dialog).getByRole('button', { name: /^Square/ }))
    await waitFor(() => expect(card().format).toBe('square'))
    const download = within(dialog).getByRole('button', { name: 'Download image' })
    await waitFor(() => expect(download).toBeEnabled())
    fireEvent.click(download)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), `everybird-comparison-square-${D}.png`))
    fireEvent.click(within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Wish list' }))
    await waitFor(() => expect(renderShareImage).toHaveBeenCalled())
    const wish = vi.mocked(renderShareImage).mock.calls.at(-1)![0]
    expect(wish).toMatchObject({ format: 'square', name: '2 of Sam’s birds you’ve yet to see', countSize: 'hide', latest: false })
    expect(wish.entries.map((e) => e.code).sort()).toEqual([C(5), C(6)].sort())
    await waitFor(() => expect(download).toBeEnabled())
    fireEvent.click(download)
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), `everybird-wish-list-square-${D}.png`))
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
    expect(screen.queryByTestId('compare-chip-need')).toBeNull()
    expect(pressed()).toEqual(['compare-chip-every'])
    const dialog = await open()
    const wish = within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Wish list' })
    expect(wish).toHaveAttribute('aria-disabled', 'true')
    expect(wish).toHaveAttribute('title', 'Add your own birds for a wish list.')
    fireEvent.click(wish)
    expect(within(within(dialog).getByTestId('share-what')).getByRole('button', { name: 'Comparison' })).toHaveAttribute('aria-pressed', 'true')
  })
})
