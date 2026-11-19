// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fileMessage, useImportJobs } from '@/components/app/use-import-jobs'
import { en } from '@/i18n/messages/en'
import { MatchReport } from '@/components/import/MatchReport'
import { SheetDrop } from '@/components/import/SheetDrop'
import * as parseClient from '@/lib/import/parse-client'
import { handleParseMessage, type ParseRequest } from '@/lib/import/parse.worker'
import * as places from '@/lib/import/places'
import { emptySaved, replaceSource } from '@/lib/list/storage'
import { buildSpeciesIndex, buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow, TaxonRow } from '@/lib/species/types'

const rawSpecies = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const rawTaxon = JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) as { taxa: TaxonRow[] }
const species = buildSpeciesIndex(rawSpecies.species)
const taxonomy = buildTaxonomyIndex(rawTaxon.taxa)
const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function mockWorker() {
  vi.spyOn(places, 'loadRegions').mockResolvedValue(regions)
  vi.spyOn(parseClient, 'parseInWorker').mockImplementation((kind, file, opts) => {
    return new Promise((resolve, reject) => {
      const msg = { kind, file, ...(opts ?? {}) } as ParseRequest
      void handleParseMessage(
        msg,
        (m) => {
          if (m.type === 'done') resolve(m.result)
          else if (m.type === 'error') reject(new parseClient.ParseError(m.message, m.code))
        },
        async () => taxonomy,
      )
    })
  })
}

describe('SheetDrop and review flow', () => {
  it('shows review on paste, lets user cancel without changing list, or confirm to add', async () => {
    mockWorker()
    const onImport = vi.fn()
    const { result } = renderHook(() => useImportJobs(onImport))

    const { rerender } = render(
      <SheetDrop
        job={result.current.sheet}
        onFile={(f) => void result.current.readSheet(f)}
        onPaste={(t) => void result.current.parsePaste(t)}
        review={result.current.sheetReview}
        onConfirm={result.current.confirmSheet}
        onCancel={result.current.cancelSheet}
        species={species}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Spreadsheet or list' }))
    fireEvent.change(screen.getByTestId('sheet-paste'), { target: { value: 'Mallard\nMallard\nMallardd\n' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('sheet-paste-submit'))
    })

    rerender(
      <SheetDrop
        job={result.current.sheet}
        onFile={(f) => void result.current.readSheet(f)}
        onPaste={(t) => void result.current.parsePaste(t)}
        review={result.current.sheetReview}
        onConfirm={result.current.confirmSheet}
        onCancel={result.current.cancelSheet}
        species={species}
      />,
    )

    const review = screen.getByTestId('sheet-review')
    // The review takes focus, named by its summary, so it is announced.
    expect(review).toHaveFocus()
    expect(screen.getByRole('group', { name: '1 species matched · 1 duplicate · 1 unmatched' })).toBe(review)
    expect(review).toHaveTextContent('1 species matched')
    expect(review).toHaveTextContent('1 duplicate')
    expect(review).toHaveTextContent('1 unmatched')
    expect(review).toHaveTextContent('Mallardd → Mallard')
    expect(onImport).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByTestId('sheet-cancel'))
    })
    expect(onImport).not.toHaveBeenCalled()

    rerender(
      <SheetDrop
        job={result.current.sheet}
        onFile={(f) => void result.current.readSheet(f)}
        onPaste={(t) => void result.current.parsePaste(t)}
        review={result.current.sheetReview}
        onConfirm={result.current.confirmSheet}
        onCancel={result.current.cancelSheet}
        species={species}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('sheet-paste-submit'))
    })
    rerender(
      <SheetDrop
        job={result.current.sheet}
        onFile={(f) => void result.current.readSheet(f)}
        onPaste={(t) => void result.current.parsePaste(t)}
        review={result.current.sheetReview}
        onConfirm={result.current.confirmSheet}
        onCancel={result.current.cancelSheet}
        species={species}
      />,
    )
    await act(async () => {
      fireEvent.click(screen.getByTestId('sheet-confirm'))
    })
    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toBe('sheet')
  })

  it('says how many rows were skipped for having no date', async () => {
    mockWorker()
    const { result } = renderHook(() => useImportJobs(vi.fn()))
    // 25 species, 5 dated: the date column marks the birds seen, so the 20 undated rows are left out.
    const names = rawSpecies.species.slice(0, 25).map((r) => r.sci)
    const text = ['Scientific Name,Date', ...names.map((n, i) => `${n},${i < 5 ? '2024-05-0' + (i + 1) : ''}`)].join('\n')
    await act(async () => {
      await result.current.parsePaste(text)
    })
    expect(result.current.sheetReview?.matched).toBe(5)
    expect(result.current.sheetReview?.noDate).toBe(20)
    render(
      <SheetDrop
        job={result.current.sheet}
        onFile={() => {}}
        onPaste={() => {}}
        review={result.current.sheetReview}
        onConfirm={() => {}}
        onCancel={() => {}}
        species={species}
      />,
    )
    expect(screen.getByTestId('sheet-review')).toHaveTextContent('5 species matched · 20 rows skipped: no date')
  })

  it('tells the birder to export CSV when an Excel file is given to the eBird or observation.org row', async () => {
    mockWorker()
    const onImport = vi.fn()
    const { result } = renderHook(() => useImportJobs(onImport))
    const xlsx = () => new File(['PK\u0003\u0004'], 'MyEBirdData.xlsx')
    await act(async () => {
      await result.current.readEbird(xlsx())
    })
    expect(result.current.ebird.error).toBe('xlsx')
    expect(fileMessage('xlsx', en.ui)).toBe('This is an Excel file. Everybird reads CSV files: export as CSV and add that file instead.')
    await act(async () => {
      await result.current.readObsOrg(xlsx())
    })
    expect(result.current.obsorg.error).toBe('xlsx')
    expect(parseClient.parseInWorker).not.toHaveBeenCalled()
    expect(onImport).not.toHaveBeenCalled()
  })

  it('rejects unsupported spreadsheet files and leaves the list unchanged', async () => {
    mockWorker()
    const onImport = vi.fn()
    const { result } = renderHook(() => useImportJobs(onImport))

    await act(async () => {
      await result.current.readSheet(new File(['legacy'], 'old.xls'))
    })
    expect(result.current.sheet.error).toBe('unsupported-sheet')
    expect(onImport).not.toHaveBeenCalled()
  })

  it('shows spreadsheet unmatched rows in MatchReport and allows fixing them', () => {
    const saved = replaceSource(emptySaved(), 'sheet', {
      records: [{ code: 'rocpig', source: 'sheet' }],
      unmatched: [{ source: 'sheet', row: 2, com: 'Mallardd', reason: 'no-match', suggestion: 'mallar3' }],
      skipped: 0,
    })
    const dispatch = vi.fn()
    render(<MatchReport open={saved.unmatched} saved={saved} species={species} dispatch={dispatch} />)

    const box = screen.getByRole('region')
    fireEvent.click(within(box).getByRole('button', { name: /Fix it/ }))
    expect(within(box).getByText('Spreadsheet row 2')).toBeInTheDocument()
    fireEvent.click(within(box).getByRole('button', { name: /Use Mallard/ }))
    expect(dispatch).toHaveBeenCalledWith({
      type: 'edit',
      edits: { ...saved.edits, fixes: { 'sheet:2': 'mallar3' } },
    })
  })
})
