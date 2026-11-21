// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ObsOrgDrop, type ObsOrgConnected } from '@/components/import/ObsOrgDrop'
import { obsorgExcluded } from '@/components/import/obsorg-copy'
import { fmt } from '@/i18n/core'
import { en } from '@/i18n/messages/en'
import type { Slot, Unmatched } from '@/lib/list/model'
import type { RowCount, SourceCounts } from '@/lib/list/source-counts'
import { emptySaved, type Saved } from '@/lib/list/storage'

const idle = { busy: false, rows: 0, error: null }
const AT = '2026-01-02T12:00:00.000Z'
const FILE = 'observation-2026-01-02-03-04-species_observed_testbirder.csv'
afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

const none: RowCount = { species: 0, only: 0, onlyIn: 'here' }
function countsWith(rows: Partial<Record<Slot, RowCount>>): SourceCounts {
  const all = { ebird: none, 'ebird-list': none, inat: none, obsorg: none, 'obsorg-list': none, sheet: none, scythebill: none, igoterra: none, manual: none, ...rows }
  return { total: 0, rows: all, parts: [] }
}
const named = (row: number, sci: string, com?: string): Unmatched => ({ source: 'obsorg', slot: 'obsorg-list', row, sci, ...(com ? { com } : {}), reason: 'not-species' })
function lifeListSaved(): Saved {
  const s = emptySaved()
  s.records['obsorg-list'] = Array.from({ length: 6 }, (_, i) => ({ code: `c${i}`, source: 'obsorg' as const }))
  s.unmatched = [
    named(8, 'Motacilla spec.', 'kwikstaart onbekend'),
    named(9, 'Colaptes auratus / chrysoides'),
    named(10, 'Colaptes auratus x Colaptes chrysoides'),
    named(11, 'Columba livia (domestica)'),
    named(12, 'Anas platyrhynchos (domesticus)'),
    { source: 'obsorg', slot: 'obsorg-list', row: 13, sci: 'Avis inventa', reason: 'no-match' },
    { source: 'obsorg', slot: 'obsorg-list', row: 14, sci: 'Neotis denhamii', reason: 'no-match' },
  ]
  s.sources = { 'obsorg-list': { kind: 'species-list', file: FILE, rows: 15, at: AT } }
  return s
}
const lifeList: ObsOrgConnected[] = [{ slot: 'obsorg-list', details: { kind: 'species-list', file: FILE, rows: 15, at: AT } }]

