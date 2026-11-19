import { readFileSync } from 'node:fs'
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/messages/en'
import { detectFile, slotOfKind } from '@/lib/import/detect'
import { handleParseMessage, type ParseResponse } from '@/lib/import/parse.worker'
import { parseSheetDate, parseSheetText, parseSheetXlsx } from '@/lib/import/sheet'
import { DamagedXlsxError, readXlsx } from '@/lib/import/xlsx'
import { buildList } from '@/lib/list/build-list'
import { fromJson, toCsv, toJson } from '@/lib/list/export'
import { buildSeen } from '@/lib/list/seen'
import { slotConnected, sourceCounts, summaryLine } from '@/lib/list/source-counts'
import { emptySaved, replaceSource, type Saved } from '@/lib/list/storage'
import { recordsOf } from '@/lib/list/store'
import { buildSpeciesIndex, buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, SpeciesRow, TaxonRow } from '@/lib/species/types'

const rawSpecies = JSON.parse(readFileSync('public/data/species.v1.json', 'utf8')) as { species: SpeciesRow[] }
const rawTaxon = JSON.parse(readFileSync('public/data/taxonomy.v1.json', 'utf8')) as { taxa: TaxonRow[] }
const species = buildSpeciesIndex(rawSpecies.species)
const taxonomy = buildTaxonomyIndex(rawTaxon.taxa)
const regions = JSON.parse(readFileSync('public/data/regions.v1.json', 'utf8')) as Regions

const fixture = (name: string) => readFileSync(`tests/fixtures/spreadsheet/${name}`, 'utf8')

function makeXlsx(opts: {
  sheets: { name: string; xml: string; state?: string }[]
  sharedStrings?: string[]
  stylesXml?: string
  workbookPr?: string
}): Uint8Array {
  const files: Record<string, Uint8Array> = {}
  const sheetEntries = opts.sheets
    .map((s, i) => `<sheet name="${s.name}" sheetId="${i + 1}"${s.state ? ` state="${s.state}"` : ''} r:id="rId${i + 1}"/>`)
    .join('')
  const relEntries = opts.sheets
    .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
    .join('')
  files['xl/workbook.xml'] = strToU8(`<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${opts.workbookPr ?? ''}<sheets>${sheetEntries}</sheets></workbook>`)
  files['xl/_rels/workbook.xml.rels'] = strToU8(`<?xml version="1.0"?><Relationships>${relEntries}</Relationships>`)
  if (opts.sharedStrings) {
    const sis = opts.sharedStrings.map((s) => (/^<(?:x:)?si>/.test(s) ? s : `<si><t>${s}</t></si>`)).join('')
    files['xl/sharedStrings.xml'] = strToU8(`<?xml version="1.0"?><sst>${sis}</sst>`)
  }
  if (opts.stylesXml) files['xl/styles.xml'] = strToU8(opts.stylesXml)
  opts.sheets.forEach((s, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(s.xml)
  })
  return zipSync(files)
}

/** A species' country and province keys as the Places filter sees them (the store projects stored places first). */
function placeKeysOf(saved: Saved, kinds = /^[cs]:/) {
  const records = recordsOf(saved, regions)
  const seen = buildSeen(records, saved.edits, saved.rules, buildList(records, saved.edits, saved.rules))
  return (code: string) => [...(seen.byCode.get(code)?.keys ?? [])].filter((k) => kinds.test(k)).sort()
}

