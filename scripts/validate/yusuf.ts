// Validation against the author's own data (plan Task 24). Reads Yusuf's private exports, runs the real importers,
// merges under the default rules and diffs against his hand-kept lifelist.json by eBird code.
//
//   npx tsx scripts/validate/yusuf.ts            live iNaturalist fetch (public API, 1 request/s), saved for re-runs
//   npx tsx scripts/validate/yusuf.ts --offline  replays private/inat-yusuftaleb.json, no network
//
// Inputs and outputs all live in private/ (git-ignored): never commit them or anything derived from them.
// stdout carries only the one-line summary and aggregate counts; species-level detail goes to the private report.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import Papa from 'papaparse'
import { parseEbirdLifeList } from '@/lib/import/ebird-lifelist'
import { parseEbirdMyData } from '@/lib/import/ebird-mydata'
import { importInat } from '@/lib/import/inat'
import { buildList } from '@/lib/list/build-list'
import { buildSeen } from '@/lib/list/seen'
import { resolveName, type TaxonomyIndex } from '@/lib/species/resolve'
import { DEFAULT_RULES, EMPTY_EDITS, type ImportResult, type ListEntry, type SourceRecord } from '@/lib/list/model'
import { buildTaxonomyIndex } from '@/lib/species/load'
import type { Regions, SpeciesFile, TaxonomyFile } from '@/lib/species/types'

const P = 'private'
const INAT_USER = 'yusuftaleb'
const INAT_CACHE = `${P}/inat-yusuftaleb.json`
const REPORT = `${P}/validation-report.md`
const TARGET_COUNT = 197

type Target = { code: string; common: string; scientific: string; date: string; source: string; mark?: 'heard' | 'dead' }
type Cache = { user: string; fetchedAt: string; responses: Record<string, unknown> }

const readJson = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T
let offlinePlaceMisses = 0

/**
 * Seen-here check, independent of the importer's aggregation: read MyEBirdData.csv row by row, resolve each name, and
 * collect per country the distinct species with any countable row there. Returns ISO2 -> codes.
 */
