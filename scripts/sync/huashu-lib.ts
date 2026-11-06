// The pure half of the huashu sync (scripts/sync/huashu-sync.ts): the lock, the diffs and the PR and issue bodies.
// No file or network access here, so the unit tests (tests/huashu-sync.test.ts) cover all of it.
import { createHash } from 'node:crypto'
import type { HuashuRecord, SpeciesRow } from '../../src/lib/species/types'

export const HUASHU_REPO = 'https://github.com/alchaincyf/huashu-bird-sticker'
export const SPECIES_JSON = 'data/species.json'
export const STICKERS_PREFIX = 'stickers/'

/**
 * data/huashu.lock.json: the huashu-bird-sticker state Everybird's data was built from. Two halves:
 * - what upstream looked like at the last sync (`commit`): git blob SHAs (what `git ls-tree` prints, so upstream HEAD
 *   can be compared without downloading a single file) for data/species.json and every file under stickers/; a digest
 *   per species.json record of the fields the build reads; and the crosswalk, the sticker file each eBird species
 *   uses (`codes`), so a week with an unchanged species.json needs no species.json download;
 * - what is published (`shipped`): the blob each species' sticker files were built from. A sync capped by
 *   --max-rebuild ships only part of a large change, so `shipped` can lag `codes`/`files`; the next sync picks up the
 *   rest. build-stickers refuses to write a sticker from any other blob.
 */
export type HuashuLock = {
  v: 1
  repo: string
  commit: string
  /** Blob SHA of data/species.json. */
  speciesJson: string
  /** Every file under stickers/: path -> blob SHA. */
  files: Record<string, string>
  /** huashu record id -> recordDigest (the fields build-species and the crosswalk read). */
  records: Record<string, string>
  /** eBird species code -> the huashu sticker file the crosswalk picks at `commit` (species with a sticker only). */
  codes: Record<string, string>
  /** eBird species code -> blob SHA of the source its published sticker was built from (species with a sticker). */
  shipped: Record<string, string>
}

/**
 * `git ls-tree -r -z <commit>` output (NUL-terminated entries, so paths are never quoted; newline-separated output
 * parses too while no path needs quoting) -> path -> blob SHA, for data/species.json and stickers/ only.
 */
export function parseLsTree(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const entry of text.split(text.includes('\0') ? '\0' : '\n')) {
    const m = /^\d+ blob ([0-9a-f]{40,64})\t(.+)$/.exec(entry)
    if (!m) continue
    if (m[2].startsWith('"')) throw new Error(`quoted path in ls-tree output (use -z): ${m[2]}`)
    if (m[2] === SPECIES_JSON || m[2].startsWith(STICKERS_PREFIX)) out.set(m[2], m[1])
  }
  return out
}

/** The fields of a huashu record that Everybird's build reads (crosswalk, mass, sticker, quality bar), as a digest. */
export function recordDigest(h: HuashuRecord): string {
  const fields = [
    h.scientificName, h.taxonConcept ?? null, h.taxonomy?.seq ?? null, h.ids?.ebird ?? null,
    h.traits?.massG ?? null, h.sticker ? [h.sticker.file, !!h.sticker.meetsQualityBar] : null,
    (h.previous ?? []).map((p) => p.scientificName),
  ]
  return createHash('sha256').update(JSON.stringify(fields)).digest('hex').slice(0, 12)
}

export function recordDigests(huashu: readonly HuashuRecord[]): Record<string, string> {
  return sortKeys(Object.fromEntries(huashu.map((h) => [h.id, recordDigest(h)])))
}

/** The crosswalk's sticker file per eBird code (codes whose matched record has a sticker). */
export function codesFromMatches(matches: ReadonlyMap<string, HuashuRecord>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [code, rec] of matches) if (rec.sticker) out[code] = rec.sticker.file
  return sortKeys(out)
}

