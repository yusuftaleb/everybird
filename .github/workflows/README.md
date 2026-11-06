# Workflows

## huashu sync (`huashu-sync.yml`)

Every Monday at 14:00 UTC (and on demand: Actions > huashu sync > Run workflow) this compares upstream
[huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker) with what Everybird has published
(`data/huashu.lock.json`). If nothing Everybird uses has changed, it ends there (1-2 minutes). Otherwise it rebuilds
up to 600 changed stickers, uploads them to R2 under new versioned names, and opens a pull request with the
regenerated `public/data` files. It never merges anything. The logic is in `scripts/sync/huashu-sync.ts` (see
AGENTS.md, "huashu sync"); this file is the setup.

Manual run inputs: `dry_run` (compute everything, upload the artifact, change nothing else), `max_rebuild` (default
600), `allow_big_change` (ship a diff the schema-change guard stopped; see "When a run stops").

### Secrets (Settings > Secrets and variables > Actions)

| Secret | What |
|---|---|
| `R2_ACCESS_KEY_ID` | Access Key ID of the R2 API token "everybird-huashu-sync (GitHub Action)" (Object Read & Write, the sticker bucket only) |
| `R2_SECRET_ACCESS_KEY` | that token's Secret Access Key |
| `R2_ACCOUNT_ID` | the Cloudflare account id (the endpoint is `https://<id>.r2.cloudflarestorage.com`); not part of the token |
| `R2_BUCKET` | the sticker bucket's name (served at https://stickers.yusuftaleb.com); not part of the token |
| `STICKERS_REPO_TOKEN` | optional, not set. A fine-grained PAT with Contents read/write on `yusuftaleb/everybird-stickers`. Without it the run skips committing the rebuilt stickers there (GitHub Pages is only the fallback now) and says so in a notice. |

If huashu changed and any R2 secret is missing, the run fails with a message saying which, before any PR.

### The R2 token expires on 2027-11-06

Rotate it before then. Only the two token secrets change:

1. In Cloudflare, R2 > Manage API tokens: create a token with Object Read & Write on the sticker bucket only.
2. Put its Access Key ID in `R2_ACCESS_KEY_ID` and its Secret Access Key in `R2_SECRET_ACCESS_KEY`.
   `R2_ACCOUNT_ID` and `R2_BUCKET` stay as they are (unless the bucket itself moves).
3. Set `R2_TOKEN_EXPIRES` in `huashu-sync.yml` (and the date here and in AGENTS.md) to the new token's expiry.
4. Delete the old token.

From 30 days before the date in `R2_TOKEN_EXPIRES`, every run prints a warning and opens an issue "Rotate the huashu
sync R2 token" (once).

### Repository settings

- Settings > Actions > General > Workflow permissions: tick **"Allow GitHub Actions to create and approve pull
  requests"**. Without it `gh pr create` fails with the `GITHUB_TOKEN`. The job asks for `contents`, `pull-requests`
  and `issues: write` itself; the checkout keeps no credentials, and only the push and `gh` steps get the token.
- Vercel's git integration builds a preview for the PR's branch on its own.
- A PR opened with `GITHUB_TOKEN` does not start other workflows (GitHub's rule). There are none today; if CI
  workflows are added later and should run on sync PRs, open the PR with a PAT or a GitHub App token instead.

### The per-run cap, and a big backlog

Rebuilding is about 2 s per sticker on the private-repo runner (2 vCPU). Nearly all of it is sharp's WebP encoder at
`effort: 6` (`scripts/build-data/build-stickers.ts`); `effort: 4` is about 100 times faster for slightly larger files,
but changing it is a product call and would make new stickers differ in encoding from the existing ones. So each run
rebuilds at most `max_rebuild` (600: about 20 minutes, timeout 60) stickers, the website's species first, then by
code, and ships removals and data changes in full. The lock records only what shipped (`shipped`), the PR says how
many are left, and once it is merged the next run continues. An unmerged PR is replaced by the next week's run with
the same batch plus anything new.

A large backlog (upstream redrew 5,883 stickers on 2026-11-06) can instead be done in one go from a laptop, with the
same script and the same PR content:

```sh
git switch main && git pull && git switch -c "huashu-sync/$(date -u +%F)"
npx tsx scripts/sync/huashu-sync.ts --max-rebuild 0 --out /tmp/huashu-sync   # clones upstream, rebuilds every change, writes in place
STICKERS_DIR=/tmp/huashu-sync/stickers R2_BUCKET=… R2_ACCESS_KEY_ID=… R2_SECRET_ACCESS_KEY=… R2_ACCOUNT_ID=… \
  npx tsx scripts/deploy/upload-stickers-r2.ts                               # only new keys; never overwrites one
xargs git add -- < /tmp/huashu-sync/changed-files.txt
git commit -m "data(stickers): sync huashu-bird-sticker to $(git -C /tmp/huashu-sync/huashu rev-parse --short HEAD)"
git push -u origin HEAD
sed 's|@@ARTIFACT_URL@@|(sheets attached below)|' /tmp/huashu-sync/pr-body.md > /tmp/huashu-sync/pr-body.final.md
gh pr create --base main --title "Sync huashu-bird-sticker stickers ($(date -u +%F))" --body-file /tmp/huashu-sync/pr-body.final.md
```

The before/after sheets are in `/tmp/huashu-sync/artifact/sheets/` (drag a few into the PR). On a 10-core laptop the
5,883-sticker backlog takes roughly an hour. Then `npx tsx scripts/dev/pull-versioned-stickers.ts` copies the new
files into `../everybird-stickers` for the dev sticker server.

### When a run stops

The run fails, uploads nothing, opens no PR and leaves an open sync PR alone, and opens (or updates) one issue "huashu
sync is blocked upstream", when:

- upstream is inconsistent in a way that repeats every week: an override in `data/overrides.json` names a huashu
  record that no longer exists, or `species.json` names a sticker file that isn't in the tree;
- the diff looks like an upstream schema change: more than 5% of the published stickers removed, more than 20% of the
  species' masses changed, more than 20% of the `species.json` records gone, or most records missing the fields the
  build reads.

Fix the override, wait for upstream, or (if the change is real) run the workflow by hand with `allow_big_change`.

### What a run with changes leaves

- A PR from `huashu-sync/<YYYY-MM-DD>` against the default branch (an older sync PR still open is closed as
  superseded; a run dispatched from another branch gets `huashu-sync/<date>-from-<branch>` and supersedes nothing).
  Its body has the upstream compare link and a species, code and change table (cut short to stay under GitHub's
  limit; `summary.json` has every entry).
- An artifact `huashu-sync-<commit>` (linked from the PR body, kept 30 days): `summary.json` and
  `sheets/sheet-NNN.png`, the old and new 128 px sticker side by side, 60 rows a page, website species first.
- The rebuilt stickers in R2 as `v1/{128,384}/<code>.<sv>.webp`: new keys, so nothing live changes before merging. The
  upload never overwrites a versioned key and skips what a failed earlier run already sent.
- When a species on yusuftaleb.com/lifelist (`data/website-lifelist-codes.json`) changed: one open issue "Website
  /lifelist stickers changed upstream". While the same change is unmerged its body (or its last comment) is rewritten;
  a new change is added as a comment.
