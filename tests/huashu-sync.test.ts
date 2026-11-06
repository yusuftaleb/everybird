import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  PR_URL, SHEET_URL, codesFromMatches, diffRecords, diffRows, diffStickers, lockJson, makeLock, nextVersions,
  parseLsTree, recordDigest, renderIssueBody, renderPrBody, summarise, type HuashuLock,
} from '../scripts/sync/huashu-lib'
import { applyStickerVersions, buildSpecies, matchHuashu, taxonomyFromPublic } from '../scripts/build-data/build-species'
import { readMaskTables, updateStickers, writeMaskTables, type MaskTables } from '../scripts/build-data/build-stickers'
import { websiteCodes } from '../scripts/build-data/build-website-codes'
import type { HuashuRecord, SpeciesFile, SpeciesRow, TaxonRow, TaxonomyFile } from '@/lib/species/types'

const FIX = resolve(__dirname, 'fixtures/huashu-sync')
const huashu = JSON.parse(readFileSync(join(FIX, 'species.json'), 'utf8')).species as HuashuRecord[]
const lsTree = readFileSync(join(FIX, 'ls-tree.txt'), 'utf8')
const taxa: TaxonRow[] = [
  { code: 'whibir1', sci: 'Avis alba', com: 'White Bird', cat: 'species', to: 1, ord: 'Testiformes', fam: 'Testidae', famCom: 'Testers' },
  { code: 'blabir1', sci: 'Avis nigra', com: 'Black Bird', cat: 'species', to: 2, ord: 'Testiformes', fam: 'Testidae', famCom: 'Testers' },
  { code: 'redbir1', sci: 'Avis rubra', com: 'Red Bird', cat: 'species', to: 3, ord: 'Testiformes', fam: 'Testidae', famCom: 'Testers' },
  { code: 'x1', sci: 'Avis sp.', com: 'bird sp.', cat: 'spuh', to: 4 },
]
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x))

function lockFor(records: HuashuRecord[], tree: Map<string, string>, commit = 'a'.repeat(40)): HuashuLock {
  return makeLock({ commit, tree, huashu: records, matches: matchHuashu(records, taxa, {}).matches })
}

describe('the huashu lock', () => {
  it('reads blob SHAs for species.json and stickers/ from ls-tree output, newline or NUL separated', () => {
    const t = parseLsTree(lsTree)
    expect([...t.keys()]).toEqual([
      'data/species.json', 'stickers/Testiformes/Testidae/Avis_alba.webp', 'stickers/Testiformes/Testidae/Avis_nigra.webp',
    ])
    expect(t.get('data/species.json')).toBe('2'.repeat(40))
    expect(parseLsTree(lsTree.trim().split('\n').join('\0') + '\0')).toEqual(t)
    expect(() => parseLsTree('100644 blob ' + 'a'.repeat(40) + '\t"stickers/\\303\\251.webp"\n')).toThrow(/-z/)
  })

  it('digests only the fields the build reads', () => {
    const [a] = huashu
    const d = recordDigest(a)
    expect(d).toMatch(/^[0-9a-f]{12}$/)
    expect(recordDigest({ ...clone(a), names: { en: 'Renamed' } } as HuashuRecord)).toBe(d) // translations: no effect
    expect(recordDigest({ ...clone(a), traits: { massG: 21 } })).not.toBe(d)
    expect(recordDigest({ ...clone(a), ids: { ebird: 'other1' } })).not.toBe(d)
    expect(recordDigest({ ...clone(a), sticker: { file: a.sticker!.file, meetsQualityBar: false } })).not.toBe(d)
    expect(recordDigest({ ...clone(a), previous: [{ scientificName: 'Avis olim' }] })).not.toBe(d)
  })

  it('records the commit, blobs, digests and each code’s sticker file, one entry per line', () => {
    const lock = lockFor(huashu, parseLsTree(lsTree))
    expect(lock.speciesJson).toBe('2'.repeat(40))
    expect(Object.keys(lock.files)).toHaveLength(2)
    expect(Object.keys(lock.records)).toEqual(['Avis_alba', 'Avis_nigra', 'Avis_rubra'])
    expect(lock.codes).toEqual({ blabir1: 'stickers/Testiformes/Testidae/Avis_nigra.webp', whibir1: 'stickers/Testiformes/Testidae/Avis_alba.webp' })
    const text = lockJson(lock)
    expect(JSON.parse(text)).toEqual(lock)
    expect(text).toContain('\n  "whibir1": "stickers/Testiformes/Testidae/Avis_alba.webp"')
  })

  it('throws when a code’s sticker file is missing from the tree', () => {
    const lock = lockFor(huashu, parseLsTree(lsTree))
    expect(() => diffStickers(lock, { files: {}, codes: lock.codes })).toThrow(/not in the upstream tree/)
  })
})

