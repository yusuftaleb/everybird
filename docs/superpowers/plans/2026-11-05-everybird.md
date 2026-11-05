# Everybird Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Everybird. A birder brings an eBird export, an iNaturalist username or hand-ticked birds, and gets their whole life list as a sticker collage sized by body mass. They can filter it by bird family, country and date, edit it, and share it as an image or a link.

**Architecture:**
- A Next.js app on Vercel. Everything personal (parsing, merging, layout, share-image drawing) runs in the visitor's browser. Lists are saved in IndexedDB.
- Build-time scripts turn huashu-bird-sticker, the eBird taxonomy and Natural Earth into small versioned data files.
- Stickers are resized into a separate static repo, `everybird-stickers`, served by GitHub Pages.
- The collage layout is a TypeScript port of `build_lifelist.py`'s packer. It runs in a Web Worker, and on the server for link previews.

**Tech Stack:** Next.js 16 (App Router; currently 16.4.5), React 19, TypeScript, npm, plus:
- Vitest and Testing Library, `fake-indexeddb`
- Playwright
- Papa Parse, for CSV
- fflate, for share-link compression
- idb-keyval, for storage
- sharp and d3-geo, at build time
- `next/og`, for link-preview images
- `@vercel/analytics`

**Spec:** `docs/superpowers/specs/2026-11-05-everybird-design.md`. Read it first. This plan only records decisions, and the spec says why.

**Reference code** (read-only, in the website repo): `/Users/yusuf/orca/projects/personal_website/framer-site/`
- `code-components/LifeList.tsx`: collage rendering, motion, cards, phone sheet and list view.
- `scripts/lifelist/build_lifelist.py`: the packer, size modes and masks.
- `code-components/PlacesMap.tsx`: the dotted map geometry and `squirclePath()`.
- `HANDOFF.md`, sections "Life list v4" to "v7.7": performance fixes and motion rules.

## Global Constraints

These come from the spec. Every task must respect them.

- **Name and tagline:** Everybird, "Every bird you've ever seen." The production URL is `https://everybird.vercel.app`.
- **Tokens (light / dark):**

  | Token | Light | Dark |
  |---|---|---|
  | Ink | `#1e1e24` | `#ffffff` |
  | Paper | `#f6f4ef` | `#1e1e24` |
  | Accent | `#92140c` | `#f06a5f` |
  | Muted | `#5f5f69` | `#a9a9b2` |
  | Line | `#857f74` | `#6e6e78` |
  | Hairline | `#dedad2` | `#3d3d45` |
  | Surface | `#ebe8e1` | `#28282f` |

- **Type:** Cabinet Grotesk 700 in sentence case for titles and headings. Satoshi for body text. Geist Mono 12px, uppercase, for dates, tags and labels. Satoshi and Cabinet Grotesk load from the Fontshare CSS API. **Never commit their font files.** Geist Mono loads with `next/font/google`.
- **Chips:**
  - 8px squircle radius, using `corner-shape: superellipse(2)` with the `.566` fallback factor from `LifeList.tsx`
  - Surface fill and a 1px Hairline border, Accent when selected
  - a Phosphor icon (`@phosphor-icons/react`) and a label
- **Motion:**
  - travel `cubic-bezier(.45,0,.1,1)` 640ms
  - arrival `cubic-bezier(.25,.8,.25,1)` 480ms, starting at 160ms
  - exit 180ms, `cubic-bezier(.4,0,1,1)`
  - ripple delay 0–120ms
  - `prefers-reduced-motion`: instant (a fade only)
- **Sizes:** "evened out" makes a tile's long side ∝ mass^0.2. True size uses mass^(1/3). The switch morphs in place.
- **Dates:** shown as month and year ("Sep 2026"), or the year alone when that's all there is.
- **Places:**
  - format: `Subnational2, Subnational1, Country`
  - otherwise `Subnational1, Country`
  - otherwise `Country`
  - otherwise nothing
  - never towns, eBird location names or coordinates
- **Marks:** `*` heard only, `†` found dead, `◦` photo or recording. The legend reads `* heard only · † found dead · ◦ photo or recording`.
- **Counting defaults:**
  - Only full species count. Subspecies and forms roll up to their species. Hybrids, "sp." entries, slashes and domestics don't count.
  - For the eBird life list file, `Countable = 1` is the rule.
  - From iNaturalist, only non-captive birds count. Research grade isn't required, but a switch can require it.
  - Switches can hide heard-only or found-dead birds.
- **Merging:** each species takes its earliest date from any source, with that record's place.
- **Privacy:**
  - No list data, file or coordinates leaves the browser.
  - The only network calls with user input are iNaturalist API requests (username and place IDs).
  - Analytics events carry no list contents.
  - Share links never contain towns or coordinates.
- **Personal data never enters git.** Yusuf's files live in `private/`, which is ignored.
- **Attribution:** "Stickers: huashu-bird-sticker, CC BY 4.0", linking https://github.com/alchaincyf/huashu-bird-sticker, appears wherever stickers appear, including share images and the stickers repo.
- **Share links:** at most 2,000 characters, and versioned. Old links must keep decoding.
- **Accessibility:** every bird and control works by keyboard, focus is visible (2px Accent outline, offset 2), reduced motion is honoured, and each bird's accessible name is its common name.
- **Performance:**
  - A list of 1,000 species filters with no main-thread task over 100ms, and no frame over 50ms, at 390px width with 4× CPU slowdown.
  - At 5,000 species everything still works.
  - Above 1,500 visible birds, morphs become a crossfade.
- **Approval:** steps that create GitHub repos, enable Pages, create the Vercel project, or publish anything need Yusuf's explicit go-ahead at that step.

## Review Focus

These five inputs aren't covered by any task's main tests, and are the most likely to hurt a real user. Each line names the task that owns the test.

1. **eBird exports in another language.** eBird writes common names in the user's chosen language, for example Spanish. Matching must go by scientific name first, and still match. Test: Task 8, `matches by scientific name when common names are Spanish`.
2. **Names from another eBird taxonomy year.** For example, a download from before eBird's yearly update, or a renamed species. These rows must appear in the unmatched list with a suggestion, never be silently dropped. Test: Task 9, `unknown scientific name falls back to common name, else unmatched with suggestion`.
3. **iNaturalist usernames that are wrong, have no bird observations, or fail on the network.** The user gets a plain message, and the rest of their list is untouched. Test: Task 11, `unknown user`, `zero birds` and `network failure keeps other sources`.
4. **A huge `MyEBirdData.csv`** (200,000 rows, around 40 MB) parses in a worker without freezing, and shows progress. Test: Task 9, `parses 200k synthetic rows under 5 s`, and Task 20's e2e test `large file shows progress and stays responsive`.
5. **Storage unavailable** (Safari private mode, or quota exceeded). The app still works in memory and says the list won't be saved. Test: Task 14, `falls back to memory when IndexedDB throws`.

---

## File Structure (repo `/Users/yusuf/orca/projects/everybird`)

```
AGENTS.md, README.md, LICENSE (MIT), .gitignore (exists)
package.json, next.config.ts, tsconfig.json, vitest.config.ts, playwright.config.ts
data/
  overrides.json          eBird code -> { huashu?, massG?, source }   (hand-kept)
  inat-synonyms.json      iNaturalist sci name -> eBird code           (hand-kept)
  link-index.json         append-only eBird codes for share links      (generated, committed)
  raw/                    downloaded sources (ignored)
  build/crosswalk-report.md (committed, regenerated)
scripts/build-data/
  fetch-sources.ts  build-species.ts  build-stickers.ts  build-geo.ts  link-index.ts
scripts/validate/
  yusuf.ts  synthetic-list.ts
public/data/              species.v1.json  taxonomy.v1.json  masks/<Order>.v1.json
                          country-dots.v1.json  regions.v1.json
src/lib/species/          types.ts  load.ts  resolve.ts
src/lib/import/           ebird-lifelist.ts  ebird-mydata.ts  detect.ts  inat.ts  places.ts  parse.worker.ts
src/lib/list/             model.ts  build-list.ts  trips.ts  filters.ts  storage.ts  export.ts  store.ts
src/lib/layout/           constants.ts  mask.ts  pack.ts  layout.worker.ts  layout-client.ts
src/lib/share/            link.ts  image.ts
src/components/collage/   Collage.tsx  Bird.tsx  Tally.tsx  BirdCard.tsx  ListView.tsx  collage.css
src/components/filters/   FilterBar.tsx  Chip.tsx  PickerSheet.tsx
src/components/map/       CountryMap.tsx
src/components/import/    ImportPanel.tsx  EbirdDrop.tsx  InatForm.tsx  AddBirds.tsx  MatchReport.tsx  RulesSwitches.tsx
src/components/edit/      EditBird.tsx
src/components/share/     ShareDialog.tsx
src/styles/               tokens.css  globals.css
app/                      layout.tsx  page.tsx  credits/page.tsx
                          s/[token]/page.tsx  s/[token]/opengraph-image.tsx
tests/                    unit tests mirroring src/ and scripts/ (Vitest)
tests/fixtures/           synthetic CSVs and API responses (never real personal data)
e2e/                      Playwright specs
private/                  Yusuf's real files (ignored)
../everybird-stickers/    separate repo: v1/128/<code>.webp, v1/384/<code>.webp, README, LICENSE
```

