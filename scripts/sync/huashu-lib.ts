// The pure half of the huashu sync (scripts/sync/huashu-sync.ts): the lock, the diffs and the PR and issue bodies.
// No file or network access here, so the unit tests (tests/huashu-sync.test.ts) cover all of it.
import { createHash } from 'node:crypto'
import type { HuashuRecord, SpeciesRow } from '../../src/lib/species/types'

export const HUASHU_REPO = 'https://github.com/alchaincyf/huashu-bird-sticker'
export const SPECIES_JSON = 'data/species.json'
export const STICKERS_PREFIX = 'stickers/'

/**
 * data/huashu.lock.json: the huashu-bird-sticker state Everybird's data was built from. Git blob SHAs (what
 * `git ls-tree` prints, so upstream HEAD can be compared without downloading a single file) for data/species.json
 * and every file under stickers/; a digest per species.json record of the fields the build reads; and the crosswalk
 * result, the sticker file each eBird species uses.
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
  /** eBird species code -> the huashu sticker file it is built from (species with a sticker only). */
  codes: Record<string, string>
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
  return { v: 1, repo: HUASHU_REPO, commit: o.commit, speciesJson, files, records: recordDigests(o.huashu), codes: codesFromMatches(o.matches) }
}

/** One entry per line, so a week's change is a small diff. */
export const lockJson = (lock: HuashuLock) => JSON.stringify(lock, null, 1) + '\n'

export function sortKeys<T>(o: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

export type StickerChange = { code: string; kind: 'changed' | 'new' | 'removed'; from?: string; to?: string; blob?: string }

/**
 * Which eBird species' stickers differ between the lock and upstream: a code whose sticker file's blob changed (a
 * redraw, or the crosswalk now picks another file with other content) is `changed`, one that gained a sticker `new`,
 * one that lost it `removed`. `blob` is the new file's blob SHA. Sorted by code.
 */
export function diffStickers(lock: Pick<HuashuLock, 'files' | 'codes'>, next: Pick<HuashuLock, 'files' | 'codes'>): StickerChange[] {
  const out: StickerChange[] = []
  const all = [...new Set([...Object.keys(lock.codes), ...Object.keys(next.codes)])].sort()
  for (const code of all) {
    const from = lock.codes[code], to = next.codes[code]
    const a = from ? lock.files[from] : undefined
    const b = to ? next.files[to] : undefined
    if (from && !to) out.push({ code, kind: 'removed', from })
    else if (!from && to) { if (!b) throw new Error(`${code}: ${to} is not in the upstream tree`); out.push({ code, kind: 'new', to, blob: b }) }
    else if (from && to) {
      if (!b) throw new Error(`${code}: ${to} is not in the upstream tree`)
      if (a !== b) out.push({ code, kind: 'changed', from, to, blob: b })
    }
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
}

export function summarise(o: {
  from: string; to: string; stickers: readonly StickerChange[]; rows: readonly RowChange[]; records: RecordChanges
  names: ReadonlyMap<string, string>; website: ReadonlySet<string>; files: string[]
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
  return { from: o.from, to: o.to, repo: HUASHU_REPO, entries, records: o.records, files: o.files }
}
const base = (p: string) => p.split('/').pop()!

const count = (s: Summary, k: SummaryEntry['kind']) => s.entries.filter((e) => e.kind === k).length
export const compareUrl = (s: Pick<Summary, 'repo' | 'from' | 'to'>) => `${s.repo}/compare/${s.from.slice(0, 7)}...${s.to.slice(0, 7)}`
const esc = (t: string) => t.replace(/\|/g, '\\|').replace(/\n/g, ' ')

export const PR_URL = '@@PR_URL@@'
export const SHEET_URL = '@@SHEET_URL@@'
export const TABLE_MAX = 300

/** The pull request's body. SHEET_URL stands for the thumbnail sheet's link (the workflow fills it in). */
export function renderPrBody(s: Summary, o: { sheetRows: number; tableMax?: number } = { sheetRows: 0 }): string {
  const max = o.tableMax ?? TABLE_MAX
  const n = { changed: count(s, 'changed'), new: count(s, 'new'), removed: count(s, 'removed'), data: count(s, 'data') }
  const web = s.entries.filter((e) => e.website)
  const lines = [
    '## huashu-bird-sticker sync',
    '',
    `Upstream: [\`${s.from.slice(0, 7)}...${s.to.slice(0, 7)}\`](${compareUrl(s)})`,
    '',
    `- Stickers: ${n.changed} changed, ${n.new} new, ${n.removed} removed (removed ones draw the outline)`,
    `- Other data (mass, quality bar): ${n.data} species`,
    `- huashu records with build-relevant changes: ${s.records.changed.length} changed, ${s.records.added.length} added, ${s.records.removed.length} removed`,
    `- On the website's /lifelist: ${web.length ? web.map((e) => `\`${e.code}\``).join(', ') : 'none'}`,
    '',
  ]
  if (o.sheetRows) {
    lines.push(`Before and after: [thumbnail sheet](${SHEET_URL}) (old and new 128 px sticker side by side, ${o.sheetRows} row${o.sheetRows === 1 ? '' : 's'}${o.sheetRows < n.changed + n.new + n.removed ? ', capped' : ''}; a workflow artifact, kept 30 days).`, '')
  }
  lines.push('| Species | Code | Change | Detail |', '|---|---|---|---|')
  for (const e of s.entries.slice(0, max)) {
    lines.push(`| ${esc(e.com)}${e.website ? ' (website)' : ''} | \`${e.code}\` | ${e.kind} | ${esc(e.detail)} |`)
  }
  if (s.entries.length > max) lines.push(`| … and ${s.entries.length - max} more | | | |`)
  lines.push(
    '',
    'Rebuilt stickers are already in the R2 bucket under new file names (`v1/<size>/<code>.<sv>.webp`); their `sv` is in',
    '`data/sticker-versions.json` and `species.v1.json`, so only they get new URLs and every other sticker URL stays the',
    'same. Nothing changes on the live site until this is merged. Check the Vercel preview, then merge by hand.',
    '',
    `Files: ${s.files.map((f) => `\`${f}\``).join(', ')}`,
  )
  return lines.join('\n') + '\n'
}

export const WEBSITE_ISSUE_TITLE = 'Website /lifelist stickers changed upstream'

/** The website issue's body (null when no website species changed). PR_URL stands for the sync PR's link. */
export function renderIssueBody(s: Summary): string | null {
  const web = s.entries.filter((e) => e.website)
  if (!web.length) return null
  return [
    `huashu-bird-sticker changed the stickers of ${web.length} species on yusuftaleb.com/lifelist ([\`${s.from.slice(0, 7)}...${s.to.slice(0, 7)}\`](${compareUrl(s)}); Everybird PR: ${PR_URL}).`,
    'Update them in Framer.',
    '',
    '| Species | Code | Change |',
    '|---|---|---|',
    ...web.map((e) => `| ${esc(e.com)} | \`${e.code}\` | ${e.kind} |`),
    '',
  ].join('\n')
}
