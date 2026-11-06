import { describe, expect, it } from 'vitest'
import { flagEmoji } from '@/lib/flag'

describe('flagEmoji (ISO2 to regional-indicator flag)', () => {
  it('builds the flag from two regional-indicator letters', () => {
    expect(flagEmoji('CA')).toBe('\u{1F1E8}\u{1F1E6}')
    expect(flagEmoji('EG')).toBe('🇪🇬')
    expect(flagEmoji('GB')).toBe('🇬🇧')
    expect(flagEmoji('ZA')).toBe('🇿🇦')
    expect([...flagEmoji('US')!].map((c) => c.codePointAt(0))).toEqual([0x1f1fa, 0x1f1f8])
  })
  it('takes lower case', () => {
    expect(flagEmoji('tr')).toBe('🇹🇷')
  })
  it('is undefined for anything but two letters A–Z', () => {
    for (const bad of ['', 'C', 'CAN', 'C1', '12', 'É1', 'ÉG', 'X-', ' CA', 'US-CA']) expect(flagEmoji(bad)).toBeUndefined()
    expect(flagEmoji(undefined)).toBeUndefined()
  })
})