---

### Task 1: Project scaffold, design tokens and fonts

**Files:**
- Create: everything at the repo root listed in File Structure, plus `app/layout.tsx`, `app/page.tsx` (a placeholder heading), `src/styles/tokens.css`, `src/styles/globals.css`, `e2e/smoke.spec.ts`, `tests/tokens.test.ts`
- Modify: `.gitignore` (add `/test-results/`, `/playwright-report/`, `/public/data/*.tmp`)

**Interfaces:**
- Produces: the CSS custom properties `--ink --paper --accent --muted --line --hairline --surface`. They switch on `prefers-color-scheme: dark` and on `[data-theme=dark|light]` on `<html>`. Also the CSS variables `--font-display` (Cabinet Grotesk), `--font-body` (Satoshi) and `--font-mono` (Geist Mono).

- [ ] **Step 1: Scaffold.** Run `npx create-next-app@latest . --ts --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm`, keeping the existing `.gitignore` and `docs/`. Move `src/app` to `app/` if the generator puts it under `src/`, and update the `tsconfig` paths. Add the dev dependencies `vitest @testing-library/react @testing-library/jest-dom jsdom fake-indexeddb @playwright/test tsx`, and the dependencies `papaparse fflate idb-keyval @phosphor-icons/react @vercel/analytics`. Scripts:
  - `test`: `vitest run`
  - `e2e`: `playwright test`
  - `data`: `tsx scripts/build-data/build-species.ts && tsx scripts/build-data/build-geo.ts`
- [ ] **Step 2: Write the failing test** `tests/tokens.test.ts`. It reads `src/styles/tokens.css` and asserts it contains every light and dark hex value from the Global Constraints table, under the right token names.
- [ ] **Step 3: Run it to verify it fails.** Run `npx vitest run tests/tokens.test.ts`. Expected: FAIL, because the file is missing.
- [ ] **Step 4: Implement the tokens and fonts.** Write `tokens.css` (`:root`, `@media (prefers-color-scheme: dark) { :root:not([data-theme=light]) … }`, `:root[data-theme=dark]`). In `layout.tsx`, add `<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,600,700&f[]=cabinet-grotesk@700&display=swap">`, Geist Mono through `next/font/google`, `body { background: var(--paper); color: var(--ink); font-family: var(--font-body) }`, `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 8px }`, and the `<title>` "Everybird".
- [ ] **Step 5: Write the e2e smoke test** `e2e/smoke.spec.ts`. It loads `/` and asserts that the body's background is `rgb(246, 244, 239)` in light mode and `rgb(30, 30, 36)` with `colorScheme: 'dark'`. It also asserts the console has no errors.
- [ ] **Step 6: Run all tests.** Run `npx vitest run && npx playwright test e2e/smoke.spec.ts`. Expected: PASS.
- [ ] **Step 7: Write the repo docs.**
  - **`AGENTS.md`** gives the privacy rule (never commit `private/` or real exports), the attribution rule, the spec and plan paths, and these commands: `npm run data`, `npm test`, `npm run e2e`.
  - **`README.md`** gives what Everybird is, how to run it, the data sources and their licences, and the MIT licence.
  - **`LICENSE`** is MIT, with © 2026 Yusuf Taleb.
- [ ] **Step 8: Commit** with `git add -A && git commit -m "chore: scaffold Everybird (Next.js, tokens, fonts, test setup)"`.

### Task 2: Source fetching and species table

**Files:**
- Create: `scripts/build-data/fetch-sources.ts`, `scripts/build-data/build-species.ts`, `src/lib/species/types.ts`, `data/overrides.json`, `tests/build-species.test.ts`, `tests/fixtures/build/` (tiny huashu `species.json`, a taxonomy JSON and overrides)
- Output: `public/data/species.v1.json`, `public/data/taxonomy.v1.json`, `data/build/crosswalk-report.md`

**Interfaces:**
- Produces (`src/lib/species/types.ts`):

```ts
export type TaxonCategory = 'species'|'issf'|'form'|'intergrade'|'spuh'|'slash'|'hybrid'|'domestic'
export type SpeciesRow = {
  code: string; com: string; sci: string          // eBird code, English common name, scientific name
  ord: string; fam: string; famCom: string; to: number   // order, family (sci), family common, eBird taxonOrder
  g: number; gSrc: 'avonet'|'override'|'family'|'order' // body mass (g) and where it came from
  st: boolean; ar: number; q: boolean              // has sticker, sticker aspect w/h, meets huashu quality bar
}
export type TaxonRow = { code: string; sci: string; com: string; cat: TaxonCategory; to: number; reportAs?: string }
export type SpeciesFile = { v: 1; ebirdTaxonomy: string; huashuCommit: string; species: SpeciesRow[] }
export type TaxonomyFile = { v: 1; ebirdTaxonomy: string; taxa: TaxonRow[] }
export type HuashuRecord = { id: string; scientificName: string; taxonConcept: string;
  taxonomy: { seq: number; order: string; family: string }; ids: { ebird?: string };
  traits?: { massG?: number }; sticker?: { file: string; meetsQualityBar: boolean }; previous?: { scientificName: string }[] }
export type Overrides = Record<string /*eBird code*/, { huashu?: string /*huashu id*/; massG?: number; source: string }>
export function buildSpecies(huashu: HuashuRecord[], taxonomy: TaxonRow[], overrides: Overrides): { file: SpeciesFile; report: string }
```

- **`fetch-sources.ts`** writes to `data/raw/`:
  - `git clone --depth 1 https://github.com/alchaincyf/huashu-bird-sticker data/raw/huashu`. It records `git rev-parse HEAD`.
  - `https://api.ebird.org/v2/ref/taxonomy/ebird?fmt=json`, all categories, with no key. It was checked with a 200 response on 2026-11-05.
  - `ne_50m_admin_0_countries.geojson` and `ne_10m_admin_1_states_provinces.geojson`, from `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/`.
  - A manifest, `data/raw/manifest.json`, with each source's URL, the date, and the huashu commit SHA.

**Crosswalk rules** for each eBird row with `category = species`:
- **Candidates:** the huashu records with `ids.ebird === code`.
  - If there's exactly one, use it.
  - If there are several, prefer the one whose `scientificName` equals the eBird `sciName`, then `taxonConcept === 'same'`, then the lowest `taxonomy.seq`.
  - If there are none, try matching the eBird `sciName` to the huashu `scientificName` or `previous[].scientificName`.
  - Otherwise there's no sticker (`st: false`, `ar: 1`).
- **Mass:**
  - first `overrides[code].massG`
  - then the chosen huashu record's `traits.massG`
  - then the median over the same eBird family
  - then the median over the same order

  `gSrc` records which one was used.
- **The report** lists:
  - multi-candidate choices
  - sci-name fallbacks
  - species with no sticker
  - mass fallbacks
  - huashu records whose eBird code matches no eBird species

  Each list has counts.

- [ ] **Step 1: Write the failing tests** in `tests/build-species.test.ts`, using fixtures:
  - `unique ebird code match uses that sticker and AVONET mass` (`gSrc === 'avonet'`)
  - `multiple huashu rows prefer the exact scientific name`
  - `no huashu row gives st false and family-median mass` (`gSrc === 'family'`)
  - `override mass wins`: the fixture `amegos` with an override of 950 gives `g === 950` and `gSrc === 'override'`
  - `only category species rows appear, sorted by taxonOrder`
  - `report lists every fallback with counts`
