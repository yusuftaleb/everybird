import { describe, expect, it } from 'vitest'
import { flagSrc } from '@/lib/flag'

describe('flagSrc (flag-icons, served from this origin)', () => {
  it('finds the 4x3 SVG by ISO2 code, any case', () => {
    // (Vitest inlines small assets as data URLs; Next serves them under /_next/static/media.)
    const urls = ['CA', 'eg', 'ZA', 'IN'].map(flagSrc) // IN: a reserved word as a code still works
    for (const u of urls) expect(u).toMatch(/^(data:image\/svg|\/)/)
    expect(new Set(urls).size).toBe(4)
    expect(flagSrc('ca')).toBe(flagSrc('CA'))
  })
  it('is undefined for codes the set lacks and for anything but two letters', () => {
    expect(flagSrc('ZZ')).toBeUndefined()
    for (const bad of ['', 'C', 'CAN', 'C1', '12', 'ÉG', ' CA', 'US-CA', 'gb-eng']) expect(flagSrc(bad)).toBeUndefined()
    expect(flagSrc(undefined)).toBeUndefined()
  })
})
