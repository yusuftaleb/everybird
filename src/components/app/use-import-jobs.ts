'use client'
// The imports in flight (an eBird or observation.org file being read, an iNaturalist fetch), kept in the provider above the routes, so
// they keep running and keep their progress while the birder moves between /, /settings and /about.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectFile, slotOfKind, type FileKind } from '@/lib/import/detect'
import { importInat, type InatError, type InatProgress } from '@/lib/import/inat'
import { parseErrorCode, parseInWorker } from '@/lib/import/parse-client'
import type { ParseResult } from '@/lib/import/parse.worker'
import { loadRegions } from '@/lib/import/places'
import type { ImportResult, Slot } from '@/lib/list/model'
import type { DetailsFor, EbirdDetails, ObsOrgDetails, ScythebillDetails, SheetDetails } from '@/lib/list/storage'
import { loadTaxonomy } from '@/lib/species/load'
import type { Regions } from '@/lib/species/types'
import { fetchData } from '@/lib/data-url'
import { fmt } from '@/i18n/core'
import type { Ui } from '@/i18n/messages/en'

/** Why a file wasn't read (worded by `fileMessage`: `t.import.ebird`, `t.import.obsorg`). `data`: Everybird's own data
 *  (taxonomy, synonyms, regions) didn't load, which isn't the file's fault. */
export type FileError =
  | 'unknown-file'
  | 'damaged'
  | 'unsupported-sheet'
  | 'data'
  | 'obsorg-unknown'
  | 'obsorg-no-birds'
  | 'obsorg-damaged'
  | 'sheet-unknown'
  | 'sheet-no-birds'
  | 'sheet-damaged'
  | 'scythebill-unknown'
  | 'scythebill-no-birds'
  | 'scythebill-damaged'
export type SheetReview = {
  result: ParseResult
  details: SheetDetails
  matched: number
  duplicates: number
  unmatchedCount: number
  notSpeciesCount: number
}
/** A file being read (an eBird, observation.org or spreadsheet export), shown under the row group it was given to. */
export type FileJob = { busy: boolean; rows: number; error: FileError | null }
export type EbirdJob = FileJob
/** The jobs hold codes, not words: the rows word them in the UI language (inatMessage, fileMessage). `error.user` is
 *  the username the failed fetch asked for (busyFor is null by the time it shows). */
export type InatJob = { busyFor: string | null; progress: InatProgress | null; error: { code: InatError; user: string } | null; note: 'cancelled' | null }
/** The last import that landed (what "See my collage" announces). */
export type Landed = { slot: Slot; species: number; at: number }

export type ImportJobs = {
  ebird: FileJob
  /** Detects the file's kind from its header, parses it in a worker and imports it into its slot; status and errors
   *  show on the eBird rows. */
  readEbird: (file: File) => Promise<void>
  obsorg: FileJob
  /** The same read, its status and errors on the observation.org rows. Any supported file lands in its kind's slot. */
  readObsOrg: (file: File) => Promise<void>
  sheet: FileJob
  readSheet: (file: File) => Promise<void>
  scythebill: FileJob
  readScythebill: (file: File) => Promise<void>
  parsePaste: (text: string) => Promise<void>
  sheetReview: SheetReview | null
  confirmSheet: () => void
  cancelSheet: () => void
  inat: InatJob
  /** Fetches (or, with the remembered username, refreshes) an iNaturalist account into the 'inat' slot. */
  fetchInat: (login: string) => Promise<void>
  cancelInat: () => void
  landed: Landed | null
}

const HEAD_BYTES = 64 * 1024

/** The header line of a file (only the first 64 KB are read here; the worker reads the rest). */
async function headerLine(file: File): Promise<string> {
  const blob = file.slice(0, HEAD_BYTES)
  const text = typeof blob.text === 'function'
    ? await blob.text()
    : await new Promise<string>((done, fail) => {
        const r = new FileReader()
        r.onload = () => done(String(r.result))
        r.onerror = () => fail(r.error)
        r.readAsText(blob)
      })
  return text.split(/\r?\n/, 1)[0] ?? ''
}

let synonymsP: Promise<Record<string, string>> | null = null
function loadSynonyms(): Promise<Record<string, string>> {
  synonymsP ??= fetchData<Record<string, string>>('inat-synonyms.v1.json')
    .catch((e) => {
      synonymsP = null
      throw e
    })
  return synonymsP
}

