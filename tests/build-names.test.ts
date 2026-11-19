import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { capFirst, familyNames, mergeChain, normalizeName, usableGroupName, writeNames } from '../scripts/build-data/build-names'
import { assertSameSpeciesCodes, fetchBytes, fetchNamesOnly, pinnedTaxonomy, taxonomyFlag, taxonomyUrl } from '../scripts/build-data/fetch-sources'
import { familyLang, NAME_BASE, NAME_LOCALES, REGION_LOCALE } from '../src/lib/species/name-locales'
import type { SpeciesFile } from '../src/lib/species/types'

const english = new Map([['amerob', 'American Robin'], ['kea', 'Kea']])
const es = new Map([['amerob', 'Zorzal americano'], ['kea', 'Kea']])
const read = (name: string) => readFileSync(new URL(`../public/data/${name}`, import.meta.url), 'utf8')

describe('names fallback chains', () => {
  it('a partial regional set falls back to the base, not English', () => {
    expect(mergeChain(english, [new Map([['amerob', 'American Robin']]), es])).toEqual({ amerob: 'Zorzal americano' })
  })

  it('a regional name wins where it is real', () => {
    expect(mergeChain(english, [new Map([['amerob', 'Zorzal regional']]), es])).toEqual({ amerob: 'Zorzal regional' })
  })

  it('a name equal to English is left out, as are blank names and unknown codes', () => {
    expect(mergeChain(english, [new Map([['kea', 'Kea'], ['amerob', ' '], ['extra', 'Otro']])])).toEqual({})
  })

  it('an English name in another case is not a translation: it falls through to the base, else English', () => {
    const en = new Map([['soucas1', 'Southern Cassowary'], ['amerob', 'American Robin']])
    const ptBR = new Map([['soucas1', capFirst('southern cassowary')], ['amerob', 'Tordo-americano']])
    expect(mergeChain(en, [ptBR])).toEqual({ amerob: 'Tordo-americano' })
    const ptPT = new Map([['soucas1', 'southern cassowary'], ['amerob', 'american robin']])
    expect(mergeChain(en, [ptPT, ptBR])).toEqual({ amerob: 'Tordo-americano' })
  })

  it('names are normalised: NFC, NBSP and runs of spaces to one space, trimmed', () => {
    expect(normalizeName('  Cari\u0301\u00a0de  monte ')).toBe('Carí de monte')
    expect(mergeChain(new Map([['a', 'A bird']]), [new Map([['a', 'Ave\u00a0local ']])])).toEqual({ a: 'Ave local' })
    expect(mergeChain(new Map([['a', 'A bird']]), [new Map([['a', 'a\u00a0BIRD']])])).toEqual({})
  })

  it('pt_PT falls back to pt_BR', () => {
    expect(NAME_BASE.pt_PT).toBe('pt_BR')
    expect(mergeChain(english, [new Map([['amerob', 'American Robin']]), new Map([['amerob', 'Tordo-americano']])])).toEqual({ amerob: 'Tordo-americano' })
  })

  it('names in every locale start with a capital and keep the rest verbatim', () => {
    expect(capFirst('tordo-americano')).toBe('Tordo-americano')
    expect(capFirst('sabiá-laranjeira')).toBe('Sabiá-laranjeira')
    expect(capFirst('águia-d’África')).toBe('Águia-d’África')
    expect(capFirst('pardela de Hawaii')).toBe('Pardela de Hawaii')
    expect(capFirst('enopsaris Nuca Blanca')).toBe('Enopsaris Nuca Blanca')
    expect(capFirst('IJsvogel')).toBe('IJsvogel')
    expect(capFirst('')).toBe('')
  })

  it('family names: hand file, then exact group, else English', () => {
    const species = [
      { fam: 'Aidae', famCom: 'First birds' }, { fam: 'Bidae', famCom: 'Second birds' },
      { fam: 'Cidae', famCom: 'Third birds' }, { fam: 'Didae', famCom: 'Fourth birds' },
    ]
    expect(familyNames([
      { englishName: 'First birds', groupName: 'Grupo uno' },
      { englishName: 'Second birds', groupName: 'Grupo dos' },
      { englishName: 'Third birds and others', groupName: 'Grupo tres' },
      { englishName: 'Fourth birds', groupName: 'Fourth birds' },
    ], species, { Aidae: 'Manual' })).toEqual({ Aidae: 'Manual', Bidae: 'Grupo dos' })
  })

  it('never takes a scientific name or a bracketed group from eBird: the hand file must supply it', () => {
    expect(usableGroupName('Leptosomidae', 'Leptosomidae')).toBe(false)
    expect(usableGroupName('Gorriones y otros Passerellidae', 'Passerellidae')).toBe(false)
    expect(usableGroupName('Papa-moscas-africanos (Hyliota)', 'Hyliotidae')).toBe(false)
    expect(usableGroupName('Martines pescadores', 'Alcedinidae')).toBe(true)
    const species = [{ fam: 'Leptosomidae', famCom: 'Cuckoo-roller' }, { fam: 'Hyliotidae', famCom: 'Hyliotas' }, { fam: 'Aidae', famCom: 'A birds' }]
    const groups = [
      { englishName: 'Cuckoo-roller', groupName: 'Leptosomidae' },
      { englishName: 'Hyliotas', groupName: 'Papa-moscas-africanos (Hyliota)' },
      { englishName: 'A birds', groupName: 'Aves A' },
    ]
    expect(familyNames(groups, species, {})).toEqual({ Aidae: 'Aves A' })
    expect(familyNames(groups, species, { Leptosomidae: 'Curóis', Hyliotidae: 'Hiliotas' })).toEqual({ Aidae: 'Aves A', Hyliotidae: 'Hiliotas', Leptosomidae: 'Curóis' })
  })

  it('keeps an explicit hand translation even when it is a cognate of English', () => {
    expect(familyNames([], [{ fam: 'Testidae', famCom: 'Kiwis' }], { Testidae: 'Kiwis' })).toEqual({ Testidae: 'Kiwis' })
  })

  it('sorts name and family keys deterministically', () => {
    expect(Object.keys(mergeChain(new Map([['z', 'Z'], ['a', 'A']]), [new Map([['z', 'Zeta'], ['a', 'Alfa']])]))).toEqual(['a', 'z'])
    expect(Object.keys(familyNames([], [{ fam: 'Z', famCom: 'Z' }, { fam: 'A', famCom: 'A' }], { Z: 'Zeta', A: 'Alfa' }))).toEqual(['A', 'Z'])
  })
})