describe('ObsOrgDrop: the two observation.org rows', () => {
  it('not added: Add opens the panel with the guide, the drop zone and the how-to', () => {
    render(<ObsOrgDrop job={idle} onFile={() => {}} />)
    const add = screen.getByRole('button', { name: 'Add observation.org life list' })
    expect(add).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getAllByText('Not added')).toHaveLength(2)
    fireEvent.click(add)
    expect(add).toHaveAttribute('aria-expanded', 'true')
    const panel = screen.getByRole('group', { name: 'Add observation.org life list' })
    expect(add).toHaveAttribute('aria-controls', panel.id)
    expect(panel).toBeVisible()
    expect(within(panel).getByText("Your Observed species list from observation.org. It gives each bird's first date, but no places.")).toBeVisible()
    expect(within(panel).getByRole('button', { name: 'Choose your observation.org file' })).toBeVisible()
    fireEvent.click(within(panel).getByRole('button', { name: 'How do I get this file?' }))
    expect(within(panel).getByText('On observation.org: open Observed species, choose Birds and Life list, then Export as CSV. Everybird reads the CSV, not the Excel file.')).toBeVisible()
    // The input takes CSV only.
    expect(screen.getByTestId('obsorg-input')).toHaveAttribute('accept', '.csv,text/csv')
  })

  it('the observations row: Add opens its guide and how-to', () => {
    render(<ObsOrgDrop job={idle} onFile={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add observation.org observations' }))
    const panel = screen.getByRole('group', { name: 'Add observation.org observations' })
    expect(within(panel).getByText('Every bird observation you made on observation.org. It places each bird by country and province, so Places can filter them.')).toBeVisible()
    fireEvent.click(within(panel).getByRole('button', { name: 'How do I get this file?' }))
    expect(within(panel).getByText('On observation.org: open your Observations, choose Birds, then Export as CSV. Everybird reads the CSV, not the Excel file.')).toBeVisible()
  })

  it('connected: the file name, counts, skipped why?, Replace and the ⋯ menu', () => {
    const saved = lifeListSaved()
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} saved={saved} counts={countsWith({ 'obsorg-list': { species: 6, only: 2, onlyIn: 'here' } })} onRemove={() => {}} />)
    const row = screen.getByTestId('source-obsorg-list')
    expect(row).toHaveTextContent(`observation.org life list · ${FILE}`)
    expect(row).toHaveTextContent(/6 species · 2 only here · 7 skipped why\? · Imported 2 Jan/)
    fireEvent.click(within(row).getByRole('button', { name: 'Why 7 skipped?' }))
    const why = within(row).getByTestId('not-counted')
    expect(why).toBeVisible()
    expect(why).toHaveTextContent('5 entries aren\'t species: birds only identified to a group (like “Motacilla spec.”), either/or IDs, hybrids, forms and varieties.')
    const items = within(why).getAllByRole('listitem').map((li) => li.textContent)
    expect(items).toEqual(['Motacilla spec. · kwikstaart onbekend', 'Colaptes auratus / chrysoides', 'Colaptes auratus x Colaptes chrysoides', 'Columba livia (domestica)', 'Anas platyrhynchos (domesticus)'])
    expect(why).toHaveTextContent("2 rows couldn't be matched to this year's eBird taxonomy. Fix them")
    expect(within(row).getByRole('button', { name: `Replace ${FILE}` })).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'More for observation.org life list' }))
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Remove']) // Replace is the button beside it
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove' }))
    expect(within(row).getByRole('group', { name: 'Remove your observation.org life list' })).toHaveTextContent(/^Remove your observation\.org life list\? Its birds leave your collage/)
  })

  it('"why?" opens a popover over the grid: it closes on Esc (focus back on why?), a press outside, focus leaving, or why? again', () => {
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} saved={lifeListSaved()} counts={countsWith({ 'obsorg-list': { species: 6, only: 2, onlyIn: 'here' } })} onRemove={() => {}} />)
    const row = screen.getByTestId('source-obsorg-list')
    const btn = within(row).getByRole('button', { name: 'Why 7 skipped?' })
    const pop = within(row).getByTestId('not-counted')
    // In the cell, not under the row: nothing in the grid moves when it opens.
    expect(pop.parentElement).toHaveClass('eb-src-main')
    expect(pop).toHaveClass('eb-whypop')
    btn.focus()
    fireEvent.click(btn)
    expect(pop).toBeVisible()
    fireEvent.keyDown(pop, { key: 'Escape' })
    expect(pop).not.toBeVisible()
    expect(btn).toHaveFocus()
    fireEvent.click(btn)
    fireEvent.pointerDown(pop)
    expect(pop).toBeVisible() // a press inside keeps it
    fireEvent.pointerDown(document.body)
    expect(pop).not.toBeVisible()
    fireEvent.click(btn)
    fireEvent.blur(btn, { relatedTarget: document.body })
    expect(pop).not.toBeVisible()
    fireEvent.click(btn)
    fireEvent.click(btn)
    expect(pop).not.toBeVisible()
    expect(btn).toHaveAttribute('aria-expanded', 'false')
  })

  it('without details: the fallback name and "Details unknown"', () => {
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg-list' }]} />)
    expect(screen.getByTestId('source-obsorg-list')).toHaveTextContent('observation.org life list · observation.org Observed species')
    expect(screen.getByTestId('source-obsorg-list')).toHaveTextContent('Details unknown')
  })

  it('the observations row connected: escapes and uncertain records are in why?, never in the skipped count', () => {
    const s = emptySaved()
    s.records.obsorg = [{ code: 'norfli', source: 'obsorg' }]
    s.unmatched = [{ source: 'obsorg', row: 9, sci: 'Colaptes spec.', reason: 'not-species' }]
    s.sources = { obsorg: { kind: 'observations', file: 'obs.csv', at: AT, excluded: { escape: 2, uncertain: 1 } } }
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg', details: s.sources.obsorg }]} saved={s} counts={countsWith({ obsorg: { species: 1, only: 0, onlyIn: 'here' } })} />)
    const row = screen.getByTestId('source-obsorg')
    expect(row).toHaveTextContent('1 species · 1 skipped why?')
    expect(row).not.toHaveTextContent('not counted why?')
    fireEvent.click(within(row).getByRole('button', { name: 'Why 1 skipped?' }))
    const why = within(row).getByTestId('not-counted')
    expect(why).toHaveTextContent('1 entry isn\'t a species: birds only identified to a group')
    expect(why).toHaveTextContent('2 observations marked as escapes and 1 marked uncertain aren\'t counted.')
    // No life-list note: the observations are on the list.
    expect(screen.queryByTestId('places-obsorg-note')).toBeNull()
  })

  it('only escapes and uncertain records left out: "N observations not counted", its why? opening the sentence', () => {
    const s = emptySaved()
    s.records.obsorg = [{ code: 'norfli', source: 'obsorg' }]
    s.sources = { obsorg: { kind: 'observations', file: 'obs.csv', at: AT, excluded: { escape: 9, uncertain: 3 } } }
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg', details: s.sources.obsorg }]} saved={s} counts={countsWith({ obsorg: { species: 1, only: 0, onlyIn: 'here' } })} />)
    const row = screen.getByTestId('source-obsorg')
    expect(row).toHaveTextContent('1 species · 12 observations not counted why?')
    expect(row).not.toHaveTextContent('skipped')
    const btn = within(row).getByRole('button', { name: 'Why 12 not counted?' })
    const why = within(row).getByTestId('not-counted')
    expect(why).not.toBeVisible()
    fireEvent.click(btn)
    expect(btn).toHaveAttribute('aria-expanded', 'true')
    expect(why).toBeVisible()
    expect(why).toHaveTextContent(/^9 observations marked as escapes and 3 marked uncertain aren't counted\.$/)
  })

  it('one observation left out reads in the singular; none left out shows no why?', () => {
    const s = emptySaved()
    s.records.obsorg = [{ code: 'norfli', source: 'obsorg' }]
    s.sources = { obsorg: { kind: 'observations', file: 'obs.csv', at: AT, excluded: { escape: 0, uncertain: 1 } } }
    const { unmount } = render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg', details: s.sources.obsorg }]} saved={s} />)
    expect(screen.getByTestId('source-obsorg')).toHaveTextContent('1 observation not counted why?')
    unmount()
    s.sources = { obsorg: { kind: 'observations', file: 'obs.csv', at: AT, excluded: { escape: 0, uncertain: 0 } } }
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg', details: s.sources.obsorg }]} saved={s} />)
    expect(screen.queryByRole('button', { name: /^Why/ })).toBeNull()
    expect(screen.queryByTestId('not-counted')).toBeNull()
  })

  it('the life-list note shows only without the observations, and its link opens their panel and focuses the picker', () => {
    const { rerender } = render(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} />)
    const note = screen.getByTestId('places-obsorg-note')
    expect(note).toHaveTextContent("Your observation.org life list has no places, so Places can't filter these birds. Add the observations export to place each bird by country and province.")
    const link = screen.getByTestId('places-obsorg-add')
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '#add-obsorg')
    expect(within(note).queryAllByRole('button')).toEqual([])
    expect(screen.getByRole('button', { name: 'Add observation.org observations' })).toHaveAttribute('aria-controls', link.getAttribute('aria-controls'))
    fireEvent.click(link)
    expect(screen.getByRole('group', { name: 'Add observation.org observations' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your observation.org file' })).toHaveFocus()
    rerender(<ObsOrgDrop job={idle} onFile={() => {}} />)
    expect(screen.queryByTestId('places-obsorg-note')).toBeNull()
    rerender(<ObsOrgDrop job={idle} onFile={() => {}} connected={[...lifeList, { slot: 'obsorg' }]} />)
    expect(screen.queryByTestId('places-obsorg-note')).toBeNull()
  })

  it('#add-obsorg opens the observations panel on arrival, and on a later hashchange', () => {
    history.replaceState(null, '', '#add-obsorg')
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} />)
    expect(screen.getByRole('group', { name: 'Add observation.org observations' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your observation.org file' })).toHaveFocus()
    cleanup()
    history.replaceState(null, '', '/')
    render(<ObsOrgDrop job={idle} onFile={() => {}} />)
    expect(screen.queryByRole('group', { name: 'Add observation.org observations' })).toBeNull()
    history.replaceState(null, '', '#add-obsorg')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByRole('group', { name: 'Add observation.org observations' })).toBeVisible()
  })

  it('#add-obsorg with the observations on the list focuses their Replace', () => {
    history.replaceState(null, '', '#add-obsorg')
    render(<ObsOrgDrop job={idle} onFile={() => {}} connected={[{ slot: 'obsorg', details: { kind: 'observations', file: 'obs.csv', at: AT } }]} />)
    expect(screen.getByRole('button', { name: 'Replace obs.csv' })).toHaveFocus()
  })

  it('#add-obsorg during a read waits, and is taken up only while the address still names it', () => {
    const { rerender } = render(<ObsOrgDrop job={{ ...idle, busy: true }} onFile={() => {}} connected={lifeList} />)
    history.replaceState(null, '', '#add-obsorg')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.queryByRole('group', { name: 'Add observation.org observations' })).toBeNull()
    rerender(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} />)
    expect(screen.getByRole('button', { name: 'Choose your observation.org file' })).toHaveFocus()
    cleanup()
    const second = render(<ObsOrgDrop job={idle} disabled onFile={() => {}} connected={lifeList} />)
    fireEvent(window, new HashChangeEvent('hashchange'))
    history.replaceState(null, '', '#match')
    second.rerender(<ObsOrgDrop job={idle} onFile={() => {}} connected={lifeList} />)
    expect(screen.queryByRole('group', { name: 'Add observation.org observations' })).toBeNull()
  })

  it('a dropped file is read; while busy, the grid shows no progress (the import toast does: round 6 item 7)', () => {
    const onFile = vi.fn()
    const file = new File(['x'], 'o.csv', { type: 'text/csv' })
    const { rerender } = render(<ObsOrgDrop job={idle} onFile={onFile} />)
    fireEvent.drop(screen.getByTestId('obsorg-drop'), { dataTransfer: { files: [file], types: ['Files'] } })
    expect(onFile).toHaveBeenCalledWith(file)
    rerender(<ObsOrgDrop job={{ busy: true, rows: 1200, error: null }} onFile={onFile} />)
    expect(screen.getByTestId('obsorg-drop')).not.toHaveTextContent(/Reading your file/)
    expect(screen.getByTestId('obsorg-drop')).toHaveAttribute('data-busy')
    rerender(<ObsOrgDrop job={{ ...idle, error: 'obsorg-no-birds' }} onFile={onFile} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No birds in this file.')
    // Disabled (the eBird rows are reading a file): a drop is not taken.
    rerender(<ObsOrgDrop job={idle} disabled onFile={onFile} />)
    fireEvent.drop(screen.getByTestId('obsorg-drop'), { dataTransfer: { files: [file], types: ['Files'] } })
    expect(onFile).toHaveBeenCalledOnce()
  })
})

describe('observation.org copy', () => {
  it('the excluded sentence: each part left out at 0, one and other', () => {
    expect(obsorgExcluded(0, 0)).toBeNull()
    expect(obsorgExcluded(1, 0)).toBe("1 observation marked as an escape isn't counted.")
    expect(obsorgExcluded(0, 1)).toBe("1 observation marked uncertain isn't counted.")
    expect(obsorgExcluded(0, 3)).toBe("3 observations marked uncertain aren't counted.")
    expect(obsorgExcluded(1, 1)).toBe("1 observation marked as an escape and 1 marked uncertain aren't counted.")
    expect(obsorgExcluded(2, 1)).toBe("2 observations marked as escapes and 1 marked uncertain aren't counted.")
  })
  it("the match report's place for each export's rows", () => {
    expect(fmt(en.ui.import.obsorg.whereList, { row: 13 })).toBe('observation.org life list row 13')
    expect(fmt(en.ui.import.obsorg.whereRow, { row: 4 })).toBe('observation.org row 4')
  })
})