/** Plain messages, in `t`'s language; the rest of the list is untouched whenever one shows. */
export function inatMessage(error: InatError, user: string, t: Ui): string {
  const e = t.import.inat.errors
  switch (error) {
    case 'unknown-user':
      return fmt(e.unknownUser, { user })
    case 'no-birds':
      return fmt(e.noBirds, { user })
    case 'network':
      return e.network
    case 'rate-limited':
      return e.rateLimited
  }
}

/** A file's read failure, in `t`'s language. */
export function fileMessage(error: FileError, t: Ui): string {
  const e = t.import.ebird
  const o = t.import.obsorg.errors
  const s = t.import.sheet.errors
  const sb = t.import.scythebill.errors
  switch (error) {
    case 'unknown-file': return e.unknownFile
    case 'damaged': return e.damaged
    case 'unsupported-sheet': return s.unsupported
    case 'data': return o.data
    case 'obsorg-unknown': return o.unknown
    case 'obsorg-no-birds': return o.noBirds
    case 'obsorg-damaged': return o.damaged
    case 'sheet-unknown': return s.unknown
    case 'sheet-no-birds': return s.noBirds
    case 'sheet-damaged': return s.damaged
    case 'scythebill-unknown': return sb.unknown
    case 'scythebill-no-birds': return sb.noBirds
    case 'scythebill-damaged': return sb.damaged
  }
}

const IDLE_FILE: FileJob = { busy: false, rows: 0, error: null }
/** The row group a file was given to. */
type Via = 'ebird' | 'obsorg' | 'sheet' | 'scythebill'
const IDLE_INAT: InatJob = { busyFor: null, progress: null, error: null, note: null }

export type OnImport = (slot: Slot, result: ImportResult, details: DetailsFor<Slot>) => void

/**
 * `onImport` receives each finished import with its slot and the source's details (storage.ts `SourceDetails`: the
 * file's name, kind and rows, or the username and observation count; both with the time): the full MyEBirdData export
 * goes to 'ebird', the quick life list download to 'ebird-list', observation.org's Observed species to 'obsorg-list'
 * and its observations to 'obsorg', so one never replaces another. The file's kind (its header) picks the slot, not
 * the rows it was given to. Unmounting (leaving
 * the app's pages) aborts.
 */
