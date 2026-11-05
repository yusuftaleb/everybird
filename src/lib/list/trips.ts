import type { ListEntry } from './model'

export type Trip = { id: string; country: string; start: string; end: string; label: string /* "Egypt · Sep 2026" */; codes: string[] }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/
const MIN_LIFERS = 3
const MAX_GAP_DAYS = 3
const DAY_MS = 86_400_000

/** ISO2 country of an entry: place.country, falling back to the sub1 prefix ("CA-BC" -> "CA"). */
export function entryCountry(e: ListEntry): string | undefined {
  return e.place?.country || e.place?.sub1?.split('-')[0] || undefined
}

const dayNumber = (d: string) => Date.parse(`${d}T00:00:00Z`) / DAY_MS

/**
 * Runs of lifers in one non-home country, each first date (full YYYY-MM-DD only) within 3 days of the
 * previous one, with at least 3 lifers. Home is the country with the most lifers (ties: lowest ISO code).
 * Sorted by start date; ids are `${country}-${start}`.
 */
export function findTrips(list: ListEntry[], countryName: (iso2: string) => string): Trip[] {
  const counts = new Map<string, number>()
  const dated = new Map<string, { code: string; date: string }[]>()
  for (const e of list) {
    const c = entryCountry(e)
    if (!c) continue
    counts.set(c, (counts.get(c) ?? 0) + 1)
    if (e.date && FULL_DATE.test(e.date) && !Number.isNaN(Date.parse(e.date))) {
      let arr = dated.get(c)
      if (!arr) dated.set(c, (arr = []))
      arr.push({ code: e.code, date: e.date })
    }
  }
  let home: string | undefined
  for (const [c, n] of counts) {
    if (home === undefined || n > counts.get(home)! || (n === counts.get(home) && c < home)) home = c
  }

  const trips: Trip[] = []
  for (const [country, rows] of dated) {
    if (country === home) continue
    rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.code < b.code ? -1 : 1))
    let run: typeof rows = []
    const flush = () => {
      if (run.length >= MIN_LIFERS) {
        const start = run[0].date
        const [y, m] = start.split('-')
        trips.push({
          id: `${country}-${start}`,
          country,
          start,
          end: run[run.length - 1].date,
          label: `${countryName(country)} · ${MONTHS[Number(m) - 1]} ${y}`,
          codes: run.map((r) => r.code),
        })
      }
      run = []
    }
    for (const r of rows) {
      if (run.length && dayNumber(r.date) - dayNumber(run[run.length - 1].date) > MAX_GAP_DAYS) flush()
      run.push(r)
    }
    flush()
  }
  return trips.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.country < b.country ? -1 : 1))
}
