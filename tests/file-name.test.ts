import { describe, expect, it } from 'vitest'
import { fileName, localDay, safeName, splitPart, zipEntryName } from '@/lib/file-name'

const day = new Date(2026, 10, 21, 15, 30)

describe('fileName', () => {
  it('joins every part in order and leaves out the empty ones', () => {
    expect(fileName({ title: 'Ada', format: 'story', date: day, ext: 'png' })).toBe('everybird-ada-story-2026-11-21.png')
    expect(fileName({ title: 'Ada', format: 'story', split: 'by-family', date: day, ext: 'zip' })).toBe('everybird-ada-story-by-family-2026-11-21.zip')
    expect(fileName({ title: 'Ada', shows: 'map', format: 'post', date: day, ext: 'png' })).toBe('everybird-ada-map-post-2026-11-21.png')
    expect(fileName({ shows: 'tree-families', format: 'a2-landscape', date: day, ext: 'pdf' })).toBe('everybird-tree-families-a2-landscape-2026-11-21.pdf')
    expect(fileName({ format: 'a4', date: day, ext: 'pdf' })).toBe('everybird-a4-2026-11-21.pdf')
    expect(fileName({ shows: 'comparison', format: 'story', date: day, ext: 'png' })).toBe('everybird-comparison-story-2026-11-21.png')
    expect(fileName({ title: 'Ada', shows: 'life-list', date: day, ext: 'csv' })).toBe('everybird-ada-life-list-2026-11-21.csv')
    expect(fileName({ shows: 'backup', date: day, ext: 'json' })).toBe('everybird-backup-2026-11-21.json')
  })

  it('has no title part for an empty or blank title', () => {
    expect(fileName({ title: '', format: 'square', date: day, ext: 'png' })).toBe('everybird-square-2026-11-21.png')
    expect(fileName({ title: ' ?* ', format: 'square', date: day, ext: 'png' })).toBe('everybird-square-2026-11-21.png')
  })
})

describe('localDay', () => {
  it('is the local date, at local midnight too', () => {
    expect(localDay(new Date(2026, 10, 21, 0, 0, 0))).toBe('2026-11-21')
    expect(localDay(new Date(2026, 10, 20, 23, 59, 59))).toBe('2026-11-20')
    expect(localDay(new Date(2027, 0, 1, 0, 0))).toBe('2027-01-01')
  })
})

describe('safeName', () => {
  it('lower-cases, turns spaces into hyphens and drops apostrophes', () => {
    expect(safeName("Ada's Big Year")).toBe('adas-big-year')
  })

  it('removes characters unsafe on any system, control characters and a leading dot', () => {
    expect(safeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a-b-c-d-e-f-g-h-i-j')
    expect(safeName('tab\there\u0000nul\u001f')).toBe('tab-here-nul')
    expect(safeName('.hidden')).toBe('hidden')
    expect(safeName('../../etc')).toBe('etc')
  })

  it('collapses repeated hyphens', () => {
    expect(safeName('a  --  b')).toBe('a-b')
  })

  it('keeps Russian and Japanese titles readable', () => {
    expect(safeName('Мои птицы 2026')).toBe('мои-птицы-2026')
    expect(safeName('私の野鳥リスト')).toBe('私の野鳥リスト')
  })

  it('cuts a long title at a hyphen, at most 40 characters', () => {
    const long = safeName('The birds of every marsh and meadow I walked in')
    expect(long).toBe('the-birds-of-every-marsh-and-meadow-i')
    expect(long.length).toBeLessThanOrEqual(40)
    expect(Array.from(safeName('鳥'.repeat(60)))).toHaveLength(40)
  })
})

describe('splitPart and zipEntryName', () => {
  it('names every split', () => {
    for (const s of ['family', 'order', 'country', 'continent', 'province', 'year']) expect(splitPart(s)).toBe(`by-${s}`)
    expect(splitPart('batches', 100)).toBe('100-birds-each')
    expect(splitPart('batches', 'all')).toBe('')
  })

  it('numbers files zero-padded to the batch size, at least two digits', () => {
    expect(zipEntryName(0, 3, 'hawks-eagles-and-kites', 'png')).toBe('01-hawks-eagles-and-kites.png')
    expect(zipEntryName(2, 12, 'canada', 'png')).toBe('03-canada.png')
    expect(zipEntryName(4, 120, 'birds-401-500', 'pdf')).toBe('005-birds-401-500.pdf')
  })
})
