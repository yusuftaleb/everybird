import { loadTaxonomy } from '@/lib/species/load'
import type { TaxonomyIndex } from '@/lib/species/resolve'
import type { ImportResult } from '@/lib/list/model'
import { parseEbirdLifeList } from './ebird-lifelist'
import { parseEbirdMyData } from './ebird-mydata'
import { DamagedCsvError, parseObsOrgSpecies, parseObsOrgObservations, type ObsOrgObservationsResult } from './obsorg'
import { parseSheetText, parseSheetXlsx } from './sheet'
import { parseScythebillCsv, parseScythebillEbird } from './scythebill'
import { DamagedXlsxError } from './xlsx'
import type { Regions } from '@/lib/species/types'

export type ParseKind = 'ebird-lifelist' | 'ebird-mydata' | 'obsorg-species' | 'obsorg-observations' | 'scythebill-csv' | 'scythebill-ebird' | 'xlsx' | 'sheet-text' | 'sheet-paste'
/** Observation.org uses iNaturalist synonyms. File types with locations also use the place registry. */
export type ParseRequest =
  | { kind: 'ebird-lifelist'; file: File; regions?: Regions }
  | { kind: 'ebird-mydata'; file: File; regions?: Regions }
  | { kind: 'obsorg-species'; file: File; synonyms: Record<string, string> }
  | { kind: 'obsorg-observations'; file: File; synonyms: Record<string, string>; regions: Regions }
  | { kind: 'scythebill-csv'; file: File; regions?: Regions }
  | { kind: 'scythebill-ebird'; file: File; regions?: Regions }
  | { kind: 'xlsx'; file: File; regions?: Regions }
  | { kind: 'sheet-text'; file: File; regions?: Regions }
  | { kind: 'sheet-paste'; text: string; regions?: Regions }
export type ParseResult = ImportResult & { excluded?: ObsOrgObservationsResult['excluded']; undated?: number; duplicates?: number; noDate?: number }
/**
 * Why a parse failed, for the UI to switch on: 'no-birds' (a readable file without a bird), 'damaged' (not readable as
 * the CSV it claims to be, or anything else the file's parser or its reading threw), 'missing-options' (a caller bug:
 * observation.org without its synonyms or regions). Failures that aren't the file's (the taxonomy didn't load, an
 * unsupported kind) carry no code.
 */
export type ParseErrorCode = 'no-birds' | 'damaged' | 'missing-options'
export type ParseResponse =
  | { type: 'progress'; rows: number }
  | { type: 'done'; result: ParseResult }
  | { type: 'error'; code?: ParseErrorCode; message: string }

class MissingOptionError extends Error {
  readonly code = 'missing-options'
}

const PROGRESS_MS = 100
const PROGRESS_ROWS = 5000

/** The worker's whole job, injectable for tests: load the taxonomy, dispatch to the parser, post messages. */
export async function handleParseMessage(
  msg: ParseRequest,
  post: (m: ParseResponse) => void,
  load: () => Promise<TaxonomyIndex> = loadTaxonomy,
): Promise<void> {
  let parsing = false
  try {
    // Checked before the taxonomy loads: a caller bug shouldn't wait on a download.
    if (msg.kind === 'obsorg-species' || msg.kind === 'obsorg-observations') {
      if (!msg.synonyms) throw new MissingOptionError('observation.org synonyms are required.')
      if (msg.kind === 'obsorg-observations' && !msg.regions) throw new MissingOptionError('observation.org regions are required.')
    }
    const t = await load()
    // From here on a failure is the file's: its reading or its parse.
    parsing = true
    let last = 0
    let lastRows = 0
    const onProgress = (rows: number) => {
      const now = Date.now()
      if (now - last >= PROGRESS_MS || rows - lastRows >= PROGRESS_ROWS) {
        last = now
        lastRows = rows
        post({ type: 'progress', rows })
      }
    }
    let result: ParseResult | { error: 'no-birds' }
    switch (msg.kind) {
      case 'ebird-mydata':
        result = await parseEbirdMyData(msg.file, t, onProgress, undefined, msg.regions)
        break
      case 'ebird-lifelist':
        result = parseEbirdLifeList(await msg.file.text(), t, msg.regions)
        break
      case 'obsorg-species':
        result = parseObsOrgSpecies(await msg.file.text(), t, msg.synonyms)
        break
      case 'obsorg-observations':
        result = await parseObsOrgObservations(msg.file, t, msg.synonyms, msg.regions, onProgress)
        break
      case 'scythebill-csv':
        result = parseScythebillCsv(await msg.file.text(), t, msg.regions, onProgress)
        break
      case 'scythebill-ebird':
        result = parseScythebillEbird(await msg.file.text(), t, msg.regions, onProgress)
        break
      case 'xlsx':
        result = parseSheetXlsx(await msg.file.arrayBuffer(), t, msg.regions, onProgress)
        break
      case 'sheet-text':
        result = parseSheetText(await msg.file.text(), t, msg.regions, onProgress)
        break
      case 'sheet-paste':
        result = parseSheetText(msg.text, t, msg.regions, onProgress)
        break
      default:
        parsing = false
        throw new Error('Unsupported import kind.')
    }
    if ('error' in result) {
      post({ type: 'error', code: 'no-birds', message: result.error })
      return
    }
    post({ type: 'done', result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const code: ParseErrorCode | undefined =
      e instanceof DamagedCsvError || e instanceof DamagedXlsxError || parsing ? 'damaged' : e instanceof MissingOptionError ? 'missing-options' : undefined
    post(code ? { type: 'error', code, message } : { type: 'error', message })
  }
}

declare const WorkerGlobalScope: unknown
// Only wire up the message listener inside a real worker (not in vitest or the main thread).
if (typeof WorkerGlobalScope !== 'undefined' && typeof self !== 'undefined' && self instanceof (WorkerGlobalScope as never)) {
  const scope = self as unknown as { onmessage: ((e: MessageEvent<ParseRequest>) => void) | null; postMessage: (m: ParseResponse) => void }
  scope.onmessage = (e) => void handleParseMessage(e.data, (m) => scope.postMessage(m))
}
