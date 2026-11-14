// Keeps Everybird's stickers current with upstream huashu-bird-sticker (run weekly by
// .github/workflows/huashu-sync.yml; see AGENTS.md "huashu sync").
//
//   npx tsx scripts/sync/huashu-sync.ts [--huashu-dir <path>] [--out <dir>] [--dry-run] [--prev-stickers <dir>]
//                                       [--max-rebuild N (default 600; 0: no cap)] [--allow-big-change]
//   npx tsx scripts/sync/huashu-sync.ts --init-lock [--huashu-dir data/raw/huashu]
//
// 1. Reads the pinned state from data/huashu.lock.json (huashu-lib.ts) and upstream HEAD's tree from a blobless,
//    sparse, depth-1 clone (`git ls-tree`: blob SHAs, no file downloads), or from --huashu-dir (a git checkout).
// 2. data/species.json is only downloaded when its blob changed; then each record's build-relevant fields are
//    digested and the crosswalk rerun. Codes whose sticker file's blob changed, or that gained or lost a sticker, are
//    the sticker changes. Nothing relevant changed: prints so, writes changed=false to $GITHUB_OUTPUT and exits 0.
// 3. Otherwise only the changed and new sticker files are checked out (sparse checkout), rebuilt with sharp into
//    <out>/stickers/v1/{128,384}/<code>.<sv>.webp (sv: the start of the source blob SHA), their masks and `ar` merged
//    into the committed public/data/masks and species.v1.json (no other sticker is needed on disk), species.v1.json
//    regenerated with the new huashu (the taxonomy comes from the committed public files, so no eBird download),
//    the sample pack rebuilt, and data/sticker-versions.json and the lock updated.
//    At most --max-rebuild stickers are rebuilt per run (website species first, then by code); the rest stay
//    unpublished (`shipped` in the lock) and the next run continues. Removals always ship.
// 4. Writes <out>/pr-body.md, <out>/issue-body.md (when a species on the website's /lifelist changed),
//    <out>/artifact/{summary.json,sheets/sheet-NNN.png} (before/after thumbnails, 60 rows a page) and
//    <out>/changed-files.txt.
// Stops (exit 1, nothing written to the repo, <out>/blocked-issue.md for the workflow) on an upstream inconsistency
// (an override naming a deleted huashu record, a sticker file species.json names but the tree lacks) or a diff that
// looks like a schema change (huashu-lib.ts `implausible`; --allow-big-change ships it anyway).
// --dry-run: everything above, but the repository's files are written under <out>/repo/ instead of in place, and the
// bodies are printed. The script itself never pushes, uploads or calls GitHub; the workflow does that.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { HuashuRecord, Overrides, Regions, SpeciesFile, SpeciesRow, TaxonomyFile } from '../../src/lib/species/types'
import { STICKER_BASE, SMALL, stickerPath } from '../../src/lib/sticker-url'
import { applyStickerVersions, buildSpecies, loadHuashu, matchHuashu, taxonomyFromPublic, STICKER_VERSIONS } from '../build-data/build-species'
import {
  ARTIFACT_URL, HUASHU_REPO, MAX_REBUILD, PR_URL, SPECIES_JSON, STICKERS_PREFIX, UpstreamInconsistency, codesFromMatches,
  diffRecords, diffRows, diffStickers, implausible, lockJson, makeLock, nextShipped, nextVersions, parseLsTree,
  recordDigests, renderBlockedBody, renderIssueBody, renderPrBody, restrictToShipped, selectBatch, sortKeys, summarise,
  type HuashuLock, type StickerChange,
} from './huashu-lib'

export const LOCK = 'data/huashu.lock.json'
export const WEBSITE_CODES = 'data/website-lifelist-codes.json'
const SHEET_ROWS = 60

export type Args = {
  huashuDir?: string; out: string; dryRun: boolean; initLock: boolean; prevStickers?: string
  maxRebuild: number; allowBigChange: boolean
}
function parseArgs(argv: string[]): Args {
  const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  const max = val('--max-rebuild')
  if (max !== undefined && !/^\d+$/.test(max)) throw new Error('--max-rebuild needs a whole number (0: no cap)')
  return {
    huashuDir: val('--huashu-dir'), out: resolve(val('--out') ?? join(tmpdir(), 'huashu-sync')),
    dryRun: argv.includes('--dry-run'), initLock: argv.includes('--init-lock'), prevStickers: val('--prev-stickers'),
    maxRebuild: max === undefined ? MAX_REBUILD : Number(max), allowBigChange: argv.includes('--allow-big-change'),
  }
}

