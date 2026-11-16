# Build assets on R2

Prepared 2026-11-15. Implementation is local on `feat/assets-on-r2`; nothing has been uploaded or deployed.

`NEXT_PUBLIC_ASSET_BASE=https://stickers.yusuftaleb.com` enables Next's `assetPrefix` and anonymous cross-origin
scripts/styles. `vercel.json` selects `npm run build`: `next build` must succeed, then
`scripts/deploy/upload-next-assets-r2.ts` must succeed before Vercel can publish the release. The uploader sends
**only** `.next/static/**` to `_next/static/**`, using the existing SigV4 implementation, MIME types for JS/CSS/fonts
and images, and `Cache-Control: public, max-age=31536000, immutable`. It also respects `NEXT_DIST_DIR`.
Export `NEXT_DIST_DIR` in the shell/Vercel environment if overriding it; do not set it only in a dotenv file, since
the uploader process needs the same directory as Next. Run build/upload commands from the repository root.
Never upload the rest of `.next` (server code, configuration, cache and manifests).
After upload, public HEAD checks of a JS, CSS and font file (requesting identity encoding) must pass for MIME, size, immutable caching and wildcard
CORS. Redirects fail. A wrong bucket/custom-domain mapping or missing public headers therefore blocks release too.

Existing keys are skipped, including when `--force` is used in the shared uploader. A different size at an existing
static key fails the release. New versioned writes sign `If-None-Match: *`, so two builds cannot overwrite each other.
A race returns 412: a signed HEAD must show the same single-part MD5 ETag as the local file, or the build fails.
Identical concurrent writes succeed without replacing the object. Network errors, 5xx and 429 get bounded retries.
This also makes the shared sticker/data uploader's versioned writes safe after a lost success response.
An authenticated read-only HEAD of an existing hashed data object on 2026-11-15 confirmed its ETag matches the
local file's MD5; no keys or credential values were printed or saved.
Partial uploads are safe and resumable. No old assets are deleted: old tabs and rollback deployments still need them. Paths are content-hashed
or build-scoped; never reuse a build ID for different content. The asset base must be a root HTTPS origin, without
`/data`, `/_next`, a query, credentials or a fragment.

With the variable unset the config omits `assetPrefix`, `crossOrigin` and the worker override. The upload step checks
`required-server-files.json` first, then returns without loading assets, credentials or networking for a plain build.
A prefix read by Next from `.env.local` cannot silently bypass the gate: if the built prefix and the exported variable
differ, the script fails and asks for an export/rebuild. Local dev and ordinary tests need no R2 credentials. A prefixed build
without credentials fails closed. There is deliberately no upload-bypass flag in the release command.

## What moves, what stays

| Resource | Host after enabling the prefix |
| --- | --- |
| Page JS, lazy chunks, CSS | R2 `/_next/static/chunks/**` |
| Geist Mono (`next/font/google`) | R2 `/_next/static/media/**`; font preloads use the prefix and CSS relative URLs resolve on R2 |
| Imported flag SVGs and other emitted build media | R2 `/_next/static/media/**` (unless routed through image optimization) |
| Layout/import/share worker bootstrap **and its imported chunks** | **Vercel**, using the Next 16.4.5 exception below |
| Satoshi/Cabinet Grotesk CSS and fonts | Fontshare, as today; these are never copied or committed |
| Stickers, hashed data | Existing R2 URLs, unchanged; failed data fetches still fall back to Vercel `/data/...` |
| HTML, navigation RSC and intent prefetch | Vercel; `IntentLink` still prefetches only on hover/focus/touch |
| `/icons/*`, `/favicon.ico` | Vercel `public/` files; existing week-long icon cache headers remain |
| `/manifest.webmanifest`, robots, sitemap | Vercel metadata routes, unaffected by `assetPrefix` |
| `/s/[token]/opengraph-image`, `twitter-image` | Vercel dynamic image routes, normally requested by link crawlers rather than each visitor |
| API routes and `/_next/image` if used | Vercel; the current build has no general API route |
| Visit/event analytics | Existing Cloudflare beacon/stats Worker, unchanged |

