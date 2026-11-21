// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { FileJob, ImportJobs, Landed } from '@/components/app/use-import-jobs'
import { ImportPanel } from '@/components/import/ImportPanel'
import { OBSORG_GROUP } from '@/components/import/obsorg-copy'
import { sourceCounts } from '@/lib/list/source-counts'
import { buildList } from '@/lib/list/build-list'
import { recordsOf } from '@/lib/list/store'
import { emptySaved, type Saved } from '@/lib/list/storage'
import type { SpeciesIndex } from '@/lib/species/load'

const idle: FileJob = { busy: false, rows: 0, error: null }
const busy: FileJob = { busy: true, rows: 120, error: null }
afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

function jobs(over: Partial<ImportJobs> = {}): ImportJobs {
  return {
    ebird: idle, readEbird: async () => {}, obsorg: idle, readObsOrg: async () => {},
    sheet: idle, readSheet: async () => {}, scythebill: idle, readScythebill: async () => {}, igoterra: idle, readIgoterra: async () => {}, parsePaste: async () => {}, sheetReview: null, confirmSheet: () => {}, cancelSheet: () => {},
    inat: { busyFor: null, progress: null, error: null, note: null }, fetchInat: async () => {}, cancelInat: () => {},
    landed: null, ...over,
  }
}

function Panel({ saved, j }: { saved: Saved; j: ImportJobs }) {
  const list = buildList(recordsOf(saved), saved.edits, saved.rules)
  return (
    <ImportPanel
      saved={saved} dispatch={() => {}} species={{ byCode: new Map() } as unknown as SpeciesIndex} jobs={j}
      counts={sourceCounts(saved, list)}
    />
  )
}

const group = (name: string) => screen.getByRole('group', { name })
const buttons = (name: string) => within(group(name)).getAllByRole('button')

describe('ImportPanel: one file at a time across both file groups', () => {
  it('while the observation.org rows read a file, the eBird rows are disabled too, and the reverse', () => {
    const saved = emptySaved()
    const { rerender } = render(<Panel saved={saved} j={jobs({ obsorg: busy })} />)
    expect(buttons('eBird files').length).toBeGreaterThan(0)
    for (const b of buttons('eBird files')) expect(b).toBeDisabled()
    for (const b of buttons(OBSORG_GROUP)) expect(b).toBeDisabled()
    expect(screen.getByTestId('ebird-input')).toBeDisabled()
    rerender(<Panel saved={saved} j={jobs({ ebird: busy })} />)
    for (const b of buttons(OBSORG_GROUP)) expect(b).toBeDisabled()
    expect(screen.getByTestId('obsorg-input')).toBeDisabled()
    rerender(<Panel saved={saved} j={jobs()} />)
    for (const b of buttons('eBird files')) expect(b).toBeEnabled()
    for (const b of buttons(OBSORG_GROUP)) expect(b).toBeEnabled()
    // iNaturalist never waits on a file.
    rerender(<Panel saved={saved} j={jobs({ obsorg: busy })} />)
    expect(screen.getByRole('button', { name: 'Add iNaturalist' })).toBeEnabled()
  })
})

