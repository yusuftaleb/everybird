# Workflows

## huashu sync (`huashu-sync.yml`)

Every Monday at 14:00 UTC (and on demand: Actions > huashu sync > Run workflow, with a `dry_run` box) this checks
upstream [huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker) against the pinned state in
`data/huashu.lock.json`. If nothing Everybird uses has changed, it ends there (about a minute). Otherwise it rebuilds
only the changed stickers, uploads them to R2 under new versioned names, and opens a pull request with the
regenerated `public/data` files. It never merges anything. The logic is in `scripts/sync/huashu-sync.ts` (see
AGENTS.md, "huashu sync"). This file is the setup.

### Secrets (Settings > Secrets and variables > Actions)

| Secret | What |
|---|---|
| `R2_ACCESS_KEY_ID` | R2 API token "everybird-huashu-sync (GitHub Action)", bucket-scoped object read/write |
| `R2_SECRET_ACCESS_KEY` | its secret |
| `R2_ACCOUNT_ID` | the Cloudflare account id (the endpoint is `https://<id>.r2.cloudflarestorage.com`) |
| `R2_BUCKET` | the sticker bucket (served at https://stickers.yusuftaleb.com) |
| `STICKERS_REPO_TOKEN` | optional, not set. A fine-grained PAT with Contents read/write on `yusuftaleb/everybird-stickers`. Without it the run skips committing the rebuilt stickers there (GitHub Pages is only the fallback now) and says so in a notice. |

If huashu changed and any R2 secret is missing, the run fails with a message saying which, before any PR.

### The R2 token expires on 2027-11-06

Rotate it before then:

1. In Cloudflare, R2 > Manage API tokens: create a new token with Object Read & Write on the sticker bucket only.
2. Update the repo secrets `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` (and `R2_ACCOUNT_ID` / `R2_BUCKET` if they
   change).
3. Set `R2_TOKEN_EXPIRES` in `huashu-sync.yml` (and the date here and in AGENTS.md) to the new token's expiry.
4. Delete the old token.

From 30 days before the date in `R2_TOKEN_EXPIRES`, every run prints a warning and opens an issue "Rotate the huashu
sync R2 token" (once).

### Repository settings

- Settings > Actions > General > Workflow permissions: allow "Read and write permissions" or keep read-only (the
  workflow asks for `contents`, `pull-requests` and `issues: write` itself), and tick **"Allow GitHub Actions to
  create and approve pull requests"**. Without that box `gh pr create` fails with the `GITHUB_TOKEN`.
- Vercel's git integration builds a preview for the PR's branch on its own; nothing to set up.
- A PR opened with `GITHUB_TOKEN` does not start other workflows (GitHub's rule). There are none today; if CI
  workflows are added later and should run on sync PRs, open the PR with a PAT or a GitHub App token instead.

### What a run with changes leaves

- A PR from `huashu-sync/<YYYY-MM-DD>` (an older sync PR still open is closed as superseded: the new one carries
  every change since the lock on main). Its body has the upstream compare link and a table of species, code and change.
- An artifact `huashu-sync-sheet-<commit>` (linked from the PR body, kept 30 days): a PNG with the old and new 128 px
  sticker side by side, up to 60 rows, website species first.
- The rebuilt stickers in R2 as `v1/{128,384}/<code>.<sv>.webp` (new keys, so nothing live changes before merging).
- When a species on yusuftaleb.com/lifelist (`data/website-lifelist-codes.json`) changed: one open issue "Website
  /lifelist stickers changed upstream", created or commented on, listing them for Framer.
