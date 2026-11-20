import { describe, expect, it } from 'vitest'
import { albumSlug, albumUrl } from '@/lib/bird-album'

describe('albumSlug', () => {
  it('follows Bird Album’s rule', () => {
    expect(albumSlug("Rüppell's Vulture")).toBe('ruppells-vulture')
    expect(albumSlug("Des Murs's Wiretail")).toBe('des-murss-wiretail')
    expect(albumSlug('Blue-capped Cordon-bleu')).toBe('blue-capped-cordon-bleu')
    expect(albumSlug('St. Lucia Oriole')).toBe('st-lucia-oriole')
  })
  it('prefixes the languages Bird Album serves', () => {
    expect(albumUrl('nene', 'en')).toBe('https://birdalbum.com/birds/nene/')
    expect(albumUrl('nene', 'pt')).toBe('https://birdalbum.com/pt-br/birds/nene/')
    expect(albumUrl('nene', 'pl')).toBe('https://birdalbum.com/birds/nene/')
  })
})
