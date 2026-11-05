export type FileKind = 'ebird-lifelist' | 'ebird-mydata' | 'unknown'

/** Identify an eBird export from its header line (BOM tolerated). */
export function detectFile(headerLine: string): FileKind {
  const cols = headerLine.replace(/^﻿/, '').split(',').map((c) => c.trim().replace(/^"|"$/g, ''))
  if (cols.includes('Countable')) return 'ebird-lifelist'
  if (cols.includes('Submission ID')) return 'ebird-mydata'
  return 'unknown'
}
