import { strFromU8, unzipSync } from 'fflate'

export type XlsxSheet = {
  name: string
  /** The sheet's rows with cells (blank rows left out). */
  rows: string[][]
  /** Each row's number in Excel (its `r`), for "Spreadsheet row N". */
  lines: number[]
}

export class DamagedXlsxError extends Error {
  constructor(message = 'Unreadable Excel workbook.') {
    super(message)
    this.name = 'DamagedXlsxError'
  }
}

/** `date1904`: the workbook counts days from 1904-01-01 (old Mac Excel), 1,462 days after the 1900 system's day 0. */
export function excelSerialToIso(serial: number, date1904 = false): string | undefined {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2958465) return undefined
  const ms = Date.UTC(1899, 11, 30) + (Math.floor(serial) + (date1904 ? 1462 : 0)) * 86400_000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return undefined
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${String(y).padStart(4, '0')}-${m}-${day}`
}

function decodeXml(s: string): string {
  return s.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (m, code: string) => {
    if (code === 'amp') return '&'
    if (code === 'lt') return '<'
    if (code === 'gt') return '>'
    if (code === 'quot') return '"'
    if (code === 'apos') return "'"
    if (code.startsWith('#x') || code.startsWith('#X')) {
      const cp = parseInt(code.slice(2), 16)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m
    }
    if (code.startsWith('#')) {
      const cp = parseInt(code.slice(1), 10)
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : m
    }
    return m
  })
}

function attr(tag: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)(?:[a-zA-Z0-9_-]+:)?${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)
  const m = re.exec(tag)
  return m ? decodeXml(m[1] ?? m[2] ?? '') : undefined
}

function colIndex(ref: string): number {
  const m = /^([A-Za-z]+)/.exec(ref)
  if (!m) return -1
  let n = 0
  for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function extractText(xml: string): string {
  const clean = xml.replace(/<rPh(?:\s[^>]*)?>[\s\S]*?<\/rPh>/g, '')
  let out = ''
  const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    if (m[1]) out += decodeXml(m[1])
  }
  return out
}

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47])

function isDateFormatCode(code: string): boolean {
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '')
  return /[ymd]/i.test(stripped)
}

function parseDateStyles(xml: string | undefined): Set<number> {
  const dateStyleIndices = new Set<number>()
  if (!xml) return dateStyleIndices
  const customDateIds = new Set<number>()
  const numFmtRe = /<numFmt\b([^>]*?)\/?>/g
  let m: RegExpExecArray | null
  while ((m = numFmtRe.exec(xml))) {
    const id = Number(attr(m[1], 'numFmtId'))
    const code = attr(m[1], 'formatCode') ?? ''
    if (Number.isInteger(id) && isDateFormatCode(code)) customDateIds.add(id)
  }
  const cellXfsMatch = /<cellXfs(?:\s[^>]*)?>([\s\S]*?)<\/cellXfs>/.exec(xml)
  if (!cellXfsMatch) return dateStyleIndices
  const xfRe = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g
  let idx = 0
  while ((m = xfRe.exec(cellXfsMatch[1]))) {
    const fmtId = Number(attr(m[1], 'numFmtId'))
    if (BUILTIN_DATE_FMTS.has(fmtId) || customDateIds.has(fmtId)) dateStyleIndices.add(idx)
    idx++
  }
  return dateStyleIndices
}

function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(extractText(m[1]))
  return out
}

function parseSheetRows(xml: string, shared: string[], dateStyles: Set<number>, date1904: boolean): Omit<XlsxSheet, 'name'> {
  const rows: string[][] = []
  const lines: number[] = []
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g
  let rm: RegExpExecArray | null
  while ((rm = rowRe.exec(xml))) {
    const body = rm[2]
    const n = Number(attr(rm[1] ?? '', 'r'))
    if (!body) continue
    const cells: string[] = []
    let nextCol = 0
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g
    let cm: RegExpExecArray | null
    while ((cm = cellRe.exec(body))) {
      const attrs = cm[1] ?? ''
      const inner = cm[2] ?? ''
      const ref = attr(attrs, 'r')
      const col = ref ? colIndex(ref) : nextCol
      const targetCol = col >= 0 ? col : nextCol
      nextCol = targetCol + 1
      const t = attr(attrs, 't')
      let val = ''
      if (t === 's') {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
        if (vm) val = shared[Number(vm[1].trim())] ?? ''
      } else if (t === 'inlineStr') {
        const im = /<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/.exec(inner)
        if (im) val = extractText(im[1])
      } else if (t === 'str' || t === 'e') {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
        if (vm) val = decodeXml(vm[1])
      } else if (t === 'b') {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
        if (vm) val = vm[1].trim() === '1' ? 'true' : 'false'
      } else {
        const vm = /<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/.exec(inner)
        if (vm) {
          const raw = vm[1].trim()
          const s = attr(attrs, 's')
          const styleIdx = s !== undefined ? Number(s) : -1
          if (raw && dateStyles.has(styleIdx) && Number.isFinite(Number(raw))) {
            val = excelSerialToIso(Number(raw), date1904) ?? raw
          } else {
            val = raw
          }
        }
      }
      while (cells.length <= targetCol) cells.push('')
      cells[targetCol] = val
    }
    while (cells.length && !cells[cells.length - 1].trim()) cells.pop()
    if (cells.some((c) => c.trim())) {
      rows.push(cells)
      lines.push(Number.isInteger(n) && n > (lines.at(-1) ?? 0) ? n : (lines.at(-1) ?? 0) + 1)
    }
  }
  return { rows, lines }
}

/** One spelling for the parsers below: CDATA sections become escaped text, and element prefixes go (`<x:row>` is
 *  `<row>`; some writers prefix every SpreadsheetML element). */
function plainXml(xml: string): string {
  return xml
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_, text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1')
}

function normalizePath(p: string): string {
  return p.replace(/^\/+/, '').replace(/^\.\//, '')
}

function resolveTarget(target: string): string {
  const clean = normalizePath(target)
  return clean.startsWith('xl/') ? clean : `xl/${clean}`
}

export function readXlsx(data: Uint8Array | ArrayBuffer): XlsxSheet[] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(bytes)
  } catch {
    throw new DamagedXlsxError()
  }
  const byPath = new Map<string, Uint8Array>()
  for (const [k, v] of Object.entries(files)) byPath.set(normalizePath(k).toLowerCase(), v)
  const textOf = (p: string) => {
    const entry = byPath.get(normalizePath(p).toLowerCase())
    return entry ? plainXml(strFromU8(entry)) : undefined
  }

  const shared = parseSharedStrings(textOf('xl/sharedStrings.xml'))
  const dateStyles = parseDateStyles(textOf('xl/styles.xml'))
  const workbookXml = textOf('xl/workbook.xml')
  const relsXml = textOf('xl/_rels/workbook.xml.rels')
  // shortcut: a bare serial in a cell without a date format is read in sheet.ts with the 1900 system; such cells are rare.
  const prMatch = workbookXml ? /<workbookPr\b([^>]*?)\/?>/.exec(workbookXml) : null
  const date1904 = !!prMatch && ['1', 'true'].includes(attr(prMatch[1], 'date1904') ?? '')

  const rels = new Map<string, string>()
  if (relsXml) {
    const relRe = /<Relationship\b([^>]*?)\/?>/g
    let m: RegExpExecArray | null
    while ((m = relRe.exec(relsXml))) {
      const id = attr(m[1], 'Id')
      const target = attr(m[1], 'Target')
      if (id && target) rels.set(id, resolveTarget(target))
    }
  }

  const sheetSpecs: { name: string; path: string }[] = []
  let hidden = 0
  if (workbookXml) {
    const sheetRe = /<sheet\b([^>]*?)\/?>/g
    let m: RegExpExecArray | null
    while ((m = sheetRe.exec(workbookXml))) {
      // A hidden sheet is the workbook's lookup data (a list of every name), never the birder's list.
      const state = attr(m[1], 'state')
      if (state === 'hidden' || state === 'veryHidden') {
        hidden++
        continue
      }
      const name = attr(m[1], 'name') ?? `Sheet ${sheetSpecs.length + 1}`
      const rid = attr(m[1], 'id')
      const path = rid ? rels.get(rid) : undefined
      if (path) sheetSpecs.push({ name, path })
    }
  }

  if (!sheetSpecs.length && !hidden) {
    const paths = Object.keys(files)
      .map(normalizePath)
      .filter((p) => /^xl\/worksheets\/sheet\d+\.xml$/i.test(p))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    paths.forEach((path, i) => sheetSpecs.push({ name: `Sheet ${i + 1}`, path }))
  }

  if (!sheetSpecs.length) throw new DamagedXlsxError('No worksheets found in Excel workbook.')

  const sheets: XlsxSheet[] = []
  for (const spec of sheetSpecs) {
    const xml = textOf(spec.path)
    if (!xml) continue
    sheets.push({ name: spec.name, ...parseSheetRows(xml, shared, dateStyles, date1904) })
  }
  if (!sheets.length) throw new DamagedXlsxError('No readable worksheets found in Excel workbook.')
  return sheets
}
