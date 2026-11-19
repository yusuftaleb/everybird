// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useImportJobs } from '@/components/app/use-import-jobs'
import { ScythebillDrop } from '@/components/import/ScythebillDrop'
import * as parseClient from '@/lib/import/parse-client'
import { handleParseMessage, type ParseRequest } from '@/lib/import/parse.worker'
import * as places from '@/lib/import/places'
import { emptySaved, replaceSource } from '@/lib/list/storage'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, TaxonRow } from '@/lib/species/types'

const rawTaxon = JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) as { taxa: TaxonRow[] }
const taxonomy = buildTaxonomyIndex(rawTaxon.taxa)
const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions
const fixture = (name: string) => readFileSync(`tests/fixtures/scythebill/${name}`, 'utf8')

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

describe('ScythebillDrop and useImportJobs', () => {
  it('imports a Scythebill CSV file into the scythebill slot and shows connected state', async () => {
    mockWorker()
    const onImport = vi.fn()
    const { result } = renderHook(() => useImportJobs(onImport))

    const { rerender } = render(
      <ScythebillDrop job={result.current.scythebill} onFile={(f) => void result.current.readScythebill(f)} />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Add Scythebill' }))
    const file = new File([fixture('native.csv')], 'native.csv', { type: 'text/csv' })
    await act(async () => {
      fireEvent.change(screen.getByTestId('scythebill-input'), { target: { files: [file] } })
    })

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onImport.mock.calls[0][0]).toBe('scythebill')
    expect(onImport.mock.calls[0][2].kind).toBe('csv')

    const saved = replaceSource(emptySaved(), 'scythebill', onImport.mock.calls[0][1], onImport.mock.calls[0][2])
    rerender(
      <ScythebillDrop
        job={result.current.scythebill}
        onFile={(f) => void result.current.readScythebill(f)}
        connected
        details={saved.sources?.scythebill}
        saved={saved}
        counts={{ species: 5, only: 0, onlyIn: 'here' }}
      />,
    )

    expect(screen.getByTestId('source-scythebill')).toBeInTheDocument()
    expect(screen.getByText(/5 species/)).toBeInTheDocument()
  })

  it('rejects a wrong file with an error and leaves the saved list untouched', async () => {
    mockWorker()
    const onImport = vi.fn()
    const { result } = renderHook(() => useImportJobs(onImport))

    const { rerender } = render(
      <ScythebillDrop job={result.current.scythebill} onFile={(f) => void result.current.readScythebill(f)} />,
    )

    const badFile = new File(['hello,world\n1,2'], 'wrong.csv', { type: 'text/csv' })
    await act(async () => {
      fireEvent.change(screen.getByTestId('scythebill-input'), { target: { files: [badFile] } })
    })

    expect(onImport).not.toHaveBeenCalled()
    rerender(
      <ScythebillDrop job={result.current.scythebill} onFile={(f) => void result.current.readScythebill(f)} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/Scythebill/)
  })
})
