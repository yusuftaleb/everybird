// @vitest-environment jsdom
// scrollQuietly (src/lib/headroom.ts): a scroll the page makes to keep content in place (Compare's families closing
// above the one pressed) leaves the top bar as it is, where the same scroll by the reader would bring it back.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachHeadroom, scrollQuietly } from '@/lib/headroom'

let y = 0
const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
const scrollTo = async (to: number) => { y = to; window.dispatchEvent(new Event('scroll')); await frame() }

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('scrollQuietly', () => {
  it('an upward correction keeps a hidden bar hidden; the reader’s own upward scroll still shows it', async () => {
    Object.defineProperty(window, 'scrollY', { configurable: true, get: () => y })
    window.scrollBy = ((o: ScrollToOptions) => { y += o.top ?? 0; window.dispatchEvent(new Event('scroll')) }) as typeof window.scrollBy
    // jsdom lays nothing out: a page 5,000px tall.
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, get: () => 5000 })
    const bar = document.createElement('header')
    document.body.append(bar)
    const off = attachHeadroom(bar)
    await scrollTo(1000)
    expect(bar.hasAttribute('data-hidden')).toBe(true)
    scrollQuietly(-300)
    await frame()
    expect(y).toBe(700)
    expect(bar.hasAttribute('data-hidden')).toBe(true)
    await scrollTo(600)
    expect(bar.hasAttribute('data-hidden')).toBe(false)
    off()
  })
})