**Worker limitation:** in this installed Next 16.4.5, Turbopack constructs `new Worker` at the prefixed URL. Browsers
require that entry URL to be same-origin. Its generated `turbopack-worker-*.js` also rejects foreign-origin chunks
explicitly, so CORS or a blob wrapper alone cannot fix it. The documented
`experimental.turbopackWorkerAssetPrefix: ''` keeps the entrypoint and its imports at same-origin `/_next/`.
All files are uploaded, but these worker requests still use Vercel. This does **not** achieve the stronger
"Vercel serves only routes" target. Moving these too would require a separate worker bundling/bootstrap change;
the release must retain the override until that is implemented. No browser or UI checks were run.

Public icons could be given explicit content-hashed R2 URLs in `SITE_ICONS` and the manifest, with a separate upload
step. That might save one or two first-visit requests, but their existing browser cache already helps repeat visits.
Keep the root favicon fallback and manifest same-origin. This change leaves those URLs alone.

**Request estimate, not a measurement:** budget roughly **7–9 Vercel requests for a cold landing/collage visit**:
one document, about four worker requests (bootstrap plus three imports), and roughly two to four icon/manifest
requests depending on the browser. About does not start the layout worker by default. Warm visits can be lower;
navigation, imports, sharing, bots, prefetch and data fallback add requests. The supplied average of ~11 per visitor
is traffic-weighted and cannot be directly compared to this cold-page budget. The emitted landing HTML in the local
build had 20 distinct static asset URLs (13 JS, six CSS, one font preload) moved to R2; this is an artifact inventory,
not a network count. Actual traffic-weighted savings and a new pause date remain unverified.

## CORS and Cloudflare settings (Yusuf)

Live HEAD checks on 2026-11-15 returned 200 and `Access-Control-Allow-Origin: *` for an existing sticker with both
`Origin: https://everybird.yusuftaleb.com` and a preview origin. An authenticated, read-only Wrangler query also
confirmed origins `*`, methods GET/HEAD, headers `*`, max age 86400 and no exposed headers. No bucket CORS policy
change is needed; the response-header rule below is a separate step for cached assets.
Keep GET/HEAD allowed from `*`; anonymous scripts and fonts need no cookies. Next emits
`crossorigin=""` (anonymous). Do not use `use-credentials`. The wildcard also covers Vercel previews.

Check the bucket policy, using the logged-in Wrangler context in `workers/stats`:

```sh
npx wrangler r2 bucket cors list everybird-stickers
```

If adjustment is needed, the dashboard's R2 → everybird-stickers → Settings → CORS Policy JSON is:

```json
[{ "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"] }]
```

