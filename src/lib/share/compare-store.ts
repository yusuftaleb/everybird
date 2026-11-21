// Compare's set-up as the birder left it (round 6, item 10), kept in localStorage under one key, so a language switch
// (a reload), a refresh or a later visit opens Compare as it was: the rows (every link box's text, valid or not, in
// order, and the name typed for it), the name typed for the birder's own list, whether the comparison shows, and the
// chosen chips (with the lists they belong to, `CompareShown.key`). Removing a row removes it here too; the set-up
// back to one empty row removes the key. Nothing leaves the device: this is localStorage only, never the address,
// a cookie or a request. Every access may throw (blocked storage): then nothing is kept beyond the page load.
import type { Choice } from './compare'

export const COMPARE_KEY = 'everybird:compare'

/** The chosen chips and the lists they were chosen for (useComparison's `drawKey`). */
export type CompareShown = { key: string; choice: Choice }
export type KeptCompare = { rows: { text: string; name?: string }[]; mine?: string; open: boolean; pick?: CompareShown }

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const local = (): Store | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

const isChoice = (c: unknown): c is Choice => c === 'need' || c === 'every' || (Number.isInteger(c) && (c as number) > 0)

/** What was kept, or null: nothing, unreadable storage, or a value this version doesn't read. */
export function readCompare(store: Store | null = local()): KeptCompare | null {
  try {
    const o = JSON.parse(store?.getItem(COMPARE_KEY) ?? 'null')
    if (o?.v !== 1 || !Array.isArray(o.rows) || !o.rows.length || typeof o.open !== 'boolean') return null
    const rows = o.rows.map((r: { text?: unknown; name?: unknown }) => {
      if (typeof r?.text !== 'string' || (r.name !== undefined && typeof r.name !== 'string')) throw new Error('row')
      return r.name === undefined ? { text: r.text } : { text: r.text, name: r.name }
    })
    const out: KeptCompare = { rows, open: o.open }
    if (typeof o.mine === 'string') out.mine = o.mine
    if (typeof o.pick?.key === 'string' && isChoice(o.pick.choice)) out.pick = { key: o.pick.key, choice: o.pick.choice }
    return out
  } catch {
    return null
  }
}

/** Keeps `k`; the untouched set-up (one empty row, nothing else) removes the key. */
export function writeCompare(k: KeptCompare, store: Store | null = local()): void {
  const empty = k.rows.length === 1 && !k.rows[0].text && k.rows[0].name === undefined && k.mine === undefined && !k.open
  try {
    if (empty) store?.removeItem(COMPARE_KEY)
    else store?.setItem(COMPARE_KEY, JSON.stringify({ v: 1, ...k }))
  } catch {
    // storage blocked or full: kept for this page load only
  }
}
