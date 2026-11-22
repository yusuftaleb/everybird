// Pure conversions between the app's list and a share payload. No link-index import: safe for client bundles.
import { formatPlace, stripBracket } from '../import/places'
import type { ListEntry, Place, SourceRecord } from '../list/model'
import type { Regions } from '../species/types'
import type { SharePayload } from './link'
import { LEGACY_COUNTRY_NAMES } from './legacy-country-names'

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
  if (ym > 300 * 12) return undefined // link.ts MAX_YM (2200-01); a typo year must not make the encoder throw
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
 * Places filter); the rest of its shared string, "Okanagan, British Columbia", splits at its last ", " into the county
 * (before, commas and all) and the province (after), so the shared view's Places filter drills country > province >
 * county from the strings links already carry. Each distinct province name in a country gets one synthetic sub1,
 * "CA-share0", whose Regions name is that province, so formatPlace prints the shared string exactly. A string whose
 * country the viewer's regions don't name, or that doesn't end with ", <country name>", stays whole on its synthetic
 * sub1, with no county.
 */
export function payloadToRecords(p: SharePayload, regions: Regions): { records: SourceRecord[]; regions: Regions } {
  const sub1: Record<string, string> = { ...regions.sub1 }
  const provinceKey = new Map<string, string>()
  let next = 0
  const keyFor = (country: string | undefined, name: string): string => {
    const id = `${country ?? ''}|${name}`
    let key = provinceKey.get(id)
    if (key === undefined) {
      key = `${country ?? 'XX'}-share${next++}`
      provinceKey.set(id, key)
      sub1[key] = name
    }
    return key
  }
  const placeOf = (i: number): Place | undefined => {
    const display = p.places?.[i]
    if (!display) return undefined
    const iso = p.countries?.[i]
    const country = iso && iso !== '--' ? iso : undefined
    const current = country && regions.countries[country] ? stripBracket(regions.countries[country]) : undefined
    // A link made before the full country names ends its places with the old short name.
    const legacy = country ? LEGACY_COUNTRY_NAMES[country] : undefined
    if (current && display === current) return { country }
    if (legacy && display === legacy) return { country }
    const cn = current && display.endsWith(`, ${current}`) ? current : legacy && display.endsWith(`, ${legacy}`) ? legacy : undefined
    if (!cn) return { country, sub1: keyFor(country, display) }
    const sub = display.slice(0, -(cn.length + 2))
    const cut = sub.lastIndexOf(', ')
    if (cut < 0) return { country, sub1: keyFor(country, sub) }
    return { country, sub1: keyFor(country, sub.slice(cut + 2)), sub2: sub.slice(0, cut) }
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
