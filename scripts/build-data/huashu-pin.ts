// Keeps local data builds (build-species, build-stickers) on the huashu state the committed data was built from:
// data/huashu.lock.json (written by scripts/sync/huashu-sync.ts). After a sync PR is merged, data/raw/huashu must be
// moved to the lock's commit (fetch-sources.ts does it) before `npm run data`; otherwise a rebuild would revert the
// sync or write an old drawing under a new sticker version.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { HuashuLock } from '../sync/huashu-lib'

export const LOCK_PATH = 'data/huashu.lock.json'

export function readLock(root = process.cwd()): HuashuLock | null {
  const p = resolve(root, LOCK_PATH)
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) as HuashuLock : null
}

/** Git's blob SHA-1 of a file's bytes (what `git hash-object` and `git ls-tree` print). */
export function gitBlobSha(buf: Buffer): string {
  return createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex')
}

/** Throws, saying how to fix it, when data/raw's huashu commit is not the lock's. */
export function assertRawPinned(manifest: { huashuCommit?: string }, lock: HuashuLock | null): void {
  if (!lock || manifest.huashuCommit === lock.commit) return
  throw new Error(
    `data/raw/huashu is at ${manifest.huashuCommit ?? '(unknown)'}, but ${LOCK_PATH} pins ${lock.commit} (a huashu sync moved it). ` +
    'Move data/raw to the pinned commit first: npx tsx scripts/build-data/fetch-sources.ts --huashu-only',
  )
}

/** Throws when `source` is not the blob the published sticker for `code` was built from (lock.shipped). */
export function assertShippedSource(code: string, source: Buffer, lock: HuashuLock | null): void {
  if (!lock) return
  const want = lock.shipped[code], got = gitBlobSha(source)
  if (want !== got) {
    throw new Error(`${code}: data/raw/huashu has blob ${got.slice(0, 10)} but the published sticker was built from ${want ? want.slice(0, 10) : 'nothing (not shipped yet)'}; ` +
      'rebuilding would publish a drawing the lock does not record. Let the huashu sync ship it (scripts/sync/huashu-sync.ts).')
  }
}