function tallyCountries(csv: string, t: TaxonomyIndex): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  const cache = new Map<string, string | null>()
  const rows = Papa.parse<Record<string, string>>(csv.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: true }).data
  for (const r of rows) {
    const sci = r['Scientific Name']?.trim() || undefined, com = r['Common Name']?.trim() || undefined
    const key = `${sci}|${com}`
    if (!cache.has(key)) cache.set(key, resolveName(t, { sci, com }).code)
    const code = cache.get(key)
    const country = (r['State/Province'] ?? '').trim().toUpperCase().split('-')[0]
    if (!code || !country) continue
    if (!out.has(country)) out.set(country, new Set())
    out.get(country)!.add(code)
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// iNaturalist: live with a recording fetch, or offline from the saved pages.

async function inat(opts: Omit<Parameters<typeof importInat>[1], 'fetch'>, offline: boolean): Promise<ImportResult> {
  let fetchImpl: typeof fetch
  let cache: Cache | null = null
  if (offline) {
    if (!existsSync(INAT_CACHE)) throw new Error(`--offline needs ${INAT_CACHE}; run once without --offline first`)
    const saved = readJson<Cache>(INAT_CACHE)
    // Seen-here resolves every observation's places, so the place batches differ from those the cache was recorded
    // with: offline, a place batch is answered from every place the cache holds (ids it lacks are counted, not guessed).
    const knownPlaces = new Map<number, unknown>()
    for (const [url, body] of Object.entries(saved.responses))
      if (url.includes('/v1/places/')) for (const p of (body as { results?: { id: number }[] }).results ?? []) knownPlaces.set(p.id, p)
    fetchImpl = (async (u: string | URL | Request) => {
      const url = String(u)
      if (url in saved.responses) return new Response(JSON.stringify(saved.responses[url]), { status: 200 })
      const m = /\/v1\/places\/([\d,]+)/.exec(url)
      if (!m) throw new Error(`Not in ${INAT_CACHE}: ${url}`)
      const ids = m[1].split(',').map(Number)
      offlinePlaceMisses += ids.filter((id) => !knownPlaces.has(id)).length
      return new Response(JSON.stringify({ results: ids.filter((id) => knownPlaces.has(id)).map((id) => knownPlaces.get(id)) }), { status: 200 })
    }) as typeof fetch
  } else {
    cache = { user: INAT_USER, fetchedAt: new Date().toISOString(), responses: {} }
    const rec = cache
    fetchImpl = (async (u: string | URL | Request, init?: RequestInit) => {
      const url = String(u)
      const res = await fetch(url, { ...init, headers: { 'User-Agent': 'Everybird validation (one-off, read-only)' } })
      if (!res.ok) return res
      const body: unknown = await res.json()
      rec.responses[url] = body
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
  }
  const res = await importInat(INAT_USER, {
    ...opts,
    fetch: fetchImpl,
    minIntervalMs: offline ? 0 : 1000,
    onProgress: offline ? undefined : (p) => process.stderr.write(`\riNaturalist: ${p.fetched} of ${p.total}`),
  })
  if (!offline) process.stderr.write('\n')
  if ('error' in res) throw new Error(`iNaturalist import failed: ${res.error}`)
  if (cache) writeFileSync(INAT_CACHE, JSON.stringify(cache))
  return res
}

// ---------------------------------------------------------------------------------------------
// Classification. "Explained" categories are Yusuf's own choices or known format differences.

type Diff = { code: string; name: string; kind: string; explained: boolean; detail: string }

const isYM = (d: string) => /^\d{4}-\d{2}$/.test(d)

function classify(targets: Target[], merged: ListEntry[], bySource: Record<'ebird' | 'inat', Map<string, SourceRecord>>, inatRes: ImportResult): Diff[] {
  const m = new Map(merged.map((e) => [e.code, e]))
  const tCodes = new Set(targets.map((t) => t.code))
  const out: Diff[] = []
  for (const t of targets) {
    const name = `${t.common} (${t.scientific})`
    const e = m.get(t.code)
    if (!e) {
      const unmatched = inatRes.unmatched.find((u) => u.sci?.toLowerCase() === t.scientific.toLowerCase())
      if (/^Yusuf,/.test(t.source)) out.push({ code: t.code, name, kind: 'manual addition (his own record, in neither source)', explained: true, detail: `his source: "${t.source}"` })
      else if (unmatched) out.push({ code: t.code, name, kind: 'iNaturalist name did not match (importer or synonym gap)', explained: false, detail: `unmatched "${unmatched.sci}" (${unmatched.reason})` })
      else out.push({ code: t.code, name, kind: 'missing from merged list', explained: false, detail: `his source: "${t.source}"` })
      continue
    }
    const eb = bySource.ebird.get(t.code)?.date
    const ina = bySource.inat.get(t.code)?.date
    if (e.date !== t.date) {
      const src = `merged ${e.date ?? '-'} (${e.sources.join('+')}; eBird ${eb ?? '-'}, iNat ${ina ?? '-'}) vs his ${t.date}; his source: "${t.source}"`
      if (/corrected/i.test(t.source)) out.push({ code: t.code, name, kind: 'date corrected by hand (iNaturalist date wrong)', explained: true, detail: src })
      else if (isYM(t.date) && e.date?.startsWith(t.date)) out.push({ code: t.code, name, kind: 'his list keeps only the month', explained: true, detail: src })
      else if (/^Yusuf,/.test(t.source)) out.push({ code: t.code, name, kind: 'his own date (manual record)', explained: true, detail: src })
      // His old migration script's name filter for domestic birds also excludes wild species whose names match it;
      // Everybird keeps their records, by his own earliest-date rule.
      else if (/\bdomesticus\b/.test(t.scientific) && ina && e.date === ina && eb === t.date && ina < t.date)
        out.push({ code: t.code, name, kind: 'earlier iNaturalist record his old script filtered out (domestic-bird name filter)', explained: true, detail: src })
      else if ((eb === t.date || ina === t.date) && e.date && e.date < t.date) out.push({ code: t.code, name, kind: 'earlier record in the other source than the one he used', explained: false, detail: src })
      else out.push({ code: t.code, name, kind: 'date differs', explained: false, detail: src })
    }
    const mark = e.dead ? 'dead' : e.heard ? 'heard' : undefined
    if (mark !== t.mark) {
      const detail = `merged ${mark ?? 'none'} vs his ${t.mark ?? 'none'} (sources ${e.sources.join('+')})`
      out.push({ code: t.code, name, kind: t.mark && !mark ? 'mark set by hand (not in the source data)' : 'mark differs', explained: !!t.mark && !mark, detail })
    }
  }
  for (const e of merged) {
    if (tCodes.has(e.code)) continue
    out.push({ code: e.code, name: e.code, kind: 'in merged list, not in his (exclusion?)', explained: false, detail: `sources ${e.sources.join('+')}, date ${e.date ?? '-'}` })
  }
  return out
}

// ---------------------------------------------------------------------------------------------

async function main() {
  const offline = process.argv.includes('--offline')
  const taxonomy = buildTaxonomyIndex(readJson<TaxonomyFile>('public/data/taxonomy.v1.json').taxa)
  const speciesFile = readJson<SpeciesFile>('public/data/species.v1.json')
  const order = new Map(speciesFile.species.map((s) => [s.code, s.to]))
  const comByCode = new Map(speciesFile.species.map((s) => [s.code, `${s.com} (${s.sci})`]))
  const regions = readJson<Regions>('public/data/regions.v1.json')
  const synonyms = readJson<Record<string, string>>('public/data/inat-synonyms.v1.json')
  const targets = readJson<{ species: Target[] }>(`${P}/lifelist.json`).species

  const life = parseEbirdLifeList(readFileSync(`${P}/ebird_world_life_list.csv`, 'utf8'), taxonomy)
  const mine = await parseEbirdMyData(readFileSync(`${P}/MyEBirdData.csv`, 'utf8'), taxonomy)
  const inatRes = await inat({ taxonomy, synonyms, regions }, offline)

  // The two eBird files must agree (same codes; the full export's earliest date may differ only by trip choice).
  const lifeCodes = new Set(life.records.map((r) => r.code))
  const mineCodes = new Set(mine.records.map((r) => r.code))
  const onlyLife = [...lifeCodes].filter((c) => !mineCodes.has(c))
  const onlyMine = [...mineCodes].filter((c) => !lifeCodes.has(c))
  const mineByCode = new Map(mine.records.map((r) => [r.code, r]))
  const ebirdDateDiffs = life.records.filter((r) => mineByCode.has(r.code) && mineByCode.get(r.code)!.date !== r.date)

  const taxonOrder = (c: string) => order.get(c) ?? Number.MAX_SAFE_INTEGER
  const merged = buildList([...life.records, ...inatRes.records], EMPTY_EDITS, DEFAULT_RULES, taxonOrder)
  const mergedMine = buildList([...mine.records, ...inatRes.records], EMPTY_EDITS, DEFAULT_RULES, taxonOrder)
  const sameMerge = JSON.stringify(merged.map((e) => [e.code, e.date])) === JSON.stringify(mergedMine.map((e) => [e.code, e.date]))

  const bySource = {
    ebird: new Map(life.records.map((r) => [r.code, r])),
    inat: new Map(inatRes.records.map((r) => [r.code, r])),
  }
  const diffs = classify(targets, merged, bySource, inatRes).map((d) => (d.name === d.code ? { ...d, name: comByCode.get(d.code) ?? d.code } : d))
  const unexplained = diffs.filter((d) => !d.explained)

  // ----- seen-here: per-country species from the importer vs the independent tally -----
  const mineCsv = readFileSync(`${P}/MyEBirdData.csv`, 'utf8')
  const tally = tallyCountries(mineCsv, taxonomy)
  const seenCount = (records: SourceRecord[]) => {
    const list = buildList(records, EMPTY_EDITS, DEFAULT_RULES)
    const seen = buildSeen(records, EMPTY_EDITS, DEFAULT_RULES, list)
    const by = new Map<string, Set<string>>()
    for (const [code, e] of seen.byCode) for (const p of e.places) { if (!by.has(p.country)) by.set(p.country, new Set()); by.get(p.country)!.add(code) }
    return by
  }
  const seenMine = seenCount(mine.records)
  const seenMerged = seenCount([...mine.records, ...inatRes.records])
  const countries = [...new Set([...tally.keys(), ...seenMine.keys()])].sort()
  const countryDiffs = countries.filter((c) => (tally.get(c)?.size ?? 0) !== (seenMine.get(c)?.size ?? 0))
  const caT = tally.get('CA')?.size ?? 0, caS = seenMine.get('CA')?.size ?? 0, caM = seenMerged.get('CA')?.size ?? 0
  const liferCA = mergedMine.filter((e) => (e.place?.country ?? e.place?.sub1?.split('-')[0]) === 'CA').length
  const seenLine = `seen-here Canada: MyEBirdData ${caS} (independent tally ${caT}, ${caS === caT ? 'match' : 'MISMATCH'}) · merged with iNat ${caM} · lifers there ${liferCA} · countries ${countries.length}, mismatched ${countryDiffs.length}${offline ? ` · offline place ids missing ${offlinePlaceMisses}` : ''}`

  const summary = `eBird ${life.records.length} · MyEBirdData ${mine.records.length} · merged ${merged.length} · target ${targets.length === TARGET_COUNT ? TARGET_COUNT : `${targets.length} (expected ${TARGET_COUNT})`} · unexplained ${unexplained.length}`

  // ----- private report (species-level; never committed) -----
  const kinds = new Map<string, Diff[]>()
  for (const d of diffs) kinds.set(d.kind, [...(kinds.get(d.kind) ?? []), d])
  const L: string[] = []
  L.push('# Validation report (PRIVATE: never commit)', '', `Generated ${new Date().toISOString()} by \`scripts/validate/yusuf.ts\`${offline ? ' --offline' : ''}.`, '', '```', summary, '```', '')
  L.push('## Sources', '')
  L.push(`- eBird life list: ${life.records.length} species, ${life.skipped} rows not countable, ${life.unmatched.length} unmatched`)
  L.push(`- MyEBirdData: ${mine.records.length} species, ${mine.skipped} rows not countable, ${mine.unmatched.length} unmatched`)
  L.push(`- eBird files agree on codes: ${onlyLife.length === 0 && onlyMine.length === 0 ? 'yes' : `no (only life list: ${onlyLife.join(', ') || '-'}; only MyEBirdData: ${onlyMine.join(', ') || '-'})`}`)
  L.push(`- eBird files agree on first dates: ${ebirdDateDiffs.length === 0 ? 'yes' : `${ebirdDateDiffs.length} differ`}`)
  for (const r of ebirdDateDiffs) L.push(`  - ${comByCode.get(r.code) ?? r.code}: life list ${r.date}, MyEBirdData ${mineByCode.get(r.code)!.date}`)
  L.push(`- iNaturalist ${INAT_USER}: ${inatRes.records.length} species, ${inatRes.skipped} observations above species/not countable, ${inatRes.unmatched.length} unmatched`)
  for (const u of inatRes.unmatched) L.push(`  - unmatched: ${u.sci} (${u.reason}${u.suggestion ? `, suggestion ${u.suggestion}` : ''})`)
  L.push(`- Merged (life list + iNat): ${merged.length}; merged (MyEBirdData + iNat) gives the same codes and dates: ${sameMerge ? 'yes' : 'no'}`)
  L.push(`- Species only from iNaturalist: ${merged.filter((e) => e.sources.length === 1 && e.sources[0] === 'inat').map((e) => comByCode.get(e.code) ?? e.code).join('; ') || '-'}`)
  L.push('', '## Seen here', '', seenLine, '')
  for (const c of countries) L.push(`- ${c}: MyEBirdData seen-here ${seenMine.get(c)?.size ?? 0}, tally ${tally.get(c)?.size ?? 0}, merged ${seenMerged.get(c)?.size ?? 0}`)
  L.push('', '## Differences from lifelist.json', '')
  if (diffs.length === 0) L.push('None.')
  for (const [kind, ds] of kinds) {
    L.push(`### ${kind}: ${ds.length} (${ds[0].explained ? 'explained' : 'UNEXPLAINED, for Yusuf to decide'})`, '')
    for (const d of ds) L.push(`- ${d.name} \`${d.code}\`: ${d.detail}`)
    L.push('')
  }
  const decide = diffs.filter((d) => !d.explained || /filtered out/.test(d.kind))
  L.push('## For Yusuf to decide', '')
  if (decide.length === 0) L.push('Nothing.')
  for (const d of decide)
    L.push(d.explained
      ? `- ${d.name}: Everybird uses the earlier iNaturalist date by your earliest-date rule; your lifelist.json has the later eBird date because the old script's name filter skipped it. Keep yours, or update lifelist.json?`
      : `- ${d.name}: ${d.kind}. ${d.detail}`)
  L.push('')
  writeFileSync(REPORT, L.join('\n') + '\n')

  // ----- stdout: aggregates only -----
  console.log(summary)
  console.log(seenLine)
  for (const [kind, ds] of kinds) console.log(`  ${ds[0].explained ? 'explained  ' : 'UNEXPLAINED'} ${String(ds.length).padStart(3)}  ${kind}`)
  console.log(`  report: ${REPORT}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