describe('name locales and pinned source data', () => {
  it('includes every planned locale and maps regions and family languages', () => {
    expect(NAME_LOCALES).toEqual(['es', 'es_MX', 'es_EC', 'es_PY', 'es_UY', 'es_BO', 'es_PE', 'es_CR', 'es_VE', 'es_AR', 'es_PA', 'es_HN', 'es_CL', 'es_CU', 'es_PR', 'es_DO', 'pt_BR', 'pt_PT', 'nl', 'pl'])
    expect(REGION_LOCALE).toMatchObject({ ES: 'es', MX: 'es_MX', PT: 'pt_PT', BR: 'pt_BR', NL: 'nl', BE: 'nl', PL: 'pl' })
    for (const l of NAME_LOCALES) {
      expect(NAME_BASE[l]).toBe(l.startsWith('es') ? 'es' : l.startsWith('pt') ? 'pt_BR' : l)
      expect(familyLang(l)).toBe(l.startsWith('es') ? 'es' : l.startsWith('pt') ? 'pt' : l)
    }
  })

  it('pins taxonomy requests and fetches Dutch as nl_NL', () => {
    const url = new URL(taxonomyUrl('2026', 'nl'))
    expect(url.origin).toBe('https://api.ebird.org')
    expect(Object.fromEntries(url.searchParams)).toEqual({ fmt: 'json', cat: 'species', locale: 'nl_NL', version: '2026' })
    expect(new URL(taxonomyUrl('2025', 'es_AR')).searchParams.get('version')).toBe('2025')
  })

  it('pins the taxonomy year: --taxonomy, then species.v1.json, then the raw manifest; latest only on request', async () => {
    const root = mkdtempSync(join(tmpdir(), 'everybird-pin-'))
    try {
      mkdirSync(join(root, 'public/data'), { recursive: true })
      mkdirSync(join(root, 'data/raw'), { recursive: true })
      const noFetch = (() => { throw new Error('no network') }) as unknown as typeof fetch
      await expect(pinnedTaxonomy(undefined, root, noFetch)).rejects.toThrow(/--taxonomy/)
      writeFileSync(join(root, 'data/raw/manifest.json'), JSON.stringify({ ebirdTaxonomy: '2025' }))
      expect(await pinnedTaxonomy(undefined, root, noFetch)).toBe('2025')
      writeFileSync(join(root, 'public/data/species.v1.json'), JSON.stringify({ ebirdTaxonomy: '2026' }))
      expect(await pinnedTaxonomy(undefined, root, noFetch)).toBe('2026')
      expect(await pinnedTaxonomy('2027', root, noFetch)).toBe('2027')
      const latest = (async () => new Response(JSON.stringify([{ authorityVer: 2026, latest: false }, { authorityVer: 2027, latest: true }]))) as unknown as typeof fetch
      expect(await pinnedTaxonomy('latest', root, latest)).toBe('2027')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
    expect(taxonomyFlag(['x', '--names-only'])).toBeUndefined()
    expect(taxonomyFlag(['--taxonomy', '2027'])).toBe('2027')
    expect(taxonomyFlag(['--taxonomy', 'latest'])).toBe('latest')
    expect(() => taxonomyFlag(['--taxonomy'])).toThrow(/YYYY/)
    expect(() => taxonomyFlag(['--taxonomy', '27'])).toThrow(/YYYY/)
    expect(() => taxonomyFlag(['--names-only', '--taxonomy=2025'])).toThrow(/--taxonomy=2025.*space/)
  })

  it('refuses a locale whose species codes differ from English, including duplicates', () => {
    const en = [{ speciesCode: 'a', category: 'species' }, { speciesCode: 'b', category: 'species' }, { speciesCode: 'form', category: 'issf' }]
    expect(() => assertSameSpeciesCodes(en, en.slice(0, 2), 'es')).not.toThrow()
    expect(() => assertSameSpeciesCodes(en, [{ speciesCode: 'a' }, { speciesCode: 'c' }], 'es')).toThrow(/es.*species codes/i)
    expect(() => assertSameSpeciesCodes(en, [{ speciesCode: 'a' }, { speciesCode: 'b' }, { speciesCode: 'b' }], 'nl')).toThrow(/nl.*species codes/i)
  })
})

describe('fetching names sources', () => {
  const json = (value: unknown) => new Response(JSON.stringify(value))
  const english = [{ speciesCode: 'a', comName: 'A bird', category: 'species' }, { speciesCode: 'x', comName: 'X', category: 'issf' }]
  /** A stand-in for api.ebird.org: every taxonomy and group request, with `fail` answering 503. */
  const ebird = (fail?: (url: URL) => boolean, calls: string[] = []) => (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    calls.push(url.href)
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    if (fail?.(url)) return new Response('busy', { status: 503 })
    if (url.pathname.includes('sppgroup')) return json([{ groupOrder: 1, groupName: 'Group' }])
    const locale = url.searchParams.get('locale')
    return json(locale ? [{ speciesCode: 'a', comName: `A ${locale}`, category: 'species' }] : english)
  }) as typeof fetch
  const noSleep = async () => {}
  let root: string
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'everybird-fetch-'))
    mkdirSync(join(root, 'public/data'), { recursive: true })
    mkdirSync(join(root, 'data/raw'), { recursive: true })
    writeFileSync(join(root, 'public/data/species.v1.json'), JSON.stringify({ ebirdTaxonomy: '2026' }))
    writeFileSync(join(root, 'data/raw/manifest.json'), JSON.stringify({ ebirdTaxonomy: '2026', sources: [{ name: 'kept' }] }))
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('retries a failed request three times with backoff, then gives up naming the URL', async () => {
    const delays: number[] = []
    let n = 0
    const flaky = (async () => (++n < 3 ? new Response('', { status: 500 }) : new Response('ok'))) as unknown as typeof fetch
    expect((await fetchBytes('https://example.test/a', { fetch: flaky, sleep: async (ms) => { delays.push(ms) } })).toString()).toBe('ok')
    expect(delays).toEqual([1000, 2000])
    const down = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(fetchBytes('https://example.test/b', { fetch: down, sleep: noSleep })).rejects.toThrow(/example\.test\/b -> offline \(after 3 tries\)/)
  })

  it('--names-only writes the taxonomy, 20 name sets, 5 group sets and the manifest', async () => {
    const calls: string[] = []
    expect(await fetchNamesOnly(root, ['--names-only'], { fetch: ebird(undefined, calls), sleep: noSleep })).toBe('2026')
    expect(calls).toHaveLength(1 + NAME_LOCALES.length + 5)
    for (const l of NAME_LOCALES) expect(existsSync(join(root, `data/raw/ebird-taxonomy.${l}.json`))).toBe(true)
    const manifest = JSON.parse(readFileSync(join(root, 'data/raw/manifest.json'), 'utf8'))
    expect(manifest.sources.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['kept', 'ebird-taxonomy', 'ebird-taxonomy.es_AR', 'ebird-groups.nl']))
  })

  it('a failure on one locale writes nothing, not even the English taxonomy or the manifest', async () => {
    const before = readFileSync(join(root, 'data/raw/manifest.json'), 'utf8')
    await expect(fetchNamesOnly(root, ['--names-only'], { fetch: ebird((u) => u.searchParams.get('locale') === 'es_AR'), sleep: noSleep })).rejects.toThrow(/es_AR.*503/)
    expect(readFileSync(join(root, 'data/raw/manifest.json'), 'utf8')).toBe(before)
    expect(existsSync(join(root, 'data/raw/ebird-taxonomy.json'))).toBe(false)
    expect(existsSync(join(root, 'data/raw/ebird-taxonomy.es.json'))).toBe(false)
  })

  it('a locale with other species codes writes nothing either', async () => {
    const wrong = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      return url.searchParams.get('locale') === 'nl_NL' ? json([{ speciesCode: 'b', comName: 'B' }]) : ebird()(input, init)
    }) as typeof fetch
    await expect(fetchNamesOnly(root, ['--names-only'], { fetch: wrong, sleep: noSleep })).rejects.toThrow(/nl.*species codes/)
    expect(existsSync(join(root, 'data/raw/ebird-taxonomy.json'))).toBe(false)
  })
})