describe('the huashu diff', () => {
  const tree = parseLsTree(lsTree)
  const lock = lockFor(huashu, tree)

  it('finds nothing when upstream equals the lock', () => {
    expect(diffStickers(lock, lock)).toEqual([])
    expect(diffRecords(lock.records, lock.records)).toEqual({ changed: [], added: [], removed: [] })
  })

  it('finds redrawn, new and removed stickers by blob and crosswalk', () => {
    const next = clone(huashu)
    next[1].sticker = undefined // blabir1 loses its sticker
    next[2].sticker = { file: 'stickers/Testiformes/Testidae/Avis_rubra.webp', meetsQualityBar: true } // redbir1 gains one
    const files = { ...lock.files, 'stickers/Testiformes/Testidae/Avis_alba.webp': 'd'.repeat(40), 'stickers/Testiformes/Testidae/Avis_rubra.webp': 'e'.repeat(40) }
    delete (files as Record<string, string>)['stickers/Testiformes/Testidae/Avis_nigra.webp']
    const codes = codesFromMatches(matchHuashu(next, taxa, {}).matches)
    expect(diffStickers(lock, { files, codes })).toEqual([
      { code: 'blabir1', kind: 'removed', from: 'stickers/Testiformes/Testidae/Avis_nigra.webp' },
      { code: 'redbir1', kind: 'new', to: 'stickers/Testiformes/Testidae/Avis_rubra.webp', blob: 'e'.repeat(40) },
      { code: 'whibir1', kind: 'changed', from: 'stickers/Testiformes/Testidae/Avis_alba.webp', to: 'stickers/Testiformes/Testidae/Avis_alba.webp', blob: 'd'.repeat(40) },
    ])
    const r = diffRecords(lock.records, lockFor(next, tree).records)
    expect(r).toEqual({ changed: ['Avis_nigra', 'Avis_rubra'], added: [], removed: [] })
  })

  it('a code moved to another file with the same content is not a change; with other content it is', () => {
    const codes = { ...lock.codes, whibir1: 'stickers/Testiformes/Testidae/Avis_copy.webp' }
    const same = { ...lock.files, 'stickers/Testiformes/Testidae/Avis_copy.webp': lock.files['stickers/Testiformes/Testidae/Avis_alba.webp'] }
    expect(diffStickers(lock, { files: same, codes })).toEqual([])
    const other = { ...lock.files, 'stickers/Testiformes/Testidae/Avis_copy.webp': 'f'.repeat(40) }
    expect(diffStickers(lock, { files: other, codes })[0]).toMatchObject({ code: 'whibir1', kind: 'changed', to: 'stickers/Testiformes/Testidae/Avis_copy.webp' })
  })

  it('a file under stickers/ that no species uses is not a change', () => {
    const files = { ...lock.files, 'stickers/Testiformes/Testidae/Unused.webp': '9'.repeat(40) }
    expect(diffStickers(lock, { files, codes: lock.codes })).toEqual([])
  })

  it('sticker versions: rebuilt stickers get the start of their blob SHA, removed ones lose theirs', () => {
    const v = nextVersions({ blabir1: 'old', keep1: 'k' }, [
      { code: 'blabir1', kind: 'removed' }, { code: 'whibir1', kind: 'changed', blob: 'd'.repeat(40) }, { code: 'redbir1', kind: 'new', blob: 'e'.repeat(40) },
    ])
    expect(v).toEqual({ keep1: 'k', redbir1: 'e'.repeat(10), whibir1: 'd'.repeat(10) })
    expect(Object.keys(v)).toEqual(['keep1', 'redbir1', 'whibir1'])
  })

  it('row changes: mass, names and the quality bar, but not the quality bar of a sticker that came or went', () => {
    const { file } = buildSpecies(huashu, taxa, {})
    const next = clone(huashu)
    next[0].traits = { massG: 25 }
    next[0].sticker!.meetsQualityBar = false
    next[1].sticker = undefined
    const after = buildSpecies(next, taxa, {}).file
    expect(diffRows(file.species, after.species)).toEqual([
      { code: 'whibir1', fields: ['mass 20 g (avonet) → 25 g (avonet)', 'quality bar met → not met'] },
    ])
  })
})

