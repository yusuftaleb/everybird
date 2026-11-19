// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { notCounted } from '@/components/import/NotCounted'
import { EN_UI } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { emptySaved } from '@/lib/list/storage'

afterEach(() => cleanup())

describe('notCounted', () => {
  it('lists eBird non-countable species by resolved name under why? and keeps skipped total intact', () => {
    const saved = {
      ...emptySaved(),
      skipped: { 'ebird-list': 4 },
      notCountable: { 'ebird-list': ['yerwar', 'rupgri', 'rocpig'] },
    }
    const names: Record<string, string> = {
      yerwar: 'Yellow-rumped Warbler',
      rupgri: "Rüppell's Griffon",
      rocpig: 'Rock Pigeon',
    }
    const out = notCounted(saved, ['ebird-list'], EN_UI, (c) => names[c] ?? c)
    expect(out?.n).toBe(4)
    render(<div>{out?.body}</div>)
    expect(screen.getByText(/1 entry isn't a species/)).toBeInTheDocument()
    expect(screen.getByText(/3 species eBird marks as not countable, like escaped or introduced birds:/)).toBeInTheDocument()
    expect(screen.getByText('Yellow-rumped Warbler')).toBeInTheDocument()
    expect(screen.getByText("Rüppell's Griffon")).toBeInTheDocument()
    expect(screen.getByText('Rock Pigeon')).toBeInTheDocument()
  })

  it('omits the non-species paragraph when every skipped row is a non-countable species', () => {
    const saved = {
      ...emptySaved(),
      skipped: { 'ebird-list': 1 },
      notCountable: { 'ebird-list': ['yerwar'] },
    }
    const out = notCounted(saved, ['ebird-list'], es.ui, () => 'Chipe Coronado')
    expect(out?.n).toBe(1)
    render(<div>{out?.body}</div>)
    expect(screen.queryByText(/no es una especie/)).toBeNull()
    expect(screen.getByText(/1 especie que eBird marca como no contable, como aves escapadas o introducidas:/)).toBeInTheDocument()
    expect(screen.getByText('Chipe Coronado')).toBeInTheDocument()
  })
})
