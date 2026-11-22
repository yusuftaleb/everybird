# everybird-stats

The anonymous usage Worker for Everybird (`stats.yusuftaleb.com`).

- `POST /e` receives the app's beacons and stores them in D1 (`everybird-events`, table `events`). Unchanged.
- `GET /dashboard` and `GET /dashboard/data` are a private dashboard for Yusuf, locked behind Cloudflare Access.

## The dashboard

**Live 2026-11-16 at 21:41 Pacific:** dashboard rebuild and receipt timestamps deployed from merged main `b1489e0` ([PR #3](https://github.com/yusuftaleb/everybird/pull/3)), Worker version `3c9af67f-5691-4bb3-b8a2-61c3b2a678c1`. The nullable timestamp column was applied and verified before deploying. Natural traffic now carries receipt times; older rows remain untimed. Design brief: `docs/superpowers/specs/2026-11-16-private-dashboard-brief.md`.

One self-contained page (design: `docs/superpowers/specs/2026-11-17-stats-dashboard-redesign.md`), built from `ui/`: Vite, React 19, TypeScript, Tailwind v4, shadcn/ui (new-york, `radix-ui`), Recharts through shadcn's chart component, Phosphor icons and self-hosted Geist / Geist Mono (Fontsource). `vite-plugin-singlefile` inlines every script, style and font into one HTML file; `ui/scripts/write-page.mjs` checks it loads nothing from another origin and writes it to `src/page.generated.ts` (`export const PAGE`, committed; `src/page.ts` re-exports it). The page fetches only same-origin `/dashboard/data?workspace=1…`. Its CSP is `default-src 'none'` with inline script/style, `connect-src 'self'`, `font-src data:` and `img-src data:`. Light is the default; the theme toggle saves a choice in `everybird:theme` with storage failures handled. Cmd/Ctrl+K (or `/`) opens a command palette for views, ranges, metrics and countries.

- **Build:** `npm --prefix workers/stats/ui ci` once, then `npm --prefix workers/stats/ui run build` (typecheck, `vite build`, write `src/page.generated.ts`). `wrangler.jsonc` runs the same build (`"build"`) before every `wrangler deploy`, so the UI's dependencies must be installed first. `ui/` has its own `package.json`, `tsconfig*.json` and `node_modules` (git-ignored, as is `ui/dist`); its Vite config sets `css.postcss` inline so the repo root's PostCSS config is never read. Nothing in the root `package.json`, root build, ESLint or `tsc` changes (`workers/` stays excluded).
- **Dev:** `npm --prefix workers/stats/ui run dev` serves the console on `127.0.0.1:5180` with `ui/dev/mock.ts` answering `/dashboard/data`: a seeded synthetic events table (no real data) in in-memory `node:sqlite` on `schema.sql`, queried with the Worker's own `parseWorkspace`, `workspaceStatements` and `shapeWorkspace`. `MOCK_STATE=error|expired|empty|slow` previews the other states.
- **Layout:** `ui/src/app/` (the store: hash state, request tickets, fetch), `ui/src/views/` (Overview, Explore, Definitions), `ui/src/components/` (shell, filter bar, charts, states; `components/ui/` is shadcn's), `ui/src/lib/` (pure TypeScript, no DOM or React, imported by the unit tests).

- **Overview:** a metric strip (active visitor-days as a daily average, personal-list collages, downloads, share actions, recorded visits, posters made; change badges when comparison is available) driving one daily chart with the previous period dashed; coverage notes under it; countries and device classes as top-N rows that apply that filter; hourly recorded visits; independent event counts and action reach; explicitly unfiltered since-launch totals. Demo and restored collages are separate from personal-list collages. Countries are request locations, not referrals.
- **Explore:** choose a measure and compatible breakdown, display a line/bar chart or sortable table, narrow categories with explicit filter actions, export the complete aggregate to CSV, and save up to 20 named views in this browser (`everybird:analytics-views`). All query state is encoded in the URL; old range/country/metric links still open. A measure change clears Explore-specific filters.
- **Definitions:** units, deduplication, privacy, coverage and comparison rules, available without a successful data request.

Date, country and device filters apply to every ordinary Overview result and Explore. Country picker options are independent of the selected country/device; they are not metric results. Explore drill-downs are separate removable chips and affect only Explore. Since-launch totals explicitly ignore all filters. Presets are 7/14/30 completed days (default 14), Today, All and custom dates. All is bounded to the latest 3,660 days. Future dates and excessive ranges are rejected.

Daily active visitors count distinct anonymous daily ids with any recorded event. Multi-day totals are **active visitor-days**, not unique people; their average divides by all selected calendar days after excluding dates before collection began. The first collection day is marked as potentially partial; wholly uncollected ranges have an unavailable state instead of zero-activity charts. Blank ids are excluded from both action-reach numerators and their active-visitor-day denominator. Event counts retain those events. Country/device categories can overlap within a visitor-day: their sum is not a distinct total. Top-10 Explore charts include Other; for active visitor-days the server counts distinct reach in the complement, rather than adding category counts. Tables/CSV retain every category, including unknown values. Long daily ranges use a line instead of crowded bars; tables paginate 50 aggregate rows at a time.

Capabilities are defined once in `src/workspace.ts` and bundled into the page. Common breakdowns are day, country and device. Event measures also support receipt hour. Browser language and page apply only to visits; import source only to personal-list collages; image formats, poster sizes/file types, share/link/search/filter types and UI-language switches apply to their matching events. There is no arbitrary SQL, raw-event export, cross-day identity, ordered funnel or referral tracking.

The Overview comparison uses the equal-length immediately preceding period; Explore reports the selected aggregate without a comparison control. It is unavailable for Today, All, any range including the current day, a baseline beginning on/before the first collection day, or a comparison spanning the 31-hour cutover. A zero baseline is described without an infinite percentage. Observations are descriptive totals with exact ranges and values, not causal claims. Coverage warnings appear beside the results. Unknown historical times are kept separate; a wholly untimed selection has no hourly distribution chart.

Refresh bypasses the browser data cache. Background refresh runs every 60 seconds while visible and outside Definitions, and waits while focus is inside the result area. Requests time out after 20 seconds. A navigation ticket invalidates older responses even when returning to cached results; superseded requests are aborted. Failed refreshes retain the last successful matching result, its timestamp and a stale-data notice. Failed queries for a new selection show an error instead of mismatched old totals. Access expiry offers a reload/sign-in explanation. Local storage is optional.

### Aggregate API

`GET /dashboard/data?workspace=1&from=YYYY-MM-DD&to=YYYY-MM-DD&country=MX&device=iphone&measure=collages&dimension=source` returns `range`, `coverage`, `summary`, `daily`, `previous`, `countries`, `devices`, `hourly`, `explore`, `lifetime`, `countryOptions` and `warnings`. Optional `all=1` uses the bounded full history. Additional filters use `f_<dimension>=<value>`, validated against the measure's capability list and fixed value vocabularies. Empty `f_hour` / `f_language` selects missing timestamps / browser languages. Every SQL value is bound; SQL expressions and predicates come only from server constants. Nine statements run in one D1 batch, or ten when an exact Other reach query is needed. Only aggregates leave D1. Database failures return a recoverable 503 without internal details. Cache policy remains `private, max-age=60`.

The legacy `/dashboard/data?from=...&to=...&country=...` response remains compatible, using `src/dashboard.ts`; the rebuilt page uses the workspace API exclusively. Its older collage counts still include demo/restore events and should not be substituted for the new personal-list measure.

Pure state, query, request-ticket, sorting, top-N and CSV helpers live in `ui/src/lib/workspace.ts` (typed against `shapeWorkspace`'s return type); date, rate and change helpers in `ui/src/lib/pure.ts`. The console and the unit tests import the same modules. CSV includes exact scope, units, Explore filters, coverage warnings, the generation time and full aggregate rows, with spreadsheet-formula escaping.

## Event timestamps

New events carry `received_at`, a UTC ISO 8601 timestamp from the Worker's clock when it receives the beacon, before reading its body or hashing the visitor id. It records server receipt, which can lag the action if the network delays delivery. Client-supplied times are ignored. The stats day and receipt time use the same instant. Existing visit deduplication and the daily cap remain in effect; a duplicate visit neither adds a row nor replaces its first timestamp.

Older events have `received_at = NULL`; no historical times are guessed or backfilled. The hourly query uses Vancouver's year-round UTC-7 rule, effective before timestamp collection begins. There is no timestamp index, so the change adds no index writes. The dashboard exposes only hourly aggregates.

Deployment completed on 2026-11-16. Repeat-deployment procedure (do not reapply the column migration if present):

1. Apply only `migrations/2026-11-17-event-timestamps.sql` with `npx wrangler d1 execute everybird-events --remote --file migrations/2026-11-17-event-timestamps.sql` from this directory. Check `PRAGMA table_info(events)` first; apply once if `received_at` is absent. Do not use `migrations apply`: this database's older migrations were applied individually.
2. Deploy this Worker with `npx wrangler deploy` after the nullable column exists. The old Worker continues working after the schema change.
3. Verify new events have receipt times and the private dashboard includes hourly aggregates. Rollback is the previous Worker deployment; leave the nullable column and collected times in place.

## Day boundary (Pacific; cutover 2026-11-17T00:00Z)

**Completed on 2026-11-16 at 19:14 Pacific.** The Worker was deployed from main `74651e9` as version `5a7dd9c2-5b87-449e-88dd-9edc5946b560`. The one-time relabel moved 3,764 old-Worker events into Pacific 16 Nov. Remote queries then found zero rows still labelled 17 Nov while new events continued arriving on 16 Nov. No migration action remains.

- **Cutover:** `CUTOVER` is `2026-11-17T00:00:00Z` (`src/event.ts`). From that instant a row's `day` is the America/Vancouver date (`statsDay()`), and before it the UTC date. Vancouver is UTC-7 all year from 1 Nov 2026 (tzdata 2026f; `wrangler dev --local` agrees), so the Pacific date is 16 Nov until 07:00Z and 17 Nov from then. The visitor id (`vid`), the visit dedupe and the daily cap all use the same day.
- "Today" and the default ranges on the dashboard are the Pacific date (`pacificDay` in the Worker and in `ui/src/lib/pure.ts`).
- The old Worker wrote UTC dates. Its events from 00:00Z until deployment were labelled `2026-11-17` but belonged to Pacific 16 Nov evening; the completed relabel corrected them.
- **Do not rerun `migrations/2026-11-17-pacific-relabel.sql`.** Its historical deadline was 2026-11-17T07:00Z. After that instant new, legitimate Pacific 17 Nov events use the same day label; the file has no runtime deadline guard and cannot distinguish them from the old events.
- 16 Nov, after the relabel, is **31 hours**: from 15 Nov 17:00 to 16 Nov 24:00 Pacific. The dashboard shows a warning for selections intersecting it.
- Known and accepted: a visitor who visited between 00:00Z and the deploy (their visit keyed on the UTC 17 Nov string) and again on the same Pacific 16 Nov after the deploy is counted twice on 16 Nov. The legacy API's "busiest day" figure can be 16 Nov, a 31-hour day; the rebuilt UI does not present it as an ordinary peak day.

## Environment variables

All three are required; if any is missing, or the Access token does not verify, both dashboard routes answer 404 (fail closed). Set them as secrets (never commit values):

```
cd workers/stats
npx wrangler secret put ACCESS_AUD           # the application's AUD tag
npx wrangler secret put ACCESS_TEAM_DOMAIN   # e.g. yourteam.cloudflareaccess.com
npx wrangler secret put DASHBOARD_EMAILS     # comma-separated, e.g. you@example.com
```

The Worker checks the `Cf-Access-Jwt-Assertion` JWT: RS256 signature against `https://<team domain>/cdn-cgi/access/certs`, `iss` = `https://<ACCESS_TEAM_DOMAIN>`, `aud` contains `ACCESS_AUD`, not expired, and the `email` claim is in `DASHBOARD_EMAILS`.

## Create the Cloudflare Access application (one time)

1. Open https://one.dash.cloudflare.com and pick the account. If asked to set up Zero Trust, choose the Free plan and a team name (this becomes `<team>.cloudflareaccess.com`).
2. Settings, Authentication: under Login methods, make sure **One-time PIN** is listed (add it if not).
3. Access controls, Applications, **Add an application**, then **Self-hosted**.
4. Application name: `Everybird stats`. Session duration: your choice (24 hours is fine).
5. **Add public hostname**: Domain `yusuftaleb.com`, Subdomain `stats`, Path `dashboard*`. (Older dashboards: Application domain `stats.yusuftaleb.com`, path `dashboard*`.) Do not cover `/e`: the app's beacons must stay public.
6. Identity providers: allow only **One-time PIN**; turn off "Accept all available identity providers".
7. Policies, **Create new policy**: name `Yusuf only`, action **Allow**, rule Include, selector **Emails**, value your email address. Save the policy, attach it to the application, and Save.
8. Find the AUD tag: Access controls, Applications, click `Everybird stats`, Edit, **Overview** tab, "Application Audience (AUD) Tag" (copy it). Use it for `ACCESS_AUD`.
9. Find the team domain: Settings, Custom pages (or General), "Team domain": `<team>.cloudflareaccess.com`. Use it for `ACCESS_TEAM_DOMAIN`.
10. Set the three secrets (above), deploy the Worker, then open `https://stats.yusuftaleb.com/dashboard`, enter your email, and type the PIN that arrives.

Access runs in front of the Worker and adds the JWT; the Worker verifies it itself, so the page stays closed even if the Access rule were ever removed.

## Checks

Local validation on 2026-11-16: 81 scoped stats tests and all 2,144 unit tests (149 files) passed; root route type generation, root/Worker typechecks and changed-file lint passed (one inherited Worker export-style warning). Final Worker bundle dry run: 81.64 KiB / gzip 26.04 KiB. No browser or visual checks; Yusuf's UI review remains pending. Release was approved and deployed on 2026-11-16.

```
npx vitest run tests/stats-worker.test.ts tests/stats-dashboard.test.ts tests/stats-workspace.test.ts   # from the repo root
npm --prefix workers/stats/ui run build && npm --prefix workers/stats/ui run typecheck
cd workers/stats && npx wrangler types && npx -p typescript tsc --noEmit
```

### Production verification (2026-11-16 21:41 Pacific)

All ten workspace aggregate queries ran successfully against production D1. Daily active/collage/download totals, hourly known-plus-unknown visit coverage, same-scope Explore totals, distinct Other bounds and reach denominators passed consistency checks. Natural incoming traffic produced timestamped rows and Pacific-hour buckets without a synthetic beacon. Anonymous requests to the private page and both data modes were denied (403); no access policy or secrets were changed. Historical rows stayed NULL. The Vercel preview packaging omission was fixed by excluding `tests/stats-workspace.test.ts` alongside the other Worker tests; the corrected preview and main build compiled successfully. Rollback target for the Worker is `5a7dd9c2-5b87-449e-88dd-9edc5946b560`, leaving the nullable column and collected times intact.
