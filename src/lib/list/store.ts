'use client'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { Regions } from '@/lib/species/types'
import { projectRecord } from '@/lib/places/registry'
import { withCanonicalPlaces } from '@/lib/places/region-mapping'
import { loadRegions } from '@/lib/import/places'
import { loadSpecies, type SpeciesIndex } from '@/lib/species/load'
import { validBigYear, type BigYear } from './big-year'
import { buildList } from './build-list'
import type { Filter } from './filters'
import { DEFAULT_LIST_ORDER, type ListOrder } from './list-order'
import { applyFilterValidity } from './filters-validate'
import { slotSource, unmatchedKey } from './model'
import { slottedRecords } from './source-counts'
import type { Edits, ImportResult, ListEntry, Rules, Slot, SourceRecord, Unmatched } from './model'
import { buildSeen, type SeenIndex } from './seen'
import * as storage from './storage'
import { takeResume, type CollageResume, type ViewKind } from '../view-resume'
import { useOfferResume } from '../use-resume'
import { emptySaved, NAME_MAX, removeSource, replaceSource, type DetailsFor, type Saved } from './storage'

export type AppState = {
  saved: Saved
  list: ListEntry[]
  /** Derived: where each species on the list was seen (seen.ts), for the Places filter, its counts and the map. */
  seen: SeenIndex
  /** Derived: unmatched rows that have no fix yet (what the MatchReport shows). */
  openUnmatched: Unmatched[]
  filter: Filter
  mode: 'even' | 'true'
  view: ViewKind
  /** The List view's sort (list-order.ts); carried over a language switch, never stored. */
  listOrder: ListOrder
  /** Scientific names lead wherever a bird or group is named (LifeList's Scientific switch); never stored. */
  sci: boolean
  persistence: 'saved' | 'memory-only' | 'idle'
}

export type Action =
  /** An import into one slot (model.ts `Slot`: 'ebird' is MyEBirdData, 'ebird-list' the life list download). */
  | { type: 'import'; source: Slot; result: ImportResult; details?: DetailsFor<Slot> }
  /** Disconnect one source: its records, unmatched rows and details go; edits stay (storage.ts `removeSource`). */
  | { type: 'remove-source'; source: Slot }
  | { type: 'edit'; edits: Edits }
  | { type: 'rules'; rules: Rules }
  | { type: 'filter'; filter: Filter }
  | { type: 'mode'; mode: AppState['mode'] }
  | { type: 'view'; view: AppState['view'] }
  | { type: 'listOrder'; listOrder: ListOrder }
  | { type: 'sci'; sci: boolean }
  | { type: 'restore'; saved: Saved }
  /** The view carried over a language switch (view-resume.ts): applied with the stored list, before the first paint. */
  | { type: 'resume'; view: CollageResume }
  /** The collage's title (Saved.name), verbatim on the page, share images and links; blank removes it. */
  | { type: 'name'; name: string }
  | { type: 'bigYear'; bigYear?: BigYear }
  | { type: 'forget' }
  /** Internal: the hook reports where the last save went. */
  | { type: 'persistence'; persistence: AppState['persistence'] }

export type StoreContext = { species: SpeciesIndex; regions?: Regions }

/** Every record the list is built from: each slot's records, then the fixed unmatched rows (source-counts.ts
 *  `slottedRecords`, which also says each record's slot). */
export function recordsOf(saved: Saved, regions?: Regions): SourceRecord[] {
  return slottedRecords(saved).map(({ record, slot }) => displayRecord(record, slot, saved, regions))
}

function displayRecord<T extends SourceRecord | Unmatched>(record: T, slot: Slot, saved: Saved, regions?: Regions): T {
  const versioned = slot !== 'manual' && saved.sources?.[slot]?.regionMapping === 1
  // Original eBird codes must be checked before the legacy normalizer uses shared codes.
  const oldEbird = !versioned && slotSource(slot) === 'ebird'
  if (oldEbird && regions?.registry) return withCanonicalPlaces(projectRecord(record, regions, true))
  const legacy = versioned ? record : withCanonicalPlaces(record)
  return regions?.registry ? projectRecord(legacy, regions, false) : legacy
}

