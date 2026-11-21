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
import { listColor } from '@/lib/share/compare'
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
  // Only what the page reads: each bird's name, family (five to a family) and taxonomic order.
  const byCode = new Map(codes.slice(0, 20).map((code, i) => [code, { code, com: `Bird ${i}`, to: i, fam: `Fam${Math.floor(i / 5)}`, famCom: `Family ${Math.floor(i / 5)}` }]))
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
    // The same page head as the comparison's (and My birds'): the title and the line under it.
    const title = screen.getByRole('heading', { level: 1 })
    expect(title).toHaveTextContent('Compare life lists')
    expect(title).toHaveClass('eb-pagehead-title')
    expect(title.closest('.eb-pagehead')!.querySelector('.eb-lede-sm')).toHaveTextContent('Paste your friends’ Everybird links to see which birds you share. Up to 6 lists.')
    // The head has the title and its line only; Compare is the form's, at its foot after Add a birder.
    expect(title.closest('.eb-pagehead')!.querySelector('.eb-pagehead-actions')).toBeNull()
    const foot = screen.getByTestId('compare-add').parentElement!
    expect(foot).toHaveClass('eb-compare-foot')
    expect([...foot.querySelectorAll('button')].map((b) => b.dataset.testid)).toEqual(['compare-add', 'compare-submit'])
    expect(screen.getByTestId('compare-submit')).toHaveAttribute('type', 'submit')
    expect(screen.getByTestId('compare-setup')).toContainElement(screen.getByTestId('compare-submit'))
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
    expect(screen.getByTestId('compare-status')).toHaveTextContent(
      'F1 · 1 species. F2 · 1 species. F3 · 1 species. F4 · 1 species. F5 · 1 species. '
      + '1 link didn’t open. It may be cut off, or made by a newer Everybird. Up to 6 lists can be compared, so the rest weren’t added.',
    )
    // Six lists in all: Add a birder is gone (not disabled), and back once a row goes.
    expect(screen.queryByTestId('compare-add')).toBeNull()
    fireEvent.click(screen.getByTestId('compare-remove-4'))
    expect(rowCount()).toBe(4)
    expect(screen.getByTestId('compare-add')).toHaveFocus()
    // A comparison link pasted into a new row: a row per list it holds, within the cap.
    fireEvent.click(screen.getByTestId('compare-add'))
    paste(comparison(payload('Ada', 1, 2), payload('Lee', 2, 3)), 4)
    expect(rowCount()).toBe(5)
    expect(screen.getByTestId('compare-name-4')).toHaveValue('Ada')
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Up to 6 lists can be compared')
  })
  it('a paste that opens a list says so; the same list twice is refused; a box with text and no list is marked once left', () => {
    render(<ComparePage />)
    // The one blank row's × does nothing visible: hidden.
    expect(screen.getByTestId('compare-remove-0')).toHaveStyle({ visibility: 'hidden' })
    paste(`${SHARE_ORIGIN}/s/${encodeShare({ v: 1, birds: [{ code: C(5) }, { code: C(6) }] }).token}`)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('Birder 2 · 2 species.') // the birder's own list is Birder 1
    expect(screen.getByTestId('compare-remove-0')).not.toHaveStyle({ visibility: 'hidden' })
    fireEvent.click(screen.getByTestId('compare-add'))
    paste(`${SHARE_ORIGIN}/s/${encodeShare({ v: 1, birds: [{ code: C(5) }, { code: C(6) }] }).token}`, 1)
    expect(screen.getByTestId('compare-status')).toHaveTextContent('That list is already in this comparison.')
    const box = screen.getByTestId('compare-link-1')
    expect(box).toHaveAttribute('autocapitalize', 'none')
    expect(box).not.toHaveAttribute('aria-invalid')
    fireEvent.paste(box)
    expect(box).toHaveAttribute('aria-invalid', 'true') // pasted into, no list
    paste('hello', 0)
    expect(screen.getByTestId('compare-link-0')).not.toHaveAttribute('aria-invalid')
    fireEvent.blur(screen.getByTestId('compare-link-0'))
    expect(screen.getByTestId('compare-link-0')).toHaveAttribute('aria-invalid', 'true')
  })
  it('Add a birder adds a row and removing one takes it out; the last row is emptied instead', () => {
    render(<ComparePage />)
    expect(screen.getByTestId('compare-add')).toHaveAccessibleName('Add a birder')
    expect(screen.getByTestId('compare-add')).not.toHaveAttribute('aria-describedby')
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
  it('the add that makes six lists takes the button away and puts focus in the new row\'s name box', () => {
    render(<ComparePage />)
    // Yours and the first row are two lists: four adds make six.
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByTestId('compare-add'))
    expect(screen.getByTestId('compare-add')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('compare-add'))
    expect(rowCount()).toBe(5)
    expect(screen.queryByTestId('compare-add')).toBeNull()
    expect(screen.getByTestId('compare-name-4')).toHaveFocus()
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
    // The drawing is 443 × 360, its units CSS px (jsdom has no ResizeObserver, so it keeps its largest size).
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 443, height: 360, right: 443, bottom: 360, x: 0, y: 0, toJSON: () => ({}) })
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
  it('four lists: a ring of 13 regions, each named; a region and its chips choose the same; the combinations it can’t show in one line', () => {
    // Mine 1–4; Sam 2, 5; Ada 3, 6; Kim 2, 4, 7. Bird 3 is on Mine and Ada alone, lists the ring doesn't put side by side.
    render(<ComparePage />)
    paste(`${link('Sam', 2, 5)}\n${link('Ada', 3, 6)}\n${link('Kim', 2, 4, 7)}`)
    compare()
    const regionsShown = screen.getAllByTestId(/^compare-region-\d+$/)
    expect(regionsShown).toHaveLength(13)
    expect(screen.queryByTestId('compare-region-5')).toBeNull()
    expect(screen.queryByTestId('compare-region-10')).toBeNull()
    // The words for screen readers name every region's number.
    expect(regionsShown.map((r) => r.getAttribute('aria-label'))).toEqual([
      'Only Mine: 1.', 'Only Sam: 1.', 'Only Ada: 1.', 'Only Kim: 1.',
      'Only Mine and Sam: 0.', 'Only Sam and Ada: 0.', 'Only Ada and Kim: 0.', 'Only Mine and Kim: 1.',
      'Only Mine, Sam & Ada: 0.', 'Only Sam, Ada & Kim: 0.', 'Only Mine, Ada & Kim: 0.', 'Only Mine, Sam & Kim: 1.',
      'On every list: 0.',
    ])
    expect(screen.getByTestId('compare-unshown')).toHaveTextContent('1 bird is shared in a combination the circles can’t show. Choose people above to see them.')
    // A region by the keyboard, then by a press on its number, and the same people by their chips: one choice.
    fireEvent.keyDown(screen.getByTestId('compare-region-11'), { key: 'Enter' })
    const byRegion = pressed()
    expect(byRegion).toEqual(['compare-chip-0', 'compare-chip-1', 'compare-chip-3', 'compare-region-11'])
    expect(shown()).toBe('Mine, Sam & Kim · 1')
    fireEvent.click(chip('every'))
    const svg = screen.getByTestId('compare-diagram')
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 443, height: 360, right: 443, bottom: 360, x: 0, y: 0, toJSON: () => ({}) })
    const ring = screen.getByTestId('compare-region-11').querySelector('rect')!
    fireEvent.click(svg, { clientX: +ring.getAttribute('x')! + +ring.getAttribute('width')! / 2, clientY: +ring.getAttribute('y')! + +ring.getAttribute('height')! / 2 })
    expect(pressed()).toEqual(byRegion)
    fireEvent.click(chip('every'))
    for (const i of [0, 1, 3]) fireEvent.click(chip(i))
    expect(pressed()).toEqual(byRegion)
    // The combination with no region: its chips still reach its bird.
    fireEvent.click(chip(1))
    fireEvent.click(chip(3))
    fireEvent.click(chip(2))
    expect(shown()).toBe('Mine & Ada · 1')
  })
  it('the line under the circles only when some birds sit on a combination they can’t show', () => {
    render(<ComparePage />)
    paste(`${link('Sam', 2, 5)}\n${link('Ada', 6)}\n${link('Kim', 4, 7)}`)
    compare()
    expect(screen.getAllByTestId(/^compare-region-\d+$/)).toHaveLength(13)
    expect(screen.queryByTestId('compare-unshown')).toBeNull()
  })
  it('six lists: 31 regions; a region too small for its number shows it in the tooltip on focus', () => {
    render(<ComparePage />)
    paste(['Sam', 'Ada', 'Kim', 'Lee', 'Bo'].map((name, i) => link(name, 2 + i, 3 + i, 10 + i)).join('\n'))
    compare()
    const all = screen.getAllByTestId(/^compare-region-\d+$/)
    expect(all).toHaveLength(31)
    const small = all.filter((r) => r.hasAttribute('data-hidden'))
    expect(small.length).toBeGreaterThan(0)
    expect(small.every((r) => !r.querySelector('text'))).toBe(true)
    expect(all.filter((r) => !r.hasAttribute('data-hidden')).every((r) => r.querySelector('text'))).toBe(true)
    fireEvent.focus(small[0])
    expect(screen.getByTestId('compare-tip')).toHaveTextContent(small[0].getAttribute('aria-label')!)
    fireEvent.blur(small[0])
    expect(screen.queryByTestId('compare-tip')).toBeNull()
    // A region with its number shows no tooltip.
    fireEvent.focus(all.find((r) => !r.hasAttribute('data-hidden'))!)
    expect(screen.queryByTestId('compare-tip')).toBeNull()
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
  it('an empty choice says so; a long family shows all its birds, no "Show all"', async () => {
    render(<ComparePage />)
    paste(link('Sam', 1, 2, 3, 4, ...Array.from({ length: 15 }, (_, i) => i + 5)))
    compare()
    fireEvent.click(chip(0))
    expect(await screen.findByTestId('compare-empty')).toHaveTextContent('No birds in this group.')
    fireEvent.click(chip(0))
    fireEvent.click(chip(1))
    expect(shown()).toBe('Only Sam · 15')
    // Family 1 (birds 5 to 9) open, every bird of it.
    expect(names(await screen.findByTestId('compare-birds'))).toEqual(['Bird 5', 'Bird 6', 'Bird 7', 'Bird 8', 'Bird 9'])
    expect(screen.queryByTestId('compare-more')).toBeNull()
  })
})

