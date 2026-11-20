import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

// The ZIP is written as it goes (fflate's streaming Zip): building the whole archive in one zipSync call would hold
// every finished poster twice, so it must never be called.
vi.mock('fflate', async (orig) => ({
  ...(await orig<typeof import('fflate')>()),
  zipSync: () => { throw new Error('zipSync holds every poster twice') },
}))
import { buildSeen } from '@/lib/list/seen'
import type { ListEntry, SourceRecord } from '@/lib/list/model'
import { batchChoice, bulkGroups, bulkImagePackSpec, bulkPackSpec, makeBulkZip, makeImageZip, sanitizeGroupStem } from '@/lib/share/bulk'
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
    const groups = bulkGroups('batches', entries, { species, regions, batchSize: 1000 })
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.entries.length)).toEqual([1000, 1000, 101])
    expect(groups.map((g) => g.label)).toEqual(['Batch 1', 'Batch 2', 'Batch 3'])
    expect(groups.map((g) => g.stem)).toEqual(['batch-1', 'batch-2', 'batch-3'])
    expect(groups[0].entries[0].code).toBe('b0')
    expect(groups[2].entries[100].code).toBe('b2100')
  })

  it('takes the most birds per poster from batchSize: All is one group', () => {
    const rows = Array.from({ length: 260 }, (_, i) => row(`b${i}`, i + 1))
    const species = buildSpeciesIndex(rows)
    const entries = rows.map((r) => entry(r.code))
    expect(bulkGroups('batches', entries, { species, regions, batchSize: 100 }).map((g) => g.entries.length)).toEqual([100, 100, 60])
    expect(bulkGroups('batches', entries, { species, regions, batchSize: 250 }).map((g) => g.entries.length)).toEqual([250, 10])
    expect(bulkGroups('batches', entries, { species, regions, batchSize: 'all' })).toHaveLength(1)
    expect(bulkGroups('batches', entries, { species, regions })).toHaveLength(1)
  })

  it('batchChoice moves an old number to the nearest choice at or above it, else All', () => {
    expect(batchChoice(10)).toBe(100)
    expect(batchChoice(100)).toBe(100)
    expect(batchChoice(101)).toBe(250)
    expect(batchChoice(300)).toBe(500)
    expect(batchChoice(1000)).toBe(1000)
    expect(batchChoice(1001)).toBe('all')
    expect(batchChoice(5000)).toBe('all')
    expect(batchChoice('all')).toBe('all')
    expect(batchChoice(undefined)).toBe('all')
    expect(batchChoice('500')).toBe('all')
    expect(batchChoice(Number.NaN)).toBe('all')
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

  it('keeps the letters NFKD does not decompose in file names', () => {
    expect(sanitizeGroupStem('Łódź')).toBe('lodz')
    expect(sanitizeGroupStem('Færøerne')).toBe('faeroerne')
    expect(sanitizeGroupStem('Straße Œuvre')).toBe('strasse-oeuvre')
    expect(sanitizeGroupStem('Đakovo Þórshöfn')).toBe('dakovo-thorshofn')
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

  it('makeImageZip writes one PNG per group in the dialog\'s format, each labelled with its group after the view', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    const specs: { aspect: number }[] = []
    const fakePack = vi.fn(async (_e: ListEntry[], _s: unknown, spec: { aspect: number }): Promise<ImagePack> => { specs.push(spec); return { W: 100, H: 100, boxes: new Map() } })
    const rendered: { format: string; filterLabel?: string; entries: ListEntry[]; theme: string }[] = []
    const fakeRender = vi.fn(async (o: { format: string; filterLabel?: string; entries: ListEntry[]; theme: string }) => {
      rendered.push(o)
      return new Blob([`png:${o.filterLabel}`], { type: 'image/png' })
    })
    const progress: number[] = []
    const blob = await makeImageZip({
      groups,
      species,
      image: { format: 'post', theme: 'dark', filterLabel: 'Canada', strings: en.ui, countSize: 'large' },
      onProgress: (done) => progress.push(done),
      deps: { pack: fakePack as never, render: fakeRender as never },
    })
    expect(rendered.map((o) => [o.format, o.theme, o.filterLabel, o.entries.map((e) => e.code)])).toEqual([
      ['post', 'dark', 'Canada · Ostriches', ['a']],
      ['post', 'dark', 'Canada · Ducks', ['b']],
    ])
    expect(progress).toEqual([1, 2])
    expect(specs[0]).toEqual(bulkImagePackSpec(groups[0].entries, { format: 'post', countSize: 'large' }))
    const files = unzipSync(new Uint8Array(await blob.arrayBuffer()))
    expect(Object.keys(files).sort()).toEqual(['ducks.png', 'ostriches.png'])
    expect(strFromU8(files['ducks.png'])).toBe('png:Canada · Ducks')
  })

  it('makeImageZip stops at a cancel and makes no later image', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    const ctl = new AbortController()
    const fakeRender = vi.fn(async () => { ctl.abort(); return new Blob(['x']) })
    await expect(makeImageZip({
      groups, species,
      image: { format: 'story', theme: 'light', strings: en.ui, signal: ctl.signal },
      deps: { pack: async () => ({ W: 1, H: 1, boxes: new Map() }), render: fakeRender },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fakeRender).toHaveBeenCalledTimes(1)
  })

  it('plans names for a group only when they are asked for', () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a', { date: '2020-01' }), entry('b', { date: '2024-01' })], { species, regions })
    const opts = { size: 'A2' as const, landscape: false, named: false, countSize: 'medium' as const, showNames: true, species }
    expect(Object.keys(bulkPackSpec(groups[0].entries, opts).captionBoxes!)).toEqual(['a'])
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

  it('keeps the active filter label or the Big Year goal on each poster, with the group after it', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks')])
    const groups = bulkGroups('family', [entry('a'), entry('b')], { species, regions })
    const seenOpts: { filterLabel?: string; goal?: unknown }[] = []
    const fakeMakePoster = vi.fn(async (opts: { filterLabel?: string; goal?: unknown }): Promise<Poster> => {
      seenOpts.push({ filterLabel: opts.filterLabel, goal: opts.goal })
      return { size: 'A2', landscape: false, bytes: 1, soft: 0, missing: 0, namesDropped: false, file: async (kind) => new Blob([kind]), dispose: () => {} }
    })
    const run = (poster: Record<string, unknown>) => makeBulkZip({
      groups, kind: 'png', species,
      poster: { size: 'A2', landscape: false, theme: 'light', strings: en.ui, ...poster },
      packSpec: (list) => imagePackSpec('print', { name: false, filter: true, latest: false, count: list.length }, 'A2'),
      deps: { pack: async () => ({ W: 100, H: 100, boxes: new Map() }), makePoster: fakeMakePoster as never },
    })
    await run({ filterLabel: 'Canada' })
    expect(seenOpts.map((o) => o.filterLabel)).toEqual(['Canada · Ostriches', 'Canada · Ducks'])
    seenOpts.length = 0
    const goal = { year: 2027, target: 300, basis: 'lifer' as const }
    await run({ goal })
    expect(seenOpts).toEqual([
      { filterLabel: 'Big Year 2027 · New species in 2027 · Ostriches', goal },
      { filterLabel: 'Big Year 2027 · New species in 2027 · Ducks', goal },
    ])
  })

  it('sizes each group\'s count hole for the Big Year target', () => {
    const species = buildSpeciesIndex([row('a', 1)])
    const opts = { size: 'A2' as const, landscape: false, named: false, countSize: 'medium' as const, showNames: false, species }
    const plain = bulkPackSpec([entry('a')], opts).hole
    const goal = bulkPackSpec([entry('a')], { ...opts, target: 300 }).hole
    // The number keeps its size; the label under it ("OF 300 SPECIES") is wider.
    expect(goal.num).toEqual(plain.num)
    expect(goal.label[2] - goal.label[0]).toBeGreaterThan(plain.label[2] - plain.label[0])
  })

  it('makeBulkZip stops at a cancel: the poster in hand is disposed and no later group is made', async () => {
    const species = buildSpeciesIndex([row('a', 1, 'O1', 'F1', 'Ostriches'), row('b', 2, 'O2', 'F2', 'Ducks'), row('c', 3, 'O3', 'F3', 'Falcons')])
    const groups = bulkGroups('family', [entry('a'), entry('b'), entry('c')], { species, regions })
    const ctl = new AbortController()
    const disposed: string[] = []
    const fakeMakePoster = vi.fn(async (opts: { filterLabel?: string }): Promise<Poster> => {
      if (opts.filterLabel === 'Ducks') ctl.abort()
      return {
        size: 'A2', landscape: false, bytes: 1, soft: 0, missing: 0, namesDropped: false,
        file: async (kind) => new Blob([kind]), dispose: () => disposed.push(opts.filterLabel ?? ''),
      }
    })
    await expect(makeBulkZip({
      groups, kind: 'png', species,
      poster: { size: 'A2', landscape: false, theme: 'light', strings: en.ui, signal: ctl.signal },
      packSpec: (list) => imagePackSpec('print', { name: false, filter: true, latest: false, count: list.length }, 'A2'),
      deps: { pack: async () => ({ W: 100, H: 100, boxes: new Map() }), makePoster: fakeMakePoster as never },
    })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fakeMakePoster).toHaveBeenCalledTimes(2)
    expect(disposed).toEqual(['Ostriches', 'Ducks'])
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
