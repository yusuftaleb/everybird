'use client'
import type { Slot } from '@/lib/list/model'
import type { Saved } from '@/lib/list/storage'

/**
 * In a source's card: the entries of its imports that aren't species and so aren't counted, said in plain words, with
 * the entries themselves behind a disclosure when the import kept their names.
 */
export function NotCounted({ saved, slots }: { saved: Saved; slots: Slot[] }) {
  const named = saved.unmatched.filter((u) => u.reason === 'not-species' && slots.includes(u.slot ?? u.source))
  const n = slots.reduce((a, s) => a + (saved.skipped?.[s] ?? 0), 0) + named.length
  if (!n) return null
  const names = named.map((u) => u.com ?? u.sci).filter((x): x is string => !!x)
  const text = `${n.toLocaleString('en-US')} ${n === 1 ? "entry wasn't" : "entries weren't"} counted: birds only identified to a group (like “duck sp.”), either/or IDs (like “Greater/Lesser Scaup”) and hybrids. eBird leaves these off life lists too.`
  return (
    <div className="eb-note eb-notcounted" data-testid="not-counted">
      <p>{text}</p>
      {names.length > 0 && (
        <details>
          <summary>Show {names.length === 1 ? 'it' : 'them'}</summary>
          <ul>{names.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </details>
      )}
    </div>
  )
}
