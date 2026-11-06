'use client'
import { ArrowCounterClockwise, Check, Trash } from '@phosphor-icons/react'
import type { Edits, ListEntry, MarkKey } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import '@/components/filters/filters.css'
import './edit.css'

const MARKS: { k: MarkKey; sym: string; label: string }[] = [
  { k: 'heard', sym: '*', label: 'Heard only' },
  { k: 'dead', sym: '†', label: 'Found dead' },
]

type Props = { entry: ListEntry; edits: Edits; dispatch: (a: Action) => void; onRemoved: () => void }

/** In the bird card: set or clear each mark, go back to the marks from the records, or remove the bird. */
export function EditBird({ entry, edits, dispatch, onRemoved }: Props) {
  const own = edits.marks[entry.code]
  const edit = (next: Partial<Edits>) => dispatch({ type: 'edit', edits: { ...edits, ...next } })
  const toggle = (k: MarkKey) => edit({ marks: { ...edits.marks, [entry.code]: { ...own, [k]: !entry[k] } } })
  const reset = () => {
    const marks = { ...edits.marks }
    delete marks[entry.code]
    edit({ marks })
  }
  const remove = () => {
    edit({
      removed: edits.removed.includes(entry.code) ? edits.removed : [...edits.removed, entry.code],
      added: edits.added.filter((r) => r.code !== entry.code),
    })
    onRemoved()
  }
  return (
    <div className="eb-edit">
      <div className="eb-edit-marks" role="group" aria-label="Marks">
        <span className="eb-mono eb-edit-label" aria-hidden="true">Mark as</span>
        {MARKS.map((m) => (
          <button key={m.k} type="button" className="eb-chip" aria-pressed={entry[m.k]} data-selected={entry[m.k] ? '' : undefined} onClick={() => toggle(m.k)}>
            {entry[m.k] ? <Check aria-hidden="true" focusable="false" weight="bold" className="eb-chip-icon" /> : <span aria-hidden="true" className="eb-edit-sym">{m.sym}</span>}
            {m.label}
          </button>
        ))}
      </div>
      <div className="eb-edit-row">
        {own && (
          <button type="button" className="eb-textbtn" onClick={reset}>
            <ArrowCounterClockwise aria-hidden="true" focusable="false" />
            Marks from my records
          </button>
        )}
        <button type="button" className="eb-textbtn eb-edit-remove" onClick={remove}>
          <Trash aria-hidden="true" focusable="false" />
          Remove from my list
        </button>
      </div>
    </div>
  )
}
