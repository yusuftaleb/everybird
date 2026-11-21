# Smaller Places Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Places filter drills down from country to state or province to county, on the birder's collage, the landing sample and the shared view, and a list that only knows lifer places says so visibly, one tap from adding MyEBirdData.

**Architecture:** Filter keys reuse seen-here's own form and go deeper: `c:CA`, `s:CA-BC`, `k:CA-BC|Capital` (a county is namespaced by its province, so two states' "Washington" counties stay apart). `Filter` keeps `countries` exactly as today and gains `provinces` (sub1 codes) and `counties` (`"<sub1>|<county name>"`); one species matches when any selected key is among its places' keys. A pure helper module (`place-keys.ts`) parses keys, names them and relates parents and children; `filters.ts` gains `placeOptions` (one pass, the rows of one level with their counts and how many children each has) and `togglePlace` / `withPlaces` (a selection never holds a place and one of its ancestors). The Places panel moves to its own file and drills in place: a breadcrumb ("All countries / Canada / British Columbia"), an "All of Canada" row, and a drill button on every row that has children. The share link format does not change: the shared view's lifer places already carry "County, Province, Country" strings, which `payloadToRecords` now splits into a province and a county so the shared Places filter drills too, old links included.

**Tech Stack:** Next.js (App Router, client components), React, TypeScript, Vitest + Testing Library (jsdom), Playwright (Chromium, WebKit, Firefox).

**Spec:** `docs/superpowers/plans/2026-11-15-next-features.md`, item "5. Smaller places" (approved by Yusuf). Read `AGENTS.md` (Structure: FilterDropdowns, seen-here, link.ts, SharedView), `DESIGN.md` ("Places and Time dropdowns", "Voice and copy", "Accessibility") and `PRODUCT.md` first.

**Stacking:** this branch is stacked on item 2 (`feat/nf-2-share-switch`, `2026-11-15-2-share-switch.md`), which itself sits on item 4 (`2026-11-15-4-date-stamp.md`; it already includes the preview-variant switch `src/lib/variants.ts`). Both edit `src/lib/share/image.ts` (`ShareImageOpts`, `drawShareImage`) and item 2 edits `ShareDialog.tsx`. This plan touches only `filterLabel` in `image.ts` and the `label` memo in `ShareDialog.tsx`: rebase onto them first and keep those edits to those lines.

**History worth knowing:** commit `84c939e` (2026-11-06) had country, province and county chips with a breadcrumb; `2bc37f0` replaced them with today's dropdown and its multi-select country checklist ("provinces and counties leave the filter"). This plan brings the levels back inside that dropdown, keeping the multi-select. The legacy single-value `sub1` / `sub2` filter fields that `applyFilterValidity` drops stay dropped; the new fields have new names.

## Global Constraints

- "The Places filter drills down: country → province/state → county."
- "Data is already there: seen-here stores sub1 and sub2 for MyEBirdData and iNaturalist records (`src/lib/list/seen.ts`)."
- "Filter keys extend the existing "c:CA" form": `c:<ISO2>`, `s:<sub1 code>`, `k:<sub1 code>|<county name>`.
- "Chip counts and the map follow the selected level." There is no map in the app (AGENTS.md: "there is no map"; removed in `2bc37f0`), so only the counts follow the level; nothing else to change.
- "Shared links keep the selected places." Implemented as: the shared view's Places filter drills down through the places its link carries. No link format change: tokens, `link.ts`, `v1-frozen.txt` and the size budget are untouched. (The other reading is a question for Yusuf, below.)
- "After an eBird life-list import (no seen-here), show a visible note that the Places filter only knows where each bird was first seen, with a one-tap path to import MyEBirdData.csv instead."
- "Out of scope: hotspots. Location names are deliberately never read (privacy)." County names are eBird's `County` column and iNaturalist's admin-level-20 place names, as today; no parser reads anything new.
- Copy rules (DESIGN.md "Voice and copy"): sentence case, plain words, second person, no em dashes, no exclamation marks.
- Touch targets 44px (DESIGN.md); the Places panel is a popover from 600px and a portalled bottom sheet below (unchanged).
- Ports: e2e uses 3100/3200/4100 only, never 3000/3001. No push, deploy or posting.
- Every UI change fits the current design (Yusuf, 2026-11-15): `DESIGN.md`, its sidecar `.impeccable/design.json` and the existing components (TopBar, share dialog, filters, bird card); the same tokens, type, spacing, radii, motion and voice; no new visual language. Checked against it, the Places panel uses only what exists: rows are the checklist's `.eb-check` (44px, the 18px checkbox, 600 name when checked, Muted count, Surface hover); the head is the panel's mono label with Clear as `.eb-textbtn`; the breadcrumb is the taxonomy's `.eb-path` (current place Accent 600, `/` in Muted) with a 44px `::after` press; search is `.eb-input` in `.eb-input-wrap`; the drill and disclosure glyph is the site's own `ChevronDownIcon` from `collage/icons.tsx` (rotated −90° for "go in"), because the panel already draws the site's `SearchIcon` and `CloseIcon` and DESIGN.md's Iconography never mixes sets within a control (no Phosphor inside the panel); motion is the existing `eb-rise .24s` on `--eb-ease` for a new level or an opened group, added to the reduced-motion block (`eb-fade-in`); no new shadow (`tests/tokens.test.ts`), no new z-index, no new colour, no mixed or indeterminate checkbox state. DESIGN.md "Do's": Accent for selection and focus only.
- Preview variants (Yusuf, 2026-11-15): the panel's drill-down is an open design choice, so it ships as variants behind the preview-only switch, key `places`: `useVariant('places', PLACES_VARIANTS)` from `src/lib/variants.ts` (`options[0]` in SSR and the first render, then `?v=<letter>` or `?v=places:<letter>`, remembered per tab from page loads; always `options[0]` on production). `PLACES_VARIANTS = ['a', 'b'] as const`: a (default) drills in place, b expands rows inline. The filter model, keys, test ids of selectable things (`country-<ISO2>`, `place-<key>`, `drill-<key>`) and copy are identical across variants; only the panel's layout differs, and every variant writes the filter only through `togglePlace` / `withPlaces`.