export function makeLock(o: { commit: string; tree: ReadonlyMap<string, string>; huashu: readonly HuashuRecord[]; matches: ReadonlyMap<string, HuashuRecord> }): HuashuLock {
  const speciesJson = o.tree.get(SPECIES_JSON)
  if (!speciesJson) throw new Error(`${SPECIES_JSON} is not in the tree`)
  const files = sortKeys(Object.fromEntries([...o.tree].filter(([p]) => p.startsWith(STICKERS_PREFIX))))
  const codes = codesFromMatches(o.matches)
  const shipped = sortKeys(Object.fromEntries(Object.entries(codes).map(([c, f]) => {
    if (!files[f]) throw new Error(`${c}: ${f} is not in the tree`)
    return [c, files[f]]
  })))
  return { v: 1, repo: HUASHU_REPO, commit: o.commit, speciesJson, files, records: recordDigests(o.huashu), codes, shipped }
}

/** One entry per line, so a week's change is a small diff. */
export const lockJson = (lock: HuashuLock) => JSON.stringify(lock, null, 1) + '\n'

export function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export type StickerChange = { code: string; kind: 'changed' | 'new' | 'removed'; from?: string; to?: string; blob?: string }

/** An upstream state the sync can't build from (deterministic: it fails the same way every week until fixed). */
export class UpstreamInconsistency extends Error {
  constructor(message: string, readonly problems: string[] = [message]) { super(message); this.name = 'UpstreamInconsistency' }
}

/**
 * Which eBird species' stickers differ between what is published (`lock.shipped`) and upstream: a code whose
 * sticker source blob changed (a redraw, or the crosswalk now picks another file with other content) is `changed`,
 * one that gained a sticker `new`, one that lost it `removed`. `blob` is the new source's blob SHA, `from` the file
 * the crosswalk picked at the last sync. Sorted by code. Throws UpstreamInconsistency when species.json names a
 * sticker file that isn't in the tree.
 */
export function diffStickers(lock: Pick<HuashuLock, 'shipped' | 'codes'>, next: Pick<HuashuLock, 'files' | 'codes'>): StickerChange[] {
  const out: StickerChange[] = []
  const missing: string[] = []
  const all = [...new Set([...Object.keys(lock.shipped), ...Object.keys(next.codes)])].sort()
  for (const code of all) {
    const a = lock.shipped[code], to = next.codes[code], from = lock.codes[code]
    const b = to ? next.files[to] : undefined
    if (to && !b) { missing.push(`${code}: species.json names ${to}, which is not in the upstream tree`); continue }
    if (a && !to) out.push({ code, kind: 'removed', from })
    else if (!a && to) out.push({ code, kind: 'new', to, blob: b })
    else if (a && to && a !== b) out.push({ code, kind: 'changed', from, to, blob: b })
  }
  if (missing.length) throw new UpstreamInconsistency(`${missing.length} sticker files missing upstream, e.g. ${missing[0]}`, missing)
  return out
}

export const MAX_REBUILD = 600

/**
 * The part of a change one sync ships: every removal (cheap), and at most `max` rebuilt stickers (`max` <= 0: all),
 * the website's species first, then by code, so reruns pick the same batch. The rest is `deferred` to a later run.
 */
