// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { EbirdDrop } from '@/components/import/EbirdDrop'
import type { SourceCounts } from '@/lib/list/source-counts'
import { emptySaved, type Saved } from '@/lib/list/storage'
import { withI18n } from './i18n-render'

const idle = { busy: false, rows: 0, error: null }
const note = () => screen.queryByTestId('ebird-detail')
afterEach(() => {
  cleanup()
  history.replaceState(null, '', '/')
})

describe('EbirdDrop: what each eBird file brings', () => {
  it('only the life list download: a visible note, and its inline link opens the MyEBirdData panel', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByTestId('places-lifer-note')).toBeVisible()
    expect(screen.getByTestId('places-lifer-note')).toHaveTextContent('Your eBird life list only says where you first recorded each bird, so Places filters by those first places. Add MyEBirdData to filter by every place you recorded each bird, down to the county.')
    // A link inside the sentence, not a second button under the row's own Add: named apart from it, starting with the
    // words it shows; it controls the row's panel.
    expect(screen.getByTestId('places-lifer-add').tagName).toBe('A')
    expect(within(screen.getByTestId('places-lifer-note')).queryAllByRole('button')).toEqual([])
    expect(screen.getByTestId('places-lifer-add')).toHaveTextContent('Add MyEBirdData')
    expect(screen.getByTestId('places-lifer-add')).toHaveAccessibleName('Add MyEBirdData for every place')
    expect(screen.queryByRole('group', { name: 'Add MyEBirdData' })).toBeNull()
    const panelId = screen.getByTestId('places-lifer-add').getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add MyEBirdData' })).toHaveAttribute('aria-controls', panelId)
    fireEvent.click(screen.getByTestId('places-lifer-add'))
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
    expect(note()).toBeNull()
  })
  it('#add-mydata opens the MyEBirdData panel on arrival', () => {
    history.replaceState(null, '', '#add-mydata')
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
  })
  it('#add-mydata later (a hashchange) opens it too', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    history.replaceState(null, '', '#add-mydata')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
  })
  it('#add-mydata while a file is being read waits, and opens the panel once the read is done', () => {
    const { rerender } = render(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    history.replaceState(null, '', '#add-mydata')
    fireEvent(window, new HashChangeEvent('hashchange'))
    expect(screen.queryByRole('group', { name: 'Add MyEBirdData' })).toBeNull()
    rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
    // Taken up once: a later read finishing doesn't move focus again.
    screen.getByRole('button', { name: /^Replace/ }).focus()
    rerender(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByRole('button', { name: /^Replace/ })).toHaveFocus()
  })
  it('#add-mydata during a read that lands a file: the panel opens once the file is in; MyEBirdData landing focuses its Replace', () => {
    const { rerender } = render(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 0 }} />)
    history.replaceState(null, '', '#add-mydata')
    fireEvent(window, new HashChangeEvent('hashchange'))
    // The life list download lands and the read ends in one render (use-import-jobs batches them).
    rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
    cleanup()
    const second = render(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 0 }} />)
    fireEvent(window, new HashChangeEvent('hashchange'))
    second.rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0 }} connected={[{ slot: 'ebird' }]} />)
    expect(screen.getByRole('button', { name: /^Replace/ })).toHaveFocus()
  })
  it('#add-mydata during a read, then another anchor: nothing moves when the read ends', () => {
    const { rerender } = render(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    history.replaceState(null, '', '#add-mydata')
    fireEvent(window, new HashChangeEvent('hashchange'))
    history.replaceState(null, '', '#match')
    rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.queryByRole('group', { name: 'Add MyEBirdData' })).toBeNull()
  })
  it("the note's link pressed during a read: held, and the panel opens when the read ends", () => {
    const { rerender } = render(<EbirdDrop job={{ ...idle, busy: true }} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    fireEvent.click(screen.getByTestId('places-lifer-add'))
    expect(screen.queryByRole('group', { name: 'Add MyEBirdData' })).toBeNull()
    expect(window.location.hash).toBe('#add-mydata')
    rerender(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
    expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
  })
  it('#add-mydata with MyEBirdData already on the list (saved before seen-here): focuses its Replace, the reason beside it', () => {
    history.replaceState(null, '', '#add-mydata')
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0 }} placesNote="reimport" connected={[{ slot: 'ebird' }]} />)
    expect(screen.getByRole('button', { name: /^Replace/ })).toHaveFocus()
    expect(note()).toBeVisible()
    expect(screen.queryByTestId('places-lifer-note')).toBeNull()
  })
  it('a full export: no lifer-only note', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 3 }} connected={[{ slot: 'ebird' }, { slot: 'ebird-list' }]} />)
    expect(screen.queryByTestId('places-lifer-note')).toBeNull()
  })
  it("the Places panel's reimport note: the same words here, Import MyEBirdData again", () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0 }} placesNote="reimport" connected={[{ slot: 'ebird' }]} />)
    expect(note()).toHaveTextContent(/^Places only knows where you first recorded each bird\. Import MyEBirdData again to filter by every place you recorded each bird\.$/)
  })
  it('no reimport note otherwise, counties or not', () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0 }} connected={[{ slot: 'ebird' }]} />)
    expect(note()).toBeNull()
    cleanup()
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} placesNote="add" connected={[{ slot: 'ebird-list' }]} />)
    expect(note()).toBeNull()
  })
})

