import { formatPlace, stripBracket } from '@/lib/import/places'
import type { Regions } from '@/lib/species/types'
import type { SpeciesIndex } from '@/lib/species/load'
import { SLOTS, slotSource } from './model'
import type { ListEntry, Slot, Source, SourceRecord } from './model'
import { seenOf, type SeenIndex } from './seen'
import { migrateSaved, type Saved, type SourceDetails } from './storage'

const HEADER = ['eBird code', 'Common name', 'Scientific name', 'First date', 'Place', 'Country', 'Heard only', 'Found dead', 'Sources', 'Countries seen']

function cell(v: string): string {
  // Neutralise spreadsheet formulas (places can come from iNaturalist free text).
  if (/^[=+\-@]/.test(v)) v = `'${v}`
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
}

const countryLabel = (iso: string, regions: Regions) => (regions.countries[iso] ? stripBracket(regions.countries[iso]) : iso)

/**
 * RFC 4180 CSV, CRLF line endings, one trailing CRLF. Dates are as stored (YYYY-MM-DD | YYYY-MM | YYYY). The first
 * date, place and country are the lifer's; the last column lists every country the species was seen in (seen-here,
 * else the lifer country), by name, "; "-separated.
 */
export function toCsv(list: ListEntry[], species: SpeciesIndex, regions: Regions, seen?: SeenIndex): string {
  const lines = [HEADER.map(cell).join(',')]
  for (const e of list) {
    const sp = species.byCode.get(e.code)
    const p = e.place
    const country = p ? (p.country && regions.countries[p.country]) || (p.sub1 && regions.countries[p.sub1.split('-')[0]]) || '' : ''
    const countries = [...new Set(seenOf(seen, e).map((x) => countryLabel(x.country, regions)))].sort((a, b) => a.localeCompare(b))
    lines.push(
      [
        e.code,
        sp?.com ?? '',
        sp?.sci ?? '',
        e.date ?? '',
        formatPlace(p, regions),
        country,
        e.heard ? 'yes' : '',
        e.dead ? 'yes' : '',
        e.sources.join('; '),
        countries.join('; '),
      ]
        .map(cell)
        .join(','),
    )
  }
  return lines.join('\r\n') + '\r\n'
}

export function toJson(s: Saved): string {
  return JSON.stringify(s)
}

const SOURCES: Source[] = ['ebird', 'inat', 'manual']
const isSlot = (k: unknown): k is Slot => SLOTS.includes(k as Slot)
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const isStrArr = (x: unknown): x is string[] => Array.isArray(x) && x.every((s) => typeof s === 'string')

const optStr = (x: unknown) => x === undefined || typeof x === 'string'
const optCount = (x: unknown) => x === undefined || (typeof x === 'number' && Number.isFinite(x) && x >= 0)
const EBIRD_KINDS = ['full-export', 'life-list']

/** v3 source details: eBird files (kind, file, rows, at) and the iNaturalist account (user, observations, at). */
function validSources(x: unknown): boolean {
  if (!isObj(x)) return false
  return Object.entries(x).every(([k, d]) => {
    if (!isObj(d) || !optStr(d.at)) return false
    if (k === 'ebird' || k === 'ebird-list') return EBIRD_KINDS.includes(d.kind as string) && optStr(d.file) && optCount(d.rows)
    if (k === 'inat') return optStr(d.user) && optCount(d.observations)
    return false
  })
}

/** Parse and validate a backup. Throws an Error with a plain message on bad input. */
export function fromJson(text: string): Saved {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('This file is not valid JSON.')
  }
  if (!isObj(raw)) throw new Error('This is not an Everybird backup.')
  // v1 backups predate seen-here, v1 and v2 backups predate source details, v1 to v3 backups hold a person's name
  // rather than the collage's title: migrateSaved brings them to v4.
  if (raw.v !== 1 && raw.v !== 2 && raw.v !== 3 && raw.v !== 4) throw new Error('Unsupported backup version.')

  if (!isObj(raw.records)) throw new Error('Backup has no records.')
  // Backups made before the second eBird slot have no 'ebird-list'; it starts empty.
  const records = { ebird: [], 'ebird-list': [], inat: [], manual: [] } as Record<Slot, SourceRecord[]>
  for (const [k, v] of Object.entries(raw.records)) {
    if (!isSlot(k) || !Array.isArray(v) || !v.every((r) => isObj(r) && typeof r.code === 'string' && (r.seen === undefined || isStrArr(r.seen))))
      throw new Error('Backup records are malformed.')
    records[k] = v as SourceRecord[]
  }

  const unmatched = raw.unmatched ?? []
  if (
    !Array.isArray(unmatched) ||
    !unmatched.every((u) => isObj(u) && typeof u.row === 'number' && SOURCES.includes(u.source as Source) && (u.slot === undefined || (isSlot(u.slot) && slotSource(u.slot) === u.source)) && (u.seen === undefined || isStrArr(u.seen)))
  )
    throw new Error('Backup unmatched rows are malformed.')

  const e = raw.edits
  if (!isObj(e) || !isStrArr(e.removed) || !Array.isArray(e.added) || !isObj(e.marks) || !isObj(e.fixes))
    throw new Error('Backup edits are malformed.')
  if (!e.added.every((r) => isObj(r) && typeof r.code === 'string')) throw new Error('Backup edits are malformed.')

  const r = raw.rules
  if (!isObj(r) || typeof r.hideHeard !== 'boolean' || typeof r.hideDead !== 'boolean' || typeof r.researchOnly !== 'boolean')
    throw new Error('Backup rules are malformed.')

  if (raw.name !== undefined && typeof raw.name !== 'string') throw new Error('Backup name is malformed.')
  const sk = raw.skipped
  if (sk !== undefined && (!isObj(sk) || !Object.entries(sk).every(([k, n]) => isSlot(k) && typeof n === 'number' && n >= 0)))
    throw new Error('Backup skipped counts are malformed.')
  const src = raw.sources
  if (src !== undefined && !validSources(src)) throw new Error('Backup source details are malformed.')
  const out: Saved = {
    v: raw.v as Saved['v'],
    records,
    unmatched: unmatched as Saved['unmatched'],
    edits: e as unknown as Saved['edits'],
    rules: r as unknown as Saved['rules'],
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : new Date().toISOString(),
  }
  if (raw.name !== undefined) out.name = raw.name
  if (sk !== undefined) out.skipped = sk as Saved['skipped']
  if (src !== undefined) out.sources = src as SourceDetails
  return migrateSaved(out)
}