- [ ] **Step 2: Run** `npx vitest run tests/build-species.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `fetch-sources.ts` and `buildSpecies()` in `build-species.ts`. The CLI part reads `data/raw/*`, writes the two JSON files minified, and writes the report. **Seed `data/overrides.json` from** `/Users/yusuf/orca/projects/personal_website/framer-site/content/lifelist/overrides.json`, keeping each entry's `source`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Run on the real data.** Run `npx tsx scripts/build-data/fetch-sources.ts && npx tsx scripts/build-data/build-species.ts`. Expected:
  - `species.v1.json` has as many species as the eBird taxonomy's `species` rows, and every row has `g > 0`
  - the report shows no more than about 200 species with `st: false`

  Paste the report's summary lines into the commit message.
- [ ] **Step 6: Commit** `scripts/ src/lib/species/types.ts data/overrides.json data/build/ public/data/ tests/` with the message `feat(data): eBird↔huashu crosswalk, masses, species and taxonomy tables`.

### Task 3: Sticker variants and collision masks

**Files:**
- Create: `scripts/build-data/build-stickers.ts`, `src/lib/layout/mask.ts`, `tests/build-stickers.test.ts`, `tests/fixtures/build/sticker.png`
- Output: `${STICKERS_OUT:-../everybird-stickers}/v1/{128,384}/<code>.webp`, and `public/data/masks/<Order>.v1.json`
- Modify: `public/data/species.v1.json` (the `ar` values, from the trimmed sticker)

**Interfaces:**
- Produces:

```ts
// src/lib/layout/mask.ts
export const MASK = 24                       // longest side in cells (from build_lifelist.py)
export type Mask = { w: number; h: number; bits: Uint8Array }   // row-major, 1 bit per cell, MSB first
export function decodeMask(m: [number, number, string]): Mask   // [w, h, base64]
export function maskFromAlpha(alpha: Uint8Array, width: number, height: number, threshold = 40): [number, number, string]
// masks/<Order>.v1.json: Record<ebirdCode, [w, h, base64]>
```

- **Steps per sticker:**
  1. Trim to the alpha bounding box.
  2. Write long-side 128 and 384 webp files, `quality 80, effort 6`.
  3. Make the mask from the 384 variant with a `BOX` resize to `MASK` on the long side, and alpha > 40. These are the same settings as `build_lifelist.py`.
  4. Set `ar = width/height` of the trimmed image.

  The stickers repo also gets `README.md` (the credit, the CC BY 4.0 notice "resized and trimmed from huashu-bird-sticker", and the source commit) and `LICENSE` (the CC BY 4.0 text).

- [ ] **Step 1: Write the failing tests:**
  - `variants have long side 128 and 384 and keep aspect within 1px`
  - `mask has MASK cells on the long side and marks opaque cells`: a fixture with a known filled square has the expected set bits
  - `decodeMask(maskFromAlpha(x))` round-trips
- [ ] **Step 2: Run** `npx vitest run tests/build-stickers.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files, using `sharp` with concurrency 8.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Run on the real data.** Run `npx tsx scripts/build-data/build-stickers.ts`. Expected:
  - the number of files in each size folder equals the count of `st: true`
  - the total size of `v1/` is under 500 MB, as reported by `du -sh`
- [ ] **Step 6: Commit.** In this repo, commit the script, `mask.ts`, the masks, the updated species file and the tests with the message `feat(data): sticker variants and collision masks`. In `../everybird-stickers`, run `git init -b main` and commit with the message `stickers v1 from huashu <sha>`. **Don't push**; see Task 25.

### Task 4: Country dots, region names and the share-link index

**Files:**
- Create: `scripts/build-data/build-geo.ts`, `scripts/build-data/link-index.ts`, `tests/build-geo.test.ts`, `tests/link-index.test.ts`
- Output: `public/data/country-dots.v1.json`, `public/data/regions.v1.json`, `data/link-index.json`

**Interfaces:**
- Produces the following. `CountryDots` and `Regions` are exported from `src/lib/species/types.ts`.

```ts
// country-dots.v1.json
type CountryDots = { v: 1; step: 1.5; rows: 95; cols: 240; countries: string[] /* ISO2, index 0 = none */;
                     cells: string /* base64 Uint16 per cell, row-major, country index */;
                     extra: [iso2: string, x: number, y: number][] /* dot for countries with no land cell */ }
// regions.v1.json
type Regions = { v: 1; countries: Record<string, string>   /* "CA" -> "Canada" */;
                 sub1: Record<string, string>              /* "CA-BC" -> "British Columbia", "EG-DK" -> "Dakahlia" */ }
// data/link-index.json : string[]  (eBird codes; append-only)
export function updateLinkIndex(existing: string[], current: string[]): string[]   // throws if any existing code would move or vanish
```

- **Geometry** is copied from `PlacesMap.tsx`:
  - equirectangular, with `x = lon + 180` and `y = 84 − lat`, and Antarctica dropped
  - cells 1.5° wide, 95 rows by 240 columns
  - odd rows offset by half a cell
- **Assigning cells:** a cell belongs to the country containing its centre, using `d3-geo` `geoContains` on the 50m admin-0 shapes. If no country contains the centre, try the 4 samples ±0.5 cells away, as PlacesMap does for land. Countries with no cell get an `extra` dot at their Natural Earth `LABEL_X/LABEL_Y`.
- **ISO codes:** use `ISO_A2_EH`, falling back to `ISO_A2`.
- **Region names:** `sub1` comes from the admin-1 `iso_3166_2` and `name` fields. Country names come from admin-0 `NAME`.
- **The link index** starts with all species codes in taxonomic order. Afterwards new codes are only appended.

- [ ] **Step 1: Write the failing tests:**
  - `cell at 56N 106W is CA`
  - `cell at 26.8N 30.8E is EG`
  - `SG has an extra dot`
  - `sub1 CA-BC is British Columbia and EG-DK is Dakahlia`
  - `updateLinkIndex appends new codes`
  - `updateLinkIndex throws when an existing code is removed or reordered`
- [ ] **Step 2: Run** `npx vitest run tests/build-geo.test.ts tests/link-index.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both scripts.
- [ ] **Step 4: Run the tests.** Then run the real build, `npx tsx scripts/build-data/build-geo.ts && npx tsx scripts/build-data/link-index.ts`. Expected: PASS, and the files are written. `country-dots` must be under 60 KB gzipped.
- [ ] **Step 5: Commit** with the message `feat(data): country dot grid, region names, append-only link index`.

### Task 5: Species loading and name resolution

**Files:**
- Create: `src/lib/species/load.ts`, `src/lib/species/resolve.ts`, `tests/resolve.test.ts`

**Interfaces:**
- Consumes: the Task 2 types.
- Produces:

```ts
export function loadSpecies(): Promise<SpeciesIndex>        // fetch /data/species.v1.json once, cache
export function loadTaxonomy(): Promise<TaxonomyIndex>      // lazy; only importers need it
export type SpeciesIndex = { rows: SpeciesRow[]; byCode: Map<string, SpeciesRow>; search(q: string, limit?: number): SpeciesRow[] }
export type TaxonomyIndex = { rows: TaxonRow[]; bySci: Map<string, TaxonRow> /* normalizeSci keys */;
                              byCom: Map<string, TaxonRow> /* lower-case, accents stripped */; byOrder: Map<number, TaxonRow> }
export type Resolution = { code: string; via: 'sci'|'com'|'taxonOrder' } | { code: null; reason: 'not-species'|'no-match'; suggestion?: string }
export function resolveName(t: TaxonomyIndex, q: { sci?: string; com?: string; taxonOrder?: number }): Resolution
export function normalizeSci(s: string): string             // lower-case, collapse spaces, drop parenthetical/group text
```

- **`resolveName` order:**
  1. Exact normalized scientific name in the taxonomy. A species is returned directly. An issf, form or intergrade returns its `reportAs`. A spuh, slash, hybrid or domestic returns `not-species`.
  2. The common name, case- and accent-insensitive, English only.
  3. `taxonOrder`.
  4. `no-match`, with `suggestion` = the nearest species by Levenshtein distance on the scientific name (≤ 3), else on the common name.
- **`search()`** matches prefixes of words in the common or scientific name, ignoring accents, and ranks exact matches first.

- [ ] **Step 1: Write the failing tests:**
  - `species sci name resolves`
  - `subspecies form resolves via reportAs`: "Colaptes auratus [cafer Group]" gives `norfli`
  - `spuh is not-species`
  - `English common name resolves when sci is missing`
  - `unknown gives no-match with a Levenshtein suggestion`
  - `search('flick')` returns Northern Flicker first
- [ ] **Step 2: Run** `npx vitest run tests/resolve.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the two files.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(species): loading, search and name resolution`.

### Task 6: List model and merging

**Files:**
- Create: `src/lib/list/model.ts`, `src/lib/list/build-list.ts`, `tests/build-list.test.ts`

**Interfaces:**
- Produces (used by every later task):

