import { describe, expect, it } from 'vitest'
import { updateLinkIndex } from '../scripts/build-data/link-index'

describe('link index', () => {
  it('updateLinkIndex appends new codes', () => {
    expect(updateLinkIndex(['a', 'b'], ['a', 'c', 'b'])).toEqual(['a', 'b', 'c'])
    expect(updateLinkIndex([], ['x', 'y'])).toEqual(['x', 'y'])
  })
  it('updateLinkIndex throws when an existing code is removed or reordered', () => {
    expect(() => updateLinkIndex(['a', 'b'], ['a'])).toThrow()
    expect(() => updateLinkIndex(['a', 'a2'], ['a', 'b'])).toThrow()
  })
})
