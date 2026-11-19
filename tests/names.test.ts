import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ListEntry } from '@/lib/list/model'
import { displayName, englishNames, familyName, nameOfCode, namesVersion, pickNameLocale, setEnglishNames, setNames, topCountry, type NameSet } from '@/lib/species/names'

class MemoryStorage {
  private m = new Map<string, string>()
  getItem(k: string) { return this.m.get(k) ?? null }
  setItem(k: string, v: string) { this.m.set(k, String(v)) }
  removeItem(k: string) { this.m.delete(k) }
}

describe('pickNameLocale', () => {
  it('takes the browser region when it maps to a set of the UI language', () => {
    expect(pickNameLocale('es', ['es-MX'])).toBe('es_MX')
    expect(pickNameLocale('es', ['es-ES'], 'AR')).toBe('es') // the browser's region wins over the list's country
    expect(pickNameLocale('pt', ['pt-BR'], 'PT')).toBe('pt_BR')
    expect(pickNameLocale('pt', ['pt-PT'])).toBe('pt_PT')
  })
  it("else the list's top country, else the base", () => {
    expect(pickNameLocale('es', ['es-US'], 'AR')).toBe('es_AR')
    expect(pickNameLocale('es', ['es-CO'])).toBe('es')
    expect(pickNameLocale('pt', ['pt'], 'PT')).toBe('pt_PT')
    expect(pickNameLocale('pt', ['pt'])).toBe('pt_BR')
  })
  it('nl is always nl and English has no file', () => {
    expect(pickNameLocale('nl', ['nl-BE'], 'NL')).toBe('nl')
    expect(pickNameLocale('nl', ['nl-NL'], 'BR')).toBe('nl')
    expect(pickNameLocale('en', ['en-GB'])).toBeNull()
  })
  it('a region of another language family is never accepted (a Spanish UI with Brazil is es, not pt)', () => {
    expect(pickNameLocale('es', ['es-US'], 'BR')).toBe('es')
    expect(pickNameLocale('es', ['es-BR'])).toBe('es')
    expect(pickNameLocale('es', ['es-US'], 'PT')).toBe('es')
    expect(pickNameLocale('pt', ['pt-PT'], 'MX')).toBe('pt_PT')
    expect(pickNameLocale('pt', ['pt'], 'MX')).toBe('pt_BR')
    expect(pickNameLocale('pt', ['pt'], 'NL')).toBe('pt_BR')
  })
  it('French: France (and Belgium, Switzerland, a bare fr) get fr_FR, Canada gets eBird\'s North American fr', () => {
    expect(pickNameLocale('fr', ['fr-FR'])).toBe('fr_FR')
    expect(pickNameLocale('fr', ['fr-CA'])).toBe('fr')
    expect(pickNameLocale('fr', ['fr-BE'])).toBe('fr_FR')
    expect(pickNameLocale('fr', ['fr-CH'])).toBe('fr_FR')
    expect(pickNameLocale('fr', ['fr'])).toBe('fr_FR')
    expect(pickNameLocale('fr', ['fr'], 'CA')).toBe('fr')
    expect(pickNameLocale('fr', ['fr'], 'BR')).toBe('fr_FR')
  })
  it('reads the first browser tag in the UI language', () => {
    expect(pickNameLocale('es', ['en-US', 'es-MX', 'es-ES'])).toBe('es_MX')
  })
})

describe('topCountry', () => {
  const e = (code: string, country?: string): ListEntry => ({ code, place: country ? { country } : undefined, heard: false, dead: false, media: false, sources: [] })
  it('is the country with the most species, ties alphabetical, none without places', () => {
    expect(topCountry([e('a', 'CA'), e('b', 'US'), e('c', 'US')])).toBe('US')
    expect(topCountry([e('a', 'US'), e('b', 'CA')])).toBe('CA')
    expect(topCountry([e('a'), e('b')])).toBeUndefined()
    expect(topCountry([])).toBeUndefined()
  })
})

describe('displayName and familyName', () => {
  const set: NameSet = { v: 1, locale: 'es', taxonomy: 't', names: { amerob: 'Zorzal americano' }, fam: { Turdidae: 'Túrdidos' } }
  const rob = { code: 'amerob', com: 'American Robin' }
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    setEnglishNames(false)
  })
  afterEach(() => {
    setNames(null)
    setEnglishNames(false)
    vi.unstubAllGlobals()
  })

  it('is English with no set, the local name with one, English for a code the set lacks', () => {
    expect(displayName(rob)).toBe('American Robin')
    setNames(set)
    expect(displayName(rob)).toBe('Zorzal americano')
    expect(displayName({ code: 'newbrd', com: 'New Bird' })).toBe('New Bird')
    expect(familyName({ fam: 'Turdidae', famCom: 'Thrushes' })).toBe('Túrdidos')
    expect(familyName({ fam: 'Corvidae', famCom: 'Crows' })).toBe('Crows')
    expect(nameOfCode(new Map([['amerob', rob]]), 'amerob')).toBe('Zorzal americano')
    expect(nameOfCode(new Map(), 'zzz')).toBe('zzz')
  })
  it('the English switch shows English everywhere, is stored under everybird:en-names and bumps the version', () => {
    setNames(set)
    const v = namesVersion()
    setEnglishNames(true)
    expect(englishNames()).toBe(true)
    expect(localStorage.getItem('everybird:en-names')).toBe('1')
    expect(displayName(rob)).toBe('American Robin')
    expect(familyName({ fam: 'Turdidae', famCom: 'Thrushes' })).toBe('Thrushes')
    expect(namesVersion()).toBeGreaterThan(v)
    setEnglishNames(false)
    expect(displayName(rob)).toBe('Zorzal americano')
  })
})

describe('the names files', () => {
  const file = (l: string) => JSON.parse(readFileSync(join(process.cwd(), 'public/data', `names.${l}.v1.json`), 'utf8')) as NameSet
  it('a partial regional set carries the base name, never English: es_AR amerob is the es name', () => {
    const ar = file('es_AR'), es = file('es')
    expect(es.names.amerob).toBeTruthy()
    expect(ar.names.amerob).toBe(es.names.amerob)
    expect(ar.names.amerob).not.toBe('American Robin')
  })
})
