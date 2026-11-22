// detect.ts reads a line's fields without papaparse (it stays in the import worker's chunk): the same fields as
// papaparse's own one-line parse, delimiter guess included.
import Papa from 'papaparse'
import { describe, expect, it } from 'vitest'
import { csvFields, detectFile } from '@/lib/import/detect'

const row17 = (d: string, cells: string[]) => cells.concat(Array(17 - cells.length).fill('x')).join(d)
const LINES = [
  '',
  'one',
  'a,b,c',
  'a;b;c',
  'a\tb\tc',
  'a|b|c',
  'a,b;c;d',
  'a;b,c,d',
  '"Smith, Jo",b,c',
  '"say ""hi""",b',
  '"a;b";c;d',
  'ab"c,d',
  '"",x,',
  ',,,',
  row17(',', ['Trip', 'Turdus', 'migratorius', '', '', '', '', '', '5/14/2024']),
  row17(';', ['Trip', 'Turdus', 'migratorius', '', '', '', '', '', '5/14/2024']),
  row17('\t', ['"Trip, one"', 'Turdus', 'migratorius', '', '', '', '', '', '05/04/2024']),
  'a,b\tc\td',
]

describe('csvFields', () => {
  it.each(LINES)('reads %j as papaparse does', (line) => {
    expect(csvFields(line)).toEqual(Papa.parse<string[]>(line, { header: false }).data[0] ?? [''])
  })

  it("still detects a Scythebill eBird-format row, and not a header", () => {
    expect(detectFile(row17(',', ['Trip', 'Turdus', 'migratorius', '', '', '', '', '', '5/14/2024']))).toBe('scythebill-ebird')
    expect(detectFile(row17(',', ['Trip', 'turdus', 'migratorius', '', '', '', '', '', '5/14/2024']))).toBe('unknown')
  })
})
