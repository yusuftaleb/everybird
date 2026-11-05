import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadSpecies, loadTaxonomy, resetCaches } from '@/lib/species/load'
import { normalizeSci, resolveName, type TaxonomyIndex } from '@/lib/species/resolve'

const fx = (n: string) => JSON.parse(readFileSync(`tests/fixtures/species/${n}.json`, 'utf8'))
const stubFetch = (files: Record<string, unknown>) => {
  const f = vi.fn(async (url: string) => {
    const body = files[url]
    return { ok: body !== undefined, status: body ? 200 : 404, json: async () => body }
  })
  vi.stubGlobal('fetch', f)
  return f
}

let tax: TaxonomyIndex
beforeEach(async () => {
  resetCaches()
  stubFetch({ '/data/taxonomy.v1.json': fx('taxonomy'), '/data/species.v1.json': fx('species') })
  tax = await loadTaxonomy()
})

describe('normalizeSci', () => {
  it('lower-cases, collapses spaces, drops parenthetical and group text', () => {
    expect(normalizeSci('  Colaptes   Auratus [cafer Group] ')).toBe('colaptes auratus')
    expect(normalizeSci('Anas platyrhynchos (Domestic type)')).toBe('anas platyrhynchos')
  })
})

describe('resolveName', () => {
  it('species sci name resolves', () => {
    expect(resolveName(tax, { sci: 'Colaptes auratus' })).toEqual({ code: 'norfli', via: 'sci' })
    expect(resolveName(tax, { sci: 'colaptes  AURATUS' })).toEqual({ code: 'norfli', via: 'sci' })
  })
  it('subspecies form resolves via reportAs', () => {
    expect(resolveName(tax, { sci: 'Colaptes auratus [cafer Group]' })).toEqual({ code: 'norfli', via: 'sci' })
    expect(resolveName(tax, { sci: 'Setophaga coronata auduboni' })).toEqual({ code: 'yerwar', via: 'sci' })
    expect(resolveName(tax, { sci: 'Colaptes auratus luteus x cafer' })).toEqual({ code: 'norfli', via: 'sci' })
  })
  it('species wins when a form normalizes to the species name', () => {
    expect(tax.bySci.get('colaptes auratus')?.code).toBe('norfli')
    expect(tax.bySci.get('anas platyrhynchos')?.code).toBe('mallar3b')
  })
  it('spuh, slash, hybrid are not-species', () => {
    for (const sci of ['Apteryx sp.', 'Colaptes auratus/chrysoides', 'Colaptes auratus x chrysoides'])
      expect(resolveName(tax, { sci })).toEqual({ code: null, reason: 'not-species' })
  })
  it('English common name resolves when sci is missing', () => {
    expect(resolveName(tax, { com: 'northern flicker' })).toEqual({ code: 'norfli', via: 'com' })
    expect(resolveName(tax, { com: "Ruppell's Griffon" })).toEqual({ code: 'rupgri', via: 'com' })
    expect(resolveName(tax, { sci: 'Nope nope', com: 'Gilded Flicker' })).toEqual({ code: 'gilfli', via: 'com' })
    expect(resolveName(tax, { com: 'Northern Flicker (Red-shafted)' })).toEqual({ code: 'norfli', via: 'com' })
  })
  it('domestic rows are not the wild species, even with reportAs', () => {
    const notSp = { code: null, reason: 'not-species' }
    expect(resolveName(tax, { com: 'Mallard (Domestic type)' })).toEqual(notSp)
    expect(resolveName(tax, { sci: 'Anas platyrhynchos (Domestic type)' })).toEqual(notSp)
    expect(resolveName(tax, { sci: 'Anas platyrhynchos' })).toEqual({ code: 'mallar3b', via: 'sci' })
  })
  it('Feral Pigeon is the one domestic that counts, as Rock Pigeon', () => {
    expect(resolveName(tax, { sci: 'Columba livia (Feral Pigeon)' })).toEqual({ code: 'rocpig', via: 'sci' })
    expect(resolveName(tax, { com: 'Rock Pigeon (Feral Pigeon)' })).toEqual({ code: 'rocpig', via: 'com' })
    expect(resolveName(tax, { sci: 'Columba livia' })).toEqual({ code: 'rocpig', via: 'sci' })
  })
  it('real taxonomy: Feral Pigeon counts, other domestics do not', async () => {
    const { buildTaxonomyIndex } = await import('@/lib/species/load')
    const real = buildTaxonomyIndex(JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')).taxa)
    expect(resolveName(real, { sci: 'Columba livia (Feral Pigeon)' })).toMatchObject({ code: 'rocpig' })
    const dom = real.rows.filter((r) => r.cat === 'domestic' && r.reportAs !== 'rocpig')
    expect(dom.length).toBeGreaterThan(0)
    for (const r of dom) expect(resolveName(real, { sci: r.sci })).toEqual({ code: null, reason: 'not-species' })
  })
  it('curly apostrophes match', () => {
    expect(resolveName(tax, { com: 'Rüppell\u2019s Griffon' })).toEqual({ code: 'rupgri', via: 'com' })
  })
  it('taxonOrder is ignored when names were given and missed', () => {
    const r = resolveName(tax, { sci: 'Unknownus birdus', com: 'Fake Bird', taxonOrder: 34403 })
    expect(r).toMatchObject({ code: null, reason: 'no-match' })
  })
  it('falls back to taxonOrder', () => {
    expect(resolveName(tax, { taxonOrder: 34403 })).toEqual({ code: 'yerwar', via: 'taxonOrder' })
  })
  it('unknown gives no-match with a Levenshtein suggestion', () => {
    expect(resolveName(tax, { sci: 'Colaptes auratuss' })).toEqual({ code: null, reason: 'no-match', suggestion: 'norfli' })
    expect(resolveName(tax, { com: 'Norther Flickr' })).toEqual({ code: null, reason: 'no-match', suggestion: 'norfli' })
    expect(resolveName(tax, { sci: 'Zzzz qqqq' })).toEqual({ code: null, reason: 'no-match' })
  })
})

describe('loading', () => {
  it('caches the fetch promise', async () => {
    const f = stubFetch({ '/data/species.v1.json': fx('species') })
    const [a, b] = [await loadSpecies(), await loadSpecies()]
    expect(a).toBe(b)
    expect(f).toHaveBeenCalledTimes(1)
  })
  it('rejects on HTTP error and allows retry', async () => {
    stubFetch({})
    await expect(loadSpecies()).rejects.toThrow()
    stubFetch({ '/data/species.v1.json': fx('species') })
    expect((await loadSpecies()).rows).toHaveLength(5)
  })
})

describe('search', () => {
  it("search('flick') returns Northern Flicker first", async () => {
    const sp = await loadSpecies()
    const r = sp.search('flick').map((x) => x.code)
    expect(r.slice(0, 3)).toEqual(['norfli', 'gilfli', 'flicker'])
  })
  it('ignores accents, matches sci words, ranks exact first, respects limit', async () => {
    const sp = await loadSpecies()
    expect(sp.search('ruppell')[0].code).toBe('rupgri')
    expect(sp.search('gyps rue')[0].code).toBe('rupgri')
    expect(sp.search('coronata')[0].code).toBe('yerwar')
    expect(sp.search('yellow rump')[0].code).toBe('yerwar')
    expect(sp.search('Gilded Flicker')[0].code).toBe('gilfli')
    expect(sp.search('flick', 1)).toHaveLength(1)
    expect(sp.search('  ')).toEqual([])
    expect(sp.byCode.get('norfli')?.com).toBe('Northern Flicker')
  })
})

describe('real taxonomy guard', () => {
  it('resolves real forms', async () => {
    resetCaches()
    stubFetch({ '/data/taxonomy.v1.json': JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) })
    const real = await loadTaxonomy()
    expect(resolveName(real, { sci: 'Colaptes auratus [cafer Group]' })).toEqual({ code: 'norfli', via: 'sci' })
    expect(resolveName(real, { sci: 'Setophaga coronata auduboni' })).toEqual({ code: 'yerwar', via: 'sci' })
    expect(resolveName(real, { sci: 'Colaptes auratus chrysocaulosus' })).toEqual({ code: 'norfli', via: 'sci' })
    expect(resolveName(real, { com: 'Yellow-rumped Warbler (Audubon\'s)' })).toEqual({ code: 'yerwar', via: 'com' })
    expect(resolveName(real, { com: 'Mallard (Domestic type)' })).toEqual({ code: null, reason: 'not-species' })
    expect(resolveName(real, { sci: 'Anas platyrhynchos (Domestic type)' })).toEqual({ code: null, reason: 'not-species' })
    expect(resolveName(real, { sci: 'Anas platyrhynchos' })).toEqual({ code: 'mallar3', via: 'sci' })
    expect(resolveName(real, { sci: 'Apteryx sp.' })).toEqual({ code: null, reason: 'not-species' })
  })
  it('real search puts Northern Flicker first', async () => {
    resetCaches()
    stubFetch({ '/data/species.v1.json': JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) })
    const sp = await loadSpecies()
    expect(sp.search('flick')[0].code).toBe('norfli')
  })
})
