'use client'
// The trips under the timeline's bars: a bracket over each trip's months with "🇪🇬 Egypt" under it, stacked in lanes
// so labels never overlap (tripLanes). A bracket is a button: it selects the trip (and its months); again clears it.
import { memo, useMemo } from 'react'
import { flagEmoji } from '@/lib/flag'
import { monthShort, tripLanes, type Month } from '@/lib/list/timeline'
import type { Trip } from '@/lib/list/trips'

/** One lane's height (px): the bracket and its label. */
export const LANE_PX = 34
/** Room a label needs: the flag and some padding, then about 7.5px per character at 13px. */
const labelPx = (name: string) => 30 + name.length * 7.5

type Props = {
  trips: Trip[]
  /** Species per trip under the other filters; trips with none are left out. */
  counts: Map<string, number>
  months: Month[]
  monthPx: number
  selected?: string
  countryName: (iso2: string) => string
  onPick: (t: Trip) => void
}

export const TripBrackets = memo(function TripBrackets({ trips, counts, months, monthPx, selected, countryName, onPick }: Props) {
  const N = months.length
  const lanes = useMemo(() => {
    const shown = trips.filter((t) => (counts.get(t.id) ?? 0) > 0)
    return tripLanes(shown, months, (t) => Math.ceil(labelPx(countryName(t.country)) / Math.max(1, monthPx)))
  }, [trips, counts, months, monthPx, countryName])
  if (!lanes.length) return null
  const rows = Math.max(...lanes.map((l) => l.lane)) + 1
  return (
    <div className="eb-trips" role="group" aria-label="Trips" style={{ height: rows * LANE_PX }} data-testid="time-trips">
      {lanes.map(({ trip: t, start, end, lane }) => {
        const name = countryName(t.country)
        const flag = flagEmoji(t.country)
        const count = counts.get(t.id) ?? 0
        return (
          <button
            key={t.id}
            type="button"
            className="eb-trip"
            aria-pressed={selected === t.id}
            aria-label={`${name} trip, ${monthShort(t.start)}, ${count} species`}
            data-testid={`trip-${t.id}`}
            onClick={() => onPick(t)}
            style={{ left: `${(start / N) * 100}%`, top: lane * LANE_PX, ['--span' as string]: `${Math.max(12, (end + 1 - start) * monthPx - 2)}px` }}
          >
            <span className="eb-trip-line" aria-hidden="true" />
            <span className="eb-trip-label" aria-hidden="true">
              {flag && <span className="eb-flag">{flag}</span>}
              {name}
            </span>
          </button>
        )
      })}
    </div>
  )
})
