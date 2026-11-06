// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Timeline, KEY_COMMIT_MS } from '@/components/filters/Timeline'
import { HOLD_MS, usePlay, type PlayControls } from '@/components/filters/use-play'
import type { Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { monthBins } from '@/lib/list/timeline'
import type { Trip } from '@/lib/list/trips'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { SpeciesRow } from '@/lib/species/types'

const row = (code: string, to: number): SpeciesRow => ({ code, com: code, sci: code, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g: 10, gSrc: 'family', st: true, ar: 1, q: true })
const species = buildSpeciesIndex(['a', 'b', 'c', 'd', 'e'].map((c, i) => row(c, i)))
const e = (code: string, date?: string, country = 'CA'): ListEntry => ({ code, date, place: { country }, heard: false, dead: false, media: false, sources: ['ebird'] })
const entries = [e('a', '2020-01-03'), e('b', '2020-03-01', 'EG'), e('c', '2020-03-02', 'EG'), e('d', '2020-03-04', 'EG'), e('e')]
const trip: Trip = { id: 'EG-2020-03-01', country: 'EG', start: '2020-03-01', end: '2020-03-04', label: 'Egypt · Mar 2020', codes: ['b', 'c', 'd'] }
const today = '2020-06'
const months = monthBins(entries, today).months // Jan .. Jun 2020
const idle: PlayControls = { state: null, start: vi.fn(), pause: vi.fn(), stop: vi.fn() }

function Harness({ play = idle, onPlay = vi.fn(), onPreview, initial = {} }: { play?: PlayControls; onPlay?: () => void; onPreview?: (r: unknown) => void; initial?: Filter }) {
  const [filter, setFilter] = useState<Filter>(initial)
  return (
    <>
      <Timeline entries={entries} trips={[trip]} filter={filter} species={species} months={months} today={today} onFilter={setFilter} countryName={(c) => (c === 'EG' ? 'Egypt' : c)} play={play} onPlay={onPlay} onPreview={onPreview} />
      <output data-testid="filter">{JSON.stringify(filter)}</output>
    </>
  )
}
const filterOf = () => JSON.parse(screen.getByTestId('filter').textContent!)
const settle = () => act(() => vi.advanceTimersByTime(KEY_COMMIT_MS + 10))

beforeEach(() => vi.useFakeTimers())
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('Timeline', () => {
  it('bars per month (empty months a tick), the readout, and sliders named by month', () => {
    render(<Harness />)
    const rects = screen.getByTestId('timeline').querySelectorAll('rect')
    expect(rects).toHaveLength(6)
    expect([...rects].map((r) => r.hasAttribute('data-empty'))).toEqual([false, true, false, true, true, true])
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Jan 2020 to Jun 2020 · 5 species')
    const lo = screen.getByRole('slider', { name: 'Start month' })
    expect(lo).toHaveAttribute('aria-valuemin', '0')
    expect(lo).toHaveAttribute('aria-valuemax', '5')
    expect(lo).toHaveAttribute('aria-valuenow', '0')
    expect(lo).toHaveAttribute('aria-valuetext', 'January 2020')
  })

  it('keyboard: arrows move a month, Home/End, the start never passes the end; previewed at once, committed 350 ms after the last key', () => {
    const onPreview = vi.fn()
    render(<Harness onPreview={onPreview} />)
    const lo = screen.getByRole('slider', { name: 'Start month' })
    const hi = screen.getByRole('slider', { name: 'End month' })
    fireEvent.keyDown(lo, { key: 'ArrowRight' })
    fireEvent.keyDown(lo, { key: 'ArrowRight' })
    expect(lo).toHaveAttribute('aria-valuetext', 'March 2020') // on screen at once
    expect(onPreview).toHaveBeenLastCalledWith({ from: '2020-03', to: undefined }) // the collage previews it
    expect(filterOf()).toEqual({}) // not committed while keys repeat
    act(() => vi.advanceTimersByTime(KEY_COMMIT_MS - 50))
    expect(filterOf()).toEqual({})
    settle()
    expect(filterOf()).toEqual({ from: '2020-03' })
    expect(onPreview).toHaveBeenLastCalledWith(null)
    fireEvent.keyDown(hi, { key: 'Home' })
    expect(hi).toHaveAttribute('aria-valuetext', 'March 2020') // stops at the start handle
    settle()
    expect(filterOf()).toEqual({ from: '2020-03', to: '2020-03' })
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Mar 2020 · 3 species')
    fireEvent.keyDown(hi, { key: 'End' })
    fireEvent.keyDown(lo, { key: 'PageDown' })
    settle()
    expect(filterOf()).toEqual({}) // the whole span again: no range
  })

  it('dragging a handle previews the range live without committing; letting go commits it once', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 600, top: 0, height: 100, right: 600, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    const onPreview = vi.fn()
    render(<Harness onPreview={onPreview} />)
    const hi = screen.getByRole('slider', { name: 'End month' })
    fireEvent.pointerDown(hi, { pointerId: 1, clientX: 600 })
    fireEvent.pointerMove(hi, { pointerId: 1, clientX: 410 })
    fireEvent.pointerMove(hi, { pointerId: 1, clientX: 310 }) // 100px a month: the end of March
    expect(hi).toHaveAttribute('aria-valuetext', 'March 2020')
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Jan 2020 to Mar 2020 · 4 species') // readout live
    expect(onPreview).toHaveBeenLastCalledWith({ from: undefined, to: '2020-03' })
    act(() => vi.advanceTimersByTime(2000))
    expect(filterOf()).toEqual({}) // held: never committed
    fireEvent.pointerUp(hi, { pointerId: 1 })
    expect(filterOf()).toEqual({ to: '2020-03' })
    expect(onPreview).toHaveBeenLastCalledWith(null)
  })

  it('stacked handles (a one-month range at the end): a press then a move left drags the start, right the end', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 600, top: 0, height: 100, right: 600, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
    render(<Harness initial={{ from: '2020-06' }} />)
    const lo = screen.getByRole('slider', { name: 'Start month' })
    const hi = screen.getByRole('slider', { name: 'End month' })
    expect(lo).toHaveAttribute('aria-valuetext', 'June 2020')
    fireEvent.pointerDown(hi, { pointerId: 1, clientX: 548 }) // on top: the end handle's element
    fireEvent.pointerMove(hi, { pointerId: 1, clientX: 210 })
    fireEvent.pointerUp(hi, { pointerId: 1 })
    expect(lo).toHaveAttribute('aria-valuetext', 'March 2020')
    expect(filterOf()).toEqual({ from: '2020-03' })
    // Pressing nearer the start handle drags it, whichever element got the press.
    fireEvent.pointerDown(hi, { pointerId: 2, clientX: 205 })
    fireEvent.pointerMove(hi, { pointerId: 2, clientX: 110 })
    fireEvent.pointerUp(hi, { pointerId: 2 })
    expect(filterOf()).toEqual({ from: '2020-02' })
  })

  it('a trip is a labelled bracket; tapping it selects the trip and its months, again clears it', () => {
    render(<Harness />)
    const b = screen.getByRole('button', { name: 'Egypt trip, Mar 2020, 3 species' })
    expect(b.querySelector('.eb-flag')).toHaveTextContent('🇪🇬')
    fireEvent.click(b)
    expect(filterOf()).toEqual({ trip: trip.id, from: '2020-03', to: '2020-03' })
    expect(b).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Egypt · Mar 2020 · 3 species')
    fireEvent.click(b)
    expect(filterOf()).toEqual({})
  })

  it('Play: the button starts it; while playing the readout shows the month and the running count', () => {
    const onPlay = vi.fn()
    const { rerender } = render(<Harness onPlay={onPlay} />)
    fireEvent.click(screen.getByRole('button', { name: 'Play' }))
    expect(onPlay).toHaveBeenCalled()
    const pause = vi.fn(), stop = vi.fn()
    rerender(<Harness play={{ state: { i: 2, running: true }, start: vi.fn(), pause, stop }} />)
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Mar 2020 · 4 species')
    expect(screen.getByTestId('time-playhead')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(pause).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(stop).toHaveBeenCalled()
    rerender(<Harness play={{ state: { i: 5, running: false }, start: vi.fn(), pause, stop }} />)
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByTestId('timeline-read')).toHaveTextContent('Jun 2020 · 5 species') // the undated bird arrives last
  })

  it('a list without dates says so', () => {
    render(<Timeline entries={[e('a')]} trips={[]} filter={{}} species={species} months={[]} today={today} onFilter={vi.fn()} countryName={(c) => c} play={idle} onPlay={vi.fn()} />)
    expect(screen.getByTestId('timeline-empty')).toHaveTextContent('This list has no dates')
  })
})

describe('usePlay', () => {
  it('steps a month at a time, holds the last month, then ends; pause keeps the month; start resumes', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    const h = renderHook(() => usePlay(4))
    act(() => h.result.current.start())
    expect(h.result.current.state).toEqual({ i: 0, running: true })
    act(() => vi.advanceTimersByTime(750)) // 4 months: 3 s in all, 750 ms each
    expect(h.result.current.state).toEqual({ i: 1, running: true })
    act(() => h.result.current.pause())
    act(() => vi.advanceTimersByTime(5000))
    expect(h.result.current.state).toEqual({ i: 1, running: false })
    act(() => h.result.current.start())
    act(() => vi.advanceTimersByTime(750))
    act(() => vi.advanceTimersByTime(750))
    expect(h.result.current.state?.i).toBe(3)
    act(() => vi.advanceTimersByTime(HOLD_MS))
    expect(h.result.current.state).toBeNull()
    vi.unstubAllGlobals()
  })
})