const git = (dir: string, args: string[], input?: string) =>
  execFileSync('git', ['-C', dir, ...args], { input, maxBuffer: 1 << 28, stdio: ['pipe', 'pipe', 'inherit'] }).toString()
const readJson = <T>(p: string) => JSON.parse(readFileSync(p, 'utf8')) as T

/** A blobless, sparse, depth-1 clone: the tree is there, file contents only for what is checked out. */
export function cloneUpstream(dir: string, url = HUASHU_REPO): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dirname(dir), { recursive: true })
  execFileSync('git', ['clone', '--quiet', '--depth', '1', '--filter=blob:none', '--sparse', url, dir], { stdio: 'inherit' })
  git(dir, ['sparse-checkout', 'set', '--no-cone', '--stdin'], '/LICENSES/\n')
}

/** Makes `paths` present on disk in a sparse checkout (fetching just those blobs); no-op where they already are. */
function materialise(dir: string, paths: string[], wanted: Set<string>): void {
  const missing = paths.filter((p) => !existsSync(join(dir, p)))
  if (!missing.length) return
  for (const p of missing) wanted.add(p)
  const pattern = (p: string) => '/' + p.replace(/[\\*?[\]!#]/g, (c) => `\\${c}`)
  git(dir, ['sparse-checkout', 'set', '--no-cone', '--stdin'], ['/LICENSES/', ...[...wanted].map(pattern)].join('\n') + '\n')
  const still = missing.filter((p) => !existsSync(join(dir, p)))
  if (still.length) throw new Error(`could not check out ${still.length} files, e.g. ${still[0]}`)
}

type Repo = {
  root: string
  species: SpeciesFile
  taxonomy: TaxonomyFile
  overrides: Overrides
  versions: Record<string, string>
  website: Set<string>
}
function readRepo(root: string): Repo {
  const pub = (f: string) => join(root, 'public/data', f)
  const vPath = join(root, STICKER_VERSIONS), wPath = join(root, WEBSITE_CODES)
  return {
    root,
    species: readJson<SpeciesFile>(pub('species.v1.json')),
    taxonomy: readJson<TaxonomyFile>(pub('taxonomy.v1.json')),
    overrides: readJson<Overrides>(join(root, 'data/overrides.json')),
    versions: existsSync(vPath) ? readJson(vPath) : {},
    website: new Set(existsSync(wPath) ? readJson<string[]>(wPath) : []),
  }
}

/** --init-lock: the lock for the pinned checkout, verified against its commit's tree and the committed species data. */
function initLock(root: string, dir: string): void {
  const repo = readRepo(root)
  const commit = git(dir, ['rev-parse', 'HEAD']).trim()
  if (commit !== repo.species.huashuCommit) throw new Error(`${dir} is at ${commit}, species.v1.json was built from ${repo.species.huashuCommit}`)
  const tree = parseLsTree(git(dir, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']))
  // Every file on disk must be the commit's blob (hash-object, no filters), not just an unmodified-looking tree.
  const paths = [...tree.keys()]
  const hashes = git(dir, ['hash-object', '--no-filters', '--stdin-paths'], paths.join('\n') + '\n').trim().split('\n')
  const bad = paths.filter((p, i) => hashes[i] !== tree.get(p))
  if (bad.length) throw new Error(`${bad.length} files differ from ${commit}'s tree, e.g. ${bad[0]}`)
  const huashu = loadHuashu(dir)
  const taxa = taxonomyFromPublic(repo.taxonomy, repo.species)
  const { matches } = matchHuashu(huashu, taxa, repo.overrides)
  const lock = makeLock({ commit, tree, huashu, matches })
  // The lock must describe exactly what the committed data was built from.
  const st = repo.species.species.filter((s) => s.st).map((s) => s.code).sort()
  const locked = Object.keys(lock.shipped).sort()
  if (JSON.stringify(st) !== JSON.stringify(locked)) throw new Error('the crosswalk disagrees with species.v1.json about which species have stickers')
  const { file } = buildSpecies(huashu, taxa, repo.overrides, { ebirdTaxonomy: repo.species.ebirdTaxonomy, huashuCommit: commit })
  const prev = new Map(repo.species.species.map((s) => [s.code, s]))
  for (const s of file.species) { const p = prev.get(s.code); if (p) s.ar = p.ar }
  applyStickerVersions(file.species, repo.versions)
  if (JSON.stringify(file) !== JSON.stringify(repo.species)) throw new Error(`rebuilding species.v1.json from ${dir} does not reproduce the committed file`)
  const manifestPath = join(root, 'data/raw/manifest.json')
  if (existsSync(manifestPath) && readJson<{ huashuCommit?: string }>(manifestPath).huashuCommit !== commit) {
    console.warn(`note: data/raw/manifest.json names another huashu commit than ${commit}`)
  }
  writeFileSync(join(root, LOCK), lockJson(lock))
  console.log(`${LOCK}: ${commit}, ${Object.keys(lock.files).length} sticker files, ${Object.keys(lock.records).length} records, ${Object.keys(lock.codes).length} codes (verified against the tree and species.v1.json)`)
}

function output(vars: Record<string, string>) {
  const f = process.env.GITHUB_OUTPUT
  for (const [k, v] of Object.entries(vars)) {
    if (f) appendFileSync(f, `${k}=${v}\n`)
  }
}

/** The old 128 px file of a sticker: from a local stickers checkout when there is one, else the sticker host. */
async function beforeImage(code: string, sv: string | undefined, prevDir: string | undefined): Promise<Buffer | null> {
  const rel = stickerPath(code, SMALL, sv)
  if (prevDir && existsSync(join(prevDir, rel))) return readFileSync(join(prevDir, rel))
  try {
    const res = await fetch(`${STICKER_BASE}/${rel}`, { signal: AbortSignal.timeout(8000) })
    return res.ok ? Buffer.from(await res.arrayBuffer()) : null
  } catch { return null }
}

async function mapPool<T, R>(items: readonly T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]) } }))
  return out
}


