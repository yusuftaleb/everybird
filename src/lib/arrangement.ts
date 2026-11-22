// How the collage places the birds, Fit, Oval or Free: a per-device choice kept in localStorage, Free when unset, unreadable
// or a value no longer offered (the dropped 'family' and 'colour'), the same in every tab. One setting for the collage
// on the page (the Display panel's Arrangement in the Collage view), the share images and the poster (the share
// dialog's Arrangement row): changing it in either changes the other.
import { IconBase } from '@phosphor-icons/react'
import { Cloud, Rectangle, type Icon, type IconWeight } from '@/components/phosphor-icons'
import { createElement, forwardRef, useSyncExternalStore, type ReactElement } from 'react'

/**
 * 'packed' (Fit): the birds fill the stage's or the frame's rectangle, corners included. 'oval': packed inside the ellipse
 * inscribed in the frame (pack.ts packBest's and packFrame's `oval`). 'free': the soft rounded cluster Fit drew before
 * round 6 made it fill the rectangle (pack.ts `free`).
 */
export type Arrangement = 'packed' | 'oval' | 'free'
export const ARRANGEMENTS: readonly Arrangement[] = ['packed', 'oval', 'free']

export const ARRANGEMENT_KEY = 'everybird:arrangement'
/** Free (Yusuf, 2026-11-21); nothing is stored for it, so a device that never chose follows it. */
export const DEFAULT_ARRANGEMENT: Arrangement = 'free'

// Phosphor has no oval: one drawn on its 256 grid, as wide as its Rectangle's frame (x 32–224 on the stroke's centre)
// and shorter (y 56–200), so it reads as an ellipse beside it, never a circle; each weight at Phosphor's stroke width
// (thin 8, light 12, regular 16, bold 24), filled for 'fill', with the 20% fill under the line for 'duotone'.
const oval = (props: Record<string, unknown>) => createElement('ellipse', { cx: 128, cy: 128, rx: 96, ry: 72, ...props })
const line = (w: number) => oval({ fill: 'none', stroke: 'currentColor', strokeWidth: w })
const OVAL_WEIGHTS = new Map<IconWeight, ReactElement>([
  ['thin', line(8)], ['light', line(12)], ['regular', line(16)], ['bold', line(24)],
  ['fill', oval({ rx: 104, ry: 80 })],
  ['duotone', createElement('g', null, oval({ opacity: 0.2 }), line(16))],
])
/** An oval in the Phosphor set's grid, weights and props (size, weight, colour, IconContext). */
export const Oval: Icon = forwardRef((props, ref) => createElement(IconBase, { ref, ...props, weights: OVAL_WEIGHTS }))
Oval.displayName = 'Oval'

/** Fit, Oval and Free's icons: the frame the birds fill, the oval they sit in, the cloud they gather in (Phosphor Cloud). */
export const ARRANGE_ICON: Record<Arrangement, Icon> = { packed: Rectangle, oval: Oval, free: Cloud }

let memory: Arrangement | null = null
const listeners = new Set<() => void>()
const bump = () => { for (const f of listeners) f() }

export function arrangement(): Arrangement {
  if (memory) return memory
  try {
    const v = localStorage.getItem(ARRANGEMENT_KEY)
    return (ARRANGEMENTS as readonly string[]).includes(v ?? '') ? (v as Arrangement) : DEFAULT_ARRANGEMENT
  } catch {
    return DEFAULT_ARRANGEMENT
  }
}

export function setArrangement(a: Arrangement): void {
  try {
    if (a === DEFAULT_ARRANGEMENT) localStorage.removeItem(ARRANGEMENT_KEY)
    else localStorage.setItem(ARRANGEMENT_KEY, a)
    memory = null
  } catch {
    memory = a
  }
  bump()
}

function subscribe(f: () => void): () => void {
  const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === ARRANGEMENT_KEY) f() }
  listeners.add(f)
  window.addEventListener('storage', onStorage)
  return () => { listeners.delete(f); window.removeEventListener('storage', onStorage) }
}

export function useArrangement(): Arrangement {
  return useSyncExternalStore(subscribe, arrangement, () => DEFAULT_ARRANGEMENT)
}