```ts
export type Source = 'ebird' | 'inat' | 'manual'
export type Place = { country?: string /*ISO2*/; sub1?: string /*"CA-BC"*/; sub2?: string /*"Okanagan-Similkameen"*/ }
export type SourceRecord = { code: string; source: Source; date?: string /* YYYY-MM-DD | YYYY-MM | YYYY */;
  place?: Place; heard?: boolean; dead?: boolean; media?: boolean; research?: boolean }
export type Unmatched = { source: Source; row: number; sci?: string; com?: string; reason: 'no-match'|'not-species'; suggestion?: string }
export type ImportResult = { records: SourceRecord[]; unmatched: Unmatched[]; skipped: number /* rows that are not countable species */ }
export type MarkKey = 'heard' | 'dead' | 'media'
export type Edits = { removed: string[]; added: SourceRecord[]; marks: Record<string, Partial<Record<MarkKey, boolean>>>;
  fixes: Record<string, string> /* "source:row" -> eBird code, from fixing unmatched rows */ }
export type Rules = { hideHeard: boolean; hideDead: boolean; researchOnly: boolean }
export type ListEntry = { code: string; date?: string; place?: Place; heard: boolean; dead: boolean; media: boolean; sources: Source[] }
export const EMPTY_EDITS: Edits; export const DEFAULT_RULES: Rules   // all false
export function buildList(records: SourceRecord[], edits: Edits, rules: Rules): ListEntry[]   // sorted by species taxonOrder
export function latestLifer(list: ListEntry[]): ListEntry | undefined                        // latest date; ties → highest taxonOrder
```

**Rules:**
- Records with `research === false` are dropped when `rules.researchOnly`. Only iNaturalist sets `research`.
- **Dates:** the earliest wins, compared lexically after padding (`YYYY` → `YYYY-00-00`). The entry takes the earliest record's `date` and `place`. Records with no date lose to dated ones.
- **`heard` and `dead`:** true when *every* record has that flag. eBird records never set either, so any eBird record clears them.
- **`media`:** true when *any* record has it.
- **Edits:**
  - `edits.marks` overrides the computed marks per key.
  - `edits.removed` drops a species.
  - `edits.added` are merged as `manual` records.
- **`hideHeard` and `hideDead`** drop entries whose final mark is true.

- [ ] **Step 1: Write the failing tests:**
  - `earliest date wins with its place`
  - `YYYY-MM loses to an earlier full date and beats a later one`
  - `heard only when all records heard; one eBird record clears it`
  - `media when any record has media`
  - `removed species disappears; manual addition appears`
  - `mark override beats computed mark`
  - `researchOnly drops non-research iNat records`
  - `hideHeard and hideDead`
  - `latestLifer picks the latest date`
- [ ] **Step 2: Run** `npx vitest run tests/build-list.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildList` and `latestLifer`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(list): merge sources, marks, edits and rules`.

### Task 7: Place formatting

**Files:**
- Create: `src/lib/import/places.ts`, `tests/places.test.ts`

**Interfaces:**
- Produces: `formatPlace(p: Place | undefined, r: Regions): string`, `placeFromSubnational(code: string): Place` (for `"CA-BC"` it returns `{ country: 'CA', sub1: 'CA-BC' }`), and `loadRegions(): Promise<Regions>`.

- [ ] **Step 1: Write the failing tests:**
  - `{country:'CA',sub1:'CA-BC',sub2:'Okanagan-Similkameen'}` formats as `"Okanagan-Similkameen, British Columbia, Canada"`
  - with no `sub2`, it formats as `"British Columbia, Canada"`
  - an unknown `sub1` such as `CA-ZZ` formats as `"Canada"`
  - `undefined` formats as `""`
  - `placeFromSubnational('EG-DK')` gives country `EG`
- [ ] **Step 2: Run** `npx vitest run tests/places.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(import): place formatting by eBird region level`.

### Task 8: eBird life list file

**Files:**
- Create: `src/lib/import/ebird-lifelist.ts`, `src/lib/import/detect.ts`, `tests/ebird-lifelist.test.ts`, `tests/fixtures/ebird/lifelist-*.csv` (synthetic)

**Interfaces:**
- Consumes: `resolveName`, `placeFromSubnational`, and `ImportResult` (Task 6).
- Produces:

```ts
export function parseEbirdLifeList(csv: string, t: TaxonomyIndex): ImportResult
export type FileKind = 'ebird-lifelist' | 'ebird-mydata' | 'unknown'
export function detectFile(headerLine: string): FileKind
```

- **The header** confirmed on 2026-11-05 is: `Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable`.
- **Rows:**
  - Rows with `Countable !== '1'` add to `skipped`.
  - The date is parsed from `30 Sep 2026` into `2026-09-30`.
  - The place is `placeFromSubnational(S/P)`.
  - `Location` is ignored.
- **`detectFile`** keys on the presence of `Countable` (the life list) or `Submission ID` (the full export). It strips a UTF-8 BOM.

- [ ] **Step 1: Write the failing tests:**
  - `keeps Countable=1 rows and skips spuh/slash`: a fixture with 5 species, 2 spuh and 1 slash gives 5 records and `skipped === 3`
  - `parses '06 Sep 2026' to 2026-09-06`
  - `S/P CA-BC gives country CA, sub1 CA-BC`
  - `matches by scientific name when common names are Spanish` (Review Focus 1)
  - `detectFile recognises both eBird headers, with and without BOM`
- [ ] **Step 2: Run** `npx vitest run tests/ebird-lifelist.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** it with Papa Parse (`header: true, skipEmptyLines: true`).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(import): eBird life list CSV`.

### Task 9: eBird full export (`MyEBirdData.csv`) in a worker

**Files:**
- Create: `src/lib/import/ebird-mydata.ts`, `src/lib/import/parse.worker.ts`, `tests/ebird-mydata.test.ts`, `tests/fixtures/ebird/mydata-*.csv`, `scripts/validate/synthetic-list.ts` (also used for the 200k-row fixture, generated at test time, not committed)

**Interfaces:**
- Produces: `parseEbirdMyData(csv: string | File, t: TaxonomyIndex, onProgress?: (rows: number) => void): Promise<ImportResult>`. It streams with Papa Parse `step` and keeps only the earliest row per species. `parse.worker.ts` exposes `{ kind, file } → ImportResult` with progress messages, for both eBird kinds.
- **The header** confirmed on 2026-11-05: `Submission ID, Common Name, Scientific Name, Taxonomic Order, Count, State/Province, County, Location ID, Location, Latitude, Longitude, Date, Time, Protocol, Duration (Min), All Obs Reported, Distance Traveled (km), Area Covered (ha), Number of Observers, Breeding Code, Observation Details, Checklist Comments, ML Catalog Numbers`.
- **Each row** resolves through `resolveName({sci, com, taxonOrder})`.
  - Rows that aren't species add to `skipped`.
  - Rows with no match add one `Unmatched` per distinct name, not per row.
  - The place is `{...placeFromSubnational(State/Province), sub2: County || undefined}`.
  - `media` is true when `ML Catalog Numbers` is non-empty on *any* row for that species.
  - Latitude and longitude are never copied into records.

- [ ] **Step 1: Write the failing tests:**
  - `rolls 'Northern Flicker (Red-shafted)' and 'Yellow-rumped Warbler (Audubon's)' up to norfli and yerwar`
  - `drops sp. and slash rows into skipped`
  - `earliest row per species wins`
  - `place is 'Okanagan-Similkameen' + CA-BC`
  - `media from any row with ML Catalog Numbers`
  - `records never contain coordinates`: deep-check that no key matches `/lat|lon/i`
  - `unknown scientific name falls back to common name, else unmatched with suggestion` (Review Focus 2)
  - `parses 200k synthetic rows under 5 s` (Review Focus 4; Node, `performance.now()`)
- [ ] **Step 2: Run** `npx vitest run tests/ebird-mydata.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `parseEbirdMyData` and the worker.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(import): MyEBirdData streaming parser with subspecies roll-up`.

### Task 10: iNaturalist name synonyms

**Files:**
- Create: `data/inat-synonyms.json`, `tests/inat-synonyms.test.ts`

**Interfaces:**
- Produces: `data/inat-synonyms.json`, shaped `Record<inatScientificName, ebirdCode>`, which is copied to `public/data/inat-synonyms.v1.json` by `npm run data`.
- **Seeding:**
  1. The `ALIAS` map in `/Users/yusuf/orca/projects/personal_website/framer-site/scripts/lifelist/migrate_to_personal.py`: `{"Cistothorus palustris": "Cistothorus paludicola"}`. iNaturalist lumps the marsh wrens; eBird splits out Western Marsh Wren. So the seed entry is `"Cistothorus palustris"` mapped to the eBird code whose `sciName` is `Cistothorus paludicola` in `taxonomy.v1.json`.
  2. Every `scientific` name in `framer-site/content/lifelist/inat-firsts.json` whose exact scientific name isn't in `taxonomy.v1.json`. Map each to the eBird code that Yusuf's `lifelist.json` uses for that bird.

  Task 24's validation adds any further entries it needs. Each entry gets a line in a sibling `data/inat-synonyms.notes.md` giving its reason.