export async function sync(root: string, a: Args): Promise<{ changed: boolean }> {
  const lock = readJson<HuashuLock>(join(root, LOCK))
  const repo = readRepo(root)
  mkdirSync(a.out, { recursive: true })
  for (const f of ['blocked-issue.md', 'issue-body.md', 'pr-body.md', 'changed-files.txt']) rmSync(join(a.out, f), { force: true })
  rmSync(join(a.out, 'artifact'), { recursive: true, force: true })
  const dir = resolve(a.huashuDir ?? join(a.out, 'huashu'))
  if (!a.huashuDir) cloneUpstream(dir)
  const commit = git(dir, ['rev-parse', 'HEAD']).trim()
  try {
    return await syncFrom(root, a, lock, repo, dir, commit)
  } catch (e) {
    if (e instanceof UpstreamInconsistency) {
      const runUrl = process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : undefined
      writeFileSync(join(a.out, 'blocked-issue.md'), renderBlockedBody({ from: lock.commit, to: commit, problems: e.problems, runUrl }))
      output({ blocked: 'true' })
    }
    throw e
  }
}

async function syncFrom(root: string, a: Args, lock: HuashuLock, repo: Repo, dir: string, commit: string): Promise<{ changed: boolean }> {
  const wanted = new Set<string>()
  const tree = parseLsTree(git(dir, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']))
  const files = sortKeys(Object.fromEntries([...tree].filter(([p]) => p.startsWith(STICKERS_PREFIX))))
  console.log(`huashu: lock ${lock.commit.slice(0, 7)}, upstream ${commit.slice(0, 7)} (${Object.keys(files).length} sticker files)`)
  const quiet = (why: string) => { console.log(`No changes: ${why}.`); output({ changed: 'false' }); return { changed: false } }

  // data/species.json: only fetched when its blob changed.
  let huashu: HuashuRecord[] | null = null
  let records = lock.records, codes = lock.codes
  const taxa = taxonomyFromPublic(repo.taxonomy, repo.species)
  const speciesBlob = tree.get(SPECIES_JSON)
  if (!speciesBlob) throw new UpstreamInconsistency(`upstream has no ${SPECIES_JSON}`)
  if (speciesBlob !== lock.speciesJson) {
    materialise(dir, [SPECIES_JSON], wanted)
    try {
      huashu = loadHuashu(dir)
      if (!Array.isArray(huashu)) throw new Error(`${SPECIES_JSON} has no species array`)
    } catch (e) { throw new UpstreamInconsistency(`${SPECIES_JSON} can't be read: ${(e as Error).message}`) }
    records = recordDigests(huashu)
    try {
      codes = codesFromMatches(matchHuashu(huashu, taxa, repo.overrides).matches)
    } catch (e) { throw new UpstreamInconsistency((e as Error).message) } // an override names a deleted record
  }
  // Stickers: what is published (lock.shipped) against upstream; also picks up a backlog a capped run left.
  const changes = diffStickers(lock, { files, codes })
  const recs = diffRecords(lock.records, records)
  const nRecs = recs.changed.length + recs.added.length + recs.removed.length
  console.log(`stickers: ${changes.length} species to publish; species.json: ${speciesBlob === lock.speciesJson ? 'unchanged' : `${nRecs} records with build-relevant changes`}`)
  if (!changes.length && !nRecs) return quiet('no sticker Everybird uses and no build-relevant species.json field changed')

  // A sticker added upstream that a capped run left unshipped is the outline in the committed rows; shipping it now
  // needs its record (quality bar), so species.json is read even when its blob is unchanged.
  if (!huashu && changes.some((c) => c.kind === 'new')) {
    materialise(dir, [SPECIES_JSON], wanted)
    huashu = loadHuashu(dir)
  }
  // species.v1.json: rebuilt from species.json (ar carried over), or the committed rows when it isn't needed.
  const prevRows = repo.species.species
  let rows: SpeciesRow[]
  if (huashu) {
    rows = buildSpecies(huashu, taxa, repo.overrides, { ebirdTaxonomy: repo.species.ebirdTaxonomy, huashuCommit: commit }).file.species
    const prevAr = new Map(prevRows.map((s) => [s.code, s.ar]))
    for (const s of rows) if (prevAr.has(s.code)) s.ar = prevAr.get(s.code)!
  } else {
    rows = prevRows.map((r) => ({ ...r }))
  }
  const problems = implausible({ shipped: Object.keys(lock.shipped).length, changes, prevRows, rows, prevRecords: Object.keys(lock.records).length, huashu })
  if (problems.length) {
    if (!a.allowBigChange) throw new UpstreamInconsistency(`the diff looks like an upstream schema change: ${problems.join('; ')}`, problems)
    console.warn(`--allow-big-change: shipping despite ${problems.join('; ')}`)
  }

  // This run's batch: every removal, and at most maxRebuild rebuilt stickers.
  const { ship, deferred } = selectBatch(changes, a.maxRebuild, repo.website)
  const shipped = nextShipped(lock.shipped, ship)
  restrictToShipped(rows, shipped)
  const versions = nextVersions(repo.versions, ship)
  applyStickerVersions(rows, versions)
  const rowChanges = diffRows(prevRows, rows)
  if (!ship.length && !rowChanges.length) return quiet(`${nRecs} huashu records changed, none in a way Everybird's data shows`)
  if (deferred.length) console.log(`cap: shipping ${ship.length - ship.filter((c) => c.kind === 'removed').length} rebuilt stickers, ${deferred.length} left for the next run`)

  // Stickers: only this batch's are checked out and rebuilt; every other mask and ar is merged as is.
  const { readMaskTables, updateStickers } = await import('../build-data/build-stickers')
  const { default: sharp } = await import('sharp')
  sharp.concurrency(1) // parallelism comes from updateStickers' pool, one sticker per thread
  const rebuild = ship.filter((s) => s.kind !== 'removed')
  materialise(dir, [...new Set(rebuild.map((s) => s.to!))], wanted)
  const stickersOut = join(a.out, 'stickers')
  rmSync(stickersOut, { recursive: true, force: true })
  const masks = readMaskTables(join(root, 'public/data/masks'))
  const written = await updateStickers({
    rows, codes: new Set(rebuild.map((s) => s.code)), source: (code) => join(dir, codes[code]), out: stickersOut, masks,
    concurrency: availableParallelism(),
  })

  // The landing sample pack, from the new rows and masks.
  const { makeSamplePack } = await import('../build-data/build-sample-pack')
  const read = <T>(f: string) => readJson<T>(join(root, 'public/data', f))
  const pack = await makeSamplePack(read('sample.v1.json'), rows, read<Regions>('regions.v1.json'), async (ord) => masks.get(ord) ?? {})

  const nextLock: HuashuLock = { v: 1, repo: HUASHU_REPO, commit, speciesJson: speciesBlob, files, records, codes, shipped }
  const target = a.dryRun ? join(a.out, 'repo') : root
  const outputs = new Map<string, string>([
    ['public/data/species.v1.json', JSON.stringify({ ...repo.species, huashuCommit: commit, species: rows })],
    ['public/data/sample-pack.v1.json', JSON.stringify(pack)],
    [STICKER_VERSIONS, JSON.stringify(versions, null, 1) + '\n'],
    [LOCK, lockJson(nextLock)],
  ])
  for (const [ord, rec] of masks) {
    const sorted = Object.fromEntries(Object.entries(rec).sort(([x], [y]) => (x < y ? -1 : 1)))
    outputs.set(`public/data/masks/${ord}.v1.json`, JSON.stringify(sorted))
  }
  // The masks bundle and the hashed data-file names (src/lib/data-files.ts), from the files as this run leaves them.
  const { buildDataFiles } = await import('../build-data/data-files')
  const dataText = (n: string) => outputs.get(`public/data/${n}`) ?? readFileSync(join(root, 'public/data', n), 'utf8')
  for (const [rel, text] of buildDataFiles(dataText, masks as Map<string, Record<string, unknown>>)) outputs.set(rel, text)
  const changedFiles: string[] = []
  for (const [rel, text] of outputs) {
    const now = existsSync(join(root, rel)) ? readFileSync(join(root, rel), 'utf8') : null
    if (now === text) continue
    changedFiles.push(rel)
    mkdirSync(dirname(join(target, rel)), { recursive: true })
    writeFileSync(join(target, rel), text)
  }

  const names = new Map(rows.map((r) => [r.code, r.com]))
  for (const r of prevRows) if (!names.has(r.code)) names.set(r.code, r.com)
  const summary = summarise({
    from: lock.commit, to: commit, stickers: ship, rows: rowChanges, records: recs, names, website: repo.website,
    files: changedFiles.sort(), deferred: deferred.length, cap: a.maxRebuild,
  })

  // Before/after sheets for every sticker this run ships, 60 rows a page, the website's species first.
  const artifact = join(a.out, 'artifact')
  mkdirSync(join(artifact, 'sheets'), { recursive: true })
  writeFileSync(join(artifact, 'summary.json'), JSON.stringify({ ...summary, deferredCodes: deferred.map((d) => d.code) }, null, 1))
  const sheetChanges = [...ship].sort((x, y) => Number(repo.website.has(y.code)) - Number(repo.website.has(x.code)) || (x.code < y.code ? -1 : 1))
  const prevDir = a.prevStickers ? resolve(a.prevStickers) : existsSync(join(root, '../everybird-stickers/v1')) ? resolve(root, '../everybird-stickers') : undefined
  const { makeSheet } = await import('./sheet')
  let pages = 0
  for (let i = 0; i < sheetChanges.length; i += SHEET_ROWS) {
    const page = await mapPool(sheetChanges.slice(i, i + SHEET_ROWS), 16, async (s: StickerChange) => ({
      code: s.code, com: names.get(s.code) ?? s.code, kind: s.kind,
      before: s.kind === 'new' ? null : await beforeImage(s.code, repo.versions[s.code], prevDir),
      after: s.kind === 'removed' ? null : readFileSync(join(stickersOut, stickerPath(s.code, SMALL, versions[s.code]))),
    }))
    writeFileSync(join(artifact, 'sheets', `sheet-${String(++pages).padStart(3, '0')}.png`), await makeSheet(page))
  }

  const prBody = renderPrBody(summary, { sheets: pages ? { pages, rows: sheetChanges.length } : null })
  const issueBody = renderIssueBody(summary)
  writeFileSync(join(a.out, 'pr-body.md'), prBody)
  if (issueBody) writeFileSync(join(a.out, 'issue-body.md'), issueBody)
  writeFileSync(join(a.out, 'changed-files.txt'), changedFiles.join('\n') + '\n')
  writeFileSync(join(a.out, 'stickers-written.txt'), written.join('\n') + (written.length ? '\n' : ''))

  console.log(`changed files (${a.dryRun ? `written under ${target}` : 'in place'}): ${changedFiles.join(', ')}`)
  console.log(`stickers built: ${written.length / 2} into ${stickersOut}; sheets: ${pages} page(s) in ${artifact}`)
  output({
    changed: 'true', website: issueBody ? 'true' : 'false', commit, short: commit.slice(0, 7),
    stickers: String(written.length / 2), deferred: String(deferred.length),
  })
  if (a.dryRun) {
    const show = (t: string) => t.replace(ARTIFACT_URL, artifact).replace(PR_URL, '(dry run: no PR)')
    console.log('\n----- PR body -----\n' + show(prBody))
    console.log('----- website issue body -----\n' + (issueBody ? show(issueBody) : '(none: no website species changed)\n'))
  }
  return { changed: true }
}

async function main() {
  process.env.UV_THREADPOOL_SIZE ||= String(Math.max(4, availableParallelism())) // before sharp's first threadpool use
  const a = parseArgs(process.argv.slice(2))
  const root = process.cwd()
  if (a.initLock) return initLock(root, resolve(a.huashuDir ?? 'data/raw/huashu'))
  await sync(root, a)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
