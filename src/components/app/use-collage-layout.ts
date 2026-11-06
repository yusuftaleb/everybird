'use client'
// Wires one layout client (one worker) to a mounted collage: setList when the packed birds change, get() for the
// current filter, mode and layout class, and prefetch of the filter's child states in idle time.
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createLayoutClient, type LayoutClient, type StateLayout } from '@/lib/layout/layout-client'
import type { LayoutName } from '@/lib/layout/layout.worker'
import { applyFilter, options, type Filter, type FilterLevel } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import { entryCountry, type Trip } from '@/lib/list/trips'
import type { SpeciesIndex } from '@/lib/species/load'

export type CollageLayout = { layout: StateLayout; visible: Set<string> }

/** Layout class from the stage container's width (LAYOUTS minWidth: wide 880, medium 540). */
export function layoutFor(width: number): LayoutName {
  return width >= 880 ? 'wide' : width >= 540 ? 'medium' : 'narrow'
}

const PREFETCH_CAP = 24
const COUNTRY_PREFETCH = 8

/**
 * The states one tap away from `f`: the next taxonomy level (orders, or the chosen order's families), the
 * top countries, and the next time level (years, or the chosen year's trips). At most PREFETCH_CAP.
 */
export function childFilters(list: ListEntry[], f: Filter, species: SpeciesIndex, trips: Trip[]): Filter[] {
  const out: Filter[] = []
  const add = (level: FilterLevel, values: string[]) => values.forEach((v) => out.push({ ...f, [level]: v }))
  const vals = (level: FilterLevel) => options(list, f, level, species, trips).map((o) => o.value)
  if (!f.order) add('order', vals('order'))
  else if (!f.family) add('family', vals('family'))
  if (!f.country) add('country', vals('country').slice(0, COUNTRY_PREFETCH))
  if (!f.year) add('year', vals('year'))
  else if (!f.trip) add('trip', vals('trip'))
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
export function useCollageLayout({ list, trips, filter, mode, species, container, seed }: Opts): CollageLayout | null {
  const client = useRef<LayoutClient | null>(null)
  const [cls, setCls] = useState<LayoutName | null>(null)
  const [result, setResult] = useState<CollageLayout | null>(null)
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])
  // Every edit builds a new list (a mark toggle too), so compare what the layout actually uses. `packSig`: the
  // codes and masses in order (what the worker packs). `filterSig`: what filters resolve on (year, country, trips).
  const packSig = useMemo(() => known.map((e) => `${e.code}:${species.byCode.get(e.code)!.g}`).join(','), [known, species])
  const filterSig = useMemo(
    () => `${known.map((e) => `${e.date?.slice(0, 4) ?? ''}${entryCountry(e) ?? ''}`).join(',')}#${trips.map((t) => `${t.id}:${t.codes.join(' ')}`).join(',')}`,
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
    if (!c || !cls || !result) return
    let todo: Filter[] | null = null
    let cancel = () => {}
    const step = () => {
      if (!todo) todo = childFilters(latest.current.known, filter, species, latest.current.trips)
      else c.prefetch([todo.shift()!], cls)
      if (todo.length) cancel = idle(step)
    }
    cancel = idle(step)
    return () => cancel()
  }, [result, filter, species, cls])

  // Until the worker's first answer, the seed stands in, whatever the filter or mode (as a stale layout does while a
  // new one is on its way): the stage stays up, and the worker's layout replaces it as soon as it lands.
  const seeded = useMemo(() => {
    const s = seed && cls ? seed.find((l) => l.layout === cls) : undefined
    return s ? { layout: s, visible: new Set(s.boxes.keys()) } : null
  }, [seed, cls])

  return known.length ? (result ?? seeded) : null
}