- [ ] **Step 1: Write the failing test** `every synonym points to a code that exists in species.v1.json`.
- [ ] **Step 2: Run** `npx vitest run tests/inat-synonyms.test.ts`. Expected: FAIL (the file is missing).
- [ ] **Step 3: Create** the file with the seed entries.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(data): iNaturalist→eBird synonyms`.

### Task 11: iNaturalist import

**Files:**
- Create: `src/lib/import/inat.ts`, `tests/inat.test.ts`, `tests/fixtures/inat/*.json` (synthetic, shaped like the real API)

**Interfaces:**
- Consumes: `resolveName`, the synonyms file and `Regions`.
- Produces:

```ts
export type InatProgress = { fetched: number; total: number }
export type InatError = 'unknown-user' | 'no-birds' | 'network' | 'rate-limited'
export function importInat(username: string, opts: { taxonomy: TaxonomyIndex; synonyms: Record<string,string>;
  fetch?: typeof fetch; signal?: AbortSignal; onProgress?: (p: InatProgress) => void; minIntervalMs?: number /* default 1000 */ })
  : Promise<ImportResult | { error: InatError }>
```

- **API calls:**
  - `GET https://api.inaturalist.org/v1/observations?user_login=<u>&iconic_taxa=Aves&captive=false&per_page=200&order_by=id&order=asc&id_above=<lastId>`, paged with `id_above` until a page is empty.
  - Wait at least `minIntervalMs` between requests.
  - An unknown user is checked first with `GET /v1/users/autocomplete?q=<u>`, looking for an exact `login` match.
- **Mapping:**
  - `taxon.rank` must be `species` or below. Below species, use the first two words of `taxon.name`. Higher ranks add to `skipped`.
  - Names go synonyms first, then `resolveName({sci})`.
  - `observed_on` gives the date.
  - `research` is `quality_grade === 'research'`.
  - `media` is `photos.length + sounds.length > 0`.
  - `heard` is `sounds.length > 0 && photos.length === 0`.
  - `dead` is true when an annotation has `controlled_attribute_id === 17 && controlled_value_id === 19`. These IDs were confirmed from `/v1/controlled_terms` on 2026-11-05.
- **Places:** collect the distinct `place_ids` and resolve them with `GET /v1/places/<id,id,...>?admin_level=0,10,20` in batches of 100.
  - Admin level 0 gives `country` (the ISO2 found by name in `Regions.countries`, inverted).
  - Level 10 gives `sub1` (the code whose name in `Regions.sub1` for that country matches, ignoring accents).
  - Level 20 gives `sub2` (the iNaturalist place name).
  - `location`, `geojson` and `place_guess` are never stored.

- [ ] **Step 1: Write the failing tests**, using an injected fake `fetch` and fake timers:
  - `pages with id_above until empty`
  - `waits minIntervalMs between requests`
  - `maps species and rolls subspecies to species`
  - `sound-only is heard; annotation 17/19 is dead; photo is media`
  - `places resolve to country/sub1/sub2 and no coordinates are kept`
  - `unknown user`
  - `zero birds`
  - `network failure keeps other sources`: the result is `{error:'network'}`, and the caller's existing records are unchanged in the store (Review Focus 3, together with Task 20)
  - `HTTP 429 gives rate-limited after 3 backoff retries`
- [ ] **Step 2: Run** `npx vitest run tests/inat.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `importInat`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(import): iNaturalist by username`.

### Task 12: Trips and filters

**Files:**
- Create: `src/lib/list/trips.ts`, `src/lib/list/filters.ts`, `tests/trips.test.ts`, `tests/filters.test.ts`

**Interfaces:**
- Produces:

```ts
export type Trip = { id: string; country: string; start: string; end: string; label: string /* "Egypt · Sep 2026" */; codes: string[] }
export function findTrips(list: ListEntry[], countryName: (iso2: string) => string): Trip[]
export type Filter = { order?: string; family?: string; country?: string; year?: string; trip?: string }
export function applyFilter(list: ListEntry[], f: Filter, species: SpeciesIndex, trips: Trip[]): ListEntry[]
export function filterKey(f: Filter): string            // stable, e.g. "o:Passeriformes|c:EG|y:2026"
export type ChipOption = { value: string; label: string; count: number }
export function options(list: ListEntry[], f: Filter, level: 'order'|'family'|'country'|'year'|'trip', species: SpeciesIndex, trips: Trip[]): ChipOption[]
```

- **A trip** is a run of lifers in one country whose first dates (full `YYYY-MM-DD` only) are each no more than 3 days after the previous one.
  - A run counts only with at least 3 lifers, and it must be in a country other than the birder's "home" country. Home is the country with the most lifers.
  - Its label is `"<Country> · <Mon YYYY>"`, using the start month.
- **Drill-down:**
  - `family` requires `order`; `trip` requires `year`.
  - The three dimensions combine with AND.
  - `options()` counts reflect the other active dimensions.
- **Order labels** use the `ORDERS` plain-English map from `build_lifelist.py`, extended to every order in the species table. Families use the eBird family common name.

- [ ] **Step 1: Write the failing tests:**
  - `three Egypt lifers within 3 days form 'Egypt · Sep 2026'`
  - `home-country runs are not trips`
  - `a 4-day gap splits a trip`
  - `filters combine with AND`
  - `options count under the other active filters`
  - `filterKey is stable regardless of property order`
- [ ] **Step 2: Run** `npx vitest run tests/trips.test.ts tests/filters.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(list): trips and combinable filters`.

### Task 13: Storage, downloads and backup

**Files:**
- Create: `src/lib/list/storage.ts`, `src/lib/list/export.ts`, `tests/storage.test.ts`, `tests/export.test.ts`

**Interfaces:**
- Produces:

```ts
export type Saved = { v: 1; records: Record<Source, SourceRecord[]>; unmatched: Unmatched[]; edits: Edits; rules: Rules; name?: string; savedAt: string }
export function save(s: Saved): Promise<'saved' | 'memory-only'>
export function load(): Promise<Saved | null>
export function forget(): Promise<void>
export function toCsv(list: ListEntry[], species: SpeciesIndex, regions: Regions): string
export function toJson(s: Saved): string            // the backup; same shape as Saved
export function fromJson(text: string): Saved        // validates v and shape; throws on bad input
```

- **CSV columns:** `eBird code,Common name,Scientific name,First date,Place,Country,Heard only,Found dead,Photo or recording,Sources`. Places are formatted with `formatPlace`.
- **Storage key:** `everybird:v1` in idb-keyval. Replacing a whole source, such as re-importing iNaturalist, replaces only `records[source]`. Edits survive.

- [ ] **Step 1: Write the failing tests:**
  - `save/load round-trips` (fake-indexeddb)
  - `forget clears`
  - `falls back to memory when IndexedDB throws`, returning `'memory-only'` (Review Focus 5)
  - `CSV header and one row exact`
  - `fromJson rejects wrong version`
  - `re-import replaces one source and keeps edits`
- [ ] **Step 2: Run** `npx vitest run tests/storage.test.ts tests/export.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(list): device storage, CSV/JSON download, backup restore`.

### Task 14: Packing engine, ported from `build_lifelist.py`

**Files:**
- Create: `src/lib/layout/constants.ts`, `src/lib/layout/pack.ts`, `tests/pack.test.ts`

**Interfaces:**
- Consumes: `Mask` and `decodeMask`.
- Produces:

```ts
// constants.ts — values from build_lifelist.py
export const EXP = 0.2, EXP_TRUE = 1 / 3, GAP = 2, MAXUP = 1.5
export const LAYOUTS = [ { name: 'wide', W: 1120, H: 700, stretch: 1.7, F: 64, minWidth: 880, minBase: 14 },
                         { name: 'medium', W: 700, H: 800, stretch: 1.0, F: 56, minWidth: 540, minBase: 12 },
                         { name: 'narrow', W: 350, H: 900, stretch: 0.55, F: 40, minWidth: 0, minBase: 10 } ] as const
export const holeRadii = (F: number): [number, number] => [1.15 * F, 0.62 * F + 12]
// pack.ts
export type PackBird = { id: number; mass: number; mask: Mask }
export type Box = [x: number, y: number, w: number, h: number]           // layout units
export type PackResult = { base: number; W: number; H: number; boxes: Map<number, Box> }
export function relSizes(birds: PackBird[], exp: number): Map<number, number>          // smallest = 1
export function pack(birds: PackBird[], rel: Map<number, number>, W: number, H: number, base: number,
                     stretch: number, hole: [number, number], targets?: Map<number, [number, number]>, cell?: number): Map<number, Box> | null
export function packBest(birds: PackBird[], layout: (typeof LAYOUTS)[number], mode: 'even'|'true',
                         opts?: { targets?: Map<number, [number, number]>; refBase?: number; fixedStage?: [number, number] }): PackResult
```

