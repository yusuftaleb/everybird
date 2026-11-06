// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BirdCard } from '@/components/collage/BirdCard'
import { ListView } from '@/components/collage/ListView'
import { formatDate, formatMass } from '@/lib/format'
import type { ListEntry } from '@/lib/list/model'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'

const row = (code: string, com: string, to: number, g: number, gSrc: SpeciesRow['gSrc'] = 'avonet', st = true): SpeciesRow => ({
  code, com, sci: `Avis ${code}`, ord: 'Passeriformes', fam: 'Corvidae', famCom: 'Crows', to, g, gSrc, st, ar: 1, q: true,
})
const species = buildSpeciesIndex([
  row('crowa', 'Alpha Crow', 1, 400),
  row('wrenb', 'Beta Wren', 2, 10),
  row('tinyc', 'Gamma Tiny', 3, 4.27, 'family'),
  row('bigge', 'Delta Heavy', 4, 1130, 'avonet', false),
])
const regions: Regions = { v: 1, countries: { CA: 'Canada' }, sub1: { 'CA-BC': 'British Columbia' } }
const entry = (code: string, o: Partial<ListEntry> = {}): ListEntry => ({ code, heard: false, dead: false, media: false, sources: ['manual'], ...o })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function setWidth(w: number) {
  vi.stubGlobal('innerWidth', w)
}

describe('format', () => {
  it('formatMass', () => {
    expect(formatMass(33)).toBe('33 g')
    expect(formatMass(4.27)).toBe('4.3 g')
    expect(formatMass(1130)).toBe('1.1 kg')
    expect(formatMass(999.6)).toBe('1000 g')
  })
  it('formatDate', () => {
    expect(formatDate('2026-09-30')).toBe('Sep 2026')
    expect(formatDate('2026-09')).toBe('Sep 2026')
    expect(formatDate('2022')).toBe('2022')
    expect(formatDate(undefined)).toBe('')
    expect(formatDate('junk')).toBe('')
  })
})

