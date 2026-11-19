import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'
import { buildSeen } from '@/lib/list/seen'
import type { ListEntry, SourceRecord } from '@/lib/list/model'
import { bulkGroups, bulkPackSpec, makeBulkZip, sanitizeGroupStem } from '@/lib/share/bulk'
import { imagePackSpec, type ImagePack } from '@/lib/share/image'
import type { Poster } from '@/lib/share/poster'
import { buildSpeciesIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow } from '@/lib/species/types'
import { en } from '@/i18n/messages/en'

const row = (code: string, to: number, ord = 'Passeriformes', fam = 'Parulidae', famCom = 'New World Warblers'): SpeciesRow => ({
  code,
  com: code,
  sci: code,
  ord,
  fam,
  famCom,
  to,
  g: 12,
  gSrc: 'family',
  st: true,
  ar: 1,
  q: true,
})

const entry = (code: string, over: Partial<ListEntry> = {}): ListEntry => ({
  code,
  date: '2023-05-01',
  place: { country: 'CA', sub1: 'CA-BC' },
  heard: false,
  dead: false,
  media: false,
  sources: ['ebird'],
  ...over,
})

const regions: Regions = {
  v: 1,
  countries: {
    CA: 'Canada',
    US: 'United States of America',
    EG: 'Egypt',
    FR: 'France',
  },
  sub1: {
    'CA-BC': 'British Columbia',
    'CA-ON': 'Ontario',
    'US-NY': 'New York',
    'EG-C': 'Cairo',
  },
}

