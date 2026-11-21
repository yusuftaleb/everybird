// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AboutPage from '../app/[lang]/(app)/about/page'
import { AVILIST, IUCN_SOURCE } from '@/lib/species/iucn'

vi.mock('@/components/about/HowItWorksDemo', () => ({ HowItWorksDemo: () => null }))
vi.mock('@/components/app/IntentLink', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))

afterEach(cleanup)

describe('About: conservation status', () => {
  it('names conservation status among the filters', async () => {
    render(await AboutPage({ params: Promise.resolve({ lang: 'en' }) }))
    expect(screen.getByText(/Filter it by group, place, year or conservation status/)).toBeInTheDocument()
  })

  it('has a Conservation status note after True size: source, version, global not regional', async () => {
    render(await AboutPage({ params: Promise.resolve({ lang: 'en' }) }))
    const h = screen.getByRole('heading', { level: 2, name: 'Conservation status' })
    const section = h.closest('section')!
    expect(section).toHaveAttribute('aria-labelledby', 'eb-status-h')
    expect(h.id).toBe('eb-status-h')
    // Beside True size (one pair: side by side from 1024px)
    expect(section.previousElementSibling).toHaveAttribute('aria-labelledby', 'eb-size-h')
    expect(section.parentElement).toHaveClass('eb-about-cols')
    expect(section.textContent).toContain(
      `Each species' status is its global IUCN Red List category, from ${IUCN_SOURCE}. It is global, not regional: a bird common where you live can still be threatened worldwide, and the other way round. Species without a category show none.`,
    )
    expect(screen.getByText(/global, not regional/)).toBeInTheDocument()
  })

  it('credits AviList for the Red List categories after AVONET', async () => {
    render(await AboutPage({ params: Promise.resolve({ lang: 'en' }) }))
    expect(screen.getByRole('link', { name: 'AviList' })).toHaveAttribute('href', 'https://doi.org/10.2173/avilist.v2026')
    expect(screen.getByText('Red List categories · CC BY 4.0')).toBeInTheDocument()
    const credit = screen.getByText('Red List categories · CC BY 4.0').closest('li')!
    expect(credit.textContent).toContain(
      "IUCN Red List categories as given for BirdLife v10 in AviList: The Global Avian Checklist, v2026 (AviList Core Team, 2026), via huashu's species table, licensed CC BY 4.0. Everybird matched them to eBird species.",
    )
    expect(within(credit).getByRole('link', { name: 'CC BY 4.0' })).toHaveAttribute('href', 'https://creativecommons.org/licenses/by/4.0/')
    // Body masses: AVONET, then BIRDBASE (the credit for the species AVONET gives no mass), then the Red List
    const birdbase = credit.previousElementSibling!
    expect(within(birdbase as HTMLElement).getByRole('link', { name: 'BIRDBASE' })).toHaveAttribute('href', 'https://doi.org/10.1038/s41597-025-05615-3')
    expect(birdbase.textContent).toContain('BIRDBASE')
    expect(birdbase.previousElementSibling!.textContent).toContain('AVONET')
  })

  it('names the sources the sticker sizes come from: AVONET, and BIRDBASE where AVONET has none', async () => {
    render(await AboutPage({ params: Promise.resolve({ lang: 'en' }) }))
    expect(screen.getByText(/from AVONET \(or BIRDBASE where AVONET has none\)/)).toBeInTheDocument()
  })

  it('reads its version text and DOI from AVILIST, as IUCN_SOURCE does', () => {
    expect(IUCN_SOURCE).toBe(`BirdLife ${AVILIST.birdlife} via AviList ${AVILIST.version}`)
    expect(AVILIST.doi).toBe(`https://doi.org/10.2173/avilist.${AVILIST.version}`)
    expect(AVILIST.version).toBe(`v${AVILIST.year}`)
  })
})
