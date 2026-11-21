import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseVariants, readVariant, rememberVariants, variantsEnabled } from '@/lib/variants'

describe('parseVariants', () => {
  it('reads one letter for every feature', () => {
    expect(parseVariants('?v=b')).toEqual({ '*': 'b' })
  })
  it('reads a letter per feature', () => {
    expect(parseVariants('?v=stamp:b,pill:c')).toEqual({ stamp: 'b', pill: 'c' })
  })
  it('mixes both', () => {
    expect(parseVariants('?v=b,pill:c')).toEqual({ '*': 'b', pill: 'c' })
  })
  it('takes letters a–z only and ignores anything else', () => {
    expect(parseVariants('?v=B,stamp:1,pill:cc,x:,:d,dock:e')).toEqual({ dock: 'e' })
    expect(parseVariants('')).toEqual({})
    expect(parseVariants('?w=b')).toEqual({})
  })
})

describe('readVariant', () => {
  const opts = ['a', 'b'] as const
  it('takes the letter for every feature', () => {
    expect(readVariant('stamp', opts, '?v=b')).toBe('b')
  })
  it('takes the feature’s own letter', () => {
    expect(readVariant('stamp', opts, '?v=stamp:b,pill:c')).toBe('b')
  })
  it('lets the feature’s own key win over *', () => {
    expect(readVariant('stamp', opts, '?v=b,stamp:a')).toBe('a')
  })
  it('falls back to the first option for another feature or an unknown letter', () => {
    expect(readVariant('stamp', opts, '?v=pill:c')).toBe('a')
    expect(readVariant('stamp', opts, '?v=z')).toBe('a')
    expect(readVariant('stamp', opts, '')).toBe('a')
  })
})

describe('variantsEnabled', () => {
  it('is off on the production domain', () => {
    expect(variantsEnabled('everybird.yusuftaleb.com')).toBe(false)
  })
  it('is on for previews and local servers', () => {
    expect(variantsEnabled('everybird-git-feat-x.vercel.app')).toBe(true)
    expect(variantsEnabled('127.0.0.1')).toBe(true)
  })
})

describe('readVariant from the address', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
  const opts = ['a', 'b'] as const
  function at(search: string, host = '127.0.0.1:3100') {
    vi.stubGlobal('location', { search, host })
  }
  it('remembers ?v for the tab, so it survives in-app navigation, and ?v= clears it', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    })
    at('?v=stamp:b')
    expect(readVariant('stamp', opts)).toBe('b')
    expect(store.size).toBe(0) // reading never writes
    rememberVariants()
    expect(store.get('everybird:variants')).toBe('stamp:b')
    at('')
    rememberVariants() // no v: the remembered one stays
    expect(readVariant('stamp', opts)).toBe('b')
    at('?v=')
    expect(readVariant('stamp', opts)).toBe('a')
    rememberVariants()
    at('')
    expect(readVariant('stamp', opts)).toBe('a')
    expect(store.size).toBe(0)
  })
  it('still reads the address when storage throws', () => {
    vi.stubGlobal('sessionStorage', { getItem: () => { throw new Error('no') }, setItem: () => { throw new Error('no') }, removeItem: () => { throw new Error('no') } })
    at('?v=b')
    expect(() => rememberVariants()).not.toThrow()
    expect(readVariant('stamp', opts)).toBe('b')
    at('')
    expect(readVariant('stamp', opts)).toBe('a')
  })
  it('is always the first option on the production domain or a production build, and remembers nothing there', () => {
    const setItem = vi.fn()
    vi.stubGlobal('sessionStorage', { getItem: () => 'b', setItem, removeItem: vi.fn() })
    at('?v=b', 'everybird.yusuftaleb.com')
    rememberVariants()
    expect(setItem).not.toHaveBeenCalled()
    expect(readVariant('stamp', opts)).toBe('a')
    expect(readVariant('stamp', opts, '?v=b')).toBe('a')
    vi.stubEnv('NEXT_PUBLIC_VERCEL_ENV', 'production')
    expect(variantsEnabled('everybird-git-feat-x.vercel.app')).toBe(false)
  })
})