describe('ImportPanel: the Add panels fold whenever a file lands', () => {
  const at = (slot: Landed['slot'], t: number): Landed => ({ slot, species: 1, at: t })
  it('an eBird file picked from the observation.org panel lands in the eBird rows: the observation.org panel folds', () => {
    const before = emptySaved()
    const { rerender } = render(<Panel saved={before} j={jobs()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add observation.org observations' }))
    expect(screen.getByRole('group', { name: 'Add observation.org observations' })).toBeVisible()
    const after = emptySaved()
    after.records['ebird-list'] = [{ code: 'a', source: 'ebird' }]
    rerender(<Panel saved={after} j={jobs({ landed: at('ebird-list', 1) })} />)
    expect(screen.queryByRole('group', { name: 'Add observation.org observations' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Add observation.org observations' })).toHaveAttribute('aria-expanded', 'false')
  })
  it('an observation.org file picked from the eBird panel: the eBird panel folds', () => {
    const { rerender } = render(<Panel saved={emptySaved()} j={jobs()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add MyEBirdData' }))
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    const after = emptySaved()
    after.records['obsorg-list'] = [{ code: 'a', source: 'obsorg' }]
    rerender(<Panel saved={after} j={jobs({ landed: at('obsorg-list', 1) })} />)
    expect(screen.queryByRole('group', { name: 'Add MyEBirdData' })).toBeNull()
  })
  it('a replacement (the same rows stay connected) folds them too', () => {
    const saved = emptySaved()
    saved.records['obsorg-list'] = [{ code: 'a', source: 'obsorg' }]
    const { rerender } = render(<Panel saved={saved} j={jobs({ landed: at('obsorg-list', 1) })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add observation.org observations' }))
    expect(screen.getByRole('group', { name: 'Add observation.org observations' })).toBeVisible()
    const again = { ...saved, records: { ...saved.records, 'obsorg-list': [{ code: 'b', source: 'obsorg' as const }] } }
    rerender(<Panel saved={again} j={jobs({ landed: at('obsorg-list', 2) })} />)
    expect(screen.queryByRole('group', { name: 'Add observation.org observations' })).toBeNull()
  })
  it('an iNaturalist fetch landing beside them leaves an open panel alone', () => {
    const { rerender } = render(<Panel saved={emptySaved()} j={jobs()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add observation.org life list' }))
    const after = emptySaved()
    after.records.inat = [{ code: 'a', source: 'inat' }]
    rerender(<Panel saved={after} j={jobs({ landed: at('inat', 1) })} />)
    expect(screen.getByRole('group', { name: 'Add observation.org life list' })).toBeVisible()
  })
})

describe('ImportPanel: one Add panel at a time', () => {
  const add = (title: string) => screen.getByRole('button', { name: `Add ${title}` })
  it('opening a source\'s Add panel closes the open one, and its button shows which is open', () => {
    render(<Panel saved={emptySaved()} j={jobs()} />)
    fireEvent.click(add('eBird life list'))
    expect(screen.getByRole('group', { name: 'Add eBird life list' })).toBeVisible()
    expect(add('eBird life list')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(add('Spreadsheet or list'))
    expect(screen.queryByRole('group', { name: 'Add eBird life list' })).toBeNull()
    expect(add('eBird life list')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('group', { name: 'Add Spreadsheet or list' })).toBeVisible()
    fireEvent.click(add('iNaturalist'))
    expect(screen.queryByRole('group', { name: 'Add Spreadsheet or list' })).toBeNull()
    expect(screen.getByRole('group', { name: 'Add iNaturalist' })).toBeVisible()
    // Its own button again closes it, and nothing is open.
    fireEvent.click(add('iNaturalist'))
    expect(screen.queryByRole('group', { name: /^Add / })).toBeNull()
  })
  it('a read in progress keeps its panel open beside the one opened next', () => {
    const { rerender } = render(<Panel saved={emptySaved()} j={jobs()} />)
    fireEvent.click(add('Scythebill'))
    rerender(<Panel saved={emptySaved()} j={jobs({ scythebill: busy })} />)
    fireEvent.click(add('iNaturalist'))
    expect(screen.getByRole('group', { name: 'Add iNaturalist' })).toBeVisible()
    expect(screen.getByRole('group', { name: 'Add Scythebill' })).toBeVisible()
  })
  it('the sources in order: eBird life list, MyEBirdData, iNaturalist, Spreadsheet or list, then observation.org\'s two, Scythebill, iGoTerra', () => {
    render(<Panel saved={emptySaved()} j={jobs()} />)
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'eBird life list', 'MyEBirdData', 'iNaturalist', 'Spreadsheet or list', 'observation.org life list', 'observation.org observations', 'Scythebill', 'iGoTerra',
    ])
  })
})

describe('ImportPanel: a life list that holds only not-countable species', () => {
  it('shows connected, with its menu and its skipped part, so it can be removed', () => {
    const saved = emptySaved()
    saved.notCountable = { 'ebird-list': ['a', 'b'] }
    saved.skipped = { 'ebird-list': 2 }
    saved.sources = { 'ebird-list': { kind: 'life-list', file: 'life.csv', rows: 2, at: '2026-11-19T00:00:00Z' } }
    render(<Panel saved={saved} j={jobs()} />)
    const row = screen.getByTestId('source-ebird-list')
    expect(row).toHaveTextContent('2 skipped')
    expect(within(row).getByRole('button', { name: /more|⋯|options/i })).toHaveAttribute('aria-haspopup', 'menu')
  })
})
