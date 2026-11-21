// @vitest-environment jsdom
// Round 6 menu audit, item 7: one toast for every import (ImportToast, on the site's Toast), no progress in the grid.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UndoToast } from '@/components/app/UndoToast'
import type { FileJob, ImportJobs, InatJob, Landed } from '@/components/app/use-import-jobs'
import { DONE_MS, ImportToast, RUN_DELAY } from '@/components/import/ImportToast'
import { InatForm } from '@/components/import/InatForm'
import { withI18n } from './i18n-render'

const IDLE: FileJob = { busy: false, rows: 0, error: null }
const NO_INAT: InatJob = { busyFor: null, progress: null, error: null, note: null }
const jobs = (over: Partial<ImportJobs> = {}): ImportJobs => ({
  ebird: IDLE, obsorg: IDLE, sheet: IDLE, scythebill: IDLE, igoterra: IDLE, inat: NO_INAT, landed: null,
  cancelInat: vi.fn(), ...over,
} as unknown as ImportJobs)
const wrapper = withI18n('en')
const toast = () => screen.queryByTestId('import-toast')
const wait = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const landed = (species: number, at: number, slot: Landed['slot'] = 'inat'): Landed => ({ slot, species, at })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { cleanup(); vi.useRealTimers() })

describe('the import toast', () => {
  it('a file read: after RUN_DELAY, a spinner and the rows read so far, announced once; done: the result line', async () => {
    const { rerender } = render(<ImportToast jobs={jobs({ ebird: { busy: true, rows: 0, error: null } })} />, { wrapper })
    expect(toast()).toBeNull()
    await wait(RUN_DELAY)
    expect(toast()).toHaveTextContent('Reading your file…')
    expect(toast()!.querySelector('.eb-toast-spin')).not.toBeNull()
    rerender(<ImportToast jobs={jobs({ ebird: { busy: true, rows: 1200, error: null } })} />)
    expect(toast()).toHaveTextContent('Reading your file… 1,200 rows')
    // The live region reads the constant words; the climbing count is shown only.
    expect(within(toast()!).getByText('Reading your file… 1,200 rows')).toHaveAttribute('aria-hidden', 'true')
    expect(toast()!.closest('[role="status"]')).not.toBeNull()
    expect(within(toast()!).queryByRole('button')).toBeNull() // a file read can't be cancelled today
    rerender(<ImportToast jobs={jobs({ landed: landed(185, 1, 'ebird') })} />)
    expect(toast()).toHaveTextContent(/^Done · 185 from eBird$/)
    expect(document.activeElement).toBe(document.body) // it never takes focus
  })
  it('a quick read shows only its done line, for DONE_MS; then it goes', async () => {
    const { rerender } = render(<ImportToast jobs={jobs({ obsorg: { busy: true, rows: 0, error: null } })} />, { wrapper })
    await wait(RUN_DELAY - 50)
    rerender(<ImportToast jobs={jobs({ landed: landed(12, 1, 'obsorg-list') })} />)
    expect(toast()).toHaveTextContent(/^Done · 12 from observation\.org$/)
    await wait(DONE_MS - 10)
    expect(toast()).not.toBeNull()
    await wait(10)
    expect(toast()).toBeNull()
  })
  it('iNaturalist: looking up with the spinner, then the count over a progress line with Cancel', async () => {
    const cancelInat = vi.fn()
    const { rerender } = render(<ImportToast jobs={jobs({ cancelInat, inat: { ...NO_INAT, busyFor: 'sam' } })} />, { wrapper })
    await wait(RUN_DELAY)
    expect(toast()).toHaveTextContent('Looking up “sam”…')
    expect(screen.queryByRole('progressbar')).toBeNull()
    rerender(<ImportToast jobs={jobs({ cancelInat, inat: { ...NO_INAT, busyFor: 'sam', progress: { fetched: 1000, total: 4341 } } })} />)
    expect(toast()).toHaveTextContent('Fetching your observations · 1,000 of 4,341')
    expect(toast()!.querySelector('.eb-toast-spin')).toBeNull()
    const bar = within(toast()!).getByRole('progressbar', { name: 'Fetching your observations' })
    expect(bar).toHaveClass('eb-share-bar')
    expect(bar).toHaveAttribute('aria-valuetext', '1,000 of 4,341')
    expect((bar.firstElementChild as HTMLElement).style.width).toMatch(/^23\.03/)
    fireEvent.click(within(toast()!).getByRole('button', { name: 'Cancel' }))
    expect(cancelInat).toHaveBeenCalledOnce()
    // Cancelled: the toast closes (the row says so); no done line.
    rerender(<ImportToast jobs={jobs({ cancelInat, inat: { ...NO_INAT, note: 'cancelled' } })} />)
    expect(toast()).toBeNull()
  })
  it('an error closes it and shows no done line (the error stays in the row), even after an earlier import landed', async () => {
    const { rerender } = render(<ImportToast jobs={jobs()} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1) })} />)
    expect(toast()).toHaveTextContent('Done · 3 from iNaturalist')
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1), inat: { ...NO_INAT, busyFor: 'nobody' } })} />)
    await wait(RUN_DELAY)
    expect(toast()).toHaveTextContent('Looking up “nobody”…')
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1), inat: { ...NO_INAT, error: { code: 'unknown-user', user: 'nobody' } } })} />)
    expect(toast()).toBeNull()
  })
  it('waits while hovered or focused, then stays its time again', async () => {
    const { rerender } = render(<ImportToast jobs={jobs()} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: landed(282, 1) })} />)
    fireEvent.pointerEnter(toast()!)
    await wait(DONE_MS * 3)
    expect(toast()).toHaveTextContent('Done · 282 from iNaturalist')
    fireEvent.pointerLeave(toast()!)
    await wait(DONE_MS - 10)
    expect(toast()).not.toBeNull()
    await wait(10)
    expect(toast()).toBeNull()
  })
  it('one toast at a time: the newer replaces the older, and a running import comes back once "Undo" is gone', async () => {
    const onDone = vi.fn()
    function Both({ removal }: { removal: { text: string; codes: string[] } | null }) {
      return (
        <>
          <ImportToast jobs={jobs({ ebird: { busy: true, rows: 10, error: null } })} />
          <UndoToast removal={removal} onUndo={() => {}} onDone={onDone} focus={false} />
        </>
      )
    }
    const { rerender } = render(<Both removal={null} />, { wrapper })
    await wait(RUN_DELAY)
    expect(toast()).not.toBeNull()
    rerender(<Both removal={{ text: 'Removed Snow Goose.', codes: ['snogoo'] }} />)
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed Snow Goose.')
    expect(toast()).toBeNull()
    expect(document.querySelectorAll('.eb-toast')).toHaveLength(1)
    rerender(<Both removal={null} />)
    expect(toast()).toHaveTextContent('Reading your file… 10 rows')
  })
  it('a done line replaced by "Undo" is over (dismissed), not shown again', async () => {
    function Both({ removal, at = 1 }: { removal: { text: string; codes: string[] } | null; at?: number | null }) {
      return (
        <>
          <ImportToast jobs={jobs({ landed: at ? landed(5, at) : null })} />
          <UndoToast removal={removal} onUndo={() => {}} onDone={() => {}} focus={false} />
        </>
      )
    }
    const { rerender } = render(<Both removal={null} at={null} />, { wrapper })
    rerender(<Both removal={null} />)
    expect(toast()).not.toBeNull()
    rerender(<Both removal={{ text: 'Removed Snow Goose.', codes: ['snogoo'] }} />)
    expect(toast()).toBeNull()
    rerender(<Both removal={null} />)
    expect(toast()).toBeNull()
  })
})

describe('the sources grid shows no import progress', () => {
  it('iNaturalist fetching: no progress bar and no count in the row; its Cancel stays', () => {
    render(<InatForm job={{ ...NO_INAT, busyFor: 'sam', progress: { fetched: 1000, total: 4341 } }} onFetch={() => {}} onCancel={() => {}} />, { wrapper })
    expect(screen.queryByRole('progressbar')).toBeNull()
    expect(document.querySelector('.eb-inat-progress')).toBeNull()
    expect(document.body).not.toHaveTextContent(/1,000|4,341|Looking up/)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })
})