- **The port** follows `pack()`, `best_layout()` and `trim_to_content()`, with these differences:
  - The occupancy grid uses `cell` layout units per cell, default 2. Bird masks are resized from the 24-cell masks to the tile's cell size by nearest-neighbour, then dilated by `ceil(GAP / cell)`.
  - Birds are placed largest first. The spiral formula and step are copied exactly: `rad = 2.2 t`, `t += 0.35/(1+0.03 rad) + 0.004`, `t < 1400`, with `stretch` on x except in targets mode.
  - The binary search starts from an estimate based on area: base = sqrt(0.55 · usable area / Σ(rel² · mask fill)). It then refines over at most 7 steps, between 0.6× and 1.6× of that estimate.
  - **Large lists:** if the best base is below `layout.minBase`, grow H by 25% and retry, up to 12× the starting H. The stage height then follows the content.
  - **Filtered states:** with `refBase` (the full collage's base) and `fixedStage` (its trimmed W×H), the base is clamped to between `0.7 · refBase` and `MAXUP · refBase`, as in `main()`.
  - **True size** is packed with `targets` set to the even-mode centres of the same state.
- **The output is deterministic:** stable sorts, with ties broken by `id`.

- [ ] **Step 1: Write the failing tests**, on a synthetic set of 300 birds with varied masks:
  - `every bird is placed`
  - `no two placed masks overlap`
  - `the count hole stays empty`
  - `same input gives identical boxes`
  - `true-size morph: median centre displacement ≤ 30% of stage width on narrow`
  - `1,000 birds pack in under 1,500 ms in Node`
  - `5,000 birds pack in under 12 s and grow the stage instead of shrinking below minBase`
- [ ] **Step 2: Run** `npx vitest run tests/pack.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `pack.ts`. Use typed arrays (`Uint8Array`) for the grid, and a word-aligned overlap test.
- [ ] **Step 4: Run the tests.** Expected: PASS. If the timing tests fail, raise `cell` to 3 on narrow before changing anything else.
- [ ] **Step 5: Commit** with the message `feat(layout): TypeScript port of the life-list packer`.

### Task 15: Layout worker and cache

**Files:**
- Create: `src/lib/layout/layout.worker.ts`, `src/lib/layout/layout-client.ts`, `tests/layout-client.test.ts`

**Interfaces:**
- Consumes: `packBest`, `filterKey`, and the masks loaded from `public/data/masks/<Order>.v1.json`. Only the orders present in the list are fetched.
- Produces:

```ts
export type StateLayout = { key: string; layout: 'wide'|'medium'|'narrow'; mode: 'even'|'true'; W: number; H: number;
                            boxes: Map<string /*code*/, Box>; scale: number /* base / full-collage base */ }
export function createLayoutClient(worker?: Worker): {
  setList(entries: { code: string; mass: number; ord: string }[]): void   // resets cache
  get(f: Filter, layout: 'wide'|'medium'|'narrow', mode: 'even'|'true'): Promise<StateLayout>   // cached by key
  prefetch(fs: Filter[], layout: 'wide'|'medium'|'narrow'): void   // idle-time warm-up of child states
}
```

- The full collage's `even` layout is always computed first. It fixes the stage and `refBase` for that layout class.
- A request superseded by a newer `get()` for the same layout resolves with the newer result, and never resolves out of order.

- [ ] **Step 1: Write the failing tests**, using an in-process fake worker:
  - `second get for same key is served from cache`
  - `true mode requests the even layout first and passes its centres as targets`
  - `out-of-order worker replies never overwrite a newer request`
  - `setList clears the cache`
- [ ] **Step 2: Run** `npx vitest run tests/layout-client.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the worker and the client.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(layout): worker with per-state cache and prefetch`.

### Task 16: App store (state wiring)

**Files:**
- Create: `src/lib/list/store.ts`, `tests/store.test.ts`

**Interfaces:**
- Consumes: Tasks 5–15.
- Produces a React hook and a pure reducer:

```ts
export type AppState = { saved: Saved; list: ListEntry[]; trips: Trip[]; filter: Filter; mode: 'even'|'true'; view: 'collage'|'list';
                         massOrder: 'heaviest'|'lightest'; persistence: 'saved'|'memory-only'|'idle' }
export type Action = { type: 'import'; source: Source; result: ImportResult } | { type: 'edit'; edits: Edits } | { type: 'rules'; rules: Rules }
  | { type: 'filter'; filter: Filter } | { type: 'mode'; mode: AppState['mode'] } | { type: 'view'; view: AppState['view'] }
  | { type: 'massOrder'; massOrder: AppState['massOrder'] } | { type: 'restore'; saved: Saved } | { type: 'forget' }
export function reducer(s: AppState, a: Action): AppState      // recomputes list/trips via buildList/findTrips
export function useEverybird(): [AppState, (a: Action) => void]   // loads on mount, debounced save (500 ms)
```

- [ ] **Step 1: Write the failing tests:**
  - `import replaces only that source`
  - `edit recomputes list`
  - `filter drops invalid family when order changes`
  - `forget resets to empty`
- [ ] **Step 2: Run** `npx vitest run tests/store.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the store.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(app): state store`.

### Task 17: Collage stage, birds, motion and count

**Files:**
- Create: `src/components/collage/Collage.tsx`, `Bird.tsx`, `Tally.tsx`, `collage.css`, `tests/collage.test.tsx`, `e2e/collage.spec.ts`

**Interfaces:**
- Consumes: `StateLayout` from `layout-client.get`, `SpeciesIndex`, and `AppState`.
- Produces: `<Collage entries={ListEntry[]} species={SpeciesIndex} layout={StateLayout} visible={Set<string>} mode onPick={(code)=>void} />`, plus the sticker URL helper `stickerUrl(code: string, cssPx: number, dpr: number): string`. It picks `128` when `cssPx·dpr ≤ 128`, else `384`, from `process.env.NEXT_PUBLIC_STICKER_BASE` (default `https://<github-user>.github.io/everybird-stickers`, set in Task 25) plus `/v1/<size>/<code>.webp`. Species with `st: false` render a Phosphor `Bird` icon in Muted.

**Port from `LifeList.tsx`:**
- **Positioning:** absolute birds, with `translate`/`scale` driven by `--x --y --k` in `cqw`, and the stage height `calc(var(--sh) * 1cqw)` with its 640ms transition.
- **Writing styles:** `useLayoutEffect` writes the CSS variables and the `data-off` and `data-enter` attributes directly onto elements, skipping unchanged values. Web Animations are kept in a ref and cancelled directly, never through `getAnimations()`.
- **Exit and enter keyframes:** `SHRINK = "translate(12%,12%) scale(.76)"`, using the motion constants from Global Constraints. The ripple delay comes from the distance to the count.
- **Containment:** `contain: layout style` on the stage and the count.
- **Tally:** the count in the hole, `"<n> species"` (or `"<n> of <total> species"` when filtered), animated as in `Tally`.
- **Hit-testing** uses the masks, as `hitMask` does. Keyboard: a single tab stop in taxonomic order, with arrow keys to move.
- **Above 1,500 visible birds,** the move transition is replaced by a 200ms opacity crossfade.
- **The True size switch** is the `.yt-ll-sci` toggle, with the label "True size".

- [ ] **Step 1: Write the failing tests:**
  - in `tests/collage.test.tsx` (jsdom): `renders one button per entry with accessible name = common name`, `hidden birds get data-off and aria-hidden`, `stickerUrl picks 128 vs 384 by cssPx·dpr`, `st:false renders the silhouette`
  - in `e2e/collage.spec.ts`, with the sample list from Task 20: `switching True size keeps every bird visible mid-transition`, which screenshots at 320ms and checks that the count of visible birds equals the total
- [ ] **Step 2: Run** `npx vitest run tests/collage.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the four files.
- [ ] **Step 4: Run** `npx vitest run tests/collage.test.tsx`. Expected: PASS. The e2e test runs after Task 20.
- [ ] **Step 5: Commit** with the message `feat(ui): collage stage with mass sizing, morphs and count`.

### Task 18: Bird card and list view

**Files:**
- Create: `src/components/collage/BirdCard.tsx`, `src/components/collage/ListView.tsx`, `tests/card-list.test.tsx`

**Interfaces:**
- Produces:
  - `<BirdCard entry species regions anchor? onClose />`. It's a popover on pointer devices, and a bottom sheet under 600px with Esc and close, moving focus into the sheet and back on close.
  - `<ListView entries species regions order="heaviest"|"lightest" onToggle />`.
  - `formatMass(g: number): string`. Under 1,000 g it rounds (to 1 decimal under 10 g) and adds " g". From 1,000 g it shows "1.1 kg" (1 decimal).
  - `formatDate(d?: string): string` gives "Sep 2026", or "2026".

**Card content** follows /lifelist v7.4:
- common name
- scientific name in italics
- a mono line with the first date
- the place
- marks with their legend text
- "Average body mass: 33 g", set apart

**The list view:**
- one row per bird, with columns: thumbnail | name | mass, then place and date at the far right, date rightmost
- sorted by mass, heaviest first, with a toggle for "Lightest first" and no other sort

- [ ] **Step 1: Write the failing tests:**
  - `formatMass(33)` gives `'33 g'`, `formatMass(4.27)` gives `'4.3 g'` and `formatMass(1130)` gives `'1.1 kg'`
  - `formatDate('2026-09-30')` gives `'Sep 2026'`, and `formatDate('2022')` gives `'2022'`
  - `card shows place by region rule and marks`
  - `list sorts by mass and toggles`
- [ ] **Step 2: Run** `npx vitest run tests/card-list.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** both components.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): bird card and mass-ordered list view`.

### Task 19: Filters and the country map

**Files:**
- Create: `src/components/filters/FilterBar.tsx`, `Chip.tsx`, `PickerSheet.tsx`, `src/components/map/CountryMap.tsx`, `tests/filters-ui.test.tsx`, `e2e/filters.spec.ts`

**Interfaces:**
- Consumes: `options()`, `Filter`, the dispatch from `useEverybird`, and `country-dots.v1.json`.
- Produces:
  - `<FilterBar state dispatch />` with three tabs, "Birds" (order, then family), "Places" (the map, then country chips) and "Time" (year, then trip). Each has a breadcrumb and drill-down chips with counts. Active filters from the other tabs show as removable chips.
  - Under 600px, each tab's chips open in `PickerSheet`. The button label is "Choose an order 18", "Choose a family 2", or the chosen group's name, as in /lifelist v5.
  - `<CountryMap counts={Map<iso2, number>} selected? onSelect />` uses the PlacesMap dot style (Hairline dots), plus SVG `<path>` round-cap dots per country.
    - Lit countries are drawn in Accent, with opacity in 4 steps set by quartiles of lifer counts: `.35 .55 .75 1`.
    - Tapping or pressing Enter on a country selects it. A label shows `"<Country> · <n> species"`.
    - It's keyboard reachable through a visually hidden list of lit-country buttons.
    - The selected country stays Accent at full opacity, and the others fade to `.25`.

- [ ] **Step 1: Write the failing tests:**
  - `choosing an order shows family chips and a breadcrumb`
  - `country chip and map tap set the same filter`
  - `removing a chip from another tab clears only that dimension`
  - `lit opacity follows quartiles`
- [ ] **Step 2: Run** `npx vitest run tests/filters-ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the four components.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Write the e2e test** `e2e/filters.spec.ts` with a synthetic 1,000-species list, at 390px with 4× CPU slowdown using CDP `Emulation.setCPUThrottlingRate`. Tap an order, then a country. Use a `PerformanceObserver` for `longtask` and frame timing through `requestAnimationFrame` deltas. Assert there's no long task over 100ms and no frame over 50ms after each tap. Run `npx playwright test e2e/filters.spec.ts`. Expected: PASS.
- [ ] **Step 6: Commit** with the message `feat(ui): filters and lit-country map picker`.

