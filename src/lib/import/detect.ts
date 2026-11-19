import type { Slot } from '@/lib/list/model'

export type FileKind =
  | 'ebird-lifelist'
  | 'ebird-mydata'
  | 'obsorg-species'
  | 'obsorg-observations'
  | 'xlsx'
  | 'sheet-text'
  | 'unsupported-sheet'
  | 'unknown'

/** File kinds fill their own slots; a new kind also needs a parser in parse.worker.ts's dispatch. */
export const FILE_KINDS: readonly { kind: FileKind; slot: Slot | null; test: (cols: string[]) => boolean }[] = [
  { kind: 'ebird-lifelist', slot: 'ebird-list', test: c => c.includes('countable') },
  { kind: 'ebird-mydata', slot: 'ebird', test: c => c.includes('submission id') },
  { kind: 'obsorg-species', slot: 'obsorg-list', test: c => ['scientific name', 'species type', 'date first observed'].every(x => c.includes(x)) },
  { kind: 'obsorg-observations', slot: 'obsorg', test: c => ['scientific name', 'species type', 'country', 'date'].every(x => c.includes(x)) },
  { kind: 'xlsx', slot: 'sheet', test: () => false },
  { kind: 'sheet-text', slot: 'sheet', test: () => false },
]

export function isUnsupportedSpreadsheet(headerLine: string, fileName?: string): boolean {
  if (/\.(xls|numbers|ods)$/i.test(fileName ?? '')) return true
  return headerLine.startsWith('\u00d0\u00cf\u0011\u00e0')
}

/** Identify the export by its header (BOM, comma/semicolon/tab separators and quoted headers tolerated). */
export function detectFile(headerLine: string, fileName?: string): FileKind {
  const header = headerLine.replace(/^\uFEFF/, '')
  if (isUnsupportedSpreadsheet(header, fileName)) return 'unsupported-sheet'
  if (header.startsWith('PK\u0003\u0004') || /\.xlsx$/i.test(fileName ?? '')) return 'xlsx'
  const cols = header.split(/\r?\n/, 1)[0].split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, '').trim().toLowerCase())
  return FILE_KINDS.find(k => k.test(cols))?.kind ?? 'unknown'
}

export function slotOfKind(kind: FileKind): Slot | null {
  return FILE_KINDS.find(k => k.kind === kind)?.slot ?? null
}