describe('writeNames with synthetic source files', () => {
  let root: string
  const write = (path: string, value: unknown) => writeFileSync(join(root, path), JSON.stringify(value))
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'everybird-names-'))
    for (const path of ['data/raw', 'data/i18n', 'public/data']) mkdirSync(join(root, path), { recursive: true })
    vi.spyOn(process, 'cwd').mockReturnValue(root)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // species.v1.json's com is deliberately stale: the English reference is the raw taxonomy's comName.
    write('public/data/species.v1.json', { v: 1, ebirdTaxonomy: '2026', species: [{ code: 'bird', com: 'Old bird', fam: 'Testidae', famCom: 'Test birds' }] })
    write('data/raw/manifest.json', { ebirdTaxonomy: '2026' })
    const taxa = [{ speciesCode: 'bird', comName: 'Bird', category: 'species' }, { speciesCode: 'extra', comName: 'Extra bird', category: 'species' }]
    write('data/raw/ebird-taxonomy.json', taxa)
    for (const l of NAME_LOCALES) {
      const name = l === 'es' ? 'Ave base' : l === 'pt_BR' ? 'ave-base' : l === 'nl' ? 'Basisvogel' : l === 'es_MX' ? 'ave de Hawaii' : 'bird'
      write(`data/raw/ebird-taxonomy.${l}.json`, [{ ...taxa[0], comName: name }, { ...taxa[1], comName: 'Extra translated' }])
    }
    write('data/raw/ebird-groups.en.json', [{ groupOrder: 1, groupName: 'Test birds' }])
    for (const lang of ['es', 'pt', 'nl', 'pl']) {
      write(`data/raw/ebird-groups.${lang}.json`, [{ groupOrder: 1, groupName: 'Translated group' }])
      write(`data/i18n/families.${lang}.json`, { Testidae: 'Hand translation' })
    }
  })
  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('writes the complete fallback chain, family overrides and metadata, without unpublished codes', () => {
    writeNames()
    const read = (l: string) => JSON.parse(readFileSync(join(root, `public/data/names.${l}.v1.json`), 'utf8'))
    expect(read('es_AR')).toEqual({ v: 1, locale: 'es_AR', taxonomy: '2026', names: { bird: 'Ave base' }, fam: { Testidae: 'Hand translation' } })
    expect(read('pt_PT').names).toEqual({ bird: 'Ave-base' })
    expect(read('nl').names).toEqual({ bird: 'Basisvogel' })
    expect(read('es_MX').names).toEqual({ bird: 'Ave de Hawaii' })
    for (const l of NAME_LOCALES) expect(existsSync(join(root, `public/data/names.${l}.v1.json`))).toBe(true)
  })

  it('warns about families with no label in a language, and leaves them to English', () => {
    write('data/i18n/families.nl.json', {})
    write('data/raw/ebird-groups.nl.json', [{ groupOrder: 1, groupName: 'Testidae' }])
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    writeNames()
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^nl: 1 families have no label.*Testidae.*families\.nl\.json/))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.parse(readFileSync(join(root, 'public/data/names.nl.v1.json'), 'utf8')).fam).toEqual({})
  })

  it('a missing raw file names the command that fetches it', () => {
    rmSync(join(root, 'data/raw/ebird-taxonomy.es_PE.json'))
    expect(() => writeNames()).toThrow(/ebird-taxonomy\.es_PE\.json is missing: run npx tsx scripts\/build-data\/fetch-sources\.ts --names-only/)
  })

  it('refuses a different taxonomy year before writing outputs', () => {
    write('data/raw/manifest.json', { ebirdTaxonomy: '2025' })
    expect(() => writeNames()).toThrow(/taxonomy 2025 does not match.*--taxonomy/)
    expect(existsSync(join(root, 'public/data/names.es.v1.json'))).toBe(false)
  })
})