export function selectBatch(changes: readonly StickerChange[], max: number, website: ReadonlySet<string>): { ship: StickerChange[]; deferred: StickerChange[] } {
  const removed = changes.filter((c) => c.kind === 'removed')
  const rebuild = changes.filter((c) => c.kind !== 'removed')
    .sort((a, b) => Number(website.has(b.code)) - Number(website.has(a.code)) || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
  const n = max > 0 ? Math.min(max, rebuild.length) : rebuild.length
  const ship = [...rebuild.slice(0, n), ...removed].sort((a, b) => (a.code < b.code ? -1 : 1))
  return { ship, deferred: rebuild.slice(n) }
}

/** `shipped` after a sync ships `ship`. */
export function nextShipped(prev: Record<string, string>, ship: readonly StickerChange[]): Record<string, string> {
  const out = { ...prev }
  for (const c of ship) {
    if (c.kind === 'removed') delete out[c.code]
    else out[c.code] = c.blob!
  }
  return sortKeys(out)
}

/**
 * A species has a sticker only once its sticker is published: a sticker upstream added but not shipped yet (a capped
 * sync) stays the outline. Mutates and returns `rows`.
 */
export function restrictToShipped(rows: SpeciesRow[], shipped: Record<string, string>): SpeciesRow[] {
  for (const r of rows) if (r.st && !shipped[r.code]) { r.st = false; r.q = false; r.ar = 1; delete r.sv }
  return rows
}

/** Thresholds past which a diff looks like an upstream schema change rather than real edits. */
export const LIMITS = { removed: 0.05, mass: 0.2, recordsLost: 0.2, malformed: 0.5 } as const

/**
 * Reasons to stop instead of shipping: more than 5% of the published stickers removed, more than 20% of the species'
 * masses changed, more than 20% of the species.json records gone, or most records missing the fields the build reads.
 * Empty when the diff looks like ordinary edits.
 */
export function implausible(o: {
  shipped: number; changes: readonly StickerChange[]; prevRows: readonly SpeciesRow[]; rows: readonly SpeciesRow[]
  prevRecords: number; huashu: readonly HuashuRecord[] | null
}): string[] {
  const out: string[] = []
  const removed = o.changes.filter((c) => c.kind === 'removed').length
  if (o.shipped && removed / o.shipped > LIMITS.removed) out.push(`${removed} of ${o.shipped} published stickers would be removed (over ${LIMITS.removed * 100}%)`)
  const before = new Map(o.prevRows.map((r) => [r.code, r.g]))
  const mass = o.rows.filter((r) => before.has(r.code) && before.get(r.code) !== r.g).length
  if (o.rows.length && mass / o.rows.length > LIMITS.mass) out.push(`${mass} of ${o.rows.length} species masses would change (over ${LIMITS.mass * 100}%)`)
  if (o.huashu) {
    const n = o.huashu.length
    if (o.prevRecords && n < o.prevRecords * (1 - LIMITS.recordsLost)) out.push(`species.json has ${n} records, down from ${o.prevRecords}`)
    const bad = o.huashu.filter((h) => typeof h?.id !== 'string' || typeof h.scientificName !== 'string' || typeof h.taxonomy?.seq !== 'number' || typeof h.ids !== 'object').length
    if (n && bad / n > LIMITS.malformed) out.push(`${bad} of ${n} species.json records lack id, scientificName, taxonomy.seq or ids`)
  }
  return out
}

export type RecordChanges = { changed: string[]; added: string[]; removed: string[] }
export function diffRecords(a: Record<string, string>, b: Record<string, string>): RecordChanges {
  const changed: string[] = [], added: string[] = [], removed: string[] = []
  for (const id of Object.keys(b)) if (!(id in a)) added.push(id); else if (a[id] !== b[id]) changed.push(id)
  for (const id of Object.keys(a)) if (!(id in b)) removed.push(id)
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() }
}

/** Short sticker version for a rebuilt sticker: the start of its huashu file's blob SHA (so a rerun gives the same). */
export const stickerVersion = (blob: string) => blob.slice(0, 10)

/** The new sticker versions: rebuilt stickers get one, removed stickers lose theirs, the rest keep what they have. */
export function nextVersions(prev: Record<string, string>, changes: readonly StickerChange[]): Record<string, string> {
  const out = { ...prev }
  for (const c of changes) {
    if (c.kind === 'removed') delete out[c.code]
    else out[c.code] = stickerVersion(c.blob!)
  }
  return sortKeys(out)
}

/**
 * Data changes other than the sticker itself, per code: mass (and its source), names, and the quality bar (unless the
 * sticker itself came or went, which the sticker change already says).
 */
export type RowChange = { code: string; fields: string[] }
export function diffRows(prev: readonly SpeciesRow[], next: readonly SpeciesRow[]): RowChange[] {
  const before = new Map(prev.map((r) => [r.code, r]))
  const out: RowChange[] = []
  for (const r of next) {
    const p = before.get(r.code)
    if (!p) { out.push({ code: r.code, fields: ['new species row'] }); continue }
    const f: string[] = []
    if (p.g !== r.g || p.gSrc !== r.gSrc) f.push(`mass ${fmtG(p.g)} (${p.gSrc}) → ${fmtG(r.g)} (${r.gSrc})`)
    if (p.q !== r.q && p.st === r.st) f.push(`quality bar ${p.q ? 'met' : 'not met'} → ${r.q ? 'met' : 'not met'}`)
    if (p.com !== r.com || p.sci !== r.sci) f.push(`name ${p.com} → ${r.com}`)
    if (f.length) out.push({ code: r.code, fields: f })
  }
  return out
}
const fmtG = (g: number) => `${Math.round(g * 10) / 10} g`

