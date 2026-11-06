import type { ListEntry } from '@/lib/list/model'

/** Everybird's marks: heard only and found dead as on LifeList, plus photo or recording. */
export const MARKS = [
  { k: 'heard', sym: '*', label: 'Heard only' },
  { k: 'dead', sym: '†', label: 'Found dead' },
  { k: 'media', sym: '◦', label: 'Photo or recording' },
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