/**
 * How many birds on the list each counting rule touches, whatever the rules are set to now: heard only, found dead,
 * and the birds that research grade only would drop (iNaturalist sightings the community hasn't agreed on, with no
 * other source).
 */
export function ruleCounts(saved: Saved): { heard: number; dead: number; casual: number } {
  const records = recordsOf(saved)
  const off = { hideHeard: false, hideDead: false, researchOnly: false }
  const all = buildList(records, saved.edits, off)
  const research = buildList(records, saved.edits, { ...off, researchOnly: true })
  return { heard: all.filter((e) => e.heard).length, dead: all.filter((e) => e.dead).length, casual: all.length - research.length }
}

/** Compute everything derived from `saved`, then repair the filter against it. */
function derive(s: AppState, saved: Saved, filter: Filter, ctx: StoreContext, pruneValues: boolean): AppState {
  const taxonOrder = (code: string) => ctx.species.byCode.get(code)?.to ?? Number.MAX_SAFE_INTEGER
  const fixKeys = new Set(Object.keys(saved.edits.fixes))
  const records = recordsOf(saved, ctx.regions)
  const edits = { ...saved.edits, added: saved.edits.added.map(withCanonicalPlaces) }
  const list = buildList(records, edits, saved.rules, taxonOrder)
  const seen = buildSeen(records, edits, saved.rules, list)
  const openUnmatched = saved.unmatched.filter((u) => !fixKeys.has(unmatchedKey(u))).map((u) => {
    return displayRecord(u, u.slot ?? u.source, saved, ctx.regions)
  })
  return {
    ...s,
    saved,
    list,
    seen,
    openUnmatched,
    filter: applyFilterValidity(filter, list, ctx.species, pruneValues, seen),
  }
}

export function initialState(): AppState {
  return {
    saved: emptySaved(),
    list: [],
    seen: { byCode: new Map(), full: false, sig: '0' },
    openUnmatched: [],
    filter: {},
    mode: 'even',
    view: 'collage',
    listOrder: DEFAULT_LIST_ORDER,
    sci: false,
    persistence: 'idle',
  }
}

/** Pure reducer; species data and country names are injected. `saved` keeps its identity unless the action changes it. */
export function makeReducer(ctx: StoreContext): (s: AppState, a: Action) => AppState {
  const stamp = (saved: Saved): Saved => ({ ...saved, savedAt: new Date().toISOString() })
  return (s, a) => {
    switch (a.type) {
      case 'import': {
        const details = a.details ? { ...a.details, regionMapping: 1 as const } : undefined
        return derive(s, replaceSource(s.saved, a.source, a.result, details as never), s.filter, ctx, true)
      }
      case 'remove-source':
        return derive(s, removeSource(s.saved, a.source), s.filter, ctx, true)
      case 'edit':
        return derive(s, stamp({ ...s.saved, edits: a.edits }), s.filter, ctx, true)
      case 'rules':
        return derive(s, stamp({ ...s.saved, rules: a.rules }), s.filter, ctx, true)
      case 'restore':
        return derive(s, a.saved, s.filter, ctx, true)
      case 'filter':
        return { ...s, filter: applyFilterValidity(a.filter, s.list, ctx.species, false, s.seen) }
      case 'mode':
        return { ...s, mode: a.mode }
      case 'view':
        return { ...s, view: a.view }
      case 'listOrder':
        return { ...s, listOrder: a.listOrder }
      case 'sci':
        return { ...s, sci: a.sci }
      case 'resume':
        return {
          ...s,
          filter: applyFilterValidity(a.view.filter, s.list, ctx.species, true, s.seen),
          mode: a.view.mode,
          view: a.view.view,
          listOrder: a.view.listOrder,
          sci: a.view.sci,
        }
      case 'persistence':
        return { ...s, persistence: a.persistence }
      case 'name': {
        const name = Array.from(a.name.trim()).slice(0, NAME_MAX).join('').trim()
        if ((s.saved.name ?? '') === name) return s
        const saved = stamp({ ...s.saved, name })
        if (!name) delete saved.name
        return { ...s, saved }
      }
      case 'bigYear': {
        if (a.bigYear === undefined) {
          if (!s.saved.bigYear) return s
          const saved = stamp({ ...s.saved })
          delete saved.bigYear
          return { ...s, saved }
        }
        if (!validBigYear(a.bigYear)) return s
        if (s.saved.bigYear?.year === a.bigYear.year && s.saved.bigYear?.target === a.bigYear.target) return s
        return { ...s, saved: stamp({ ...s.saved, bigYear: a.bigYear }) }
      }
      case 'forget': {
        const f = initialState()
        return derive({ ...f, persistence: s.persistence }, f.saved, {}, ctx, true)
      }
    }
  }
}