describe('sticker versions in species rows', () => {
  it('sets sv only on rows with a sticker and drops stale ones', () => {
    const { file } = buildSpecies(huashu, taxa, {})
    const rows = file.species.map((r) => (r.code === 'redbir1' ? { ...r, sv: 'stale' } : r))
    applyStickerVersions(rows, { whibir1: 'abc', redbir1: 'zzz' })
    expect(rows.map((r) => r.sv)).toEqual(['abc', undefined, undefined])
    expect('sv' in rows[1]).toBe(false) // unversioned rows serialise exactly as before
  })

  it('the build taxonomy comes back from the public files', () => {
    const { file } = buildSpecies(huashu, taxa, {})
    const pub: TaxonomyFile = { v: 1, ebirdTaxonomy: 't', taxa: taxa.map((t) => ({ code: t.code, sci: t.sci, com: t.com, cat: t.cat, to: t.to })) }
    const again = buildSpecies(huashu, taxonomyFromPublic(pub, file), {}).file
    expect(again).toEqual(file)
  })
})

describe('updateStickers (merge mode)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'eb-sync-'))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const row = (code: string, st: boolean, sv?: string): SpeciesRow =>
    ({ code, com: code, sci: code, ord: 'Testiformes', fam: 'Testidae', famCom: 'T', to: 1, g: 1, gSrc: 'avonet', st, ar: 0.5, q: st, ...(sv ? { sv } : {}) })

  it('rebuilds only the given codes under versioned names, keeps the other masks, drops species without a sticker', async () => {
    const masks: MaskTables = new Map([['Testiformes', { keep1: [1, 1, 'AA'], gone1: [1, 1, 'BB'] } as Record<string, [number, number, string]>]])
    const rows = [row('keep1', true), row('gone1', false), row('new1', true, 'abc123')]
    const written = await updateStickers({
      rows, codes: new Set(['new1']), source: () => resolve(__dirname, 'fixtures/build/sticker.png'), out: dir, masks,
    })
    expect(written).toEqual(['v1/128/new1.abc123.webp', 'v1/384/new1.abc123.webp'])
    expect(existsSync(join(dir, 'v1/384/new1.abc123.webp'))).toBe(true)
    const t = masks.get('Testiformes')!
    expect(Object.keys(t).sort()).toEqual(['keep1', 'new1'])
    expect(t.keep1).toEqual([1, 1, 'AA'])
    expect(rows.map((r) => r.ar)).toEqual([0.5, 1, 1]) // kept, outline, measured (the fixture trims to a square)
    writeMaskTables(join(dir, 'masks'), masks)
    expect(Object.keys(readMaskTables(join(dir, 'masks')).get('Testiformes')!)).toEqual(['keep1', 'new1'])
  })

  it('fails for a sticker with neither a mask nor a file', async () => {
    await expect(updateStickers({ rows: [row('lost1', true)], codes: new Set(), source: () => '', out: dir, masks: new Map() })).rejects.toThrow(/no mask/)
  })
})

