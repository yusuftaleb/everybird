'use client'
// Wires one layout client (one worker) to a mounted collage: setList when the list changes, get() for the
// current filter, mode and layout class, and prefetch of the filter's child states in idle time.
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createLayoutClient, type LayoutClient, type StateLayout } from '@/lib/layout/layout-client'
import type { LayoutName } from '@/lib/layout/layout.worker'
import { applyFilter, options, type Filter } from '@/lib/list/filters'
import type { ListEntry } from '@/lib/list/model'
import type { Trip } from '@/lib/list/trips'
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
  const add = (level: keyof Filter, values: string[]) => values.forEach((v) => out.push({ ...f, [level]: v }))
  const vals = (level: keyof Filter) => options(list, f, level, species, trips).map((o) => o.value)
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
 * environments without Worker, such as jsdom). Entries whose species are unknown are left out.
 */
export function useCollageLayout({ list, trips, filter, mode, species, container }: Opts): CollageLayout | null {
  const client = useRef<LayoutClient | null>(null)
  const [cls, setCls] = useState<LayoutName | null>(null)
  const [result, setResult] = useState<CollageLayout | null>(null)
  const known = useMemo(() => list.filter((e) => species.byCode.has(e.code)), [list, species])

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

  // New list: the client drops its cache and re-packs from the full collage.
  useEffect(() => {
    const c = client.current
    if (!c || !known.length) return
    c.setList(
      known.map((e) => {
        const row = species.byCode.get(e.code)!
        return { code: e.code, mass: row.g, ord: row.ord }
      }),
      (f) => applyFilter(known, f, species, trips).map((e) => e.code),
    )
  }, [known, species, trips])

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
  }, [known, filter, cls, mode])

  // Warm the cache for the next tap, once the current state is on screen: one idle slot to list the child
  // states, then one idle slot per state, so the main thread is never held for long.
  useEffect(() => {
    const c = client.current
    if (!c || !cls || !result) return
    let todo: Filter[] | null = null
    let cancel = () => {}
    const step = () => {
      if (!todo) todo = childFilters(known, filter, species, trips)
      else c.prefetch([todo.shift()!], cls)
      if (todo.length) cancel = idle(step)
    }
    cancel = idle(step)
    return () => cancel()
  }, [result, known, filter, species, trips, cls])

  return known.length ? result : null
}
