// Keeps Everybird's stickers current with upstream huashu-bird-sticker (run weekly by
// .github/workflows/huashu-sync.yml; see AGENTS.md "huashu sync").
//
//   npx tsx scripts/sync/huashu-sync.ts [--huashu-dir <path>] [--out <dir>] [--dry-run] [--prev-stickers <dir>]
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
// 4. Writes <out>/pr-body.md, <out>/issue-body.md (when a species on the website's /lifelist changed),
//    <out>/sheet.png (before/after thumbnails), <out>/summary.json and <out>/changed-files.txt.
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
  HUASHU_REPO, PR_URL, SHEET_URL, SPECIES_JSON, STICKERS_PREFIX, codesFromMatches, diffRecords, diffRows, diffStickers,
  lockJson, makeLock, nextVersions, parseLsTree, recordDigests, renderIssueBody, renderPrBody, sortKeys, summarise,
  type HuashuLock, type StickerChange,
} from './huashu-lib'

export const LOCK = 'data/huashu.lock.json'
export const WEBSITE_CODES = 'data/website-lifelist-codes.json'
const SHEET_MAX = 60

type Args = { huashuDir?: string; out: string; dryRun: boolean; initLock: boolean; prevStickers?: string }
function parseArgs(argv: string[]): Args {
  const val = (f: string) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
  return {
    huashuDir: val('--huashu-dir'), out: resolve(val('--out') ?? join(tmpdir(), 'huashu-sync')),
    dryRun: argv.includes('--dry-run'), initLock: argv.includes('--init-lock'), prevStickers: val('--prev-stickers'),
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
  const locked = Object.keys(lock.codes).sort()
  if (JSON.stringify(st) !== JSON.stringify(locked)) throw new Error('the crosswalk disagrees with species.v1.json about which species have stickers')
  const { file } = buildSpecies(huashu, taxa, repo.overrides, { ebirdTaxonomy: repo.species.ebirdTaxonomy, huashuCommit: commit })
  const prev = new Map(repo.species.species.map((s) => [s.code, s]))
  for (const s of file.species) { const p = prev.get(s.code); if (p) s.ar = p.ar }
  applyStickerVersions(file.species, repo.versions)
  if (JSON.stringify(file) !== JSON.stringify(repo.species)) throw new Error(`rebuilding species.v1.json from ${dir} does not reproduce the committed file`)
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

export async function sync(root: string, a: Args): Promise<{ changed: boolean }> {
  const lock = readJson<HuashuLock>(join(root, LOCK))
  const repo = readRepo(root)
  mkdirSync(a.out, { recursive: true })
  const dir = resolve(a.huashuDir ?? join(a.out, 'huashu'))
  if (!a.huashuDir) cloneUpstream(dir)
  const wanted = new Set<string>()
  const commit = git(dir, ['rev-parse', 'HEAD']).trim()
  const tree = parseLsTree(git(dir, ['ls-tree', '-r', '-z', '--full-tree', 'HEAD']))
  const files = sortKeys(Object.fromEntries([...tree].filter(([p]) => p.startsWith(STICKERS_PREFIX))))
  console.log(`huashu: pinned ${lock.commit.slice(0, 7)}, upstream ${commit.slice(0, 7)} (${Object.keys(files).length} sticker files)`)

  const quiet = (why: string) => { console.log(`No changes: ${why}.`); output({ changed: 'false' }); return { changed: false } }
  if (commit === lock.commit) return quiet('upstream is at the pinned commit')

  // data/species.json: only fetched when its blob changed.
  let huashu: HuashuRecord[] | null = null
  let records = lock.records, codes = lock.codes
  const taxa = taxonomyFromPublic(repo.taxonomy, repo.species)
  const speciesBlob = tree.get(SPECIES_JSON)
  if (!speciesBlob) throw new Error(`upstream has no ${SPECIES_JSON}`)
  if (speciesBlob !== lock.speciesJson) {
    materialise(dir, [SPECIES_JSON], wanted)
    huashu = loadHuashu(dir)
    records = recordDigests(huashu)
    codes = codesFromMatches(matchHuashu(huashu, taxa, repo.overrides).matches)
  }
  const stickers = diffStickers(lock, { files, codes })
  const recs = diffRecords(lock.records, records)
  const nRecs = recs.changed.length + recs.added.length + recs.removed.length
  console.log(`stickers: ${stickers.length} species affected; species.json: ${speciesBlob === lock.speciesJson ? 'unchanged' : `${nRecs} records with build-relevant changes`}`)
  if (!stickers.length && !nRecs) return quiet('no sticker Everybird uses and no build-relevant species.json field changed')

  // species.v1.json: rebuilt from the new species.json (ar carried over), or the committed rows when it is unchanged.
  const prevRows = repo.species.species
  let rows: SpeciesRow[]
  if (huashu) {
    rows = buildSpecies(huashu, taxa, repo.overrides, { ebirdTaxonomy: repo.species.ebirdTaxonomy, huashuCommit: commit }).file.species
    const prevAr = new Map(prevRows.map((s) => [s.code, s.ar]))
    for (const s of rows) if (prevAr.has(s.code)) s.ar = prevAr.get(s.code)!
  } else {
    rows = prevRows.map((r) => ({ ...r }))
  }
  const versions = nextVersions(repo.versions, stickers)
  applyStickerVersions(rows, versions)
  const rowChanges = diffRows(prevRows, rows)
  if (!stickers.length && !rowChanges.length) return quiet(`${nRecs} huashu records changed, none in a way Everybird's data shows`)

  // Stickers: only the changed and new ones are checked out and rebuilt; every other mask and ar is merged as is.
  const { readMaskTables, updateStickers } = await import('../build-data/build-stickers')
  const { default: sharp } = await import('sharp')
  sharp.concurrency(1) // parallelism comes from updateStickers' pool, one sticker per thread
  const rebuild = stickers.filter((s) => s.kind !== 'removed')
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

  const nextLock: HuashuLock = {
    v: 1, repo: HUASHU_REPO, commit, speciesJson: speciesBlob, files, records, codes,
  }
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
  const summary = summarise({ from: lock.commit, to: commit, stickers, rows: rowChanges, records: recs, names, website: repo.website, files: changedFiles.sort() })

  // Before/after sheet: the website's species first, then the rest, capped.
  const sheetChanges = [...stickers].sort((x, y) => Number(repo.website.has(y.code)) - Number(repo.website.has(x.code))).slice(0, SHEET_MAX)
  const prevDir = a.prevStickers ? resolve(a.prevStickers) : existsSync(join(root, '../everybird-stickers/v1')) ? resolve(root, '../everybird-stickers') : undefined
  const { makeSheet } = await import('./sheet')
  const sheetRows = await Promise.all(sheetChanges.map(async (s: StickerChange) => ({
    code: s.code, com: names.get(s.code) ?? s.code, kind: s.kind,
    before: s.kind === 'new' ? null : await beforeImage(s.code, repo.versions[s.code], prevDir),
    after: s.kind === 'removed' ? null : readFileSync(join(stickersOut, stickerPath(s.code, SMALL, versions[s.code]))),
  })))
  if (sheetRows.length) writeFileSync(join(a.out, 'sheet.png'), await makeSheet(sheetRows))
  else rmSync(join(a.out, 'sheet.png'), { force: true })

  const prBody = renderPrBody(summary, { sheetRows: sheetRows.length })
  const issueBody = renderIssueBody(summary)
  writeFileSync(join(a.out, 'summary.json'), JSON.stringify(summary, null, 1))
  writeFileSync(join(a.out, 'pr-body.md'), prBody)
  if (issueBody) writeFileSync(join(a.out, 'issue-body.md'), issueBody)
  else rmSync(join(a.out, 'issue-body.md'), { force: true })
  writeFileSync(join(a.out, 'changed-files.txt'), changedFiles.join('\n') + '\n')
  writeFileSync(join(a.out, 'stickers-written.txt'), written.join('\n') + (written.length ? '\n' : ''))

  console.log(`changed files (${a.dryRun ? `written under ${target}` : 'in place'}): ${changedFiles.join(', ')}`)
  console.log(`stickers built: ${written.length / 2} into ${stickersOut}`)
  output({
    changed: 'true', website: issueBody ? 'true' : 'false', commit, short: commit.slice(0, 7),
    stickers: String(written.length / 2), sheet: sheetRows.length ? 'true' : 'false',
  })
  if (a.dryRun) {
    const show = (t: string) => t.replace(SHEET_URL, join(a.out, 'sheet.png')).replace(PR_URL, '(dry run: no PR)')
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