export function useImportJobs(onImport: OnImport): ImportJobs {
  const [ebird, setEbird] = useState<FileJob>(IDLE_FILE)
  const [obsorg, setObsorg] = useState<FileJob>(IDLE_FILE)
  const [sheet, setSheet] = useState<FileJob>(IDLE_FILE)
  const [scythebill, setScythebill] = useState<FileJob>(IDLE_FILE)
  const [sheetReview, setSheetReview] = useState<SheetReview | null>(null)
  const [inat, setInat] = useState<InatJob>(IDLE_INAT)
  const [landed, setLanded] = useState<Landed | null>(null)
  const abort = useRef<AbortController | null>(null)
  const busyFile = useRef(false)
  const live = useRef(true)
  const latest = useRef(onImport)
  useEffect(() => { latest.current = onImport })
  useEffect(() => {
    live.current = true
    return () => { live.current = false; abort.current?.abort() }
  }, [])

  const land = useCallback((slot: Slot, result: ImportResult, details: DetailsFor<Slot>) => {
    latest.current(slot, result, details)
    setLanded({ slot, species: new Set(result.records.map((r) => r.code)).size, at: Date.now() })
  }, [])

  // One file at a time, across all file groups (eBird, observation.org, spreadsheet).
  const readFile = useCallback(async (file: File, via: Via) => {
    if (busyFile.current) return
    busyFile.current = true
    const set = via === 'ebird' ? setEbird : via === 'obsorg' ? setObsorg : via === 'sheet' ? setSheet : setScythebill
    setEbird(IDLE_FILE)
    setObsorg(IDLE_FILE)
    setSheet(IDLE_FILE)
    setScythebill(IDLE_FILE)
    setSheetReview(null)
    let kind: FileKind = 'unknown'
    let head = ''
    try {
      try {
        head = await headerLine(file)
        kind = detectFile(head, file.name)
      } catch {
        kind = 'unknown'
      }
      if (kind === 'unsupported-sheet') {
        set({ ...IDLE_FILE, error: 'unsupported-sheet' })
        return
      }
      if (kind === 'unknown' && via === 'sheet') {
        const textExt = /\.(csv|tsv|txt)$/i.test(file.name) || !/\.[a-z0-9]{1,8}$/i.test(file.name)
        if (textExt && !head.includes('\u0000')) kind = 'sheet-text'
      }
      const slot = slotOfKind(kind)
      if (kind === 'unknown' || !slot) {
        set({ ...IDLE_FILE, error: via === 'ebird' ? 'unknown-file' : via === 'obsorg' ? 'obsorg-unknown' : via === 'sheet' ? 'sheet-unknown' : 'scythebill-unknown' })
        return
      }
      set({ busy: true, rows: 0, error: null })
      const onProgress = (rows: number) => { if (live.current) set((j) => ({ ...j, rows })) }
      const obsorgKind = kind === 'obsorg-species' || kind === 'obsorg-observations'
      const sheetKind = kind === 'xlsx' || kind === 'sheet-text'
      const scythebillKind = kind === 'scythebill-csv' || kind === 'scythebill-ebird'
      // Everybird's own data first: when it doesn't load, the file isn't to blame.
      let synonyms: Record<string, string> = {}
      let regions: Regions | undefined
      try {
        [synonyms, regions] = await Promise.all([
          obsorgKind ? loadSynonyms() : {},
          kind === 'obsorg-species' ? undefined : loadRegions(),
        ])
      } catch {
        set({ ...IDLE_FILE, error: 'data' })
        return
      }
      try {
        const at = new Date().toISOString()
        let result: ParseResult
        if (kind === 'xlsx' || kind === 'sheet-text') {
          result = await parseInWorker(kind, file, { onProgress, regions })
          const details: SheetDetails = { kind: 'file', at, ...(file.name ? { file: file.name } : {}), ...(typeof result.rows === 'number' ? { rows: result.rows } : {}) }
          if (live.current) {
            setSheetReview({
              result,
              details,
              matched: result.records.length,
              duplicates: result.duplicates ?? 0,
              unmatchedCount: result.unmatched.filter((u) => u.reason === 'no-match').length,
              notSpeciesCount: result.unmatched.filter((u) => u.reason === 'not-species').length,
            })
          }
          set(IDLE_FILE)
          return
        }
        let details: EbirdDetails | ObsOrgDetails | ScythebillDetails
        if (kind === 'ebird-lifelist' || kind === 'ebird-mydata') {
          result = await parseInWorker(kind, file, { onProgress, regions })
          details = { kind: kind === 'ebird-lifelist' ? 'life-list' : 'full-export', at } satisfies EbirdDetails
        } else if (kind === 'obsorg-species') {
          result = await parseInWorker(kind, file, { onProgress, synonyms })
          details = { kind: 'species-list', at } satisfies ObsOrgDetails
        } else if (kind === 'obsorg-observations') {
          result = await parseInWorker(kind, file, { onProgress, synonyms, regions: regions! })
          details = { kind: 'observations', at, ...(result.excluded ? { excluded: result.excluded } : {}) } satisfies ObsOrgDetails
        } else if (kind === 'scythebill-csv' || kind === 'scythebill-ebird') {
          result = await parseInWorker(kind, file, { onProgress, regions })
          details = { kind: kind === 'scythebill-csv' ? 'csv' : 'ebird-record', at } satisfies ScythebillDetails
        } else {
          return
        }
        if (file.name) details.file = file.name
        if (typeof result.rows === 'number') details.rows = result.rows
        if (live.current) land(slot, result, details)
        set(IDLE_FILE)
      } catch (e) {
        // By the file's kind, wherever it was given: a damaged eBird file in eBird's words, an observation.org file in
        // its own. A failure without a code (the taxonomy didn't load, the worker crashed) isn't the file's.
        const code = parseErrorCode(e)
        const error = code === 'damaged' || code === 'no-birds'
          ? obsorgKind
            ? (code === 'no-birds' ? 'obsorg-no-birds' : 'obsorg-damaged')
            : sheetKind
              ? (code === 'no-birds' ? 'sheet-no-birds' : 'sheet-damaged')
              : scythebillKind
                ? (code === 'no-birds' ? 'scythebill-no-birds' : 'scythebill-damaged')
                : 'damaged'
          : 'data'
        set({ ...IDLE_FILE, error })
      }
    } finally {
      busyFile.current = false
    }
  }, [land])
  const readEbird = useCallback((file: File) => readFile(file, 'ebird'), [readFile])
  const readObsOrg = useCallback((file: File) => readFile(file, 'obsorg'), [readFile])
  const readSheet = useCallback((file: File) => readFile(file, 'sheet'), [readFile])
  const readScythebill = useCallback((file: File) => readFile(file, 'scythebill'), [readFile])

  const parsePaste = useCallback(async (text: string) => {
    if (busyFile.current || !text.trim()) return
    busyFile.current = true
    setEbird(IDLE_FILE)
    setObsorg(IDLE_FILE)
    setScythebill(IDLE_FILE)
    setSheet({ busy: true, rows: 0, error: null })
    setSheetReview(null)
    try {
      let regions: Regions | undefined
      try {
        regions = await loadRegions()
      } catch {
        setSheet({ ...IDLE_FILE, error: 'data' })
        return
      }
      try {
        const at = new Date().toISOString()
        const file = new File([text], 'pasted.txt', { type: 'text/plain' })
        const onProgress = (rows: number) => { if (live.current) setSheet((j) => ({ ...j, rows })) }
        const result = await parseInWorker('sheet-text', file, { onProgress, regions })
        const details: SheetDetails = { kind: 'paste', at, ...(typeof result.rows === 'number' ? { rows: result.rows } : {}) }
        if (live.current) {
          setSheetReview({
            result,
            details,
            matched: result.records.length,
            duplicates: result.duplicates ?? 0,
            unmatchedCount: result.unmatched.filter((u) => u.reason === 'no-match').length,
            notSpeciesCount: result.unmatched.filter((u) => u.reason === 'not-species').length,
          })
        }
        setSheet(IDLE_FILE)
      } catch (e) {
        const code = parseErrorCode(e)
        const error: FileError = code === 'no-birds' ? 'sheet-no-birds' : code === 'damaged' ? 'sheet-damaged' : 'data'
        setSheet({ ...IDLE_FILE, error })
      }
    } finally {
      busyFile.current = false
    }
  }, [])

  const confirmSheet = useCallback(() => {
    if (!sheetReview) return
    land('sheet', sheetReview.result, sheetReview.details)
    setSheetReview(null)
  }, [land, sheetReview])

  const cancelSheet = useCallback(() => {
    setSheetReview(null)
  }, [])

  const fetchInat = useCallback(async (raw: string) => {
    const login = raw.trim().replace(/^@/, '').trim() // "@ sam" too: the username is stored and shown exactly
    if (!login || abort.current) return
    setInat({ busyFor: login, progress: null, error: null, note: null })
    const ctl = new AbortController()
    abort.current = ctl
    let end: Partial<InatJob> = {}
    let observations = 0
    try {
      const [taxonomy, synonyms, regions] = await Promise.all([loadTaxonomy(), loadSynonyms(), loadRegions()])
      const res = await importInat(login, {
        taxonomy, synonyms, regions, signal: ctl.signal,
        onProgress: (progress) => {
          observations = progress.fetched
          if (abort.current === ctl) setInat((j) => ({ ...j, progress }))
        },
      })
      if (ctl.signal.aborted) end = { note: 'cancelled' }
      else if ('error' in res) end = { error: { code: res.error, user: login } }
      else land('inat', res, { user: login, observations, at: new Date().toISOString() })
    } catch (err) {
      end = (err as Error)?.name === 'AbortError' || ctl.signal.aborted ? { note: 'cancelled' } : { error: { code: 'network', user: login } }
    } finally {
      if (abort.current === ctl) abort.current = null
      setInat({ ...IDLE_INAT, ...end })
    }
  }, [land])

  const cancelInat = useCallback(() => abort.current?.abort(), [])

  return useMemo(
    () => ({ ebird, readEbird, obsorg, readObsOrg, sheet, readSheet, scythebill, readScythebill, parsePaste, sheetReview, confirmSheet, cancelSheet, inat, fetchInat, cancelInat, landed }),
    [ebird, readEbird, obsorg, readObsOrg, sheet, readSheet, scythebill, readScythebill, parsePaste, sheetReview, confirmSheet, cancelSheet, inat, fetchInat, cancelInat, landed],
  )
}