// Proper nouns and proper adjectives that may keep a capital inside a family label (Dutch keeps demonyms capitalised;
// Spanish and Portuguese write them in lower case). Anything else capitalised mid-label is Title Case to fix by hand.
const PROPER = [
  'Nuevo', 'Viejo', 'Novo', 'Velho', 'Mundo', 'Nieuwe', 'Oude', 'Wereld', 'Antillas', 'Antilhas', 'Antillen', 'Mayores',
  'Grandes', 'Grote', 'Nova', 'Zelândia', 'Nieuw', 'Zeeland', 'Zeelandse', 'África', 'Afrika', 'Amerika', 'Aziatische',
  'Oceania', 'Hawaii', 'La', 'Española', 'Célebes', 'Arfak', 'Magallanes', 'Przewalski', 'Zeledón',
]

describe('committed names files', () => {
  const species = JSON.parse(read('species.v1.json')) as SpeciesFile
  const families = [...new Set(species.species.map((s) => s.fam))].sort()
  const files = new Map(NAME_LOCALES.map((l) => [l, JSON.parse(read(`names.${l}.v1.json`))]))

  it('the committed files cover the species file', () => {
    const common = new Map(species.species.map((s) => [s.code, s.com]))
    const bad: string[] = []
    for (const [l, file] of files) {
      expect(file).toMatchObject({ v: 1, locale: l, taxonomy: species.ebirdTaxonomy })
      expect(Object.keys(file.names).sort()).toEqual(Object.keys(file.names))
      expect(Object.keys(file.fam)).toEqual(families)
      for (const [code, name] of Object.entries(file.names) as [string, string][]) {
        const en = common.get(code)
        if (en === undefined) bad.push(`${l}: ${code} is not a published species`)
        else if (typeof name !== 'string' || name === '') bad.push(`${l}: ${code} is empty`)
        else if (name.toLowerCase() === en.toLowerCase()) bad.push(`${l}: ${code} is English`)
        else if (name !== normalizeName(name)) bad.push(`${l}: ${code} is not normalised`)
        else if (name !== capFirst(name)) bad.push(`${l}: ${code} starts in lower case`)
      }
      if (l === 'es' || l === 'nl' || l === 'pl') expect(Object.keys(file.names).length, l).toBeGreaterThanOrEqual(11100)
    }
    expect(bad).toEqual([])
    for (const l of ['es', 'pt_BR', 'nl', 'pl']) expect(gzipSync(read(`names.${l}.v1.json`), { level: 9 }).length, l).toBeLessThan(120_000)
    // Live eBird 2026: es_AR's American Robin falls through to the Spanish base.
    expect(files.get('es_AR').names.amerob).toBe('Zorzal americano')
    expect(files.get('pt_BR').names.amerob).toBe('Tordo-americano')
    expect(files.get('nl').names.amerob).toBe('Roodborstlijster')
    // Polish keeps its letters outside Latin-1 (the set a wrong locale or encoding would lose).
    expect(files.get('pl').names.osprey).toBe('Rybołów')
    expect(files.get('pl').names.mutswa).toBe('Łabędź niemy')
  })

  it('every regional Spanish file has names of its own (a locale eBird ignored would equal es)', () => {
    const es = files.get('es').names as Record<string, string>
    const own = NAME_LOCALES.filter((l) => l.startsWith('es_')).map((l) => {
      const names = files.get(l).names as Record<string, string>
      return [l, Object.entries(names).filter(([code, name]) => es[code] !== name).length] as const
    })
    expect(own.filter(([, n]) => n < 200)).toEqual([])
  })

  it('family labels are unique, sentence case, never scientific or bracketed', () => {
    const bad: string[] = []
    for (const [lang, file] of files) {
      const fam = file.fam as Record<string, string>
      const seen = new Map<string, string>()
      for (const [f, label] of Object.entries(fam)) {
        if (seen.has(label)) bad.push(`${lang}: ${f} and ${seen.get(label)} are both "${label}"`)
        seen.set(label, f)
        if (label.includes('(')) bad.push(`${lang}: ${f} "${label}" has brackets`)
        if (/\p{L}+idae\b/u.test(label)) bad.push(`${lang}: ${f} "${label}" is scientific`)
        if (label !== capFirst(label)) bad.push(`${lang}: ${f} "${label}" starts in lower case`)
        // Words after the first, split at spaces and hyphens ("Pseudo-Babbelaars"); "IJs- en …" starts the label.
        for (const word of label.split(/[\s-]+/).slice(1)) {
          if (/^\p{Lu}/u.test(word) && !PROPER.includes(word.replace(/[,'’]+$/, ''))) bad.push(`${lang}: ${f} "${label}" capitalises ${word}`)
        }
      }
    }
    expect(bad).toEqual([])
  })
})