describe('Compare: the birds by family, one open at a time, with who has each', () => {
  // Mine: birds 1 to 4 (family 0). Sam: 3, 4, 5, 6, 11. Ada: 4, 6, 12.
  const start = async () => {
    render(<ComparePage />)
    paste(`${link('Sam', 3, 4, 5, 6, 11)} ${link('Ada', 4, 6, 12)}`)
    compare()
    await screen.findByTestId('family-accordion')
  }
  const heads = () => screen.getAllByRole('button', { expanded: undefined }).filter((b) => b.classList.contains('eb-facc-btn'))
  const fams = () => heads().map((b) => b.querySelector('.eb-lhead-name')!.textContent)
  const open = () => heads().map((b) => b.getAttribute('aria-expanded'))
  const who = () => screen.queryAllByTestId('compare-who').map((w) => w.getAttribute('aria-label'))
  const head = (name: string) => heads().find((b) => b.textContent!.startsWith(name))!
  it('families in taxonomic order, the first open; one at a time; all can close; the first again on a new choice', async () => {
    await start()
    expect(shown()).toBe('Yet to see · 4')
    expect(fams()).toEqual(['Family 1', 'Family 2'])
    expect(open()).toEqual(['true', 'false'])
    // The heading: its name, then its count (in words for a screen reader), the button controlling its family.
    expect(head('Family 1')).toHaveAccessibleName('Family 1, 2 species')
    expect(head('Family 1').closest('h3')).toHaveClass('eb-lhead')
    expect(document.getElementById(head('Family 1').getAttribute('aria-controls')!)).toContainElement(screen.getByTestId('compare-birds'))
    expect(head('Family 2')).not.toHaveAttribute('aria-controls')
    // The birds most lists have first, then taxonomic order.
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 6', 'Bird 5'])
    fireEvent.click(head('Family 2'))
    expect(open()).toEqual(['false', 'true'])
    expect(screen.getAllByTestId('compare-birds')).toHaveLength(1)
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 11', 'Bird 12'])
    fireEvent.click(head('Family 2'))
    expect(open()).toEqual(['false', 'false'])
    expect(screen.queryByTestId('compare-birds')).toBeNull()
    fireEvent.click(chip('every'))
    expect(fams()).toEqual(['Family 0', 'Family 1', 'Family 2'])
    expect(open()).toEqual(['true', 'false', 'false'])
    expect(names(screen.getByTestId('compare-birds'))).toEqual(['Bird 4', 'Bird 3', 'Bird 1', 'Bird 2'])
  })
  it('each tile’s dots name who has it, on Yet to see and Every bird only', async () => {
    await start()
    expect(who()).toEqual(['On Sam & Ada’s lists', 'On Sam’s lists'])
    const dots = screen.getAllByTestId('compare-who')[0].querySelectorAll('.eb-compare-who-dot')
    expect([...dots].map((d) => (d as HTMLElement).style.background)).toEqual([listColor(1), listColor(2)])
    fireEvent.click(chip('every'))
    expect(who()).toEqual(['On Mine, Sam & Ada’s lists', 'On Mine & Sam’s lists', 'On Mine’s lists', 'On Mine’s lists'])
    // A person's own birds, or a region: the same lists on every tile, so no dots.
    fireEvent.click(chip(1))
    expect(shown()).toBe('Only Sam · 2')
    expect(who()).toEqual([])
    fireEvent.click(chip(2))
    expect(who()).toEqual([])
  })
  it('a family above closing keeps the pressed heading where it was on screen, the scroll corrected at once', async () => {
    await start()
    const scrollBy = vi.fn()
    vi.stubGlobal('scrollBy', scrollBy)
    window.scrollBy = scrollBy
    // Family 2's section sits 300px lower while Family 1 is open above it.
    const second = screen.getByTestId('family-Fam2')
    second.getBoundingClientRect = () => ({ top: screen.getByTestId('family-Fam1').querySelector('.eb-facc-body') ? 500 : 200 } as DOMRect)
    fireEvent.click(head('Family 2'))
    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy).toHaveBeenCalledWith({ top: -300, behavior: 'instant' })
    // A family below closing moves nothing above it: no scroll.
    fireEvent.click(head('Family 1'))
    expect(scrollBy).toHaveBeenCalledTimes(1)
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