**Builder's decisions (made here):**
- Keys: as above; a county key always has a province. A county seen without a province (seen-here `"date|KE|Some county"`, an iNaturalist place whose province name did not match) counts at the country level only.
- Selection: a multi-select over all levels, as countries are today. Checking a place removes its checked ancestors and descendants (checking British Columbia while Canada is checked narrows to British Columbia); unchecking removes only it. Clear clears every level.
- Panel, variant a (the default): one level at a time, drilled in place. Head: "Countries · 12", "States and provinces · 8", "Counties · 14" (one wording for every country; eBird's subnational1 and 2). Under it, once drilled, the breadcrumb "All countries / Canada / British Columbia" (the taxonomy's `.eb-path` look, current place in Accent 600, `aria-current="location"`). The first row of a drilled level is "All of Canada" (the parent's own checkbox and count). Each row with children ends in a drill button (the site's `ChevronDownIcon` turned −90°, 18px Muted, 44×44, `aria-label="Show states and provinces in Canada"` / `"Show counties in British Columbia"`). Flags on country rows only.
- Panel, variant b: one checklist, rows expand inline. Head "Countries · N" always; no breadcrumb and no "All of" row (the parent row is its own "all"). A row with children ends in a disclosure button (`drill-<key>`, the same chevron pointing right when closed and down when open, 44×44, `aria-expanded`, `aria-controls` the nested list, `aria-label="States and provinces in Canada"` / `"Counties in British Columbia"`). Opening shows the children as a nested `<ul>` under the row, indented one checkbox and gap (28px) per level so a child's checkbox lines up under its parent's name, 16px per level under 360px of viewport; names ellipsize (`.eb-check-name`), nothing scrolls sideways. Several groups may be open; they close with the panel. A parent with a checked descendant is not drawn checked or mixed: on opening the panel, every ancestor of a selected place starts open so the checked row is in view. Toggling a group keeps focus on its button. Search ("Find a country", from 9 countries) matches country rows only; an open group under a matching country stays shown.
- Variant c (the taxonomy FilterBar's one-level chips) is left out: DESIGN.md's chip rule is single-choice (the other chips step back to 70%, pressing the selected chip clears it), so chips can't keep today's multi-select (Egypt and Costa Rica together, `e2e/flows.spec.ts`) without bending that rule.
- Focus: drilling in focuses the "All of …" checkbox; a breadcrumb step back focuses the drill button of the row it came from. Esc closes the panel from any level, as today (not "up a level"). The search field's query resets on each level change; its placeholder is "Find a country" / "Find a state or province" / "Find a county", shown when the level has more than `SEARCH_FROM` (8) rows.
- The bar's button: "Places · N" counts the selected places at all levels; its accessible name lists them in full ("Places: British Columbia, Canada; Kenya"), the share image's label by short names ("British Columbia + Kenya", "Capital and 2 more").
- Lifer-only note: Settings shows it under the eBird rows whenever the life list is on the list and MyEBirdData is not (its button opens MyEBirdData's Add panel); the Places panel's note links to `/settings#add-mydata`, which opens that panel on arrival (or focuses Replace when MyEBirdData is connected but older than seen-here).

## Review Focus

1. Two counties with one name in different states ("Washington" in US-OR and US-PA): separate rows, separate counts, checking one never matches the other (Task 1 and Task 2 tests).
2. A list whose places are countries only (manual ticks, `manyCountriesSaved` in `e2e/places.spec.ts`): no drill buttons anywhere and the panel reads as today; the existing checkbox counts in `places.spec.ts` and `flows.spec.ts` still hold (Task 4 test).
3. A checked province or county that loses every species under another filter (an order chip, a rule switch): its row stays in its level with count 0 so it can be unchecked, and a list change prunes it (Task 2 validity test, Task 4 UI test).
4. Old share links and links cut to the `countries` level: they decode exactly as before; a regions-level link drills, a countries-level one shows no drill buttons; the card's place line is unchanged (Task 5 tests with `v1-frozen.txt`).
5. Settings after a life-list import grows by the new note: `e2e/settings.spec.ts` "Settings fits about 1.5 screens at 1280x800 with a source connected" (1.6 × 800) must still pass; and a 5,000-species list with seen-here must stay responsive while drilling (Task 2 timing test).

---

### Task 1: Place keys

**Files:**
- Create: `src/lib/list/place-keys.ts`
- Modify: `src/lib/list/seen.ts` (`placeKeys`, the header comment: drop "and the map")
- Test: `tests/place-keys.test.ts` (new), `tests/seen.test.ts` ("placeKeys" describe)

**Interfaces:**
- Produces (all pure, `place-keys.ts`):
  - `type PlaceLevel = 'country' | 'province' | 'county'`
  - `type ParsedPlace = { level: PlaceLevel; country: string; sub1?: string; county?: string }`
  - `parsePlaceKey(key: string): ParsedPlace | undefined` (country: `/^c:[A-Z]{2}$/`; province: `s:` + `/^[A-Z]{2}-[A-Za-z0-9]+$/` (the shared view's synthetic `CA-share0` passes); county: `k:` + a valid sub1 + `|` + a non-empty name; anything else undefined)
  - `keysOfPlace(p: { country: string; sub1?: string; sub2?: string }): string[]` (`['c:CA','s:CA-BC','k:CA-BC|Capital']`; no `k:` without a sub1)
  - `parentKey(key: string): string | undefined`, `isWithin(key: string, ancestor: string): boolean` (strict descendant)
  - `childKey(p: { country: string; sub1?: string; sub2?: string }, parent: string | undefined): string | undefined` (the place's key one level under `parent`: undefined parent → its `c:`; `c:CA` → its `s:` when it is in CA and has a sub1; `s:CA-BC` → its `k:` when it has that sub1 and a sub2)
  - `placeName(key: string, regions: Pick<Regions, 'countries' | 'sub1'>): string` (stripBracket'd country or sub1 name, else the code; a county's own name)
  - `placeNameLong(key, regions): string` ("Canada", "British Columbia, Canada", "Capital, British Columbia")
- `seen.ts`: `placeKeys(places)` returns the union of `keysOfPlace` over the places (the `SeenEntry.keys` every matcher reads).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/place-keys.test.ts
it('every place gives its keys at each level it has', () => {
  expect(keysOfPlace({ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' })).toEqual(['c:CA', 's:CA-BC', 'k:CA-BC|Capital'])
  expect(keysOfPlace({ country: 'CA', sub1: 'CA-BC' })).toEqual(['c:CA', 's:CA-BC'])
  expect(keysOfPlace({ country: 'KE', sub2: 'Some county' })).toEqual(['c:KE']) // a county without a province counts at the country
})
it('parses the three levels and refuses anything else', () => {
  expect(parsePlaceKey('k:US-OR|Washington')).toEqual({ level: 'county', country: 'US', sub1: 'US-OR', county: 'Washington' })
  expect(parsePlaceKey('s:CA-share0')).toEqual({ level: 'province', country: 'CA', sub1: 'CA-share0' })
  for (const bad of ['', 'c:ca', 's:CA', 'k:CA-BC|', 'k:CA|X', 'x:CA']) expect(parsePlaceKey(bad)).toBeUndefined()
})
it('parents and children; same-named counties in two states stay apart', () => {
  expect(parentKey('k:US-OR|Washington')).toBe('s:US-OR')
  expect(parentKey('s:US-OR')).toBe('c:US')
  expect(parentKey('c:US')).toBeUndefined()
  expect(isWithin('k:US-OR|Washington', 'c:US')).toBe(true)
  expect(isWithin('k:US-OR|Washington', 's:US-PA')).toBe(false)
  expect(isWithin('c:US', 'c:US')).toBe(false)
  expect(childKey({ country: 'US', sub1: 'US-PA', sub2: 'Washington' }, 's:US-OR')).toBeUndefined()
  expect(childKey({ country: 'US', sub1: 'US-PA', sub2: 'Washington' }, 'c:US')).toBe('s:US-PA')
})
it('names: short and long', () => {
  const regions = { countries: { CA: 'Canada' }, sub1: { 'CA-BC': 'British Columbia' } }
  expect(placeName('s:CA-BC', regions)).toBe('British Columbia')
  expect(placeName('s:CA-XX', regions)).toBe('CA-XX')
  expect(placeNameLong('s:CA-BC', regions)).toBe('British Columbia, Canada')
  expect(placeNameLong('k:CA-BC|Capital', regions)).toBe('Capital, British Columbia')
})
```

In `tests/seen.test.ts`, rename "names the countries of the places (the filter goes no deeper)" to "names every level of the places" and assert `placeKeys([{ country: 'CA', sub1: 'CA-BC', sub2: 'Capital' }, { country: 'MX' }])` equals `new Set(['c:CA', 's:CA-BC', 'k:CA-BC|Capital', 'c:MX'])`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/place-keys.test.ts tests/seen.test.ts`
Expected: FAIL (module not found; placeKeys has no `s:`/`k:` keys)

- [ ] **Step 3: Implement `place-keys.ts` and switch `placeKeys` to `keysOfPlace`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/place-keys.test.ts tests/seen.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/place-keys.ts src/lib/list/seen.ts tests/place-keys.test.ts tests/seen.test.ts
git commit -m "feat(places): place keys at country, province and county level"
```

---

### Task 2: The filter model drills down

**Files:**
- Modify: `src/lib/list/filters.ts` (`Filter`, `filterKey`, `matcher`, new `placeOptions` / `togglePlace` / `withPlaces` / `filterPlaceKeys` / `hasPlaces`, `filterToShow`, `toggleCountry` and `withCountries` on top of `withPlaces`, the `Filter` doc comment), `src/lib/list/filters-validate.ts`, `src/components/app/use-collage-layout.ts` (`childFilters`' prefetch condition, the list signature)
- Test: `tests/filters-places.test.ts`, `tests/collage-layout-hook.test.tsx` (only if its expectations name the prefetch)

**Interfaces:**
- Consumes: Task 1's `keysOfPlace`, `parsePlaceKey`, `parentKey`, `isWithin`, `childKey`.
- Produces:
  - `Filter` gains `provinces?: string[]` (sub1 codes, sorted) and `counties?: string[]` (`"CA-BC|Capital"`, sorted); `countries` unchanged.
  - `filterPlaceKeys(f: Filter): string[]` (countries, then provinces, then counties, as keys); `hasPlaces(f: Filter): boolean`
  - `withPlaces(f: Filter, keys: readonly string[]): Filter` (parses, drops invalid, dedupes, sorts each level, drops any key with an ancestor also present, drops empty levels)
  - `togglePlace(f: Filter, key: string): Filter` (unchecks a checked key; else adds it and removes its ancestors and descendants)
  - `toggleCountry(f, iso)` = `togglePlace(f, 'c:' + iso)`; `withCountries(f, countries)` keeps its signature: it sets the country level to exactly `countries`, keeps provinces and counties outside those countries and drops the ones inside them (`withPlaces(f, [...countries as c: keys, ...the other levels' keys])`), so `withCountries(f, [])` clears only countries (Clear calls `withPlaces(f, [])`, which clears every level); existing tests keep passing
  - `type PlaceOption = ChipOption & { children: number }` (`value` is the key)
  - `placeOptions(list: ListEntry[], f: Filter, parent: string | undefined, species: SpeciesIndex, label: (key: string) => string, seen?: SeenIndex): PlaceOption[]`: the rows of the level under `parent` (undefined: countries), each species counted once per row, under the other filters but whatever places are checked (skip the place dimension, as `options(…, 'country')` does); `children` is the number of distinct child keys among the counted places; sorted by count, then label. One pass over the matching entries and their `seenOf` places.
  - `filterKey` appends `s:<provinces joined by ,>` and `k:<counties joined by ,>` after `c:`, only when present (every existing key stays byte for byte).

- [ ] **Step 1: Write the failing tests** (in `tests/filters-places.test.ts`, on its fixture: duck seen in CA-BC|Capital, US-WA|King and MX; owl in CA-ON; crow in MX and CA-BC without a county)

```ts
describe('provinces and counties', () => {
  it('a province or a county keeps the species seen there; levels mix by ANY', () => {
    expect(codes({ provinces: ['CA-BC'] })).toEqual(['crow', 'duck'])
    expect(codes({ counties: ['CA-BC|Capital'] })).toEqual(['duck'])
    expect(codes({ provinces: ['CA-ON'], countries: ['MX'] })).toEqual(['crow', 'duck', 'owl'])
    expect(applyFilter(list, { provinces: ['CA-BC'] }, species).map((e) => e.code)).toEqual(['duck']) // lifer places
  })
  it('placeOptions: each level counted under the other filters, with its children', () => {
    const rowsOf = (f: object, parent?: string) => placeOptions(list, f, parent, species, (k) => k, seen).map((o) => [o.value, o.count, o.children])
    expect(rowsOf({})).toEqual([['c:CA', 3, 2], ['c:MX', 2, 0], ['c:US', 1, 1]])
    expect(rowsOf({}, 'c:CA')).toEqual([['s:CA-BC', 2, 1], ['s:CA-ON', 1, 0]])
    expect(rowsOf({}, 's:CA-BC')).toEqual([['k:CA-BC|Capital', 1, 0]])
    expect(rowsOf({ order: 'Strigiformes' }, 'c:CA')).toEqual([['s:CA-ON', 1, 0]])
    expect(rowsOf({ provinces: ['CA-ON'] }, 'c:CA')).toEqual(rowsOf({}, 'c:CA')) // whatever is checked
  })
  it('togglePlace narrows and widens; a selection never holds a place and its ancestor', () => {
    expect(togglePlace({ countries: ['CA'] }, 's:CA-BC')).toEqual({ provinces: ['CA-BC'] })
    expect(togglePlace({ provinces: ['CA-BC'] }, 'c:CA')).toEqual({ countries: ['CA'] })
    expect(togglePlace({ counties: ['CA-BC|Capital'], countries: ['MX'] }, 's:CA-BC')).toEqual({ countries: ['MX'], provinces: ['CA-BC'] })
    expect(togglePlace({ provinces: ['CA-BC'] }, 'k:CA-BC|Capital')).toEqual({ counties: ['CA-BC|Capital'] })
    expect(togglePlace({ provinces: ['CA-BC'], order: 'X' }, 's:CA-BC')).toEqual({ order: 'X' })
    expect(withPlaces({ order: 'X' }, ['s:CA-BC', 'c:CA', 'k:US-WA|King', 'nope'])).toEqual({ order: 'X', countries: ['CA'], counties: ['US-WA|King'] })
    expect(withPlaces({ countries: ['CA'], provinces: ['US-WA'] }, [])).toEqual({})
  })
  it('same-named counties in two states are two places', () => {
    const r = [rec('duck', { date: '2020-01-01', seen: ['2020-01-01|US-OR|Washington'] }), rec('owl', { date: '2020-01-01', seen: ['2020-01-01|US-PA|Washington'] })]
    const l = buildList(r, EMPTY_EDITS, DEFAULT_RULES), s = buildSeen(r, EMPTY_EDITS, DEFAULT_RULES, l)
    expect(applyFilter(l, { counties: ['US-OR|Washington'] }, species, s).map((e) => e.code)).toEqual(['duck'])
  })
  it('keys: unchanged for countries; provinces and counties appended', () => {
    expect(filterKey({ countries: ['US', 'CA'] })).toBe('c:CA,US')
    expect(filterKey({ provinces: ['CA-ON', 'CA-BC'], counties: ['US-WA|King'] })).toBe('s:CA-BC,CA-ON|k:US-WA|King')
    expect(filterPlaceKeys({ counties: ['US-WA|King'], provinces: ['CA-BC'], countries: ['MX'] })).toEqual(['c:MX', 's:CA-BC', 'k:US-WA|King'])
  })
  it('a search pick keeps places it was seen in, else clears every place level', () => {
    const crow = list.find((e) => e.code === 'crow')!
    expect(filterToShow({ provinces: ['CA-BC'] }, crow, species, seen)).toEqual({ provinces: ['CA-BC'] })
    expect(filterToShow({ provinces: ['CA-ON'], counties: ['CA-BC|Capital'] }, crow, species, seen)).toEqual({})
  })
  it.skipIf(process.env.SKIP_PERF === '1')('5,000 species with 20 places each: every level in under 150 ms', () => { /* synthetic records: 5 countries × 4 provinces × 5 counties; time placeOptions at the three levels plus applyFilter with a county checked */ })
})
describe('validity of provinces and counties', () => {
  it('bad codes go, ancestors win', () => {
    expect(applyFilterValidity({ provinces: ['CA-BC', 'CA-BC', 'bad'], counties: ['US-WA|King', 'nope', 'CA-BC|Capital'] }, list, species, false)).toEqual({ provinces: ['CA-BC'], counties: ['US-WA|King'] })
  })
  it('after a list change, places no species was seen in go', () => {
    expect(applyFilterValidity({ provinces: ['CA-QC', 'CA-ON'] }, list, species, true, seen)).toEqual({ provinces: ['CA-ON'] })
    expect(applyFilterValidity({ counties: ['CA-BC|Nowhere'] }, list, species, true, seen)).toEqual({})
  })
})
```

The existing tests in this file ("older state migrates: … provinces and counties are dropped" for the legacy `sub1`/`sub2` fields included) must pass unchanged.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/filters-places.test.ts`
Expected: FAIL (`placeOptions`, `togglePlace`, `withPlaces`, `filterPlaceKeys` not exported)

- [ ] **Step 3: Implement**

`matcher` builds its place keys with `filterPlaceKeys` (skipped under the `country` dimension, which now means every place level). `applyFilterValidity` runs `withPlaces` over `filterPlaceKeys(out)` plus the legacy `country`, and with `pruneValues` drops keys no entry's `keysOf` holds. `filterToShow` deletes `countries`, `provinces` and `counties` together when none of the filter's keys is among the bird's. In `use-collage-layout.ts`: `childFilters` prefetches top countries only when `!hasPlaces(f)`, and the list signature adds `e.place?.sub2` beside `sub1` (the shared view's lifer places now carry counties).

- [ ] **Step 4: Run them to see them pass, then the whole suite**

Run: `npx vitest run tests/filters-places.test.ts tests/filters.test.ts tests/store.test.ts tests/collage-layout-hook.test.tsx && npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/filters.ts src/lib/list/filters-validate.ts src/components/app/use-collage-layout.ts tests/filters-places.test.ts
git commit -m "feat(places): provinces and counties in the filter, counted per level"
```

---

### Task 3: Places in words (the bar's button and the share image)

**Files:**
- Modify: `src/lib/list/filter-summary.ts` (`placesSummary`, `placesSpoken`, new `placesLabel`), `src/lib/share/image.ts` (`filterLabel` only), `src/components/share/ShareDialog.tsx` (the `label` memo only), `src/components/filters/FilterDropdowns.tsx` (the `spoken` call)
- Test: `tests/filter-summary.test.ts`, `tests/filters-places.test.ts` ("the share image names the countries")

**Interfaces:**
- Consumes: Task 1's `placeName`, `placeNameLong`; Task 2's `filterPlaceKeys`.
- Produces:
  - `placesSummary(f: Filter): string | undefined`: the number of selected places at all levels.
  - `placesSpoken(f: Filter, regions: Pick<Regions, 'countries' | 'sub1'>): string | undefined`: the long names joined by `"; "` when any province or county is selected, by `", "` when only countries are (today's "Canada, Egypt" stays).
  - `placesLabel(f: Filter, regions: Pick<Regions, 'countries' | 'sub1'>): string | undefined`: short names with `countriesLabel`'s wording ("British Columbia", "British Columbia + Kenya", "Capital and 2 more"), in `filterPlaceKeys` order. `countriesLabel` stays exported.
  - `filterLabel(f, ctx: { species; countryName; regions?: Pick<Regions, 'countries' | 'sub1'> })`: uses `placesLabel` when `regions` is given, else `countriesLabel` as today. `ShareDialog` passes `regions`.

- [ ] **Step 1: Write the failing tests**

```ts
const regions = { countries: { CA: 'Canada', EG: 'Egypt', KE: 'Kenya' }, sub1: { 'CA-BC': 'British Columbia' } }
expect(placesSummary({ countries: ['KE'], provinces: ['CA-BC'], counties: ['CA-ON|Ottawa'] })).toBe('3')
expect(placesSpoken({ countries: ['CA', 'EG'] }, regions)).toBe('Canada, Egypt')
expect(placesSpoken({ countries: ['KE'], provinces: ['CA-BC'] }, regions)).toBe('Kenya; British Columbia, Canada')
expect(placesLabel({ provinces: ['CA-BC'], countries: ['KE'] }, regions)).toBe('Kenya + British Columbia')
expect(placesLabel({ counties: ['CA-BC|Capital', 'CA-BC|Okanagan', 'CA-BC|Sooke'] }, regions)).toBe('Capital and 2 more')
expect(filterLabel({ order: 'Strigiformes', provinces: ['CA-BC'] }, { species, countryName: (c) => c, regions })).toBe('Owls · British Columbia')
```

Update the existing `placesSpoken` call in "the bar buttons" to pass `regions`.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/filter-summary.test.ts tests/filters-places.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement; `FilterDropdowns` calls `placesSpoken(filter, regions)`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/filter-summary.test.ts tests/filters-places.test.ts tests/share-image.test.ts tests/share-dialog.test.tsx tests/places-ui.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/list/filter-summary.ts src/lib/share/image.ts src/components/share/ShareDialog.tsx src/components/filters/FilterDropdowns.tsx tests/filter-summary.test.ts tests/filters-places.test.ts
git commit -m "feat(places): provinces and counties on the Places button and the share image"
```

---

### Task 4: The Places panel drills down (variant a, the default)

**Files:**
- Create: `src/components/filters/PlacesList.tsx` (the shell: `PlacesList` and `PlacesNoteLine` move here from `FilterDropdowns.tsx`, which imports them; `SEARCH_FROM` and `PlacesNote` stay exported from `FilterDropdowns.tsx`; it picks the variant and holds what variants share), `src/components/filters/PlacesDrill.tsx` (variant a)
- Modify: `src/components/filters/FilterDropdowns.tsx` (header comment, passes `regions`), `src/components/filters/filters.css` (`.eb-places-path`, `.eb-drill`, the "All of" row)
- Test: `tests/places-ui.test.tsx`

**Interfaces:**
- Consumes: Task 2's `placeOptions`, `togglePlace`, `withPlaces`, `filterPlaceKeys`; Task 1's `placeName`, `parsePlaceKey`, `parentKey`.
- Produces: `PlacesList({ state, species, regions, note, onFilter }: { state: AppState; species: SpeciesIndex; regions: Regions; note?: PlacesNote; onFilter: (f: Filter) => void })`, which renders the note, then `variant === 'a' ? <PlacesDrill …/> : …` with `const variant = useVariant('places', PLACES_VARIANTS)` (`export const PLACES_VARIANTS = ['a'] as const` here; Task 4b adds `'b'`). Shared, exported from `PlacesList.tsx` for the variants: `usePlaceRows(state, parent: string | undefined, regions, species): PlaceOption[]` (`placeOptions` plus checked keys at that level missing from it, count 0), `PlaceCheck({ option, checked, onToggle, flag })` (one `.eb-check` row: label, checkbox with its test id, flag on countries, name, Muted count, `eb-sr` ", N species"), `PlacesFind({ level, q, onQ })` (the field, its placeholder per level, `places-find`). Test ids: country checkboxes keep `country-<ISO2>`; province and county checkboxes `place-<key>`; the "All of …" checkbox `place-all`; drill buttons `drill-<key>`; the breadcrumb `places-path`; `places-clear`, `places-find`, `places-lifer-only` unchanged.

Behaviour (the decisions above, made concrete): local state `at: string | undefined` (the drilled parent key) and `q`. Rows are `placeOptions(list, filter, at, …)` plus any checked key at this level missing from them (count 0, `children` 0). The "All of <parent>" row's checkbox is checked when the parent key is selected; its count is the parent's row count at the level above. A row's checkbox is checked when its own key is selected. The checklist's `aria-label` is the level's head word ("Countries", "States and provinces", "Counties"). After a drill or a breadcrumb step, the panel body scrolls to its top. A drilled level whose parent no longer has any rows (another filter emptied it) shows "No places here under the other filters." with the breadcrumb still there.

- [ ] **Step 1: Write the failing tests** (`Harness` and `seeded()` take `variant?: 'full' | 'lifer' | 'countries'` in place of `full`, `'full'` by default and `'lifer'` today's `full={false}`; extend the test regions with `sub1: { 'CA-BC': 'British Columbia', 'CA-ON': 'Ontario', 'US-WA': 'Washington' }`; duck1 is seen in CA-BC|Capital and US-WA|King, crow1 in CA-BC, owl1 in CA-ON)

```tsx
it('a country with provinces has a drill button; drilling shows its provinces under a breadcrumb, focus on "All of Canada"', () => {
  render(<Harness />); fireEvent.click(placesBtn())
  expect(screen.queryByTestId('drill-c:EG')).toBeNull()
  fireEvent.click(screen.getByTestId('drill-c:CA'))
  expect(screen.getByTestId('places-path')).toHaveTextContent('All countries/Canada')
  expect(screen.getByText(/States and provinces · 2/)).toBeInTheDocument()
  expect(screen.getByTestId('place-all')).toHaveFocus()
  expect(screen.getByRole('checkbox', { name: 'British Columbia, 2 species' })).toBeInTheDocument()
})
it('checking a province narrows a checked country; the button counts and names it', () => {
  // check Canada, drill, check British Columbia: filter is { provinces: ['CA-BC'] }; place-all unchecked;
  // placesBtn() has text "Places · 1" and aria-label "Places: British Columbia, Canada"
})
it('counties: drill again, check one; the breadcrumb steps back and focus returns to the drill button', () => {
  // drill-c:CA, drill-s:CA-BC: "Counties · 1", checkbox "Capital, 1 species"; check it -> { counties: ['CA-BC|Capital'] };
  // click "All countries" in places-path: the country level, drill-c:CA has focus
})
it('a checked place that another filter empties stays listed at 0 so it can be unchecked', () => {
  // check province CA-ON, then dispatch an order filter for Anseriformes: the Ontario row shows count 0 and is checked
})
it('countries-only lists show no drill buttons and no breadcrumb', () => {
  // seeded() gets a third variant, 'countries': the three species with lifer places { country } only and no seen-here
  render(<Harness variant="countries" />); fireEvent.click(placesBtn())
  expect(screen.queryAllByRole('button', { name: /^Show / })).toHaveLength(0)
  expect(screen.queryByTestId('places-path')).toBeNull()
})
it('Esc closes the panel from a drilled level and focus returns to the Places button', () => { /* drill, Escape, placesBtn() focused */ })
it('at phone width the drilled sheet keeps Tab inside and its drill buttons are buttons', () => { /* matchMedia stub as the existing sheet test */ })
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/places-ui.test.tsx`
Expected: FAIL (no `drill-c:CA`)

- [ ] **Step 3: Implement `PlacesList.tsx` and the CSS**

`.eb-places-path` reuses `.eb-path`, with its buttons given a 44px press (`position: relative` and a 44px `::after`, as the chips). `.eb-drill`: 44×44, transparent, the site's `ChevronDownIcon` at 18px rotated −90°, Muted, Ink on hover and focus, the global focus ring; the row keeps `.eb-check` for the label and puts the drill button beside it inside the `<li>` (a button is never inside the `<label>`). A new level's list enters with `eb-rise .24s var(--eb-ease)`; add `.eb-places-level` to the reduced-motion block's `eb-fade-in` list. No other new CSS values: spacing from the checklist's own (10px gaps, 8px row padding).

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/places-ui.test.tsx tests/filters-ui.test.tsx tests/collage-controls.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/PlacesList.tsx src/components/filters/PlacesDrill.tsx src/components/filters/FilterDropdowns.tsx src/components/filters/filters.css tests/places-ui.test.tsx
git commit -m "feat(places): the Places panel drills from country to province to county"
```

---

### Task 4b: Variant b, expandable rows, behind `?v=places:b`

**Files:**
- Create: `src/components/filters/PlacesTree.tsx` (variant b)
- Modify: `src/components/filters/PlacesList.tsx` (`PLACES_VARIANTS = ['a', 'b'] as const`; render `PlacesTree` for `'b'`), `src/components/filters/filters.css` (`.eb-places-sub` nested list and its indent, the disclosure state of `.eb-drill`)
- Test: `tests/places-ui.test.tsx`

**Interfaces:**
- Consumes: Task 4's `usePlaceRows`, `PlaceCheck`, `PlacesFind`, `PLACES_VARIANTS`; Task 2's `togglePlace`, `withPlaces`, `filterPlaceKeys`; Task 1's `parentKey`.
- Produces: `PlacesTree(props: same as PlacesDrill)`; local state `open: Set<string>` (starts with every ancestor of a selected key) and `q`. Test ids as variant a (`country-<ISO2>`, `place-<key>`, `drill-<key>` for the disclosure buttons, `places-clear`, `places-find`); no `place-all`, no `places-path`.

Behaviour: the "Panel, variant b" decision above. A nested group's rows come from `usePlaceRows(state, key, …)` for that open key only (nothing is computed for closed groups). Opening a group animates its list in with `eb-rise` (reduced motion: `eb-fade-in`).

- [ ] **Step 1: Write the failing tests**

```tsx
// Force a variant in jsdom the way the switch reads it, and never leak it into the next test:
const withVariant = (v: string) => history.replaceState(null, '', `/?v=places:${v}`)
afterEach(() => { history.replaceState(null, '', '/'); sessionStorage.removeItem('everybird:variants') })

describe.each(['a', 'b'] as const)('variant %s', (v) => {
  it('selects a province, then a county, through the same filter', () => {
    withVariant(v); render(<Harness />); fireEvent.click(placesBtn())
    fireEvent.click(screen.getByTestId('drill-c:CA'))
    fireEvent.click(screen.getByTestId('place-s:CA-BC'))
    expect(filterOf()).toEqual({ provinces: ['CA-BC'] })
    fireEvent.click(screen.getByTestId('drill-s:CA-BC'))
    fireEvent.click(screen.getByTestId('place-k:CA-BC|Capital'))
    expect(filterOf()).toEqual({ counties: ['CA-BC|Capital'] })
    expect(placesBtn()).toHaveAccessibleName('Places: Capital, British Columbia')
  })
})
it('variant b: rows open inline with aria-expanded; focus stays on the toggle; a checked county opens its ancestors on reopen', () => {
  // withVariant('b'); drill-c:CA has aria-expanded="false", then "true" after a click and keeps focus; the country
  // checklist still shows Egypt and the United States beside the open Canada group; no places-path, no place-all;
  // check place-k:CA-BC|Capital, close with Escape, reopen: drill-c:CA and drill-s:CA-BC are aria-expanded="true"
})
it('without a ?v the panel is variant a', () => { /* no withVariant: places-path appears after drill-c:CA */ })
```

The variant-a tests from Task 4 stay as they are (no `?v` = variant a).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/places-ui.test.tsx`
Expected: FAIL (variant b renders variant a: `aria-expanded` missing)

- [ ] **Step 3: Implement `PlacesTree.tsx` and the CSS**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/places-ui.test.tsx tests/variants.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/PlacesTree.tsx src/components/filters/PlacesList.tsx src/components/filters/filters.css tests/places-ui.test.tsx
git commit -m "feat(places): preview variant b (?v=places:b), expandable rows"
```

---

### Task 5: The shared view drills too (no link format change)

**Files:**
- Modify: `src/lib/share/convert.ts` (`payloadToRecords`, its doc comment)
- Test: `tests/shared-view.test.tsx`, `tests/link.test.ts` (one added assertion)

**Interfaces:**
- Consumes: nothing new; the shared view already passes `shown.regions` to `CollageView`.
- Produces: `payloadToRecords` gives a place `{ country, sub1: <synthetic key>, sub2? }`: the display string minus its country name is split at its last `", "` into the county (everything before; names with commas stay whole) and the province name (after). The synthetic sub1 key is `${country}-share${j}`, one `j` per distinct (country, province name) in the payload, with `regions.sub1[key]` = the province name, so `formatPlace` prints the shared string exactly as before. A display string whose country the viewer's regions don't name keeps today's behaviour (the whole string as one sub1 name, no county).

- [ ] **Step 1: Write the failing tests**

```ts
it('splits a shared place into a province and a county, one province key per name', () => {
  const p: SharePayload = { v: 1, places: ['Okanagan, British Columbia, Canada', 'British Columbia, Canada', 'Sooke, Metchosin, British Columbia, Canada', 'Egypt'], countries: ['CA', 'CA', 'CA', 'EG'],
    birds: [{ code: 'a', p: 0 }, { code: 'b', p: 1 }, { code: 'c', p: 2 }, { code: 'd', p: 3 }] }
  const { records, regions: shown } = payloadToRecords(p, regions)
  const k = records[0].place!.sub1!
  expect(records[0].place).toEqual({ country: 'CA', sub1: k, sub2: 'Okanagan' })
  expect(records[1].place).toEqual({ country: 'CA', sub1: k })
  expect(records[2].place).toEqual({ country: 'CA', sub1: k, sub2: 'Sooke, Metchosin' })
  expect(records[3].place).toEqual({ country: 'EG' })
  expect(shown.sub1[k]).toBe('British Columbia')
  p.places!.forEach((d, i) => expect(formatPlace(records[i].place, shown)).toBe(d))
})
```

Change the existing "rebuilds records with a country and a printable region" expectation from `'Okanagan, British Columbia'` to the split (`sub1` name `'British Columbia'`, `sub2` `'Okanagan'`). In `tests/link.test.ts` add: every token in `v1-frozen.txt` decodes, and `payloadToRecords` + `formatPlace` returns each payload's `places[i]` for every bird with a place (old links keep their place lines).

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/shared-view.test.tsx tests/link.test.ts`
Expected: FAIL (one sub1 per display string, no sub2)

- [ ] **Step 3: Implement the split in `payloadToRecords`**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/shared-view.test.tsx tests/link.test.ts tests/og.test.ts`
Expected: PASS; `git diff --stat src/lib/share/link.ts tests/fixtures/share` is empty.

- [ ] **Step 5: Commit**

```bash
git add src/lib/share/convert.ts tests/shared-view.test.tsx tests/link.test.ts
git commit -m "feat(share): the shared view's places drill to province and county, from the strings links already carry"
```

---

### Task 6: The lifer-only note, visible and one tap from MyEBirdData

**Files:**
- Modify: `src/components/filters/PlacesList.tsx` (`PlacesNoteLine` copy and link), `src/components/import/EbirdDrop.tsx` (the visible note, its button, `#add-mydata`)
- Test: `tests/places-ui.test.tsx` ("the lifer-only notice …"), `tests/ebird-drop.test.tsx`

**Interfaces:**
- Consumes: `placesNoteFor` (unchanged rule: `'add'` or `'reimport'`); `EbirdDrop`'s existing `quickOnly` and `reimport`.
- Produces: the anchor `/settings#add-mydata`. Test ids `places-lifer-note` (Settings' visible note) and `places-lifer-add` (its button; its visible text and name "Add MyEBirdData" match the row's own Add button, which does the same thing, so tests address it by test id); `places-lifer-only` (the panel's) unchanged. The in-panel `ebird-detail` note for `quickOnly` goes (the visible note replaces it); the `reimport` `ebird-detail` line stays.

Copy (exact):
- Places panel, `'add'`: "Places only knows where each bird was first seen. " + link "Add MyEBirdData" + " to filter by every place you saw each bird, down to the county."
- Places panel, `'reimport'`: "Places only knows where each bird was first seen. " + link "Import MyEBirdData again" + " to filter by every place you saw each bird."
- Settings, under the eBird rows when `quickOnly`: "Your eBird life list only says where each bird was first seen, so Places filters by those first places. MyEBirdData has every place you saw each bird, down to the county." and a quiet small button "Add MyEBirdData".

Behaviour: Settings' button opens MyEBirdData's Add panel and focuses its "Choose your eBird file" button. `EbirdDrop` reads `window.location.hash === '#add-mydata'` once mounted and on `hashchange` (as `MatchReport` reads `#match`: a client navigation fires no hashchange): MyEBirdData not connected → open its Add panel, scroll it into view (`block: 'center'`), focus "Choose your eBird file"; connected → focus its Replace button. Nothing happens while a file is being read (`off`).

- [ ] **Step 1: Write the failing tests**

```tsx
// tests/ebird-drop.test.tsx
it('only the life list download: a visible note, and its button opens the MyEBirdData panel', () => {
  render(<EbirdDrop job={idle} onFile={() => {}} loaded={{ full: 0, quick: 3 }} connected={[{ slot: 'ebird-list' }]} />)
  expect(screen.getByTestId('places-lifer-note')).toBeVisible()
  expect(screen.getByTestId('places-lifer-note')).toHaveTextContent('only says where each bird was first seen')
  fireEvent.click(screen.getByTestId('places-lifer-add'))
  expect(screen.getByRole('group', { name: 'Add MyEBirdData' })).toBeVisible()
  expect(screen.getByRole('button', { name: 'Choose your eBird file' })).toHaveFocus()
})
it('#add-mydata opens the MyEBirdData panel on arrival', () => { /* history.replaceState(null, '', '#add-mydata'), render, same two expectations */ })
it('a full export: no lifer-only note', () => { /* loaded { full: 3, quick: 3, fullCounty: true }: queryByTestId('places-lifer-note') is null */ })
```

In `tests/places-ui.test.tsx`, the notice test expects the two new panel sentences exactly and both links' `href` to be `/settings#add-mydata`. The first `ebird-drop.test.tsx` test ("only the life list download: says it stops at the province …") is replaced by the new one.

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/ebird-drop.test.tsx tests/places-ui.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement the copy, the note, the button and the hash**

- [ ] **Step 4: Run them to see them pass**

Run: `npx vitest run tests/ebird-drop.test.tsx tests/places-ui.test.tsx tests/app-routes.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/filters/PlacesList.tsx src/components/import/EbirdDrop.tsx tests/ebird-drop.test.tsx tests/places-ui.test.tsx
git commit -m "feat(places): the lifer-only note shows after a life list import, one tap from MyEBirdData"
```

---

### Task 7: End to end

**Files:**
- Create: `e2e/press-areas.ts` (`pressAreas(page)` moved out of `e2e/flows.spec.ts`, unchanged: it counts a control's 44px `::after` and skips a checkbox inside its label, which a bounding box can't)
- Modify: `e2e/places.spec.ts`, `e2e/share-link.spec.ts`, `e2e/settings.spec.ts`, `e2e/flows.spec.ts` (imports `pressAreas`)
- Test: those specs

**Interfaces:**
- Consumes: the test ids of Tasks 4–6.

- [ ] **Step 1: Write the specs**

`e2e/places.spec.ts`, inside the existing `for (const width of [1280, 390])` describe, a new test on a `drilledSaved()` list (synthetic, MyEBirdData-style records in the `ebird` slot with `seen` arrays: ten species seen in `CA-BC|Capital`, four in `CA-BC|Okanagan-Similkameen`, three in `CA-ON`, two in `US-WA|King`, two in `EG`): "drill from Canada to British Columbia to a county; the bar names it; back, Esc and 44px presses". It asserts: `drill-c:CA` visible, `drill-c:EG` absent; at 1280 the drill is pressed from the keyboard (focus, Enter), at 390 tapped; `place-all` focused; the head reads "States and provinces · 2"; checking British Columbia gives stats "14 of 21 species" and the button "Places · 1" with aria-label "Places: British Columbia, Canada"; drilling into British Columbia and checking Capital gives "10 of 21 species"; at each drilled level `pressAreas(page)` gives `small` `[]` (every drill button, the breadcrumb's buttons, Clear and the rows); "All countries" returns focus to `drill-c:CA`; Escape closes the panel and focuses the Places button; the page and the dock never scroll sideways (the existing measurement).

Also in `e2e/places.spec.ts`, for both widths: "variant b (?v=places:b) selects a province and a county inline": seed, then `page.goto("/?v=places:b")`, open Places, open `drill-c:CA` and `drill-s:CA-BC`, check `place-s:CA-BC` ("14 of 21 species"), then `place-k:CA-BC|Capital` ("10 of 21 species"); `pressAreas` `small` is `[]` and `.eb-drop-body` has `scrollWidth <= clientWidth` with both groups open. And once at a 260px viewport (Safari's aA at 150% on a 390px phone, as `text-size.spec.ts` uses), the same two groups open in the sheet without sideways scroll.

`e2e/share-link.spec.ts`: "a shared link's Places drills to province and county": `encodeShare` a payload of six link-index birds with places `['Capital, British Columbia, Canada', 'Okanagan-Similkameen, British Columbia, Canada', 'Ontario, Canada', 'Egypt']` (countries `CA, CA, CA, EG`), open `/s/<token>`, open Places, drill Canada, then British Columbia, check Capital: the stats line says the shown count, and a bird's card shows its place line "Capital, British Columbia, Canada".

`e2e/settings.spec.ts`: "after a life list import, Settings and Places say places are first places only, one tap from MyEBirdData": import `LIFELIST` with the existing helper; `places-lifer-note` visible; its `places-lifer-add` button opens the "Add MyEBirdData" group with "Choose your eBird file" focused; then the top bar's Collage link, open Places, `places-lifer-only`'s "Add MyEBirdData" link lands on `/settings#add-mydata` with the panel open and its button focused.

- [ ] **Step 2: Run them (the sticker server, dev server and engines as AGENTS.md describes; the executor runs these, not the planner)**

Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/places.spec.ts e2e/share-link.spec.ts e2e/settings.spec.ts e2e/flows.spec.ts e2e/responsive.spec.ts --project=chromium --project=webkit --project=firefox`
Expected: PASS (projects that don't include a spec skip it); "Settings fits about 1.5 screens at 1280x800 with a source connected" still passes.

- [ ] **Step 3: Commit**

```bash
git add e2e/places.spec.ts e2e/share-link.spec.ts e2e/settings.spec.ts
git commit -m "test(e2e): Places drills down on the collage and the shared view; the lifer-only note after a life list import"
```

---

### Task 8: Docs and full verification

**Files:**
- Modify: `AGENTS.md` (Structure: `FilterDropdowns.tsx` and the new `PlacesList.tsx` (levels, keys, drill buttons, breadcrumb, "All of", focus), `src/lib/list/place-keys.ts`, `seen.ts` keys, `filters.ts` (`provinces`, `counties`, `placeOptions`, `togglePlace`), `SharedView` / `payloadToRecords` (the split; "no link format change"), Settings' `EbirdDrop` lifer-only note and `#add-mydata`; and in the "Preview variants" paragraph, after the `stamp` key: "`places` (the Places panel's drill-down, `PlacesList.tsx`): a = drill in place with a breadcrumb and an "All of" row (default), b = expandable rows in one checklist (`PlacesTree.tsx`)"), `DESIGN.md` (describe the default, variant a, only, until Yusuf picks; "Places and Time dropdowns": replace "a checklist of countries, never provinces or counties" with the drill-down, the head words, the breadcrumb, the "All of" row, the drill button, the new note copy (also fixing the stale "Showing where each lifer…" text); "Accessibility": drill buttons' names, `aria-current` on the breadcrumb), `docs/superpowers/specs/2026-11-05-everybird-design.md` ("Changes after approval": a "Smaller places (2026-11-15)" entry), `docs/superpowers/plans/2026-11-15-next-features.md` (tick item 5)

- [ ] **Step 1: Update the docs** (AGENTS.md and DESIGN.md were edited by items 4 and 2 on this stack: edit the current text, don't restore older lines)

- [ ] **Step 2: Verify**

Run: `npm run lint && npx next typegen && npx tsc --noEmit && npm test`
Expected: no lint errors, no type errors, all Vitest tests pass.

Run: `STICKERS_DIR=../everybird-stickers npx playwright test e2e/places.spec.ts e2e/flows.spec.ts e2e/share-link.spec.ts e2e/responsive.spec.ts e2e/settings.spec.ts e2e/search.spec.ts e2e/text-size.spec.ts --project=chromium --project=webkit --project=firefox`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md DESIGN.md docs/superpowers/specs/2026-11-05-everybird-design.md docs/superpowers/plans/2026-11-15-next-features.md
git commit -m "docs: Places drills down to province and county; the lifer-only note"
```

---

## Questions for Yusuf

1. Which Places drill-down do you prefer: a (`?v=places:a`, the default: drill into a country in place, a breadcrumb and an "All of Canada" row) or b (`?v=places:b`: rows expand inline in one checklist)? The other one is deleted once you pick. A third, taxonomy-style chips, was left out because chips are single-choice and Places is multi-select.
2. Shared links: this plan makes the shared view's Places drill down through the places links already carry (each bird's first place, no format change, old links too). The other reading is that a link carries the place filter active when it was copied and opens with it applied. That needs a new format bit and more bytes. Today a link also ignores the order and time filters and carries the whole list, while the share image shows the filtered view. Do you want links to open on the sharer's filtered view?
3. The lifer-only note shows on Settings under the eBird rows and in the Places panel. Should it also show on the collage page itself, under the stats line?
4. The level names are "States and provinces" and "Counties" for every country (eBird's subnational levels). Keep those, or use something like "Regions" for the second level?
5. The shared view's places are always first places only (that's all a link has). Should its Places panel say so, as the birder's own panel does?
