import { describe, expect, it } from 'vitest'
import { searchable } from '@/components/import/SpeciesSearch'

describe('searchable (H19): the match report search starts at two characters, or one Han or kana character', () => {
  it('takes 鹰, 鹤 and カ alone, never a single Latin letter', () => {
    expect(searchable('鹰')).toBe(true)
    expect(searchable(' 鹤 ')).toBe(true)
    expect(searchable('カ')).toBe(true)
    expect(searchable('a')).toBe(false)
    expect(searchable('ab')).toBe(true)
    expect(searchable('')).toBe(false)
  })
})
