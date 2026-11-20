import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { es } from '@/i18n/messages/es'
import { nl } from '@/i18n/messages/nl'
import { pt } from '@/i18n/messages/pt'
import { pageTitle, titleFromOldName } from '@/lib/list/title'

describe('pageTitle', () => {
  it('the saved title verbatim, in every language', () => {
    for (const t of [en.ui, es.ui, pt.ui, nl.ui]) expect(pageTitle('  Birds of Kenya ', t)).toBe('Birds of Kenya')
  })
  it('without one, the language\'s "My birds"', () => {
    expect(pageTitle(undefined, en.ui)).toBe('My birds')
    expect(pageTitle('', es.ui)).toBe('Mis aves')
    expect(pageTitle('   ', pt.ui)).toBe('Minhas aves')
    expect(pageTitle(undefined, nl.ui)).toBe('Mijn vogels')
  })
  it("the migration's output stays English (stored data)", () => {
    expect(titleFromOldName('Ada')).toBe("Ada's birds")
  })
})
