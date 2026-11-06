import type { ListEntry } from '@/lib/list/model'

/** Everybird's marks: heard only and found dead as on LifeList. The stored `media` field is kept but not shown. */
export const MARKS = [
  { k: 'heard', sym: '*', label: 'Heard only' },
  { k: 'dead', sym: '†', label: 'Found dead' },
] as const

export const marksOf = (e: ListEntry) => MARKS.filter((m) => e[m.k])

/** The marks as a superscript after a name, with screen-reader text (LifeList's Mark). */
export function Marks({ entry }: { entry: ListEntry }) {
  const ms = marksOf(entry)
  if (!ms.length) return null
  return (
    <>
      <sup className="eb-mark" aria-hidden="true">{ms.map((m) => m.sym).join('')}</sup>
      <span className="eb-sr">, {ms.map((m) => m.label.toLowerCase()).join(', ')}</span>
    </>
  )
}