const NO_CTX: StoreContext = { species: { rows: [], byCode: new Map(), search: () => [] } }
const SAVE_DELAY_MS = 500

export type EverybirdMeta = {
  /** False until species, regions and the stored list have loaded. Actions dispatched before this are queued and applied once loaded. */
  ready: boolean
  /** Set when species/regions failed to load (ready stays false). */
  error?: string
  /** Outcome of the last 'forget': 'failed' means the device copy may remain ("Couldn't clear this device's copy"). */
  forgetOutcome?: 'forgotten' | 'failed'
  /** Species index, once loaded. */
  species?: SpeciesIndex
  /** Region names, loaded with the species. */
  regions?: Regions
  /** The stored list as first read (null: none; undefined: not read yet). Known well before `ready`. */
  stored?: Saved | null
}

/** Run `fn` when the browser is idle (at most `timeout` ms from now); where idle callbacks don't exist, now. */
function whenIdle(timeout: number): Promise<void> {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number }
  return new Promise((resolve) => (g.requestIdleCallback ? g.requestIdleCallback(() => resolve(), { timeout }) : resolve()))
}

/**
 * Loads species, regions and the stored list on mount (`deferIfEmpty`: with no stored list, species and regions wait for
 * an idle moment), then keeps `saved` persisted
 * (debounced 500 ms, flushed on pagehide / tab hidden). Nothing is saved before the initial load,
 * so a stored list is never overwritten by the empty initial state. Actions dispatched before ready are
 * queued and replayed, in order, after the stored list is restored. A successful save or a new forget clears
 * meta.forgetOutcome; a failed forget re-reads storage.isMemoryOnly() into `persistence`.
 */
