'use client'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'

/**
 * In a source's row: one small disclosure, "2 entries weren't counted", for the entries of its import that aren't
 * species. Open, it says why in plain words and lists them when the import kept their names.
 */
export function NotCounted({ saved, slots }: { saved: Saved; slots: Slot[] }) {
  const named = saved.unmatched.filter((u) => u.reason === 'not-species' && slots.includes(u.slot ?? u.source))
  const n = slots.reduce((a, s) => a + (saved.skipped?.[s] ?? 0), 0) + named.length
  if (!n) return null
  const names = named.map((u) => u.com ?? u.sci).filter((x): x is string => !!x)
  return (
    <details className="eb-notcounted" data-testid="not-counted">
      <summary>{n.toLocaleString('en-US')} {n === 1 ? "entry wasn't" : "entries weren't"} counted</summary>
      <p className="eb-note">
        Birds only identified to a group (like “duck sp.”), either/or IDs (like “Greater/Lesser Scaup”) and hybrids.
        eBird leaves these off life lists too.
      </p>
      {names.length > 0 && <ul className="eb-note">{names.map((x, i) => <li key={i}>{x}</li>)}</ul>}
    </details>
  )
}
