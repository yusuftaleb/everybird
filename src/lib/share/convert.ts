// Pure conversions between the app's list and a share payload. No link-index import: safe for client bundles.
import { formatPlace, stripBracket } from '../import/places'
import type { ListEntry, Place, SourceRecord } from '../list/model'
import type { Regions } from '../species/types'
import type { SharePayload } from './link'

const BASE_YEAR = 1900
const M_HEARD = 1, M_DEAD = 2, M_MEDIA = 4

/** "2020-03-04" | "2020-03" -> months since 1900-01; "2020" -> that January with yearOnly. Anything else: none. */
export function dateToYm(date: string | undefined): { ym: number; yearOnly?: true } | undefined {
  const m = date && /^(\d{4})(?:-(\d{2}))?/.exec(date)
  if (!m) return undefined
  const year = Number(m[1])
  const month = m[2] ? Number(m[2]) : 1
  if (year < BASE_YEAR || year > BASE_YEAR + 5000 || month < 1 || month > 12) return undefined
  const ym = (year - BASE_YEAR) * 12 + (month - 1)
  return m[2] ? { ym } : { ym, yearOnly: true }
}
export function ymToDate(ym: number, yearOnly?: boolean): string {
  const year = BASE_YEAR + Math.floor(ym / 12)
  return yearOnly ? String(year) : `${year}-${String((ym % 12) + 1).padStart(2, '0')}`
}

function isoOf(place: Place | undefined): string | undefined {
  return place?.country || place?.sub1?.split('-')[0] || undefined
}

/** The list as a share payload: codes, first month, marks and the formatted region (never towns or coordinates). */
export function payloadFromList(list: ListEntry[], regions: Regions, name?: string): SharePayload {
  const places: string[] = [], countries: string[] = []
  const slot = new Map<string, number>()
  const birds = list.map((e) => {
    const b: SharePayload['birds'][number] = { code: e.code }
    const d = dateToYm(e.date)
    if (d) { b.ym = d.ym; if (d.yearOnly) b.yearOnly = true }
    const display = formatPlace(e.place, regions)
    if (display) {
      const iso = isoOf(e.place) ?? '--'
      const key = `${iso}|${display}`
      let s = slot.get(key)
      if (s === undefined) { s = places.length; slot.set(key, s); places.push(display); countries.push(iso) }
      b.p = s
    }
    const m = (e.heard ? M_HEARD : 0) | (e.dead ? M_DEAD : 0) | (e.media ? M_MEDIA : 0)
    if (m) b.m = m
    return b
  })
  const out: SharePayload = { v: 1, birds }
  if (name?.trim()) out.name = name.trim()
  if (places.length) { out.places = places; out.countries = countries }
  return out
}

/**
 * A shared payload as records for the store, plus the Regions to show them with. A place keeps its ISO2 country (for the
 * country filter and the map); its sub-region text rides on a synthetic sub1 so formatPlace prints the shared string.
 */
export function payloadToRecords(p: SharePayload, regions: Regions): { records: SourceRecord[]; regions: Regions } {
  const sub1: Record<string, string> = { ...regions.sub1 }
  const placeOf = (i: number): Place | undefined => {
    const display = p.places?.[i]
    if (!display) return undefined
    const iso = p.countries?.[i]
    const country = iso && iso !== '--' ? iso : undefined
    const cn = country && regions.countries[country] ? stripBracket(regions.countries[country]) : undefined
    let sub: string | undefined = display
    if (cn && display === cn) sub = undefined
    else if (cn && display.endsWith(`, ${cn}`)) sub = display.slice(0, -(cn.length + 2))
    if (!sub) return { country }
    const key = `${country ?? 'XX'}-share${i}`
    sub1[key] = sub
    return { country, sub1: key }
  }
  const cache = new Map<number, Place | undefined>()
  const records = p.birds.map((b): SourceRecord => {
    const r: SourceRecord = { code: b.code, source: 'ebird' }
    if (b.ym !== undefined) r.date = ymToDate(b.ym, b.yearOnly)
    if (b.p !== undefined) {
      if (!cache.has(b.p)) cache.set(b.p, placeOf(b.p))
      const pl = cache.get(b.p)
      if (pl) r.place = pl
    }
    const m = b.m ?? 0
    if (m & M_HEARD) r.heard = true
    if (m & M_DEAD) r.dead = true
    if (m & M_MEDIA) r.media = true
    return r
  })
  return { records, regions: { ...regions, sub1 } }
}