export type SummaryEntry = { code: string; com: string; kind: 'changed' | 'new' | 'removed' | 'data'; detail: string; website: boolean }
export type Summary = {
  from: string; to: string; repo: string
  entries: SummaryEntry[]
  records: RecordChanges
  /** Files under public/data and data/ the sync rewrote. */
  files: string[]
  /** Rebuilt stickers left for a later sync by the cap, and the cap. */
  deferred: number
  cap: number
}

export function summarise(o: {
  from: string; to: string; stickers: readonly StickerChange[]; rows: readonly RowChange[]; records: RecordChanges
  names: ReadonlyMap<string, string>; website: ReadonlySet<string>; files: string[]; deferred?: number; cap?: number
}): Summary {
  const entries: SummaryEntry[] = []
  const rowsBy = new Map(o.rows.map((r) => [r.code, r.fields]))
  for (const s of o.stickers) {
    const extra = rowsBy.get(s.code) ?? []
    rowsBy.delete(s.code)
    const what = s.kind === 'changed' ? (s.from === s.to ? 'redrawn' : `now ${base(s.to!)}`) : s.kind === 'new' ? `sticker ${base(s.to!)}` : 'outline from now on'
    entries.push({ code: s.code, com: o.names.get(s.code) ?? s.code, kind: s.kind, detail: [what, ...extra].join('; '), website: o.website.has(s.code) })
  }
  for (const [code, fields] of rowsBy) {
    entries.push({ code, com: o.names.get(code) ?? code, kind: 'data', detail: fields.join('; '), website: false })
  }
  const order = { changed: 0, new: 1, removed: 2, data: 3 }
  entries.sort((a, b) => order[a.kind] - order[b.kind] || (a.com < b.com ? -1 : a.com > b.com ? 1 : 0))
  return { from: o.from, to: o.to, repo: HUASHU_REPO, entries, records: o.records, files: o.files, deferred: o.deferred ?? 0, cap: o.cap ?? 0 }
}
const base = (p: string) => p.split('/').pop()!

const count = (s: Summary, k: SummaryEntry['kind']) => s.entries.filter((e) => e.kind === k).length
export const compareUrl = (s: Pick<Summary, 'repo' | 'from' | 'to'>) => `${s.repo}/compare/${s.from.slice(0, 7)}...${s.to.slice(0, 7)}`
const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export const PR_URL = '@@PR_URL@@'
export const ARTIFACT_URL = '@@ARTIFACT_URL@@'
export const TABLE_MAX = 300
/** GitHub rejects bodies over 65,536 characters; stay well under (the workflow swaps in URLs). */
export const BODY_MAX = 60_000

export type SheetInfo = { pages: number; rows: number }

/**
 * The pull request's body. ARTIFACT_URL stands for the run's artifact (summary.json and the paged before/after
 * sheets; the workflow fills it in). The table is cut short so the body stays under BODY_MAX.
 */
