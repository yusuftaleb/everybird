# Stats dashboard redesign: Cloudflare-style console (React + shadcn)

Status: direction chosen by Yusuf on 2026-11-17 ("React + shadcn bundled", "Cloudflare dashboard look"). Supersedes the visual and build sections of `2026-11-16-private-dashboard-brief.md`; that brief's counting rules, units, scopes and Explore contract still hold word for word. No deploy, push or merge without Yusuf's yes.

## Design read

A private Operate-mode analytics console for one reader (Yusuf), checked a few times a day on a laptop and sometimes a phone. Language: the Cloudflare dashboard's Analytics pages. Neutral, dense but calm, one blue interaction accent, numbers first. It does not need to match Everybird's Paper/Ink site.

Reference lock (from dash.cloudflare.com Analytics, Web Analytics and Workers metrics pages):

- **Preserve:** white/near-white surfaces on a faint grey page; 1px neutral borders, small radius (6px), almost no shadow; a left sidebar with icon + label rows and a tinted active row; a page title row with a short scope line under it; one filter bar (time range dropdown first, "Add filter" chips after); the **metric strip**, a row of clickable metric tabs (label, big number, change badge) where the selected tab drives one large time chart below it; "Top N" cards whose rows carry a proportional bar behind the label and the value right-aligned.
- **Borrow only:** a command palette (Cmd/Ctrl+K) for jumping to views, metrics, ranges and countries (Linear/Vercel habit); crosshair hover tooltips on charts.
- **Role rules:** blue is for interaction and the selected series only (active nav row, focused/selected states, primary button, the current-period series). Previous period is a dashed neutral line, never a second accent. Amber only for coverage warnings, red only for errors and negative change; green only for positive change badges.
- **Reject:** hero-metric template with decorative sparklines, gradient fills louder than 12% opacity, glass, eyebrows over headings, cards inside cards, Everybird's cream paper, purple, emoji, em dashes in any UI copy.

## Tokens

Light (default when nothing is stored, else the stored `everybird:theme`; a toggle in the sidebar footer saves it):

| Role | Light | Dark |
|---|---|---|
| page | `#f7f7f8` | `#111214` |
| surface (cards, sidebar) | `#ffffff` | `#18191b` |
| surface-muted (table head, hover) | `#f2f3f5` | `#202124` |
| border | `#e3e4e8` | `#2c2d31` |
| text | `#1d1f23` | `#ececee` |
| text-muted | `#5d6169` | `#a0a3ab` |
| accent (CF blue) | `#0051c3` | `#5b9dff` |
| accent-soft (active row, bar fills) | `#e8f0fc` | `#1b2a44` |
| positive | `#16794c` | `#4cc38a` |
| negative | `#c4320a` | `#ff7a59` |
| warning bg / text | `#fff7e6` / `#8a5a00` | `#2b2210` / `#f2c063` |

Map these onto shadcn's CSS variables (`--background`, `--card`, `--muted`, `--border`, `--primary`, `--ring`, `--chart-1` = accent, `--chart-2` = text-muted for the previous period). Radius 6px everywhere (inputs, buttons, cards, popovers); pills (badges, chips) full radius. Shadow only on popovers/dialogs: `0 8px 24px -8px rgb(16 24 40 / .18)`.

Type: Geist Sans (variable) for UI, Geist Mono for dates, ISO codes and CSV-ish values; self-hosted from `@fontsource-variable/geist` and `@fontsource-variable/geist-mono`, inlined into the HTML (no remote fonts). Scale: page title 20/28 semibold, card title 14/20 semibold, body 14/20, small 12/16, metric value 24/32 semibold `tabular-nums`, sidebar 14/20 medium. Numbers are always `tabular-nums`.

Icons: Phosphor (`@phosphor-icons/react`), regular weight, 16px (20px in the sidebar). One family only.

Browser surfaces: themed `::selection` (accent-soft), `accent-color`, focus ring 2px accent with 2px offset, thin themed scrollbars, `caret-color` accent.

## Layout

Shell: sidebar 232px (collapses to a top bar with a Sheet menu under 900px) + main column, max content width 1440px, page padding 24px (16px on phones).

Sidebar, top to bottom: wordmark "Everybird" + muted "stats"; nav rows Overview (ChartLine), Explore (MagnifyingGlass or Compass), Definitions (BookOpen); spacer; a "Search" row showing the ⌘K shortcut; footer with last-updated time, auto-refresh state, theme toggle.

### Overview