export function useEverybird(opts: { deferIfEmpty?: boolean } = {}): [AppState, (a: Action) => void, EverybirdMeta] {
  const deferIfEmpty = useRef(!!opts.deferIfEmpty)
  const [ctx, setCtx] = useState<StoreContext | null>(null)
  const reducer = useMemo(() => makeReducer(ctx ?? NO_CTX), [ctx])
  const [state, rawDispatch] = useReducer(reducer, undefined, initialState)
  // The view carried over a language switch (view-resume.ts), claimed once. A ref, not a local: StrictMode runs the load effect
  // twice, the first run is cancelled, and its claim must still reach the second.
  const carried = useRef<CollageResume | null | undefined>(undefined)
  const [meta, setMeta] = useState<EverybirdMeta>({ ready: false })
  // Until the carried view is applied (ready), it is what a switch carries on, not the default state.
  useOfferResume('collage', () => (!meta.ready && carried.current ? carried.current : { filter: state.filter, mode: state.mode, view: state.view, listOrder: state.listOrder, sci: state.sci }))
  const seen = useRef(state.saved) // last `saved` we looked at; only a different one schedules a save
  const skipSave = useRef(false) // the next change to `saved` comes from load/forget and must not be written
  const pending = useRef<Saved | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const alive = useRef(true)
  // Actions dispatched before the initial load finishes; null once ready.
  const queue = useRef<Action[] | null>([])
  const dispatchRef = useRef<(a: Action) => void>(() => {})

  useEffect(() => {
    alive.current = true
    let cancelled = false
    ;(async () => {
      try {
        if (carried.current === undefined) carried.current = takeResume('collage') ?? null
        const resumed = carried.current
        const storedP = storage.load()
        // A visitor with no list (the landing's pre-packed sample, About, a first Settings visit) needs no bird data yet: let
        // the page have the network first, and fetch species and regions once the browser is idle. Actions dispatched
        // meanwhile (an import) wait in the queue.
        const stored0 = deferIfEmpty.current ? await storedP : undefined
        if (cancelled) return
        if (deferIfEmpty.current) {
          setMeta((m) => (m.ready ? m : { ...m, stored: stored0 }))
          if (!stored0) await whenIdle(1500)
        } else void storedP.then((st) => { if (!cancelled) setMeta((m) => (m.ready ? m : { ...m, stored: st })) }, () => {})
        const [species, regions, stored] = await Promise.all([loadSpecies(), loadRegions(), storedP])
        if (cancelled) return
        setCtx({ species, regions })
        const early = queue.current ?? []
        queue.current = null
        // The restored list itself is not re-saved, unless queued actions change it (then they must be saved).
        if (stored) {
          skipSave.current = early.length === 0
          rawDispatch({ type: 'restore', saved: stored })
        }
        // After the list, so its filter is checked against it; the same batch as `ready`, so the first collage render has it.
        if (resumed) rawDispatch({ type: 'resume', view: resumed })
        if (storage.isMemoryOnly()) rawDispatch({ type: 'persistence', persistence: 'memory-only' })
        setMeta({ ready: true, species, regions, stored })
        // Actions dispatched before ready run now, on top of the stored list, with the loaded species.
        for (const a of early) dispatchRef.current(a)
      } catch (e) {
        // Keep what is already known (the stored list): the landing still shows its sample, a list holder sees the notice.
        if (!cancelled) setMeta((m) => ({ ...m, ready: false, error: e instanceof Error ? e.message : String(e) }))
      }
    })()
    return () => {
      cancelled = true
      alive.current = false
    }
  }, [])

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    const s = pending.current
    if (!s) return
    pending.current = null
    void storage.save(s).then((p) => {
      if (!alive.current) return
      rawDispatch({ type: 'persistence', persistence: p })
      if (p === 'saved') setMeta((m) => (m.forgetOutcome ? { ...m, forgetOutcome: undefined } : m))
    })
  }, [])

  useEffect(() => {
    if (!meta.ready) return
    if (seen.current === state.saved) return
    seen.current = state.saved
    if (skipSave.current) {
      skipSave.current = false
      return
    }
    pending.current = state.saved
    timer.current = setTimeout(flush, SAVE_DELAY_MS)
    return () => {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
    }
  }, [state.saved, meta.ready, flush])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      flush()
    }
  }, [flush])

  const dispatch = useCallback((a: Action) => {
    if (queue.current) {
      queue.current.push(a) // not ready: applied after the stored list loads, so the restore can't overwrite it
      return
    }
    if (a.type === 'forget') {
      if (timer.current) clearTimeout(timer.current)
      timer.current = null
      pending.current = null
      skipSave.current = true
      rawDispatch(a)
      setMeta((m) => (m.forgetOutcome ? { ...m, forgetOutcome: undefined } : m))
      void storage.forget().then((outcome) => {
        if (!alive.current) return
        setMeta((m) => ({ ...m, forgetOutcome: outcome }))
        if (outcome === 'failed' && storage.isMemoryOnly()) rawDispatch({ type: 'persistence', persistence: 'memory-only' })
      })
      return
    }
    rawDispatch(a)
  }, [])
  useLayoutEffect(() => {
    dispatchRef.current = dispatch
  })

  return [state, dispatch, meta]
}