describe('BirdCard', () => {
  const full = entry('crowa', { date: '2026-09-30', place: { country: 'CA', sub1: 'CA-BC', sub2: 'Okanagan' }, heard: true, dead: true, media: true })

  it('card shows place by region rule and marks', () => {
    setWidth(1000)
    render(<BirdCard entry={full} species={species} regions={regions} onClose={() => {}} />)
    const dlg = screen.getByRole('dialog', { name: 'Alpha Crow' })
    expect(within(dlg).getByText('Avis crowa')).toBeInTheDocument()
    expect(within(dlg).getByText('Okanagan, British Columbia, Canada')).toBeInTheDocument()
    expect(within(dlg).getByText('Sep 2026')).toBeInTheDocument()
    // LifeList's card (layout C): marks after the name and on the date line, the mass top-right beside the name.
    expect(dlg.querySelector('.eb-card-date')).toHaveTextContent('Sep 2026 · Heard only · Found dead')
    expect(dlg.querySelector('.eb-card-name .eb-mark')).toHaveTextContent(/^\*†$/)
    const mass = dlg.querySelector('.eb-card-mass')!
    expect(mass).toHaveTextContent('Average body mass 400 g')
    expect(mass).toHaveAttribute('title', 'Average body mass')
    expect(dlg).not.toHaveTextContent('estimated')
    expect(dlg).not.toHaveAttribute('aria-modal')
  })

  it('shows only the marks that apply, no place line when unknown, and marks estimated mass', () => {
    setWidth(1000)
    render(<BirdCard entry={entry('tinyc', { media: true })} species={species} regions={regions} onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg).not.toHaveTextContent('Photo or recording')
    expect(dlg).not.toHaveTextContent('◦')
    expect(dlg).not.toHaveTextContent('Heard only')
    expect(dlg.querySelector('.eb-card-place')).toBeNull()
    const mass = dlg.querySelector('.eb-card-mass')!
    expect(mass).toHaveTextContent('~4.3 g')
    expect(mass).toHaveAttribute('title', 'Average body mass, estimated from its family')
  })

  it('phone: bottom sheet with aria-modal; Esc closes; focus moves in and returns', () => {
    setWidth(390)
    const onClose = vi.fn()
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { unmount } = render(<BirdCard entry={full} species={species} regions={regions} onClose={onClose} returnFocus={opener} actions={<button>Edit</button>} />)
    const dlg = screen.getByRole('dialog', { name: 'Alpha Crow' })
    expect(dlg).toHaveAttribute('aria-modal', 'true')
    expect(dlg).toHaveAttribute('data-variant', 'sheet')
    expect(dlg.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(2)
    unmount()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('with Scientific names on, the title is the scientific name (Latin) and the common name comes second; the dialog keeps the common name', () => {
    setWidth(1000)
    render(<BirdCard entry={full} species={species} regions={regions} sci onClose={() => {}} />)
    const dlg = screen.getByRole('dialog', { name: 'Alpha Crow' })
    expect(within(dlg).getByRole('heading', { name: /Avis crowa/ })).toHaveAttribute('lang', 'la')
    expect(within(dlg).getByText('Alpha Crow')).toBeInTheDocument()
  })

  it('follow: the popover keeps re-placing itself next to a bird that is still travelling', async () => {
    setWidth(1000)
    vi.stubGlobal('innerHeight', 800)
    let top = 100
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({ left: 400, right: 420, top, bottom: top + 20, width: 20, height: 20, x: 400, y: top, toJSON() {} })
    document.body.append(anchor)
    render(<BirdCard entry={full} species={species} regions={regions} anchor={anchor} follow={1000} onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    const first = dlg.style.top
    top = 300
    await new Promise((r) => setTimeout(r, 80))
    expect(dlg.style.top).not.toBe(first)
    anchor.remove()
  })

  it('popover on wide screens positions inside the viewport near the anchor', () => {
    setWidth(1000)
    vi.stubGlobal('innerHeight', 800)
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({ left: 990, right: 1000, top: 10, bottom: 30, width: 10, height: 20, x: 990, y: 10, toJSON() {} })
    document.body.append(anchor)
    render(<BirdCard entry={full} species={species} regions={regions} anchor={anchor} onClose={() => {}} />)
    const dlg = screen.getByRole('dialog')
    expect(dlg).toHaveAttribute('data-variant', 'popover')
    const left = parseFloat(dlg.style.left)
    expect(left).toBeGreaterThanOrEqual(8)
    expect(left).toBeLessThanOrEqual(1000)
    anchor.remove()
  })
})

describe('ListView', () => {
  const entries = [
    entry('wrenb', { date: '2024-05-01' }),
    entry('crowa', { date: '2022', place: { country: 'CA' } }),
    entry('tinyc'),
    entry('bigge'),
  ]
  const names = () => screen.getAllByRole('listitem').map((li) => within(li).getByText(/^(Alpha|Beta|Gamma|Delta) /).textContent)

  function Harness({ onPick = () => {} }: { onPick?: (c: string) => void }) {
    const [order, setOrder] = useState<'heaviest' | 'lightest'>('heaviest')
    return (
      <>
        <button onClick={() => setOrder(order === 'heaviest' ? 'lightest' : 'heaviest')}>Reverse</button>
        <ListView entries={entries} species={species} regions={regions} order={order} onPick={onPick} />
      </>
    )
  }

  it('list sorts by mass, heaviest or lightest first (the direction lives in the controls bar)', () => {
    render(<Harness />)
    expect(names()).toEqual(['Delta Heavy', 'Alpha Crow', 'Beta Wren', 'Gamma Tiny'])
    fireEvent.click(screen.getByRole('button', { name: 'Reverse' }))
    expect(names()).toEqual(['Gamma Tiny', 'Beta Wren', 'Alpha Crow', 'Delta Heavy'])
  })

  it('rows show mass, place and date, and open the card', () => {
    const onPick = vi.fn()
    render(<Harness onPick={onPick} />)
    const li = screen.getAllByRole('listitem')[1]
    expect(li).toHaveTextContent('400 g')
    expect(li).toHaveTextContent('Canada')
    expect(li).toHaveTextContent('2022')
    fireEvent.click(within(li).getByRole('button'))
    expect(onPick).toHaveBeenCalledWith('crowa', expect.any(HTMLElement))
  })

  it('renders 5,000 rows', () => {
    const many = buildSpeciesIndex(Array.from({ length: 5000 }, (_, i) => row(`s${i}`, `Bird ${i}`, i, i + 1)))
    render(<ListView entries={many.rows.map((r) => entry(r.code))} species={many} regions={regions} order="heaviest" onPick={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(5000)
  })
})

describe('shared CSS', () => {
  const css = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8')
  it('defines .eb-mono, .eb-sr and the corner-shape token globally, and .eb-sil with the Sticker', () => {
    const g = css('src/styles/globals.css')
    expect(g).toMatch(/\.eb-mono\s*\{[^}]*var\(--font-mono\)[^}]*12px[^}]*uppercase/)
    expect(g).toMatch(/\.eb-sr\s*\{[^}]*clip-path/)
    expect(g).toMatch(/--one-if-corner-shape-supported:\s*\.566/)
    expect(g).toMatch(/@supports \(corner-shape: superellipse\(2\)\)\s*\{\s*:root\s*\{\s*--one-if-corner-shape-supported:\s*1/)
    expect(css('src/components/collage/Sticker.css')).toMatch(/\.eb-sil\s*\{/)
    expect(css('src/components/collage/Sticker.tsx')).toContain("import './Sticker.css'")
  })
})

describe('BirdCard focus and Esc', () => {
  const e1 = entry('crowa', { date: '2026-09-30' })
  it('popover focuses a visible, placed dialog on open and returns focus to the anchor on close', () => {
    setWidth(1000)
    vi.stubGlobal('innerHeight', 800)
    const anchor = document.createElement('button')
    anchor.getBoundingClientRect = () => ({ left: 100, right: 120, top: 10, bottom: 30, width: 20, height: 20, x: 100, y: 10, toJSON() {} })
    document.body.append(anchor)
    anchor.focus()
    const seen: { visibility: string; left: string }[] = []
    const orig = HTMLElement.prototype.focus
    HTMLElement.prototype.focus = function (this: HTMLElement, ...a) {
      if (this.getAttribute('role') === 'dialog') seen.push({ visibility: getComputedStyle(this).visibility, left: this.style.left })
      return orig.apply(this, a)
    }
    try {
      const { unmount } = render(<BirdCard entry={e1} species={species} regions={regions} anchor={anchor} onClose={() => {}} />)
      const dlg = screen.getByRole('dialog')
      expect(document.activeElement).toBe(dlg)
      expect(seen).toHaveLength(1)
      expect(seen[0].visibility).not.toBe('hidden')
      expect(seen[0].left).not.toBe('')
      unmount()
      expect(document.activeElement).toBe(anchor)
    } finally {
      HTMLElement.prototype.focus = orig
      anchor.remove()
    }
  })

  it('Esc handled by the card does not reach other document listeners', () => {
    setWidth(1000)
    const onClose = vi.fn()
    const other = vi.fn()
    document.addEventListener('keydown', other)
    render(<BirdCard entry={e1} species={species} regions={regions} onClose={onClose} />)
    fireEvent.keyDown(document.body, { key: 'Escape' })
    document.removeEventListener('keydown', other)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })
})

describe('list estimated mass', () => {
  it('marks estimated masses with ~', () => {
    render(<ListView entries={[entry('tinyc'), entry('crowa')]} species={species} regions={regions} order="heaviest" onPick={() => {}} />)
    const items = screen.getAllByRole('listitem')
    expect(items[1]).toHaveTextContent('~4.3 g')
    expect(items[0]).not.toHaveTextContent('~')
  })
})
