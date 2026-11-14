'use client'
// The imports in flight (an eBird file being read, an iNaturalist fetch), kept in the provider above the routes, so
// they keep running and keep their progress while the birder moves between /, /settings and /about.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectFile } from '@/lib/import/detect'
import { importInat, type InatError, type InatProgress } from '@/lib/import/inat'
import { parseInWorker } from '@/lib/import/parse-client'
import { loadRegions } from '@/lib/import/places'
import type { ImportResult, Slot } from '@/lib/list/model'
import type { EbirdDetails, InatDetails } from '@/lib/list/storage'
import { loadTaxonomy } from '@/lib/species/load'
import { fetchData } from '@/lib/data-url'

export type EbirdJob = { busy: boolean; rows: number; error: string | null }
export type InatJob = { busyFor: string | null; progress: InatProgress | null; error: string | null; note: string | null }
/** The last import that landed (what "See my collage" announces). */
export type Landed = { slot: Slot; species: number; at: number }

export type ImportJobs = {
  ebird: EbirdJob
  /** Detects the file's kind from its header, parses it in a worker and imports it into its slot. */
  readEbird: (file: File) => Promise<void>
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

/** Plain messages; the rest of the list is untouched whenever one shows. */
export function inatMessage(error: InatError, user: string): string {
  switch (error) {
    case 'unknown-user':
      return `We couldn't find an iNaturalist user called “${user}”. Check the username (not the display name).`
    case 'no-birds':
      return `“${user}” has no public bird observations on iNaturalist yet.`
    case 'network':
      return "Couldn't reach iNaturalist. Check your connection and try again."
    case 'rate-limited':
      return 'iNaturalist is busy right now. Wait a minute, then try again.'
  }
}

const IDLE_EBIRD: EbirdJob = { busy: false, rows: 0, error: null }
const IDLE_INAT: InatJob = { busyFor: null, progress: null, error: null, note: null }

export type OnImport = (slot: Slot, result: ImportResult, details: EbirdDetails | InatDetails) => void

/**
 * `onImport` receives each finished import with its slot and the source's details (storage.ts `SourceDetails`: the
 * file's name, kind and rows, or the username and observation count; both with the time): the full MyEBirdData export
 * goes to 'ebird', the quick life list download to 'ebird-list', so one never replaces the other. Unmounting (leaving
 * the app's pages) aborts.
 */
export function useImportJobs(onImport: OnImport): ImportJobs {
  const [ebird, setEbird] = useState<EbirdJob>(IDLE_EBIRD)
  const [inat, setInat] = useState<InatJob>(IDLE_INAT)
  const [landed, setLanded] = useState<Landed | null>(null)
  const abort = useRef<AbortController | null>(null)
  const busyEbird = useRef(false)
  const live = useRef(true)
  const latest = useRef(onImport)
  useEffect(() => { latest.current = onImport })
  useEffect(() => {
    live.current = true
    return () => { live.current = false; abort.current?.abort() }
  }, [])

  const land = useCallback((slot: Slot, result: ImportResult, details: EbirdDetails | InatDetails) => {
    latest.current(slot, result, details)
    setLanded({ slot, species: new Set(result.records.map((r) => r.code)).size, at: Date.now() })
  }, [])

  const readEbird = useCallback(async (file: File) => {
    if (busyEbird.current) return
    setEbird(IDLE_EBIRD)
    let kind
    try {
      kind = detectFile(await headerLine(file))
    } catch {
      kind = 'unknown' as const
    }
    if (kind === 'unknown') {
      setEbird({ ...IDLE_EBIRD, error: "Couldn't read this file. Use eBird's life list download or MyEBirdData.csv." })
      return
    }
    busyEbird.current = true
    setEbird({ busy: true, rows: 0, error: null })
    try {
      const result = await parseInWorker(kind, file, (rows) => { if (live.current) setEbird((j) => ({ ...j, rows })) })
      const lifeList = kind === 'ebird-lifelist'
      const details: EbirdDetails = { kind: lifeList ? 'life-list' : 'full-export', at: new Date().toISOString() }
      if (file.name) details.file = file.name
      if (typeof result.rows === 'number') details.rows = result.rows
      if (live.current) land(lifeList ? 'ebird-list' : 'ebird', result, details)
      setEbird(IDLE_EBIRD)
    } catch {
      setEbird({ ...IDLE_EBIRD, error: "Couldn't read this file. It may be damaged or not an eBird export." })
    } finally {
      busyEbird.current = false
    }
  }, [land])

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
      if (ctl.signal.aborted) end = { note: 'Cancelled. Nothing was changed.' }
      else if ('error' in res) end = { error: inatMessage(res.error, login) }
      else land('inat', res, { user: login, observations, at: new Date().toISOString() })
    } catch (err) {
      end = (err as Error)?.name === 'AbortError' || ctl.signal.aborted ? { note: 'Cancelled. Nothing was changed.' } : { error: inatMessage('network', login) }
    } finally {
      if (abort.current === ctl) abort.current = null
      setInat({ ...IDLE_INAT, ...end })
    }
  }, [land])

  const cancelInat = useCallback(() => abort.current?.abort(), [])

  return useMemo(() => ({ ebird, readEbird, inat, fetchInat, cancelInat, landed }), [ebird, readEbird, inat, fetchInat, cancelInat, landed])
}