describe('EbirdDrop in Spanish', () => {
  const saved = (): Saved => {
    const s = emptySaved()
    s.records['ebird-list'] = [{ code: 'a', source: 'ebird', date: '2024-05-04' }]
    s.skipped = { 'ebird-list': 7 }
    return s
  }
  const counts = { total: 160, parts: [], rows: { 'ebird-list': { species: 160, only: 149, onlyIn: 'eBird' } } } as unknown as SourceCounts
  it('a connected row: its counts, "7 omitidas ¿por qué?", Reemplazar and the lifer-only note', () => {
    render(
      <EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} saved={saved()} counts={counts} connected={[{ slot: 'ebird-list', details: { kind: 'life-list', file: 'life.csv', at: '2025-09-06T10:00:00Z' } }]} />,
      { wrapper: withI18n('es') },
    )
    const row = screen.getByTestId('source-ebird-list')
    expect(row.querySelector('.eb-src-meta')).toHaveTextContent('160 especies · 149 solo en eBird · 7 omitidas ¿por qué? · Importado el 6 sept 2025')
    expect(within(row).getByRole('button', { name: '¿Por qué 7 omitidas?' })).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Reemplazar life.csv' })).toHaveTextContent('Reemplazar')
    expect(within(row).getByRole('button', { name: 'Más opciones de Lista de vida de eBird' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Añadir MyEBirdData' })).toHaveTextContent('Añadir')
    expect(screen.getByTestId('places-lifer-add')).toHaveTextContent('Añade MyEBirdData')
    expect(screen.getByTestId('places-lifer-note')).toHaveTextContent(/^Tu lista de vida de eBird solo dice/)
  })
  it('a read shows no progress in the rows (the import toast does: round 6 item 7); errors from the job codes', () => {
    const { rerender } = render(<EbirdDrop job={{ busy: true, rows: 1089, error: null }} onFile={() => {}} loaded={{ full: 0, quick: 0 }} />, { wrapper: withI18n('es') })
    expect(screen.getByTestId('ebird-drop')).not.toHaveTextContent(/Leyendo tu archivo/)
    expect(screen.getByTestId('ebird-drop')).toHaveAttribute('data-busy')
    rerender(<EbirdDrop job={{ ...idle, error: 'unknown-file' }} onFile={() => {}} loaded={{ full: 0, quick: 0 }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/^No se pudo leer este archivo\. Usa la descarga/)
    cleanup()
    render(<EbirdDrop job={{ ...idle, error: 'damaged' }} onFile={() => {}} loaded={{ full: 0, quick: 0 }} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't read this file. It may be damaged or not an eBird export.")
  })
  it("the reimport line is the Places panel's own words", () => {
    render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 3, quick: 0 }} placesNote="reimport" connected={[{ slot: 'ebird' }]} />, { wrapper: withI18n('pt') })
    expect(note()).toHaveTextContent('Lugares só sabe onde você registrou cada ave pela primeira vez. Importe o MyEBirdData de novo para filtrar por todos os lugares onde você registrou cada ave.')
  })
})
