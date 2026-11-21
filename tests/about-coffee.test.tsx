// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AboutPage from '../app/[lang]/(app)/about/page'

vi.mock('@/components/about/HowItWorksDemo', () => ({ HowItWorksDemo: () => null }))
vi.mock('@/components/app/IntentLink', () => ({ default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a> }))
vi.mock('@/components/app/PageHead', () => ({ PageHead: ({ title }: { title: string }) => <h1>{title}</h1> }))

afterEach(cleanup)

describe('About: Buy me a coffee', () => {
  it("is Buy Me a Coffee's static button, self-hosted, in the credits, opening their page in a new tab", async () => {
    render(await AboutPage({ params: Promise.resolve({ lang: 'en' }) }))
    const credits = document.getElementById('credits')!
    const link = within(credits).getByRole('link', { name: 'Buy me a coffee' })
    expect(link).toHaveAttribute('href', 'https://buymeacoffee.com/yusuftaleb')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const img = within(link).getByRole('img', { name: 'Buy me a coffee' })
    expect(img.getAttribute('src')).toBe('/buy-me-a-coffee.png') // this origin: nothing loads from a third party
    expect(Number(img.getAttribute('height'))).toBe(40)
    expect(Number(img.getAttribute('width'))).toBe(143) // 545 × 153 at 40px tall
    // At the right of the one paragraph that says who made Everybird and asks for the coffee
    const p = link.previousElementSibling!
    expect(p.textContent).toBe("Made by Yusuf Taleb. It grew out of the life list on his site, and is built from other people's generous work. If you enjoy Everybird, you can buy Yusuf a coffee.")
    expect(link.parentElement).toHaveClass('eb-coffee')
    // The thank-you after it, in plain words, no names
    expect(link.parentElement!.nextElementSibling!.textContent).toBe('Thank you to everyone who encouraged the idea, tested early versions and sent feedback along the way. Everybird is better for it.')
    // The text link it replaces is gone from About (the footer keeps its own).
    expect(screen.queryByRole('link', { name: 'buy Yusuf a coffee' })).toBeNull()
  })
})
