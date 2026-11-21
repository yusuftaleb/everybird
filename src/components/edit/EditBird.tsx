'use client'
import { ArrowCounterClockwise, Check, Trash } from '@phosphor-icons/react'
import { useContext } from 'react'
import { CardEndLink } from '@/components/collage/BirdCard'
import { markLabel } from '@/components/collage/Marks'
import { useI18n } from '@/i18n/I18nProvider'
import type { Edits, ListEntry, MarkKey } from '@/lib/list/model'
import type { Action } from '@/lib/list/store'
import '@/components/filters/filters.css'
import './edit.css'

const MARKS: { k: MarkKey & ('heard' | 'dead'); sym: string }[] = [
  { k: 'heard', sym: '*' },
  { k: 'dead', sym: '†' },
]

/** `onRemoved(keyboard)`: the bird was removed; `keyboard` when Remove was pressed from the keyboard (Enter or Space). */
type Props = { entry: ListEntry; edits: Edits; dispatch: (a: Action) => void; onRemoved: (keyboard: boolean) => void }

/** In the bird card: set or clear each mark, go back to the marks from the records (under the marks), or remove the
 *  bird; the card's illustration link (CardEndLink) shares the Remove row, at its right, never wrapping under it. */
export function EditBird({ entry, edits, dispatch, onRemoved }: Props) {
  const { t } = useI18n()
  const end = useContext(CardEndLink)
  const own = edits.marks[entry.code]
  const edit = (next: Partial<Edits>) => dispatch({ type: 'edit', edits: { ...edits, ...next } })
  const toggle = (k: MarkKey) => edit({ marks: { ...edits.marks, [entry.code]: { ...own, [k]: !entry[k] } } })
  const reset = () => {
    const marks = { ...edits.marks }
    delete marks[entry.code]
    edit({ marks })
  }
  const remove = (keyboard: boolean) => {
    edit({
      removed: edits.removed.includes(entry.code) ? edits.removed : [...edits.removed, entry.code],
      added: edits.added.filter((r) => r.code !== entry.code),
    })
    onRemoved(keyboard)
  }
  return (
    <div className="eb-edit">
      <div className="eb-edit-marks" role="group" aria-label={t.card.marks}>
        <span className="eb-mono eb-edit-label" aria-hidden="true">{t.card.markAs}</span>
        {MARKS.map((m) => (
          <button key={m.k} type="button" className="eb-chip" aria-pressed={entry[m.k]} data-selected={entry[m.k] ? '' : undefined} onClick={() => toggle(m.k)}>
            {entry[m.k] ? <Check aria-hidden="true" focusable="false" weight="bold" className="eb-chip-icon" /> : <span aria-hidden="true" className="eb-edit-sym">{m.sym}</span>}
            {markLabel(m.k, t)}
          </button>
        ))}
      </div>
      {own && (
        <button type="button" className="eb-textbtn eb-edit-reset" onClick={reset}>
          <ArrowCounterClockwise aria-hidden="true" focusable="false" />
          {t.card.resetMarks}
        </button>
      )}
      <div className="eb-edit-row">
        <button type="button" className="eb-textbtn eb-edit-remove" onClick={(e) => remove(e.detail === 0)}>
          <Trash aria-hidden="true" focusable="false" />
          {t.card.remove}
        </button>
        {end}
      </div>
    </div>
  )
}
