'use client'
// Wires one layout client (one worker) to a mounted collage: setList when the packed birds change, get() for the
// current filter, mode and layout class, and prefetch of the filter's child states in idle time.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createLayoutClient, type LayoutClient, type StateLayout } from '@/lib/layout/layout-client'
import type { LayoutName } from '@/lib/layout/layout.worker'
import { applyFilter, filterKey, inRange, options, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { monthOf, revealUntil, timeless, tripFilter } from '@/lib/list/timeline'
import { entryCountry, type Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'

/** `still`: only visibility changes over the shown layout (Play, a range drag's preview): placed without motion. */
export type CollageLayout = { layout: StateLayout; visible: Set<string>; still?: boolean }

/** Layout class from the stage container's width (LAYOUTS minWidth: wide 880, medium 540). */
export function layoutFor(width: number): LayoutName {
  return width >= 880 ? 'wide' : width >= 540 ? 'medium' : 'narrow'
}

const PREFETCH_CAP = 24
const COUNTRY_PREFETCH = 8
const TRIP_PREFETCH = 6

export { timeless }

/**
 * The states one tap away from `f`: the next taxonomy level (orders, or the chosen order's families), the
 * top countries, and, with no time chosen, the latest trips (a bracket tap: the trip with its months). At most
 * PREFETCH_CAP. Range drags are continuous, so they are not guessed ahead.
 */
export function childFilters(list: ListEntry[], f: Filter, species: SpeciesIndex, trips: Trip[]): Filter[] {
  const out: Filter[] = []
  const add = (level: FilterLevel, values: string[]) => values.forEach((v) => out.push({ ...f, [level]: v }))
  const vals = (level: FilterLevel) => options(list, f, level, species, trips).map((o) => o.value)
  if (!f.order) add('order', vals('order'))
  else if (!f.family) add('family', vals('family'))
  if (!f.country) add('country', vals('country').slice(0, COUNTRY_PREFETCH))
  if (!f.year && !f.from && !f.to && !f.trip) {
    const shown = new Set(applyFilter(list, timeless(f), species, trips).map((e) => e.code))
    const near = trips.filter((t) => t.codes.some((c) => shown.has(c))).slice(-TRIP_PREFETCH).reverse()
    for (const t of near) out.push(tripFilter(f, t))
  }
  return out.slice(0, PREFETCH_CAP)
}

type Opts = {
  list: ListEntry[]
  trips: Trip[]
  filter: Filter
  mode: 'even' | 'true'
  species: SpeciesIndex
  /** The element whose width picks the layout class (the stage's container). */
  container: RefObject<HTMLElement | null>
  /** Full even layouts packed ahead of time (the landing sample): shown until the worker's first answer. */
  seed?: readonly StateLayout[]
  /**
   * Play: the month reached (YYYY-MM) and whether it is the last. The layout is the filter's without its time
   * dimensions, packed once; only the birds dated up to `until` are visible (undated ones join at the last month), so
   * each step is a visibility change over the same layout, never a re-pack.
   */
  play?: { until: string; last: boolean } | null
  /**
   * A range drag in progress: the filter is not committed yet; the shown layout stays and only its birds dated inside
   * from..to are visible (no worker call, no travel). Play wins over a preview.
   */
  preview?: { from?: string; to?: string; committed?: boolean } | null
}

/**
 * What the stage shows while only visibility changes. Play: the birds dated up to `until` over the time-free layout,
 * nothing until that layout (key `want`) has landed, so the old trip or range layout never flashes. A drag preview: the
 * shown layout's birds dated inside from..to; once committed, only while the shown layout is still the old one.
 * Otherwise the layout as it is.
 */
export function stillView(
  current: CollageLayout,
  want: string,
  play: { months: ReadonlyMap<string, string | undefined>; until: string; last: boolean } | null,
  preview: { dates: ReadonlyMap<string, string | undefined>; from?: string; to?: string; committed?: boolean } | null,
): CollageLayout {
  const { layout } = current
  if (play) {
    if (layout.key.split('|').slice(2).join('|') !== want) return { layout, visible: new Set(), still: true }
    return { layout, visible: revealUntil(layout.boxes.keys(), play.months, play.until, play.last), still: true }
  }
  // A committed preview stands in only until the committed range's layout (key `want`) lands; that layout is never
  // marked still, so it travels.
  if (preview && !(preview.committed && layout.key.split('|').slice(2).join('|') === want)) {
    const visible = new Set<string>()
    for (const c of layout.boxes.keys()) if (inRange(preview.dates.get(c), preview.from, preview.to)) visible.add(c)
    return { layout, visible, still: true }
  }
  return current
}

const idle = (fn: () => void): (() => void) => {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (g.requestIdleCallback && g.cancelIdleCallback) {
    const id = g.requestIdleCallback(fn, { timeout: 2000 })
    return () => g.cancelIdleCallback!(id)
  }
  const t = setTimeout(fn, 200)
  return () => clearTimeout(t)
}

/**
 * The current StateLayout and its visible codes, or null until the first layout arrives (and always in
 * environments without Worker, such as jsdom, unless a seed covers the state). Entries whose species are unknown are left out.
 */
export function useCollageLayout({ list, trips, filter: chosen, mode, species, container, seed, play, preview }: Opts): CollageLayout | null {
  const playing = !!play
  const filter = useMemo(() => (playing ? timeless(chosen) : chosen), [chosen, playing])
  const client = useRef<LayoutClient | null>(null)
  const [cls, setCls] = useState<LayoutName | null>(null)
  const [result, setResult] = useState<CollageLayout | null>(null)
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  // Every edit builds a new list (a mark toggle too), so compare what the layout actually uses. `packSig`: the
  // codes and masses in order (what the worker packs). `filterSig`: what filters resolve on (year, country, trips).
  const packSig = useMemo(() => known.map((e) => `${e.code}:${species.byCode.get(e.code)!.g}`).join(','), [known, species])
  const filterSig = useMemo(
    () => `${known.map((e) => `${e.date?.slice(0, 7) ?? ''}${entryCountry(e) ?? ''}`).join(',')}#${trips.map((t) => `${t.id}:${t.codes.join(' ')}`).join(',')}`,
    [known, trips],
  )
  // The client resolves filters lazily, against the newest list and trips.
  const latest = useRef({ known, trips })
  useEffect(() => { latest.current = { known, trips } }, [known, trips])
  const resolve = useCallback((f: Filter) => applyFilter(latest.current.known, f, species, latest.current.trips).map((e) => e.code), [species])

  // One client per mounted collage; its worker ends with it.
  useEffect(() => {
    if (typeof Worker === 'undefined') return
    const c = createLayoutClient()
    client.current = c
    return () => {
      c.dispose()
      if (client.current === c) client.current = null
    }
  }, [])

  // Layout class from the container width.
  useEffect(() => {
    const el = container.current
    if (!el) return
    const read = (w: number) => { if (w > 0) setCls(layoutFor(w)) }
    read(el.getBoundingClientRect().width)
    if (typeof ResizeObserver !== 'function') return
    const ro = new ResizeObserver(([e]) => read(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [container])

  // New birds or masses: the client drops its cache and re-packs from the full collage. Marks alone: nothing.
  // Per client: a new client (Strict Mode's remount, a remounted collage) starts with no list.
  const packed = useRef<{ client: LayoutClient; sig: string; filterSig: string } | null>(null)
  useEffect(() => {
    const c = client.current
    const { known } = latest.current
    if (!c || !known.length) return
    if (packed.current?.client !== c || packed.current.sig !== packSig) {
      c.setList(
        known.map((e) => {
          const row = species.byCode.get(e.code)!
          return { code: e.code, mass: row.g, ord: row.ord }
        }),
        resolve,
      )
    } else if (packed.current.filterSig !== filterSig) {
      c.refilter(resolve) // same birds, new dates/places/trips: keep the full collages
    }
    packed.current = { client: c, sig: packSig, filterSig }
  }, [packSig, filterSig, species, resolve])

  // The current state. Aborts (a newer list) are expected and ignored.
  useEffect(() => {
    const c = client.current
    if (!c || !cls || !known.length) return
    let live = true
    let raf = 0
    c.get(filter, cls, mode).then(
      (layout) => {
        if (!live) return
        // Next frame: the tap's own update (chips, count, sheet) paints first, then the birds start to move.
        const apply = () => { if (live) setResult({ layout, visible: new Set(layout.boxes.keys()) }) }
        if (typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(apply)
        else apply()
      },
      (e: unknown) => { if (live && (e as Error)?.name !== 'AbortError') console.warn('Everybird layout failed:', e) },
    )
    return () => {
      live = false
      if (raf) cancelAnimationFrame(raf)
    }
  }, [packSig, filterSig, known.length, filter, cls, mode])

  // Warm the cache for the next tap, once the current state is on screen: one idle slot to list the child
  // states, then one idle slot per state, so the main thread is never held for long.
  useEffect(() => {
    const c = client.current
    if (!c || !cls || !result || playing) return
    let todo: Filter[] | null = null
    let cancel = () => {}
    const step = () => {
      if (!todo) todo = childFilters(latest.current.known, filter, species, latest.current.trips)
      else c.prefetch([todo.shift()!], cls)
      if (todo.length) cancel = idle(step)
    }
    cancel = idle(step)
    return () => cancel()
  }, [result, filter, species, cls, playing])

  // Until the worker's first answer, the seed stands in, whatever the filter or mode (as a stale layout does while a
  // new one is on its way): the stage stays up, and the worker's layout replaces it as soon as it lands.
  const seeded = useMemo(() => {
    const s = seed && cls ? seed.find((l) => l.layout === cls) : undefined
    return s ? { layout: s, visible: new Set(s.boxes.keys()) } : null
  }, [seed, cls])

  const months = useMemo(() => (playing ? new Map(known.map((e) => [e.code, monthOf(e.date)])) : null), [known, playing])
  const dates = useMemo(() => (preview ? new Map(known.map((e) => [e.code, e.date])) : null), [known, preview])
  const current = result ?? seeded
  const until = play?.until, last = !!play?.last
  const want = filterKey(filter)
  const revealed = useMemo(
    () => (current ? stillView(current, want, months && until ? { months, until, last } : null, preview && dates ? { dates, ...preview } : null) : null),
    [current, months, until, last, want, preview, dates],
  )

  return known.length ? revealed : null
}
