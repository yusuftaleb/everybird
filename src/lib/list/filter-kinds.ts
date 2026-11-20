import type { FilterKind } from '@/lib/analytics'
import type { Filter } from './filters'

/** One kind's value as a comparable string; '' when the kind is off. Only for telling "changed to something" apart. */
const SIGNATURES: Record<FilterKind, (f: Filter) => string> = {
  place: (f) => [f.countries, f.provinces, f.counties, f.regions].map((a) => (a ? [...a].sort().join(',') : '')).join('|').replace(/^\|*$/, ''),
  continent: (f) => (f.continents ? [...f.continents].sort().join(',') : ''),
  time: (f) => (f.from || f.to ? `${f.from ?? ''}~${f.to ?? ''}` : f.year ?? ''),
  status: (f) => (f.statuses ? [...f.statuses].sort().join(',') : ''),
  group: (f) => f.group ?? '',
  taxonomy: (f) => (f.order || f.family || f.genus ? `${f.order ?? ''}|${f.family ?? ''}|${f.genus ?? ''}` : ''),
}
const KINDS = Object.keys(SIGNATURES) as FilterKind[]

/** The kinds of filter newly set going from `prev` to `next`: empty to set, or changed to another non-empty value. Clearing is never one. */
export function newlySetKinds(prev: Filter, next: Filter): FilterKind[] {
  return KINDS.filter((k) => {
    const n = SIGNATURES[k](next)
    return n !== '' && n !== SIGNATURES[k](prev)
  })
}