describe('bulk export', () => {
  it('splits 2,101 birds into numbered batches of 1,000, 1,000, and 101 in taxonomic order', () => {
    const rows = Array.from({ length: 2101 }, (_, i) => row(`b${i}`, i + 1))
    const species = buildSpeciesIndex(rows)
    const entries = [...rows].reverse().map((r) => entry(r.code))
    const groups = bulkGroups('batches', entries, { species, regions })
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.entries.length)).toEqual([1000, 1000, 101])
    expect(groups.map((g) => g.label)).toEqual(['Batch 1', 'Batch 2', 'Batch 3'])
    expect(groups.map((g) => g.stem)).toEqual(['batch-1', 'batch-2', 'batch-3'])
    expect(groups[0].entries[0].code).toBe('b0')
    expect(groups[2].entries[100].code).toBe('b2100')
  })

  it('produces one group per non-empty family and order in taxonomic order', () => {
    const species = buildSpeciesIndex([
      row('ostric2', 1, 'Struthioniformes', 'Struthionidae', 'Ostriches'),
      row('mallar3', 10, 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl'),
      row('cangoo', 11, 'Anseriformes', 'Anatidae', 'Ducks, Geese, and Waterfowl'),
      row('amerob', 50, 'Passeriformes', 'Turdidae', 'Thrushes and Allies'),
    ])
    const entries = [entry('amerob'), entry('mallar3'), entry('ostric2'), entry('cangoo')]

    const families = bulkGroups('family', entries, { species, regions })
    expect(families.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['Ostriches', ['ostric2']],
      ['Ducks, Geese, and Waterfowl', ['mallar3', 'cangoo']],
      ['Thrushes and Allies', ['amerob']],
    ])

    const orders = bulkGroups('order', entries, { species, regions })
    expect(orders.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['Struthioniformes', ['ostric2']],
      ['Anseriformes', ['mallar3', 'cangoo']],
      ['Passeriformes', ['amerob']],
    ])
  })

  it('places a bird seen in multiple provinces, countries, continents, and years into every matching poster', () => {
    const species = buildSpeciesIndex([
      row('merlin', 1, 'Falconiformes', 'Falconidae', 'Falcons'),
      row('mallar3', 2, 'Anseriformes', 'Anatidae', 'Ducks'),
      row('undated', 3, 'Passeriformes', 'Corvidae', 'Crows'),
    ])
    const entries = [
      entry('merlin', { date: '2019-03-01', place: { country: 'EG', sub1: 'EG-C' } }),
      entry('mallar3', { date: '2022-06-01', place: { country: 'CA', sub1: 'CA-BC' } }),
      entry('undated', { date: undefined, place: undefined }),
    ]
    const records: SourceRecord[] = [
      {
        code: 'merlin',
        source: 'ebird',
        date: '2019-03-01',
        place: { country: 'EG', sub1: 'EG-C' },
        seen: ['2019-03-01|EG-C', '2023-04-10|CA-BC', '2024-05-12|CA-ON'],
        seenMonths: ['2019-03|EG-C', '2023-04|CA-BC', '2024-05|CA-ON'],
      },
      {
        code: 'mallar3',
        source: 'ebird',
        date: '2022-06-01',
        place: { country: 'CA', sub1: 'CA-BC' },
        seen: ['2022-06-01|CA-BC'],
        seenMonths: ['2022-06|CA-BC'],
      },
      { code: 'undated', source: 'ebird' },
    ]
    const seen = buildSeen(records, { added: [], removed: [], fixes: {}, marks: {} }, { hideHeard: false, hideDead: false, researchOnly: false }, entries)

    const provinces = bulkGroups('province', entries, { species, regions, seen })
    expect(provinces.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['British Columbia', ['merlin', 'mallar3']],
      ['Cairo', ['merlin']],
      ['Ontario', ['merlin']],
    ])

    const countries = bulkGroups('country', entries, { species, regions, seen })
    expect(countries.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['Canada', ['merlin', 'mallar3']],
      ['Egypt', ['merlin']],
    ])

    const continents = bulkGroups('continent', entries, { species, regions, seen })
    expect(continents.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['Africa', ['merlin']],
      ['North America', ['merlin', 'mallar3']],
    ])

    const years = bulkGroups('year', entries, { species, regions, seen })
    expect(years.map((g) => [g.label, g.entries.map((e) => e.code)])).toEqual([
      ['2019', ['merlin']],
      ['2022', ['mallar3']],
      ['2023', ['merlin']],
      ['2024', ['merlin']],
    ])
  })

  it('sanitizes group names into safe, unique filenames without traversal or illegal characters', () => {
    expect(sanitizeGroupStem('../../etc/passwd')).toBe('etc-passwd')
    expect(sanitizeGroupStem('São Paulo: State / East?*')).toBe('sao-paulo-state-east')
    expect(sanitizeGroupStem('CON')).toBe('con-group')
    expect(sanitizeGroupStem('...')).toBe('group')

    const species = buildSpeciesIndex([
      row('a', 1, 'O', 'F1', 'Warblers!'),
      row('b', 2, 'O', 'F2', 'Warblers?'),
    ])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    expect(groups.map((g) => g.stem)).toEqual(['warblers', 'warblers-2'])
  })

  it('makeBulkZip runs makePoster strictly sequentially, always calls dispose, and writes a valid ZIP', async () => {
    const species = buildSpeciesIndex([
      row('a', 1, 'O1', 'F1', 'Ostriches'),
      row('b', 2, 'O2', 'F2', 'Ducks'),
      row('c', 3, 'O3', 'F3', 'Falcons'),
    ])
    const groups = bulkGroups('family', [entry('a'), entry('b'), entry('c')], { species, regions })
    let active = 0
    let maxActive = 0
    const disposed: string[] = []
    const progress: [number, number][] = []

    const fakePack = vi.fn(async (): Promise<ImagePack> => ({ W: 100, H: 100, boxes: new Map() }))
    const fakeMakePoster = vi.fn(async (opts: { filterLabel?: string }): Promise<Poster> => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      const label = opts.filterLabel ?? 'poster'
      return {
        size: 'A2',
        landscape: false,
        bytes: 10,
        soft: 0,
        missing: 0,
        namesDropped: false,
        file: async (kind) => new Blob([`${kind}:${label}`], { type: 'image/png' }),
        dispose: () => {
          active--
          disposed.push(label)
        },
      }
    })

    const { blob: zipBlob, namesDropped } = await makeBulkZip({
      groups,
      kind: 'png',
      species,
      poster: {
        size: 'A2',
        landscape: false,
        theme: 'light',
        latest: false,
        markNewest: false,
        markFirst: false,
        strings: en.ui,
        nameOf: (r) => r.com,
      },
      packSpec: (list) => imagePackSpec('print', { name: false, filter: true, latest: false, count: list.length }, 'A2'),
      onProgress: (done, total) => progress.push([done, total]),
      deps: { pack: fakePack, makePoster: fakeMakePoster as never },
    })

    expect(maxActive).toBe(1)
    expect(namesDropped).toBe(0)
    expect(active).toBe(0)
    expect(disposed).toEqual(['Ostriches', 'Ducks', 'Falcons'])
    expect(progress).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ])

    const unzipped = unzipSync(new Uint8Array(await zipBlob.arrayBuffer()))
    expect(Object.keys(unzipped)).toEqual(['ostriches.png', 'ducks.png', 'falcons.png'])
    expect(strFromU8(unzipped['ostriches.png'])).toBe('png:Ostriches')
    expect(strFromU8(unzipped['ducks.png'])).toBe('png:Ducks')
    expect(strFromU8(unzipped['falcons.png'])).toBe('png:Falcons')
  })

  it('plans each group\'s names with its own lifer rings, not the whole list\'s', () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    // b is the whole list's latest lifer; in Ostriches' poster a is the latest (and only) bird, and it is ringed there.
    const groups = bulkGroups('family', [entry('a', { date: '2020-01' }), entry('b', { date: '2024-01' })], { species, regions })
    const opts = { size: 'A2' as const, landscape: false, named: false, countSize: 'medium' as const, showNames: true, species, marks: { newest: true } }
    const ostriches = bulkPackSpec(groups[0].entries, opts).captionBoxes!
    expect(ostriches.a.ring).toBeGreaterThan(0)
    const plain = bulkPackSpec(groups[0].entries, { ...opts, marks: {} }).captionBoxes!
    expect(plain.a.ring).toBeUndefined()
    expect(ostriches.a.h).toBeGreaterThan(plain.a.h)
    expect(bulkPackSpec(groups[0].entries, { ...opts, showNames: false }).captionBoxes).toBeUndefined()
  })

  it('makeBulkZip counts the posters that asked for names but have none', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    const fakeMakePoster = vi.fn(async (opts: { filterLabel?: string }): Promise<Poster> => ({
      size: 'A2', landscape: false, bytes: 1, soft: 0, missing: 0, namesDropped: opts.filterLabel === 'Ducks',
      file: async (kind) => new Blob([kind]), dispose: () => {},
    }))
    const { namesDropped } = await makeBulkZip({
      groups, kind: 'png', species,
      poster: { size: 'A2', landscape: false, theme: 'light', showNames: true, strings: en.ui },
      packSpec: (list) => imagePackSpec('print', { name: false, filter: true, latest: false, count: list.length }, 'A2'),
      deps: { pack: async () => ({ W: 100, H: 100, boxes: new Map() }), makePoster: fakeMakePoster as never },
    })
    expect(namesDropped).toBe(1)
  })

  it('makeBulkZip disposes the poster even when poster.file throws or signal aborts', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    const disposed: string[] = []
    const ctl = new AbortController()

    const fakePack = vi.fn(async (): Promise<ImagePack> => ({ W: 100, H: 100, boxes: new Map() }))
    const fakeMakePoster = vi.fn(async (opts: { filterLabel?: string }): Promise<Poster> => ({
      size: 'A2',
      landscape: false,
      bytes: 10,
      soft: 0,
      missing: 0,
      namesDropped: false,
      file: async () => {
        ctl.abort()
        throw new Error('disk full')
      },
      dispose: () => disposed.push(opts.filterLabel ?? ''),
    }))

    await expect(
      makeBulkZip({
        groups,
        kind: 'pdf',
        species,
        poster: {
          size: 'A2',
          landscape: false,
          theme: 'light',
          latest: false,
          markNewest: false,
          markFirst: false,
          strings: en.ui,
          nameOf: (r) => r.com,
          signal: ctl.signal,
        },
        packSpec: (list) => imagePackSpec('print', { name: false, filter: true, latest: false, count: list.length }, 'A2'),
        deps: { pack: fakePack, makePoster: fakeMakePoster as never },
      }),
    ).rejects.toThrow('disk full')

    expect(disposed).toEqual(['Ostriches'])
    expect(fakeMakePoster).toHaveBeenCalledTimes(1)
  })

  it('respects active place and time filters in country, province, continent, and year splits', () => {
    const species = buildSpeciesIndex([row('merlin', 1, 'Falconiformes', 'Falconidae', 'Falcons')])
    const entries = [entry('merlin', { date: '2019-03-01', place: { country: 'EG', sub1: 'EG-C' } })]
    const records: SourceRecord[] = [
      {
        code: 'merlin',
        source: 'ebird',
        date: '2019-03-01',
        place: { country: 'EG', sub1: 'EG-C' },
        seen: ['2019-03-01|EG-C', '2023-04-10|CA-BC', '2024-05-12|CA-ON'],
        seenMonths: ['2019-03|EG-C', '2023-04|CA-BC', '2024-05|CA-ON'],
      },
    ]
    const seen = buildSeen(records, { added: [], removed: [], fixes: {}, marks: {} }, { hideHeard: false, hideDead: false, researchOnly: false }, entries)

    const caOnly = { countries: ['CA'] }
    expect(bulkGroups('country', entries, { species, regions, seen, filter: caOnly }).map((g) => g.label)).toEqual(['Canada'])
    expect(bulkGroups('continent', entries, { species, regions, seen, filter: caOnly }).map((g) => g.label)).toEqual(['North America'])
    expect(bulkGroups('province', entries, { species, regions, seen, filter: caOnly }).map((g) => g.label)).toEqual(['British Columbia', 'Ontario'])
    expect(bulkGroups('year', entries, { species, regions, seen, filter: caOnly }).map((g) => g.label)).toEqual(['2023', '2024'])

    const seenIn2023 = { countries: ['CA'], from: '2023-01', to: '2023-12', basis: 'seen' as const }
    expect(bulkGroups('province', entries, { species, regions, seen, filter: seenIn2023 }).map((g) => g.label)).toEqual(['British Columbia'])
    expect(bulkGroups('year', entries, { species, regions, seen, filter: seenIn2023 }).map((g) => g.label)).toEqual(['2023'])

    const liferIn2019 = { from: '2019-01', to: '2019-12' }
    expect(bulkGroups('year', entries, { species, regions, seen, filter: liferIn2019 }).map((g) => g.label)).toEqual(['2019'])
  })
})
