// @vitest-environment jsdom
// Round 6 menu audit, item 7: one toast for every import (ImportToast, on the site's Toast), no progress in the grid.
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UndoToast } from '@/components/app/UndoToast'
import type { FileJob, ImportJobs, InatJob, Landed } from '@/components/app/use-import-jobs'
import { DONE_MS, ImportToast, RUN_DELAY, SEE_MS } from '@/components/import/ImportToast'
import { InatForm } from '@/components/import/InatForm'
import { withI18n } from './i18n-render'

const IDLE: FileJob = { busy: false, rows: 0, error: null }
const NO_INAT: InatJob = { busyFor: null, progress: null, error: null, note: null }
const jobs = (over: Partial<ImportJobs> = {}): ImportJobs => ({
  ebird: IDLE, obsorg: IDLE, sheet: IDLE, scythebill: IDLE, igoterra: IDLE, inat: NO_INAT, landed: null,
  cancelInat: vi.fn(), cancelFile: vi.fn(), ...over,
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
    // Cancel stops the read (C9).
    const cancelFile = vi.fn()
    rerender(<ImportToast jobs={jobs({ cancelFile, ebird: { busy: true, rows: 1200, error: null } })} />)
    fireEvent.click(within(toast()!).getByRole('button', { name: 'Cancel' }))
    expect(cancelFile).toHaveBeenCalledOnce()
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
  it('an iNaturalist failure shows its message for DONE_MS (the fetch outlives the dialog), never an earlier done line', async () => {
    const { rerender } = render(<ImportToast jobs={jobs()} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1) })} />)
    expect(toast()).toHaveTextContent('Done · 3 from iNaturalist')
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1), inat: { ...NO_INAT, busyFor: 'nobody' } })} />)
    await wait(RUN_DELAY)
    expect(toast()).toHaveTextContent('Looking up “nobody”…')
    rerender(<ImportToast jobs={jobs({ landed: landed(3, 1), inat: { ...NO_INAT, error: { code: 'unknown-user', user: 'nobody' } } })} />)
    expect(toast()).toHaveTextContent('nobody')
    expect(toast()).not.toHaveTextContent('Done')
    await wait(DONE_MS)
    expect(toast()).toBeNull()
  })
  it('a file read the parser streams: its share of the file over a progress line (O11)', async () => {
    render(<ImportToast jobs={jobs({ ebird: { busy: true, rows: 120000, frac: 0.456, error: null } })} />, { wrapper })
    await wait(RUN_DELAY)
    expect(toast()).toHaveTextContent('Reading your file… 120,000 rows · 45%')
    const bar = within(toast()!).getByRole('progressbar', { name: 'Reading your file…' })
    expect(bar).toHaveAttribute('aria-valuenow', '45')
    expect(toast()!.querySelector('.eb-toast-spin')).toBeNull()
  })
  it('the first birds into an empty list name the collage; a Refresh or Replace says what it added (D1, D2)', () => {
    const { rerender } = render(<ImportToast jobs={jobs()} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(282, 1, 'ebird'), first: true } })} />)
    expect(toast()).toHaveTextContent(/^Your collage has 282 species$/)
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(290, 2), added: 4 } })} />)
    expect(toast()).toHaveTextContent(/^Done · 290 from iNaturalist · 4 new species$/)
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(290, 3), added: 0 } })} />)
    expect(toast()).toHaveTextContent(/^Done · 290 from iNaturalist · no new species$/)
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

describe('"See my collage" on the done line', () => {
  const see = () => (toast() ? within(toast()!).queryByRole('button', { name: 'See my collage' }) : null)
  it('shows when an import brought birds (first collage, a new source, new species), stays SEE_MS, and its press goes and ends the toast', async () => {
    const onSee = vi.fn()
    const { rerender } = render(<ImportToast jobs={jobs()} onSee={onSee} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(282, 1, 'ebird'), first: true } })} onSee={onSee} />)
    expect(toast()).toHaveTextContent(/^Your collage has 282 species\s*See my collage$/)
    expect(toast()!.closest('[role="status"]')).not.toBeNull() // still in the live region
    expect(see()).toHaveClass('eb-textbtn') // Undo's style, and its 44px press (app.css .eb-textbtn::after)
    rerender(<ImportToast jobs={jobs({ landed: landed(12, 2, 'inat') })} onSee={onSee} />)
    expect(see()).not.toBeNull()
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(290, 3), added: 4 } })} onSee={onSee} />)
    expect(see()).not.toBeNull()
    expect(document.activeElement).toBe(document.body) // a pointer start: no focus move
    await wait(SEE_MS - 10)
    expect(see()).not.toBeNull()
    fireEvent.click(see()!)
    expect(onSee).toHaveBeenCalledOnce()
    expect(toast()).toBeNull()
  })
  it('never on an error, a cancel or "no new species", nor without birds', async () => {
    const onSee = vi.fn()
    const { rerender } = render(<ImportToast jobs={jobs()} onSee={onSee} />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(290, 1), added: 0 } })} onSee={onSee} />)
    expect(toast()).toHaveTextContent('no new species')
    expect(see()).toBeNull()
    rerender(<ImportToast jobs={jobs({ landed: landed(0, 2, 'ebird') })} onSee={onSee} />)
    expect(see()).toBeNull()
    rerender(<ImportToast jobs={jobs({ landed: landed(0, 2, 'ebird'), inat: { ...NO_INAT, busyFor: 'nobody' } })} onSee={onSee} />)
    rerender(<ImportToast jobs={jobs({ landed: landed(0, 2, 'ebird'), inat: { ...NO_INAT, error: { code: 'unknown-user', user: 'nobody' } } })} onSee={onSee} />)
    expect(toast()).toHaveTextContent('nobody')
    expect(see()).toBeNull()
  })
  it('hidden when the birder is already on the Collage view (here), and back if they leave it while it shows', () => {
    const onSee = vi.fn()
    const { rerender } = render(<ImportToast jobs={jobs()} onSee={onSee} here />, { wrapper })
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(5, 1), first: true } })} onSee={onSee} here />)
    expect(toast()).toHaveTextContent(/^Your collage has 5 species$/)
    expect(see()).toBeNull()
    rerender(<ImportToast jobs={jobs({ landed: { ...landed(5, 1), first: true } })} onSee={onSee} here={false} />)
    expect(see()).not.toBeNull()
    expect(document.activeElement).toBe(document.body) // shown later: never a focus move
  })
  it('an import started from the keyboard puts focus on it; one started by pointer does not', async () => {
    const onSee = vi.fn()
    const { rerender } = render(<ImportToast jobs={jobs()} onSee={onSee} />, { wrapper })
    fireEvent.keyDown(document.body, { key: 'Enter' })
    rerender(<ImportToast jobs={jobs({ inat: { ...NO_INAT, busyFor: 'sam' } })} onSee={onSee} />)
    fireEvent.pointerDown(document.body) // a press while it runs doesn't change how it was started
    rerender(<ImportToast jobs={jobs({ landed: landed(5, 1) })} onSee={onSee} />)
    await wait(16)
    expect(see()).toHaveFocus()
    fireEvent.blur(see()!)
    ;(document.activeElement as HTMLElement).blur()
    rerender(<ImportToast jobs={jobs({ landed: landed(5, 1), ebird: { busy: true, rows: 0, error: null } })} onSee={onSee} />)
    rerender(<ImportToast jobs={jobs({ landed: landed(6, 2) })} onSee={onSee} />)
    await wait(16)
    expect(see()).not.toBeNull()
    expect(see()).not.toHaveFocus()
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