describe('spreadsheet import', () => {
  it('parses English-only CSV with dates, places, duplicates, non-species, and unmatched suggestions', () => {
    const res = parseSheetText(fixture('english-list.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return

    expect(res.duplicates).toBe(1)
    expect(res.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig', 'barswa', 'houspa'])

    const mallard = res.records.find((r) => r.code === 'mallar3')!
    expect(mallard.date).toBe('2021-04-12')
    expect(mallard.place?.country).toBe('CA')
    expect(mallard.seen?.some((s) => s.includes('|CA'))).toBe(true)
    expect(mallard.seen?.some((s) => s.includes('|US'))).toBe(true)

    const notSp = res.unmatched.find((u) => u.reason === 'not-species')
    expect(notSp?.com ?? notSp?.sci).toBe('Anas sp.')

    const miss = res.unmatched.find((u) => u.reason === 'no-match')
    expect(miss?.com).toBe('Mallardd')
    expect(miss?.suggestion).toBe('mallar3')
  })

  it('resolves scientific names in a Species column and common names in a Taxon column', () => {
    const sciInSpecies = parseSheetText('Species,Country\nAnas platyrhynchos,Canada\n', taxonomy, regions)
    expect('error' in sciInSpecies).toBe(false)
    if (!('error' in sciInSpecies)) {
      expect(sciInSpecies.records.map((r) => r.code)).toEqual(['mallar3'])
      expect(sciInSpecies.records[0].place?.country).toBe('CA')
    }

    const comInTaxon = parseSheetText('Taxon,Country\nRock Pigeon,Egypt\n', taxonomy, regions)
    expect('error' in comInTaxon).toBe(false)
    if (!('error' in comInTaxon)) {
      expect(comInTaxon.records.map((r) => r.code)).toEqual(['rocpig'])
      expect(comInTaxon.records[0].place?.country).toBe('EG')
    }
  })

  it('parses scientific names and splits multi-country cells into separate sightings', () => {
    const res = parseSheetText(fixture('sci-multicountry.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return

    expect(res.duplicates).toBe(1)
    const mallard = res.records.find((r) => r.code === 'mallar3')!
    expect(mallard.date).toBe('2020-05')
    expect(mallard.seen?.map((s) => s.split('|')[1])).toEqual(expect.arrayContaining(['CA', 'FR', 'KE']))

    const pigeon = res.records.find((r) => r.code === 'rocpig')!
    expect(pigeon.date).toBe('2021')
    expect(pigeon.seen?.map((s) => s.split('|')[1])).toEqual(expect.arrayContaining(['EG', 'ES', 'MA']))

    const swallow = res.records.find((r) => r.code === 'barswa')!
    expect(swallow.date).toBe('2022-11-14')
  })

  it('reads a country name with a comma as one country', () => {
    const res = parseSheetText('Common Name,Country\nMallard,"Congo, Democratic Republic of the"\nRock Pigeon,"Korea, Republic of"\nBarn Swallow,"Canada, Kenya"\n', taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(res.records.map((r) => [r.code, r.seen?.map((s) => s.split('|')[1])])).toEqual([
      ['mallar3', ['CD']],
      ['rocpig', ['KR']],
      ['barswa', ['CA', 'KE']],
    ])
  })

  it('reads a Location cell as country and province, never the country as a province', () => {
    const csv = [
      'Common Name,Location',
      'Mallard,Kenya',
      'Rock Pigeon,"Vancouver, BC, Canada"',
      'Barn Swallow,"British Columbia, Canada"',
      'House Sparrow,"San Diego, CA, USA"',
      'European Robin,"Kenya, Tanzania"',
    ].join('\n')
    const res = parseSheetText(csv, taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    const keys = placeKeysOf(replaceSource(emptySaved(), 'sheet', res))
    expect(keys('mallar3')).toEqual(['c:KE'])
    expect(keys('rocpig')).toEqual(['c:CA', 's:CA-BC'])
    expect(keys('barswa')).toEqual(['c:CA', 's:CA-BC'])
    expect(keys('houspa')).toEqual(['c:US', 's:US-CA'])
    expect(keys('eurrob1')).toEqual(['c:KE', 'c:TZ'])
  })

  it('finds the province among a place cell\'s parts when the country has its own column', () => {
    const res = parseSheetText('Common Name,Country,Place\nMallard,Canada,"Vancouver, BC"\nRock Pigeon,United States,Georgia\n', taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    const keys = placeKeysOf(replaceSource(emptySaved(), 'sheet', res))
    expect(keys('mallar3')).toEqual(['c:CA', 's:CA-BC'])
    expect(keys('rocpig')).toEqual(['c:US', 's:US-GA'])
  })

  it('puts Puerto Rico entered as a US state in the Caribbean and Latin America', () => {
    const res = parseSheetText('Common Name,Country,State\nMallard,United States,Puerto Rico\n', taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(placeKeysOf(replaceSource(emptySaved(), 'sheet', res), /^[sr]:/)('mallar3')).toEqual(['r:caribbean', 'r:latam', 's:US-PR'])
  })

  it('parses a pasted plain list, single plain cell, and quoted TSV with tabs/newlines', () => {
    const plain = parseSheetText(fixture('pasted-plain.txt'), taxonomy, regions)
    expect('error' in plain).toBe(false)
    if (!('error' in plain)) {
      expect(plain.records).toHaveLength(4)
      expect(plain.duplicates).toBe(1)
      expect(plain.unmatched).toHaveLength(1)
      expect(plain.unmatched[0].com).toBe('Unknown Birdus')
    }

    const single = parseSheetText('Mallard', taxonomy, regions)
    expect('error' in single).toBe(false)
    if (!('error' in single)) {
      expect(single.records.map((r) => r.code)).toEqual(['mallar3'])
    }

    const tsv = 'Common Name\tCountry\tNote\n"Mallard"\t"Canada"\t"Seen with\ta tab and\nnewline"\n"Rock Pigeon"\t"Egypt"\t"City"\n'
    const tsvRes = parseSheetText(tsv, taxonomy, regions)
    expect('error' in tsvRes).toBe(false)
    if (!('error' in tsvRes)) {
      expect(tsvRes.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig'])
      expect(tsvRes.records[0].place?.country).toBe('CA')
      expect(tsvRes.records[1].place?.country).toBe('EG')
    }
  })

  it('reads every line of a pasted list with a stray quote', () => {
    const res = parseSheetText('"Mallard\nRock Pigeon\nBarn Swallow\n', taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(res.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig', 'barswa'])
  })

  it('numbers unmatched rows as the birder\'s file does, title and blank rows included', () => {
    const text = parseSheetText('My birds\n\nCommon Name\nMallard\n\nMallardd\n', taxonomy, regions)
    if ('error' in text) throw new Error('expected parse success')
    expect(text.unmatched.map((u) => [u.com, u.row])).toEqual([['Mallardd', 6]])

    const cell = (r: number, v: string) => `<row r="${r}"><c r="A${r}" t="inlineStr"><is><t>${v}</t></is></c></row>`
    const xlsx = makeXlsx({ sheets: [{ name: 'Birds', xml: `<?xml version="1.0"?><worksheet><sheetData>${cell(1, 'My birds')}${cell(3, 'Common Name')}${cell(4, 'Mallard')}${cell(7, 'Mallardd')}</sheetData></worksheet>` }] })
    const sheet = parseSheetXlsx(xlsx, taxonomy, regions)
    if ('error' in sheet) throw new Error('expected parse success')
    expect(sheet.unmatched.map((u) => [u.com, u.row])).toEqual([['Mallardd', 7]])
  })

  it('imports only marked rows from a ticked checklist', () => {
    const res = parseSheetText(fixture('ticked-checklist.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.records).toHaveLength(5)
  })

  it('skips title rows above the header row', () => {
    const res = parseSheetText(fixture('title-rows.csv'), taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.records.map((r) => r.code)).toEqual(['barswa', 'houspa', 'eurrob1'])
  })

  it('keeps only the year when day/month order is ambiguous', () => {
    expect(parseSheetDate('03/04/2024', 'ambiguous')).toBe('2024')
    expect(parseSheetDate('15/04/2024', 'ambiguous')).toBe('2024-04-15')
    expect(parseSheetDate('04/15/2024', 'ambiguous')).toBe('2024-04-15')
    expect(parseSheetDate('2024-05', 'ambiguous')).toBe('2024-05')
    expect(parseSheetDate('2024', 'ambiguous')).toBe('2024')
  })

  it('reads .xlsx with shared strings, rich text runs, inline strings, serial dates, and picks the best sheet', () => {
    const xlsx = makeXlsx({
      sharedStrings: [
        'Common Name',
        'Date',
        '<si><r><t>Mal</t></r><r><rPr><b/></rPr><t>lard</t></r></si>',
        'Country',
        'Canada',
      ],
      stylesXml: `<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      sheets: [
        {
          name: 'Notes',
          xml: `<?xml version="1.0"?><worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Nothing here</t></is></c></row></sheetData></worksheet>`,
        },
        {
          name: 'Birds',
          xml: `<?xml version="1.0"?><worksheet><sheetData>
            <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>3</v></c></row>
            <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"><v>45231</v></c><c r="C2" t="s"><v>4</v></c></row>
            <row r="3"><c r="A3" t="inlineStr"><is><t>Rock Pigeon</t></is></c><c r="B3"><v>2022</v></c></row>
          </sheetData></worksheet>`,
        },
      ],
    })

    const res = parseSheetXlsx(xlsx, taxonomy, regions)
    expect('error' in res).toBe(false)
    if ('error' in res) return
    expect(res.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig'])
    expect(res.records[0].date).toBe('2023-11-01')
    expect(res.records[0].place?.country).toBe('CA')
    expect(res.records[1].date).toBe('2022')
  })

  it('skips hidden and very hidden sheets, however many birds they name', () => {
    const rows = (names: string[]) =>
      `<?xml version="1.0"?><worksheet><sheetData>${['Common Name', ...names].map((n, i) => `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${n}</t></is></c></row>`).join('')}</sheetData></worksheet>`
    const lookup = rawSpecies.species.slice(0, 30).map((r) => r.com)
    const xlsx = makeXlsx({
      sheets: [
        { name: 'Lookup', state: 'hidden', xml: rows(lookup) },
        { name: 'My list', xml: rows(['Mallard', 'Rock Pigeon']) },
        { name: 'Names', state: 'veryHidden', xml: rows(lookup) },
      ],
    })
    const res = parseSheetXlsx(xlsx, taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(res.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig'])
  })

  it('gives no-birds for a readable file where no row names a species', () => {
    expect(parseSheetText('Date,Description,Amount\n2024-01-02,Coffee,3.50\n2024-01-03,Lunch,12.00\n', taxonomy, regions)).toEqual({ error: 'no-birds' })
    expect(parseSheetText('Shopping\nMilk\nBread\n', taxonomy, regions)).toEqual({ error: 'no-birds' })
  })

  it('reads dates in a workbook on the 1904 date system', () => {
    const sheet = (serial: number) => `<?xml version="1.0"?><worksheet><sheetData>
      <row r="1"><c r="A1" t="inlineStr"><is><t>Common Name</t></is></c><c r="B1" t="inlineStr"><is><t>Date</t></is></c></row>
      <row r="2"><c r="A2" t="inlineStr"><is><t>Mallard</t></is></c><c r="B2" s="1"><v>${serial}</v></c></row>
    </sheetData></worksheet>`
    const stylesXml = `<?xml version="1.0"?><styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`
    const dateOf = (xlsx: Uint8Array) => {
      const res = parseSheetXlsx(xlsx, taxonomy, regions)
      if ('error' in res) throw new Error('expected parse success')
      return res.records[0].date
    }
    expect(dateOf(makeXlsx({ stylesXml, workbookPr: '<workbookPr date1904="1"/>', sheets: [{ name: 'Mac', xml: sheet(43769) }] }))).toBe('2023-11-01')
    expect(dateOf(makeXlsx({ stylesXml, workbookPr: '<workbookPr date1904="false"/>', sheets: [{ name: 'Win', xml: sheet(45231) }] }))).toBe('2023-11-01')
  })

  it('reads prefixed SpreadsheetML elements and CDATA text', () => {
    const xlsx = makeXlsx({
      sharedStrings: ['<x:si><x:t><![CDATA[Common Name]]></x:t></x:si>', '<x:si><x:t><![CDATA[Mallard & co]]></x:t></x:si>'],
      sheets: [
        {
          name: 'Prefixed',
          xml: `<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData>
            <x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c></x:row>
            <x:row r="2"><x:c r="A2" t="inlineStr"><x:is><x:t><![CDATA[Rock Pigeon]]></x:t></x:is></x:c></x:row>
            <x:row r="3"><x:c r="A3" t="inlineStr"><x:is><x:t>Barn Swallow</x:t></x:is></x:c></x:row>
          </x:sheetData></x:worksheet>`,
        },
      ],
    })
    const res = parseSheetXlsx(xlsx, taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(res.records.map((r) => r.code)).toEqual(['rocpig', 'barswa'])
    expect(readXlsx(xlsx)[0].rows[0]).toEqual(['Common Name'])
  })

  it('throws DamagedXlsxError on unreadable xlsx bytes', () => {
    expect(() => parseSheetXlsx(new Uint8Array([1, 2, 3, 4]), taxonomy, regions)).toThrow(DamagedXlsxError)
  })

  it('detects xlsx and rejects legacy xls, numbers, and ods', () => {
    expect(detectFile('PK\u0003\u0004', 'birds.xlsx')).toBe('xlsx')
    expect(slotOfKind('xlsx')).toBe('sheet')
    expect(detectFile('', 'old.xls')).toBe('unsupported-sheet')
    expect(detectFile('PK\u0003\u0004', 'list.numbers')).toBe('unsupported-sheet')
    expect(detectFile('PK\u0003\u0004', 'list.ods')).toBe('unsupported-sheet')
    expect(slotOfKind('unsupported-sheet')).toBeNull()
  })

  it('integrates with storage, backup export/import, source counts, and Places filtering', () => {
    const res = parseSheetText(fixture('sci-multicountry.csv'), taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')

    const saved = replaceSource(emptySaved(), 'sheet', res, { kind: 'file', file: 'birds.csv', rows: res.rows, at: '2026-11-19T00:00:00Z' })
    const restored = fromJson(toJson(saved))
    expect(restored.records.sheet).toHaveLength(4)
    expect(restored.sources?.sheet?.file).toBe('birds.csv')

    const list = buildList(restored.records.sheet, restored.edits, restored.rules)
    const seen = buildSeen(restored.records.sheet, restored.edits, restored.rules, list)
    expect(seen.byCode.get('rocpig')?.keys.has('c:EG')).toBe(true)
    expect(seen.byCode.get('rocpig')?.keys.has('c:ES')).toBe(true)
    expect(seen.byCode.get('rocpig')?.keys.has('c:MA')).toBe(true)

    const counts = sourceCounts(restored, list)
    expect(counts.rows.sheet.species).toBe(4)
    expect(summaryLine(counts, en.ui)).toBe('Your collage has 4 species, all from your spreadsheet.')

    const csv = toCsv(list, species, regions, seen)
    expect(csv).toContain('Egypt; Morocco; Spain')
  })

  it('reads a spreadsheet with a Countable column as a spreadsheet, never as an eBird life list', () => {
    const csv = 'Common Name,Scientific Name,Countable\nNorthern Flicker,Colaptes auratus,x\nMallard,Anas platyrhynchos,\n'
    expect(detectFile(csv.split('\n')[0], 'ticks.csv')).toBe('unknown') // the spreadsheet row then reads it as text
    const res = parseSheetText(csv, taxonomy, regions)
    if ('error' in res) throw new Error('expected parse success')
    expect(res.records.map((r) => r.code)).toEqual(['norfli'])
    expect(res.notCountable).toBeUndefined()
  })

  it('shows a slot that holds only not-countable species as connected, so it can be removed', () => {
    const saved = replaceSource(emptySaved(), 'ebird-list', { records: [], unmatched: [], skipped: 2, rows: 2, notCountable: ['norfli', 'mallar3'] })
    expect(slotConnected(saved, 'ebird-list')).toBe(true)
    expect(slotConnected(saved, 'ebird')).toBe(false)
    expect(slotConnected(emptySaved(), 'ebird-list')).toBe(false)
  })

  it('dispatches xlsx and sheet-text through the parse worker handler', async () => {
    const msgs: ParseResponse[] = []
    await handleParseMessage(
      { kind: 'sheet-paste', text: 'Mallard\nRock Pigeon\n', regions },
      (m) => msgs.push(m),
      async () => taxonomy,
    )
    const done = msgs.find((m) => m.type === 'done')
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.result.records.map((r) => r.code)).toEqual(['mallar3', 'rocpig'])
    }
  })
})