### Task 20: Landing, the three ways in, match report and editing

**Files:**
- Create: `app/page.tsx` (replacing the placeholder), `src/components/import/ImportPanel.tsx`, `EbirdDrop.tsx`, `InatForm.tsx`, `AddBirds.tsx`, `MatchReport.tsx`, `RulesSwitches.tsx`, `src/components/edit/EditBird.tsx`, `public/data/sample.v1.json`, `tests/import-ui.test.tsx`, `e2e/import.spec.ts`

**Interfaces:**
- Consumes: the store and all the importers.
- **The page flow:**
  1. **Hero:** the title "Everybird" and the tagline. The sample collage, built from `sample.v1.json`, plays as a live, filterable demo. It has the button "Make yours".
  2. **The three ways in,** given equal weight:
     - **eBird file:** a drop zone plus a file picker, with two short how-tos. One is "Quick: My eBird → click your World life list total → Download". The other is "Full (adds regions and photo marks): eBird → Download My Data (eBird emails it)".
     - **iNaturalist:** a username field, with progress shown as "Fetched 400 of 576".
     - **Tick by hand:** search, add date and region if you like.

     After the first import, the others stay available as "Add another source".
  3. **The collage page,** with the count, filters, collage or list view, the True size switch, the legend, Share, Download (CSV and JSON backup), Restore from backup, and Forget my list.
  4. **`MatchReport`:** "12 rows couldn't be matched". Each row has its suggestion as a one-tap fix, plus a search to fix it by hand, which writes `edits.fixes`. Non-species rows are summarised as "7 sp., slash or hybrid entries don't count".
  5. **`RulesSwitches`:** "Hide heard-only birds", "Hide found-dead birds" and "iNaturalist: research grade only".
  6. **`EditBird`,** opened from the card: remove from my list, or set and clear each mark.
  7. **The privacy line,** near the import area: "Your list never leaves your browser. We count visits anonymously."
- **`sample.v1.json`** is Yusuf's public 197-species list, generated from `framer-site/content/lifelist/lifelist.json`. It keeps the date and `region` (province and country) and drops towns. This is Claude's call; Yusuf can swap it before launch.

- [ ] **Step 1: Write the failing tests:**
  - in `tests/import-ui.test.tsx`: `dropping a lifelist CSV adds its species`, `iNat error message is plain and other sources stay` (Review Focus 3), `fixing an unmatched row adds the species`, `forget my list asks once then clears`
  - in `e2e/import.spec.ts`: `sample collage renders on landing`, `large file shows progress and stays responsive` (Review Focus 4: a generated 200k-row file, where the progress text updates and a button click responds within 200ms while parsing), `works in memory when storage is blocked` (the IndexedDB `open` is stubbed to throw, and the notice "This list won't be saved on this device" appears)
- [ ] **Step 2: Run** `npx vitest run tests/import-ui.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the page and components.
- [ ] **Step 4: Run** `npx vitest run && npx playwright test e2e/import.spec.ts e2e/collage.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(ui): landing, three ways in, match report, rules and editing`.

### Task 21: Share links and the shared view

**Files:**
- Create: `src/lib/share/link.ts`, `app/s/[token]/page.tsx`, `tests/link.test.ts`, `tests/fixtures/share/v1-frozen.txt`

**Interfaces:**
- Consumes: `data/link-index.json`, which is bundled.
- Produces:

```ts
export type ShareBird = { code: string; ym?: number /* months since 1900-01; year-only → that year's January with yearOnly */; yearOnly?: boolean; p?: number; m?: number /* 1 heard, 2 dead, 4 media */ }
export type SharePayload = { v: 1; name?: string; places?: string[] /* formatted region strings */; birds: ShareBird[] }
export type ShareLevel = 'regions' | 'countries' | 'dates' | 'species'
export function encodeShare(p: SharePayload, maxChars?: number /* 2000 */): { token: string; level: ShareLevel }
export function decodeShare(token: string): SharePayload       // throws on unknown version or corrupt token
```

- **The token** is `"1"` followed by base64url of `deflateRaw` (fflate, level 9) over this binary layout:
  - name length and UTF-8 name
  - the places dictionary
  - the bird count
  - per bird: the link-index delta as a varint, a flags byte, `ym` (uint16) and `p` (uint8)

  Version byte `1` is permanent.
- **Fallback when it's over `maxChars`:**
  1. `regions`: the places dictionary holds full region strings.
  2. `countries`: places reduced to country names.
  3. `dates`: no places.
  4. `species`: codes and marks only.
- **The shared page** renders the read-only collage, filters, True size and cards, plus a "Make your own" button linking to `/`. Its header reads `"<name>'s Everybird"`, or "An Everybird", and shows the count.
  - When the level is `dates` or `species`, the page notes that the place or date filters aren't available for this link.
  - It never reads or writes the visitor's own saved list.

- [ ] **Step 1: Write the failing tests:**
  - `round-trips a 197-bird payload at level regions under 2000 chars`
  - `a 3000-bird payload falls back and stays under 2000 chars`
  - `decodes the frozen v1 fixture`: the fixture string is committed. Never regenerate it.
  - `rejects version 2 and corrupt tokens with a clear error`
  - `tokens contain no town names`: encode a payload whose places came from `formatPlace`, then assert the decoded places are region strings only
- [ ] **Step 2: Run** `npx vitest run tests/link.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `link.ts` and the page. A bad token shows "This link is broken or from a newer Everybird" with a link to `/`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(share): versioned share links and read-only shared view`.

### Task 22: Share images

**Files:**
- Create: `src/lib/share/image.ts`, `src/components/share/ShareDialog.tsx`, `tests/share-image.test.ts`, `e2e/share.spec.ts`

**Interfaces:**
- Consumes: `packBest` (run in the worker at the image's aspect), `stickerUrl`, and `latestLifer`.
- Produces:

```ts
export type ImageFormat = 'story' | 'post'                 // 1080×1920, 1080×1350
export function renderShareImage(opts: { format: ImageFormat; entries: ListEntry[]; species: SpeciesIndex; filterLabel?: string;
  name?: string; theme: 'light'|'dark' }): Promise<Blob>    // image/png