1. **Title row:** "Overview", scope line under it, e.g. "3–16 Nov 2026 · 14 completed days · Pacific time · All countries · All devices". Right: Refresh button (ArrowClockwise; spins while loading) and "Updated 12 s ago".
2. **Filter bar** (shared with Explore; sticky under the top of the main column): time range dropdown (Popover: Today, Previous 7 / 14 / 30 days, All time, Custom with two date inputs and Apply; the trigger shows the label, e.g. "Previous 14 days"); "Country" combobox (Command with search; options from `countryOptions`, names from `Intl.DisplayNames`, code in mono); "Device" select (the 11 device classes, human labels); "Compare to previous period" Switch (disabled with a tooltip giving the reason when `range.compareAvailable` is false). Active country/device show as removable chips; "Reset" clears all.
3. **Notices:** `warnings[]` as one compact amber Alert with a list; collapsible when there are more than two ("3 notices about this range").
4. **Metric strip:** six tabs, one row on desktop, horizontally scrollable with snap on phones: Active visitor-days (value: average per day, sub-line "N visitor-days total"), Personal collages, Downloads, Share actions, Recorded visits, Posters made. Each shows the period total (except active: average), and when comparison is available a change badge (ArrowUp/ArrowDown + percent, green/red; "New" when the previous period was 0; nothing when not comparable). The selected tab has a 2px accent top border and surface background; the others are muted. Keyboard: a `tablist`, arrow keys move. The selection is `trend` in the URL.
5. **Main chart card:** area chart of the selected metric per day (accent stroke 2px, fill accent at 10%), previous period as a dashed muted line aligned day-for-day, crosshair + tooltip ("Mon 10 Nov: 42 · previous 35 (Mon 27 Oct)"). Mark the first collection day and the 31-hour 16 Nov with a small labelled reference line. Today, when included, is drawn dashed as incomplete. Click a day: offers "Show only 10 Nov" (sets a custom one-day range). Header right: Line/Bar toggle and "Explore this" (opens Explore with measure = the metric, dimension = day).
6. **Breakdown row (2 columns, 1 on phones):** "Countries" and "Devices" Top-N cards: rows with proportional accent-soft bar behind the name, exact value right, share muted. Top 8 + "Show all" (expands in place). Clicking a row applies that country/device filter (chip appears). Footnote: categories can overlap within a visitor-day, so they don't add up to the total.
7. **Second row:** "Visits by hour (Pacific)" 24-bar chart with the untimed count stated under it ("1,204 earlier visits have no time"); "What people did": event counts (collages, demo collages, restored collages, image downloads, poster downloads, links copied, shares, posters, searches, filters) as a compact two-column definition list, plus action reach (makers/downloaders/sharers as % of active visitor-days, via `pct`). Each card has "Explore this".
8. **Since launch:** a small card at the end, labelled "Since launch · ignores filters": first collection day, personal collages, downloads.

### Explore

Two columns on desktop (config 300px left, result right), stacked on phones.

- Config card: Measure (Select grouped "People" / "Events", unit shown under it), Break down by (only compatible dimensions), Display (ToggleGroup Auto / Line / Bar / Table; Line only for day), Explore filters as chips with remove, Saved views (DropdownMenu: Save current view… (Dialog with name), list to open, delete; up to 20, `everybird:analytics-views`).
- Result: a readable query sentence ("Personal-list collages by country, 3–16 Nov 2026, all devices"), the chart (bars horizontal for categories, Top 10 + Other via `workspaceChartRows`), then the sortable Table (shadcn Table; click headers; full aggregate), total row, "Export CSV" button (`workspaceCsv`). Clicking a bar or row adds that category as an Explore filter (drill), then the breakdown can change.

### Definitions

A reading page, max 72ch: units, deduplication, privacy, coverage, comparison rules (port the current text verbatim from `page.ts`). Works without data.

### Command palette

Cmd/Ctrl+K opens shadcn `CommandDialog`: Go to Overview / Explore / Definitions; Range: Today, 7, 14, 30, All; Metric: the six trends; Country: each option; Theme: toggle; Refresh. `/` also focuses it.

## States and motion

