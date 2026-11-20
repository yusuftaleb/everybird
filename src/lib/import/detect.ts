import Papa from 'papaparse'
import type { Slot } from '@/lib/list/model'

export type FileKind =
  | 'ebird-lifelist'
  | 'ebird-mydata'
  | 'obsorg-species'
  | 'obsorg-observations'
  | 'scythebill-csv'
  | 'scythebill-ebird'
  | 'igoterra'
  | 'xlsx'
  | 'sheet-text'
  | 'unsupported-sheet'
  | 'unknown'

/** File kinds fill their own slots; a new kind also needs a parser in parse.worker.ts's dispatch. */
export const FILE_KINDS: readonly { kind: FileKind; slot: Slot | null; test: (cols: string[], line: string) => boolean }[] = [
  // eBird's life list: "Countable" alone is any ticked spreadsheet's column, so its other columns must be there too.
  { kind: 'ebird-lifelist', slot: 'ebird-list', test: c => ['taxon order', 'category', 'scientific name', 's/p', 'countable'].every(x => c.includes(x)) },
  { kind: 'ebird-mydata', slot: 'ebird', test: c => c.includes('submission id') },
  { kind: 'obsorg-species', slot: 'obsorg-list', test: c => ['scientific name', 'species type', 'date first observed'].every(x => c.includes(x)) },
  { kind: 'obsorg-observations', slot: 'obsorg', test: c => ['scientific name', 'species type', 'country', 'date'].every(x => c.includes(x)) },
  { kind: 'scythebill-csv', slot: 'scythebill', test: c => ['scientific', 'subspecies', 'index', 'trip name'].every(x => c.includes(x)) },
  { kind: 'scythebill-ebird', slot: 'scythebill', test: (_c, line) => isScythebillEbirdRow(line) },
  { kind: 'igoterra', slot: 'igoterra', test: c => ['scientific name', 'scientific family', 'fo', 'main group', 'species group'].every(x => c.includes(x)) },
  { kind: 'xlsx', slot: 'sheet', test: () => false },
  { kind: 'sheet-text', slot: 'sheet', test: () => false },
]

function isScythebillEbirdRow(line: string): boolean {
  const row = Papa.parse<string[]>(line, { header: false }).data[0]
  if (!row || row.length < 17) return false
  const genus = (row[1] ?? '').trim()
  const epithet = (row[2] ?? '').trim()
  const date = (row[8] ?? '').trim()
  if (!/^[A-Z][a-z-]+$/.test(genus)) return false
  if (!/^[a-z]/.test(epithet)) return false
  return /^(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/\d{4}$/.test(date)
}

export function isUnsupportedSpreadsheet(headerLine: string, fileName?: string): boolean {
  if (/\.(xls|numbers|ods)$/i.test(fileName ?? '')) return true
  return headerLine.startsWith('\u00d0\u00cf\u0011\u00e0')
}

/** Identify the export by its header (BOM, comma/semicolon/tab separators and quoted headers tolerated). */
export function detectFile(headerLine: string, fileName?: string): FileKind {
  const header = headerLine.replace(/^\uFEFF/, '')
  if (isUnsupportedSpreadsheet(header, fileName)) return 'unsupported-sheet'
  if (header.startsWith('PK\u0003\u0004') || /\.xlsx$/i.test(fileName ?? '')) return 'xlsx'
  const firstLine = header.split(/\r?\n/, 1)[0]
  const cols = firstLine.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, '').trim().toLowerCase())
  return FILE_KINDS.find(k => k.test(cols, firstLine))?.kind ?? 'unknown'
}

export function slotOfKind(kind: FileKind): Slot | null {
  return FILE_KINDS.find(k => k.kind === kind)?.slot ?? null
}