export function renderPrBody(s: Summary, o: { sheets?: SheetInfo | null; tableMax?: number } = {}): string {
  const n = { changed: count(s, 'changed'), new: count(s, 'new'), removed: count(s, 'removed'), data: count(s, 'data') }
  const web = s.entries.filter((e) => e.website)
  const head = [
    '## huashu-bird-sticker sync',
    '',
    s.from === s.to
      ? `Upstream: [\`${s.to.slice(0, 7)}\`](${s.repo}/commit/${s.to}) (unchanged; this run continues the backlog an earlier capped sync left)`
      : `Upstream: [\`${s.from.slice(0, 7)}...${s.to.slice(0, 7)}\`](${compareUrl(s)})`,
    '',
    `- Stickers: ${n.changed} changed, ${n.new} new, ${n.removed} removed (removed ones draw the outline)`,
    ...(s.deferred ? [`- Left for the next sync: ${s.deferred} more rebuilt stickers (this run ships at most ${s.cap}; merge this PR and the next run continues)`] : []),
    `- Other data (mass, quality bar): ${n.data} species`,
    `- huashu records with build-relevant changes: ${s.records.changed.length} changed, ${s.records.added.length} added, ${s.records.removed.length} removed`,
    `- On the website's /lifelist: ${web.length ? web.map((e) => `\`${e.code}\``).join(', ') : 'none'}`,
    '',
    `Artifacts: [summary.json and the before/after sheets](${ARTIFACT_URL})${o.sheets ? ` (old and new 128 px sticker side by side, ${o.sheets.rows} rows on ${o.sheets.pages} page${o.sheets.pages === 1 ? '' : 's'})` : ''}; kept 30 days.`,
    '',
    '| Species | Code | Change | Detail |', '|---|---|---|---|',
  ]
  const tail = [
    '',
    'Rebuilt stickers are already in the R2 bucket under new file names (`v1/<size>/<code>.<sv>.webp`); their `sv` is in',
    '`data/sticker-versions.json` and `species.v1.json`, so only they get new URLs and every other sticker URL stays the',
    'same. Nothing changes on the live site until this is merged. Check the Vercel preview, then merge by hand.',
    '',
    `Files: ${s.files.map((f) => `\`${f}\``).join(', ')}`,
  ]
  const rows = s.entries.map((e) => `| ${esc(e.com)}${e.website ? ' (website)' : ''} | \`${e.code}\` | ${e.kind} | ${esc(e.detail)} |`)
  let max = Math.min(o.tableMax ?? TABLE_MAX, rows.length)
  const build = (k: number) => [...head, ...rows.slice(0, k), ...(rows.length > k ? [`| … and ${rows.length - k} more (summary.json has them all) | | | |`] : []), ...tail].join('\n') + '\n'
  let body = build(max)
  while (body.length > BODY_MAX && max > 0) body = build(max = Math.max(0, max - Math.max(1, Math.ceil(max / 4))))
  return body
}

export const WEBSITE_ISSUE_TITLE = 'Website /lifelist stickers changed upstream'
/** Marks which published state (the lock's commit) an issue body was written against. */
export const baseMarker = (from: string) => `<!-- huashu-sync base=${from} -->`

/**
 * The website issue's body (null when no website species changed). PR_URL stands for the sync PR's link. Its marker
 * lets the workflow update the body while the same change is still unmerged, and comment once a new change comes.
 */
export function renderIssueBody(s: Summary): string | null {
  const web = s.entries.filter((e) => e.website)
  if (!web.length) return null
  return [
    baseMarker(s.from),
    `huashu-bird-sticker changed the stickers of ${web.length} species on yusuftaleb.com/lifelist ([\`${s.from.slice(0, 7)}...${s.to.slice(0, 7)}\`](${compareUrl(s)}); Everybird PR: ${PR_URL}).`,
    'Update them in Framer.',
    '',
    '| Species | Code | Change |',
    '|---|---|---|',
    ...web.map((e) => `| ${esc(e.com)} | \`${e.code}\` | ${e.kind} |`),
    '',
  ].join('\n')
}

export const BLOCKED_ISSUE_TITLE = 'huashu sync is blocked upstream'

/** The issue opened when a sync stops on an upstream inconsistency or an implausible diff. */
export function renderBlockedBody(o: { from: string; to: string; problems: readonly string[]; runUrl?: string }): string {
  const list = o.problems.slice(0, 50).map((p) => `- ${p}`)
  if (o.problems.length > 50) list.push(`- … and ${o.problems.length - 50} more`)
  return [
    `The weekly huashu sync stopped at upstream \`${o.to.slice(0, 7)}\` (published: \`${o.from.slice(0, 7)}\`, [compare](${compareUrl({ repo: HUASHU_REPO, from: o.from, to: o.to })})) and shipped nothing${o.runUrl ? ` ([run](${o.runUrl}))` : ''}:`,
    '',
    ...list,
    '',
    'It fails the same way every week until this is resolved: fix `data/overrides.json` (an override naming a huashu record',
    'that no longer exists), wait for upstream to fix its data, or, if the change is real, run the workflow by hand with',
    '`allow_big_change` (or `huashu-sync.ts --allow-big-change` locally).',
    '',
  ].join('\n')
}