export function shareCardText(n: number, latest?: { com: string; date?: string }): { count: string; latest?: string }
```

- **Layout** in a 1080px-wide canvas, with Paper background, 64px margins and the design tokens:
  - top: "Everybird", Cabinet Grotesk 700 at 56px
  - the collage, packed for the area left
  - bottom: the count, Cabinet at 96px ("197 species"), and under it "Latest lifer: Western Grebe · Sep 2026" (Satoshi 32px)
  - footer: `everybird.vercel.app` and "Stickers: huashu-bird-sticker, CC BY 4.0", in Geist Mono 22px Muted
  - a filtered view adds `filterLabel` ("Egypt · 2026") under the title
- **Drawing:** stickers are drawn from the 384 variants with `crossOrigin = 'anonymous'`. GitHub Pages sends `access-control-allow-origin: *`, checked 2026-11-05.
- **`ShareDialog`** has:
  - format toggles with a live preview
  - "Share image", using `navigator.share({ files })` when `navigator.canShare` allows it, else a download
  - "Download image"
  - "Copy link", using `encodeShare` and naming the level when it isn't `regions`
  - an optional name field, stored in `Saved.name`

- [ ] **Step 1: Write the failing tests:**
  - in `tests/share-image.test.ts`: `shareCardText(197, Western Grebe 2026-09-30)` gives `'197 species'` and `'Latest lifer: Western Grebe · Sep 2026'`
  - in `e2e/share.spec.ts`: `story image is 1080×1920 PNG and post is 1080×1350`, with the canvas not tainted (`toBlob` succeeds), and `copy link puts a /s/1… URL under 2000 chars on the clipboard`
- [ ] **Step 2: Run** `npx vitest run tests/share-image.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** both files.
- [ ] **Step 4: Run** `npx vitest run tests/share-image.test.ts && npx playwright test e2e/share.spec.ts`. Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(share): story and post images, share dialog`.

### Task 23: Per-person link previews

**Files:**
- Create: `app/s/[token]/opengraph-image.tsx`, `e2e/og.spec.ts`
- Modify: `app/s/[token]/page.tsx` (adding `generateMetadata`)

**Interfaces:**
- Consumes: `decodeShare`, `packBest` (on the server), the masks and the stickers.
- **The image:** `next/og` `ImageResponse` at 1200×630, in the Node runtime.
  - On the left, a mini collage of at most 60 birds. Choose them by stepping evenly through the list in taxonomic order, so every group is represented. Pack them with the `wide` layout into 640×560, using the 128 stickers.
  - On the right, "<name>'s Everybird" or "Everybird", the count at 120px, and the latest lifer.
  - Fonts are fetched from Fontshare and Google at request time and cached in memory.
- **Metadata:** the title is `"<name>'s Everybird — <n> species"`, the description is "Every bird you've ever seen.", and `og:image` and `twitter:card=summary_large_image` are set.

- [ ] **Step 1: Write the failing test** in `e2e/og.spec.ts`: for a 197-bird token, GET `/s/<token>/opengraph-image` returns `image/png` at 1200×630 within 4,000ms on the dev server, and the page `<head>` contains `og:image`.
- [ ] **Step 2: Run** `npx playwright test e2e/og.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the image and the metadata.
- [ ] **Step 4: Run the test.** Expected: PASS.
- [ ] **Step 5: Commit** with the message `feat(share): per-person link preview images`.

### Task 24: Credits, analytics and validation against Yusuf's data

**Files:**
- Create: `app/credits/page.tsx`, `scripts/validate/yusuf.ts`, `docs/validation.md`, `e2e/credits.spec.ts`
- Modify: `app/layout.tsx` (adding `<Analytics />` from `@vercel/analytics/react`), and the import, share and download handlers (adding `track()` calls)

**Interfaces:**
- **Credits** lists:
  - huashu-bird-sticker (CC BY 4.0, linked, stating that the stickers were resized and trimmed)
  - AVONET (body masses)
  - eBird and Clements (taxonomy, with the eBird taxonomy version from `species.v1.json`)
  - iNaturalist (API)
  - Natural Earth (public domain)
  - Avian Visitors by Teddy Warner (the inspiration, linking https://theodore.net/projects/AvianVisitors/)
  - Fontshare (Satoshi, Cabinet Grotesk), Geist Mono (OFL) and Phosphor (MIT)
  - the MIT code licence, linking the repo
- **Analytics events:** `collage_made {source: 'ebird'|'inat'|'manual'}`, `image_downloaded {format}` and `link_copied {level}`. They carry no counts, names or places.
- **`scripts/validate/yusuf.ts`:**
  1. Reads `private/ebird_world_life_list.csv`, `private/MyEBirdData.csv` and `private/lifelist.json`, copied by hand from `~/Downloads/` and `framer-site/content/lifelist/lifelist.json`.
  2. Runs both eBird importers, plus `importInat('yusuftaleb')` live, saving the raw API pages to `private/inat-yusuftaleb.json` for Task 10.
  3. Merges with `DEFAULT_RULES` and diffs against `lifelist.json` by eBird code.
  4. Writes `private/validation-report.md`. It holds the counts per source (expected: life list 185, MyEBirdData 185 after roll-up), the merged total (target 197), and every species-level and date difference, each with a reason. Known reasons: his South Africa dates corrected by hand to 2022-05-14 (Laughing Dove, Blacksmith Lapwing, Common Myna, Hadada Ibis), his manual marks, and his exclusions.

  It prints a one-line summary. `docs/validation.md` (committed) holds the checklist and results with **no personal data**.
- **`docs/validation.md`** also holds the manual launch gate from the spec:
  - a real mid-range phone with 1,000+ species, in Safari iOS and Chrome Android
  - every way in, on a phone
  - share images posted to LinkedIn and Instagram, and checked by eye
  - three to five birder friends trying it privately, with their problems logged and fixed

- [ ] **Step 1: Write the failing test** in `e2e/credits.spec.ts`: `/credits` contains a link to `https://github.com/alchaincyf/huashu-bird-sticker` and the text "CC BY 4.0", and every page has a footer link to `/credits`.
- [ ] **Step 2: Run** `npx playwright test e2e/credits.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the credits page, the analytics and the validation script.
- [ ] **Step 4: Run the test and the validation.** Run `npx playwright test e2e/credits.spec.ts && npx tsx scripts/validate/yusuf.ts`. Expected: the test passes, and the script prints `eBird 185 · MyEBirdData 185 · merged N · target 197 · unexplained 0`. If anything is unexplained, fix the importers or the synonyms (Task 10) until it reads `unexplained 0`. Otherwise, record the difference in the report for Yusuf to decide.
- [ ] **Step 5: Commit**, excluding `private/`, with the message `feat: credits, anonymous analytics, validation against the author's data`.

### Task 25: Publish (needs Yusuf's go-ahead at each step)

**Files:**
- Modify: `README.md` (live URLs), `docs/validation.md` (results)

- [ ] **Step 1: Ask Yusuf before each step.** Ask: "OK to create public GitHub repos `everybird` and `everybird-stickers` under your account, turn on Pages for the stickers repo, and link `everybird` to Vercel as `everybird.vercel.app`?" Wait for a yes.
- [ ] **Step 2: Stickers.**
  1. Run `gh repo create everybird-stickers --public --source ../everybird-stickers --push`.
  2. Turn on Pages from `main` and the root folder.
  3. Check that `curl -sI https://<user>.github.io/everybird-stickers/v1/128/norfli.webp` returns 200 with `access-control-allow-origin: *`.
- [ ] **Step 3: The app.**
  1. Run `gh repo create everybird --public --source . --push`.
  2. Create the Vercel project from the repo (the `vercel` CLI or dashboard), set `NEXT_PUBLIC_STICKER_BASE=https://<user>.github.io/everybird-stickers`, and turn on Web Analytics.
  3. Run `npx playwright test` against the preview URL by setting `BASE_URL`. Expected: all pass.
- [ ] **Step 4: Production.** Promote the build to production at `everybird.vercel.app`, then run the full e2e suite against it.
- [ ] **Step 5: Launch.** Hand the manual launch gate in `docs/validation.md` to Yusuf. **The LinkedIn post happens only after he signs it off.**
- [ ] **Step 6: Commit and push** the README and validation updates, with the message `docs: live URLs and validation results`.

---

## Later (not in this plan; tracked so nothing is lost)

- charts, such as lifers by year
- sticker-album sets with empty slots
- a "my year in birds" card (the New Year 2027 stretch)
- provinces and states lighting up when zooming into a country
- searching by name in other languages, using huashu's 43 languages
- a yearly eBird taxonomy refresh: re-run `npm run data` and `link-index.ts`, which only appends