Preserve any other needed rules. **Before a prefixed release**, add a Cloudflare response-header Transform Rule:
expression `(http.host eq "stickers.yusuftaleb.com" and starts_with(http.request.uri.path, "/_next/static/"))`,
set static response header `Access-Control-Allow-Origin` to `*`. This ensures anonymous loads work even if a request
without `Origin` populated the edge cache. Verify that cache case after first upload as described below; it is not
verified yet and remains a release blocker. Custom-domain cached responses may need purging **if CORS changes**. Ensure the
custom domain maps directly to this bucket and that `/_next/static/*` gets no challenge, authentication, HTML
rewrite or redirect. A Cache Rule for that path should make it cache-eligible and respect origin cache headers;
the sampled sticker HEAD responses were `CF-Cache-Status: DYNAMIC`, so edge caching was not proven. Browser
immutable caching still applies. See [Cloudflare CORS](https://developers.cloudflare.com/r2/buckets/cors/).

## Costs

From the supplied 47,000 requests/day at ~11 requests/visitor: ~4,273 visits/day, ~128,182 visits/30 days.
Moving six to eight requests per visit adds ~0.77–1.03 million R2 reads/30 days if **every** request reaches R2;
even treating all existing 47,000/day as moved gives 1.41 million. The artifact inventory's 20 URLs per cold visit
would be ~2.56 million reads/30 days. These scenarios are below R2 Standard's **10 million Class B reads/month**
free allowance, before counting the existing stickers/data and other account usage. Existing R2 usage was not
queried, so total account cost is unverified. Browser/edge hits reduce origin reads. Beyond the shared allowance,
Class B costs $0.36/million (billing rounds up). Standard also includes 10 GB-month storage and one million Class A
operations/month; this local build's assets were about 3.3 MB and 311 objects. Lists and uploads consume Class A;
R2 egress is free. These allowances do not cover Infrequent Access.
[Pricing verified 2026-11-15](https://developers.cloudflare.com/r2/pricing/).

## Release steps, in order (Yusuf only)

**Opus 5.5 high review must pass before shipping.** No push is made during this task because new Vercel variables
are required. Commands below are instructions, not actions performed by the agent. Use the linked Everybird
Vercel project (`vercel link` interactively if this worktree is not linked). Older commits ignore the new variable and
remain unprefixed; this feature commit and later use the gate.

1. Set Vercel build variables. Production and **this feature branch's preview** need:
   `NEXT_PUBLIC_ASSET_BASE=https://stickers.yusuftaleb.com`, `R2_BUCKET=everybird-stickers`, `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Use the existing bucket-scoped Object Read & Write token or a new
   bucket-scoped token (a dedicated Vercel token is preferable); enter credentials privately at the CLI prompts,
   never in chat or tracked files. If reusing the huashu token, its expiry is **2027-11-06**: rotate the two Vercel
   credentials as well as GitHub's when following `.github/workflows/README.md`. GitHub Action
   secrets are not automatically available to Vercel. `R2_ENDPOINT` can replace `R2_ACCOUNT_ID`. Keep the existing
   `NEXT_PUBLIC_DATA_BASE=https://stickers.yusuftaleb.com/data` and sticker-base values. No Development scope is needed.

   ```sh
   for name in NEXT_PUBLIC_ASSET_BASE R2_BUCKET R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
     vercel env add "$name" --environment production
     vercel env add "$name" --environment preview --git-branch feat/assets-on-r2
   done
   ```

   After merge, enable the same Preview values without the branch restriction if all future previews should use R2.
   R2 secrets stay server-only (never `NEXT_PUBLIC_`). `vercel.json` pins `npm run build`, even if the dashboard had an
   older build-command override. Keep build dependencies installed (`tsx` is required).

2. Check/adjust R2 CORS and cache settings above **before the first upload**. The current wildcard GET/HEAD bucket
   policy already matches; add the static-assets response-header Transform Rule, then verify the warm-cache case.

3. First upload: from this branch, privately load the R2 variables from the file Yusuf confirmed on 2026-11-15
   at 17:20 America/Vancouver, then run (do not enable shell tracing or print the environment):

   ```sh
   set -a
   . ~/.config/everybird/r2.env
   set +a
   NEXT_PUBLIC_ASSET_BASE=https://stickers.yusuftaleb.com npm run build
   ```

   This builds locally and uploads before any release exists. This manual first upload is optional; Vercel's own
   build will upload too, but do not route production to a prefixed deployment until the public cache checks below
   pass (use preview first if skipping the local upload). For inspection without uploading or R2 access:

   ```sh
   NEXT_PUBLIC_ASSET_BASE=https://stickers.yusuftaleb.com npx next build
   NEXT_PUBLIC_ASSET_BASE=https://stickers.yusuftaleb.com npx tsx scripts/deploy/upload-next-assets-r2.ts --dry-run
   ```

   Check one emitted JS, CSS and font URL from `.next/server/app/index.html`/`.next/static/chunks/*.css` with
   `curl -sSI -H 'Origin: https://everybird.yusuftaleb.com' '<EXACT_ASSET_URL>'`: 200, correct MIME,
   immutable cache header and `Access-Control-Allow-Origin: *`. These checks require that upload to have happened.
   For each of those three exact URLs, warm the edge cache **without Origin** (try up to three times for HIT),
   then check CORS with Origin. If it stays DYNAMIC, record "not edge-cached; cache case not applicable yet", confirm
   ACAO with Origin, and repeat the check whenever edge caching is enabled. If caching is enabled, resolve any
   failure to get HIT and confirm that cached response before shipping. Never ship with missing ACAO:

   ```sh
   curl -sS -D - -o /dev/null '<EXACT_ASSET_URL>'
   curl -sS -D - -o /dev/null '<EXACT_ASSET_URL>'
   curl -sSI -H 'Origin: https://everybird.yusuftaleb.com' '<EXACT_ASSET_URL>'
   ```

   Do not check nonexistent paths before upload (avoid caching a 404). Keep old keys; do not add a cleanup lifecycle.

4. After review and setup, push for preview, then merge through a PR:

   ```sh
   git push -u origin feat/assets-on-r2
   gh pr create --base main --head feat/assets-on-r2 --title 'Serve build assets from R2' --body 'Add an upload gate before Vercel release; keep Turbopack workers same-origin. Setup and validation: docs/assets-on-r2.md.'
   # After the preview build and your own checks pass:
   gh pr merge <PR_NUMBER> --merge
   ```

   Each Vercel build uploads **its own** static output before release; a local upload alone cannot cover a different
   build's hashes. A failed upload leaves the currently live deployment intact; fix settings/credentials and rebuild.
   Existing rolling-window requests do not disappear immediately, so this cannot guarantee avoiding a pause.

## Rollback (Yusuf only)

Remove `NEXT_PUBLIC_ASSET_BASE` from Production and this branch's Preview, then rebuild the **same feature commit**
on Vercel (dashboard → deployment → Redeploy, with current environment settings). Do not merely promote the old
prefixed build: the prefix is compiled into its HTML/JS. All assets still exist on Vercel as the regular Next output.

```sh
vercel env rm NEXT_PUBLIC_ASSET_BASE --environment production
vercel env rm NEXT_PUBLIC_ASSET_BASE --environment preview --git-branch feat/assets-on-r2
```

Alternatively, use the Vercel dashboard's instant rollback to the previous deployment built **without** the prefix.
Leave R2 keys in place for cached HTML and old tabs. Credentials and CORS can remain; without the public variable the
upload step does no work. Disable the Preview-wide variable too if that was subsequently configured.

## Code checks

Final scoped ESLint, TypeScript and 22 upload/config tests passed after the review fixes. The initial full Vitest run
(`--maxWorkers=1`) passed 832/833
tests: the unchanged 5,000-bird narrow packing timing bound failed at 12.79 s (limit 12 s); an isolated 81-test pack
rerun passed 80 and reproduced that failure at 13.40 s. Neither the packer nor its tests differ from the starting
commit. The failure is left visible; no threshold was changed or skipped. The prefixed production build passed.

Only lint, typecheck, Vitest, a local production build and filesystem inspection of emitted output were used.
No e2e, browser, screenshot or design checks. Build inspection resolves relative CSS font URLs against the prefixed
stylesheet URL and checks the target files exist; it also checks the generated worker factory uses `/_next/`.
Final results and reviewer outcome are recorded in the Orca worktree comment.

Two Claude Opus 5.5 reviews were launched with `--effort high`. The first requested the built-prefix check and safe
412 handling; the follow-up approved those fixes and recommended identity encoding for public size verification.
That recommendation was applied and the 22 scoped tests, lint and typecheck rerun. The warm-cache/Transform Rule
checks remain Yusuf's release gate; they were not performed by the agent. Local reports are retained in the ignored
`.inbox/assets-r2-review.md` and `.inbox/assets-r2-review-followup.md`.

Next sources read: installed `node_modules/next/dist/docs/.../assetPrefix.md`, `crossOrigin.md`, `08-turbopack.md`,
and the installed `config-shared.d.ts` worker-prefix documentation; the emitted worker bootstrap was inspected.
[assetPrefix](https://nextjs.org/docs/app/api-reference/config/next-config-js/assetPrefix),
[crossOrigin](https://nextjs.org/docs/app/api-reference/config/next-config-js/crossOrigin).