- Loading: Skeletons at the real geometry (metric tabs, chart area, top-N rows). Keep showing the previous result dimmed with a thin progress bar at the top of the main column while a refresh for the same selection runs.
- Errors: inline Alert in the result area naming the problem and a Retry; failed background refresh keeps the last result with "Showing data from 14:02; refresh failed" in the title row. Access expiry (non-JSON or 401/403/404 response): a centered card "Your Cloudflare Access session ended" with "Reload to sign in".
- Empty: "No events in this range" with the range and a "Previous 30 days" button; uncollected ranges say collection began on X.
- Motion: metric values tween to the new number over 400ms (ease-out-expo), the selected tab indicator slides, charts animate 300ms on data change, popovers 150ms. Everything collapses to instant under `prefers-reduced-motion`.

## Behaviour that must not change

All of `workspace-client.ts` and `pure.ts` semantics: URL hash state (old `r`/`c`/`m` links still open), request tickets that discard stale responses and abort superseded ones, 20 s timeout, 60 s background refresh while visible and not on Definitions and not while focus is inside results, "Refresh" bypassing the cache (`cache: 'no-store'`), the CSV contents and escaping, `workspaceObservation`, `pct`, `deltaInfo`, `pacificDay`, `addDays`. The Worker's data API, SQL, Access check, `/e` and CORS are untouched.

## Build

- `workers/stats/ui/`: its own `package.json` (Vite, React 19, TypeScript, Tailwind v4 via `@tailwindcss/vite`, shadcn/ui new-york with the unified `radix-ui` package, Recharts via the shadcn `chart` component, Phosphor, the two Fontsource packages, `vite-plugin-singlefile`). Its own `tsconfig.json` and `node_modules`. The Vite config sets `css.postcss` inline so the repo root's PostCSS config is never picked up.
- The pure logic moves from string-embedded ES5 into real TypeScript modules under `workers/stats/ui/src/lib/` (no DOM, no React imports), imported by the UI and by the unit tests in `tests/`. `pure.ts`'s legacy `PURE_JS` and `WORKSPACE_JS` strings are removed once nothing uses them, with their tests ported to the TS functions, same assertions.
- `npm --prefix workers/stats/ui run build` writes one self-contained HTML (scripts, CSS and fonts inlined) and then `workers/stats/src/page.generated.ts` (`export const PAGE = <JSON string>`), which is committed like the repo's other generated files. `page.ts` re-exports it. `wrangler.jsonc` gets `"build": { "command": "npm --prefix ui run build" }` so every `wrangler deploy` ships the current UI.
- CSP stays `default-src 'none'` with inline script/style, plus `font-src data:` and `img-src data:`. Nothing is fetched from another origin.
- Dev: `npm --prefix workers/stats/ui run dev` on port 5180 with a synthetic mock of `/dashboard/data` (generated in code, seeded, no real data) so the page can be reviewed without deploying.
- Root `npm run build`, `npm run cf:build`, root `tsc`, root ESLint and `.vercelignore` stay unaffected (`workers/` is already excluded everywhere).

## Amendments after Refero research (2026-11-17)

Refero references: the "Cloudflare: infrastructure in sunlight" style (Cloudflare's current site), and the Fingerprint "Overview" and Visitors analytics dashboard screens. These override the tokens and some details above.

- **Accent is Cloudflare signal orange** (`#ff5e1f`, dark `#ff6a33`), used only for data and selection: the current-period series, the selected metric tab's 2px bottom underline, the active sidebar row's indicator, Top-N proportional bars (about 14% opacity) and focus rings. Never as text on white. Blue is dropped.
- **Actions:** primary buttons are ink-filled pills (`#262626`, white text); utility buttons are 36-38px outlined pills with a `#e5e5e5` border; inputs and selects 8px radius; press scale 0.98.
- **Neutrals:** page and panels white, panel frame `#ebebeb`, inner hairlines `#f0f0f0`, muted rows `#fafaf9`, ink `#262626`, secondary `#676767`, tertiary `#727272`. Dark: page `#111111`, panel `#171717`, frame `#262626`, hairline `#222222`, ink `#ededed`, secondary `#a1a1a1`.
- **Structure:** technical grids are touching cells divided by hairlines inside one framed panel (gap 0): the metric strip, and Countries beside Devices. Panels 12px radius, nested 8px, no panel shadows.
- **Type:** headings and metric values weight 500 with -0.025em tracking (title 24px, metric values 28px tabular); labels 13px weight 500 in the secondary color; sentence case.
- **Notices** sit in a thin note strip under the main chart (icon plus one secondary-colour line each, "Show N more" past two). Alerts only for errors and Access expiry.
- **Chart header:** title left; Line/Bar pill toggle and "Explore this" right; previous period dashed `#a3a3a3`; horizontal gridlines only.
