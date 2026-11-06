'use client'
// The trips under the timeline's bars: a bracket over each trip's months with "🇪🇬 Egypt" under it, stacked in lanes
// so labels never overlap (tripLanes). A bracket is a button: it selects the trip (and its months); again clears it.
// A trip narrower than TICK_PX (a few days in one month) is a tick at its month instead of a squashed bracket, and a
// label that would run past the strip's end is aligned to the bracket's right edge.
import { memo, useMemo } from 'react'
import { Flag } from '@/components/Flag'
import { monthShort, tripLanes, type Month, type MonthAxis } from '@/lib/list/timeline'
import type { Trip } from '@/lib/list/trips'

/** One lane's height (px): the bracket and its label. */
export const LANE_PX = 34
/** Room a label needs: the flag and some padding, then about 7.5px per character at 13px. */
const labelPx = (name: string) => 30 + name.length * 7.5
/** Below this width (px) a bracket is drawn as a tick. */
const TICK_PX = 10

type Props = {
  trips: Trip[]
  /** Species per trip under the other filters; trips with none are left out. */
  counts: Map<string, number>
  months: Month[]
  /** The strip's scale (monthAxis) and the width of one unit in px. */
  axis: MonthAxis
  unitPx: number
  selected?: string
  countryName: (iso2: string) => string
  onPick: (t: Trip) => void
}

export const TripBrackets = memo(function TripBrackets({ trips, counts, months, axis, unitPx, selected, countryName, onPick }: Props) {
  const lanes = useMemo(() => {
    const shown = trips.filter((t) => (counts.get(t.id) ?? 0) > 0)
    // The months a label needs from its start month: until the axis has given it labelPx of room.
    const room = (t: Trip, start: number) => {
      const need = labelPx(countryName(t.country)) / Math.max(1e-9, unitPx)
      let k = 1
      while (start + k < months.length && axis.start[start + k] - axis.start[start] < need) k++
      return k
    }
    return tripLanes(shown, months, room)
  }, [trips, counts, months, axis, unitPx, countryName])
  const trackPx = axis.units * unitPx
  if (!lanes.length) return null
  const rows = Math.max(...lanes.map((l) => l.lane)) + 1
  return (
    <div className="eb-trips" role="group" aria-label="Trips" style={{ height: rows * LANE_PX }} data-testid="time-trips">
      {lanes.map(({ trip: t, start, end, lane }) => {
        const name = countryName(t.country)
        const count = counts.get(t.id) ?? 0
        const x = axis.start[start] * unitPx
        const span = (axis.start[end + 1] - axis.start[start]) * unitPx - 2
        const tick = span < TICK_PX
        const atEnd = x + labelPx(name) > trackPx
        return (
          <button
            key={t.id}
            type="button"
            className="eb-trip"
            aria-pressed={selected === t.id}
            aria-label={`${name} trip, ${monthShort(t.start)}, ${count} species`}
            data-testid={`trip-${t.id}`}
            data-tick={tick ? '' : undefined}
            data-end={atEnd ? '' : undefined}
            onClick={() => onPick(t)}
            style={{
              ...(atEnd ? { right: `${(1 - axis.start[end + 1] / axis.units) * 100}%` } : { left: `${(axis.start[start] / axis.units) * 100}%` }),
              top: lane * LANE_PX,
              ['--span' as string]: tick ? `${Math.max(2, span + 2)}px` : `${span}px`,
            }}
          >
            <span className="eb-trip-line" aria-hidden="true" />
            <span className="eb-trip-label" aria-hidden="true">
              <Flag iso={t.country} />
              {name}
            </span>
          </button>
        )
      })}
    </div>
  )
})