describe('PR and issue bodies', () => {
  const summary = summarise({
    from: 'a'.repeat(40), to: 'b'.repeat(40),
    stickers: [
      { code: 'whibir1', kind: 'changed', from: 'stickers/T/T/Avis_alba.webp', to: 'stickers/T/T/Avis_alba.webp', blob: 'd'.repeat(40) },
      { code: 'redbir1', kind: 'new', to: 'stickers/T/T/Avis_rubra.webp', blob: 'e'.repeat(40) },
      { code: 'blabir1', kind: 'removed', from: 'stickers/T/T/Avis_nigra.webp' },
    ],
    rows: [{ code: 'whibir1', fields: ['mass 20 g (avonet) → 25 g (avonet)'] }, { code: 'grebir1', fields: ['quality bar met → not met'] }],
    records: { changed: ['Avis_alba'], added: [], removed: [] },
    names: new Map([['whibir1', 'White Bird'], ['redbir1', 'Red Bird'], ['blabir1', 'Black | Bird'], ['grebir1', 'Green Bird']]),
    website: new Set(['whibir1', 'blabir1']),
    files: ['public/data/species.v1.json'],
  })

  it('orders entries changed, new, removed, data, and folds row changes into the sticker line', () => {
    expect(summary.entries.map((e) => [e.code, e.kind, e.website])).toEqual([
      ['whibir1', 'changed', true], ['redbir1', 'new', false], ['blabir1', 'removed', true], ['grebir1', 'data', false],
    ])
    expect(summary.entries[0].detail).toBe('redrawn; mass 20 g (avonet) → 25 g (avonet)')
  })

  it('the PR body has the range link, counts, the sheet link and the table', () => {
    const body = renderPrBody(summary, { sheetRows: 3 })
    expect(body).toContain('[`aaaaaaa...bbbbbbb`](https://github.com/alchaincyf/huashu-bird-sticker/compare/aaaaaaa...bbbbbbb)')
    expect(body).toContain('- Stickers: 1 changed, 1 new, 1 removed')
    expect(body).toContain(`[thumbnail sheet](${SHEET_URL})`)
    expect(body).toContain('| White Bird (website) | `whibir1` | changed | redrawn; mass 20 g (avonet) → 25 g (avonet) |')
    expect(body).toContain('| Black \\| Bird (website) | `blabir1` | removed | outline from now on |')
    expect(body).toContain("On the website's /lifelist: `whibir1`, `blabir1`")
    expect(renderPrBody(summary, { sheetRows: 0 })).not.toContain('thumbnail sheet')
    expect(renderPrBody(summary, { sheetRows: 3, tableMax: 2 })).toContain('| … and 2 more |')
  })

  it('the website issue lists only the website species, and is null without any', () => {
    const body = renderIssueBody(summary)!
    expect(body).toContain(PR_URL)
    expect(body).toContain('| White Bird | `whibir1` | changed |')
    expect(body).toContain('| Black \\| Bird | `blabir1` | removed |')
    expect(body).not.toContain('redbir1')
    expect(renderIssueBody({ ...summary, entries: summary.entries.filter((e) => !e.website) })).toBeNull()
  })
})

describe('website codes', () => {
  it('keeps only eBird codes, deduplicated and sorted', () => {
    expect(websiteCodes({ species: [{ code: 'zeta1', date: '2020-01', town: 'X' } as never, { code: 'alpha1' }, { code: 'alpha1' }, { code: 'Bad Code' }, {}] }))
      .toEqual(['alpha1', 'zeta1'])
  })

  it('the committed file is sorted codes only', () => {
    const codes = JSON.parse(readFileSync(resolve(__dirname, '../data/website-lifelist-codes.json'), 'utf8')) as unknown[]
    expect(codes.every((c) => typeof c === 'string' && /^[a-z0-9]+$/.test(c))).toBe(true)
    expect([...codes].sort()).toEqual(codes)
  })
})

describe('the committed lock', () => {
  it('matches the committed species data (every species with a sticker, the commit it was built from)', () => {
    const lock = JSON.parse(readFileSync(resolve(__dirname, '../data/huashu.lock.json'), 'utf8')) as HuashuLock
    const sp = JSON.parse(readFileSync(resolve(__dirname, '../public/data/species.v1.json'), 'utf8')) as SpeciesFile
    expect(lock.commit).toBe(sp.huashuCommit)
    expect(Object.keys(lock.codes).sort()).toEqual(sp.species.filter((s) => s.st).map((s) => s.code).sort())
    for (const f of Object.values(lock.codes)) expect(lock.files[f]).toMatch(/^[0-9a-f]{40}$/)
  })
})
