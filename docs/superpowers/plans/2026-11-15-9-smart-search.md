# Everybird item 9: smart search

## Context
Yusuf wants Everybird's search box to understand plain phrases, like his Nest Ledger search does: "waterfowl canada 2026", "october 2026", "oct 2025 - nov 2026", "hawks BC", "threatened mexico". Recognised parts become filters, and the rest stays a bird-name search. His answers (2026-11-15):
- **Date meaning:** "seen there in that period", not only lifers. For life-list-only imports it falls back to first-seen dates and says so.
- **Placement:** upgrade the existing collage search (DockSearch). Recognised parts show as removable chips and drive the existing Places/Time/Status filters, so the buttons stay in sync.
- **Languages:** works in the site's language (en/es/pt/nl), and English always works.

## What exists to reuse
- **The parser to port:** another local project's `search.ts` and its tests. It's local and deterministic, with no AI service.
  - Tokenizer with quoted phrases and a `used[]` word marker.
  - Dates: month names and 3+ letter prefixes, years, quarters, ranges (`- / to / through / until / between…and / from…to`), year inference and relative dates (`this/last year`, `last N months`, `since <month>`).
  - Longest-run entity matching (up to 4 words) with plural stripping and 4+ letter prefixes.
  - `Chip {kind,label,token}`, plus `withoutChip` to remove one chip's words.
- **Alias ideas** from another local project's `smart-search.ts`: significant tokens and acronym aliases.
- **Everybird building blocks**, paths in the Everybird repo:
  - Name search: `src/lib/species/name-search.ts` (`searchKey`, `nameTier`) and `searchCollage(...)`, which already matches orders and families.
  - Filter model in `src/lib/list/filters.ts`: `Filter {order, family, countries, provinces, counties, from, to}`, plus `withPlaces`, `togglePlace` and `filterKey`. Status filter `statuses` and `withStatuses` on feat/nf-3-iucn.
  - Place keys `src/lib/list/place-keys.ts`; seen-here `src/lib/list/seen.ts`; months `src/lib/list/timeline.ts` (`Month`, `rangeLabel`).
  - Place-name resolution on feat/nf-8a-obsorg-core: `src/lib/import/obsorg-places.ts` (`countryNameMap` via `Intl.DisplayNames`) and `src/lib/import/sub1-index.ts` (`makeSub1Index`).
  - i18n: `src/i18n/messages/{en,es,pt,nl}.ts` and `useI18n()`.
  - Search UI: `src/components/app/DockSearch.tsx`; picks handled in `CollageView.tsx` `onSearchPick`.

## Gaps to fill
1. **Bird groups:** eBird species groups ("Waterfowl", "Hawks, Eagles, and Kites", "Shorebirds") aren't shipped. Today the filter allows only one order and one family.
2. **Time follows lifers only:** the Time filter applies to the first-seen date, and seen-here keeps only the earliest date per place. "Seen in Canada in 2026" needs every month a species was seen at each place.
3. **No place aliases** ("USA", "UK", "BC", "Ontario" in other languages).

## Approach (branch feat/nf-9-smart-search, built last on top of 1+7, 3, 5, 8)

**A. Data (Sol 6.1 high, can start now in parallel, then Opus review)**
- `scripts/build-data/build-groups.ts`:
  - Fetch eBird `ref/sppgroup` (en, es, pt_BR, nl) with taxon-order bounds.
  - Write `public/data/groups.v1.json`: `{id, name: {en,es,pt,nl}, lo, hi}` plus a hand-kept synonym file `data/i18n/group-synonyms.json`, e.g. ducks/geese/patos/eenden → waterfowl; raptors; owls; gulls; shorebirds; hummingbirds.
  - Register it in `data-files.ts`, and upload to R2 with `--data` (approved; keys in `~/.config/everybird/r2.env`).
- **Seen months:** while a file is read, `SeenAgg` also keeps the set of months each species was seen per place (`YYYY-MM`, compact). It's stored beside `seen` as `seenMonths` (Saved v5, with a migration).
  - MyEBirdData, iNaturalist and the observation.org observations export fill it.
  - Old saves and life-list-only sources have none, so they fall back to the earliest-date and lifer behaviour.

**B. Filter model**
- `Filter.group?: string`: an eBird group id, matched by taxon order. Shown as a chip in FilterBar.
- `Filter.basis?: 'lifer' | 'seen'`: smart-search dates set `seen`.
  - With `seen`, Time and Places together mean "seen at one of these places in this period", via `seenMonths`.
  - The Time panel shows the basis as a small two-way switch, "First seen / Seen any time", so the buttons stay in sync.
  - Add to `filterKey`, validation and the summary labels (`filter-summary.ts`), so share images say "Seen in Canada · 2026".
- **Card and tooltip inside the filter** (Yusuf, 2026-11-15). With a Places or Time filter on, the bird card and the hover tooltip show the first sighting inside the filter, not the lifer. For example, filtered to Canada 2023, a Merlin first seen in Egypt in 2019 reads "Canada · Mar 2023".
  - Month precision comes from MyEBirdData's per-place months (`seenMonths`).
  - Without MyEBirdData, or when nothing in the filter has a month, fall back to the lifer's date and place, as now.
  - With no filter, nothing changes.
  - This uses the same place-plus-time matching as `basis: 'seen'`.

**C. Parser: `src/lib/search/smart.ts` (pure, ported from Nest Ledger)**
- `parseSmart(q, ctx) → { filter: Partial<Filter>, chips: Chip[], rest: string }`.
  - `ctx` = `{today, lang, groups, regions, listPlaces, statuses}`.
- **Dates** become months. Month names come from `Intl.DateTimeFormat` for the UI language plus English, and connectors are per language (to/hasta/até/tot, -). The finance parts are dropped (amounts, kinds, people).
- **Places:**
  - Country names: `countryNameMap` moved into a shared `src/lib/places/names.ts`, with the current language added.
  - Aliases: USA/US/UK/UAE…
  - sub1 names and their code suffix ("BC", "ON"), matched first against the places on the user's list so short codes stay unambiguous.
  - Counties only by full name.
- **Groups:** names, synonyms, order labels and family names (reusing `searchCollage`'s order and family matching).
- **Status:** threatened, endangered, VU/EN/CR… and the localized words.
- **"lifers" / "new"** switch the basis to `lifer`.
- **Leftover words** go to the existing name search, unchanged.

**D. UI: DockSearch**
- An "Understood as" chip row under the field (Group · Place · Period · Status). Each chip has an ×, using `withoutChip`.
- Name hits still list below.
- Enter, or "Show these birds", applies the chips to the store filter in one `{type:'filter'}` action; no live re-pack while typing.
- The existing order, family and species picks keep working.
- A one-line note when `seen` dates fall back to lifer dates ("Your list only has first-seen dates; import MyEBirdData.csv for every sighting").
- Strings go into the i18n messages, with es/pt/nl search words in a `ui.search` area.

**E. Order and owners**
- Now: A, by a Sol 6.1 high agent in worktree `nf-9a-search-data`, plus the pure parser C with its unit tests (the Nest Ledger cases adapted). Opus 5.5 high reviews both.
- After 1+7, 3 and 8 are pushed: an Opus 5.5 high terminal agent does B and D on `feat/nf-9-smart-search`, rebased on the top of the stack, and pushes it for preview.
- Yusuf's rules apply: code checks only; push feature branches only; never main.

## Verification (code checks only)
- **Unit tests for `parseSmart`:**
  - "waterfowl canada 2026" gives group, c:CA and 2026-01–2026-12 with basis seen.
  - "oct 2025 - nov 2026"; "october" (latest October); "last year"; "hawks BC" gives CA-BC when the list has it.
  - "patos méxico 2026" and "eenden nederland 2025" in es and nl; "threatened" gives VU/EN/CR.
  - "lifers 2024" gives basis lifer; unknown words become `rest`.
- **Filter tests:** a species seen in Canada in 2026 but first seen in 2024 is included with basis seen and excluded with basis lifer; old saves without `seenMonths` fall back.
- **Group data tests:** every species maps to exactly one group, and the localized names are present.
- **Code checks:** lint, typecheck, one full unit run. No e2e or screenshots. Yusuf tries it on the preview.

## Follow-ups (Low, from the nf-9a bug check, 2026-11-15; deferred)
- "since last year" returns only last year (the since branch takes no relative period).
- One date chip per query: "nieuwe 2020 okt" takes 2020 and leaves "okt" as name text.
- A listed county silently beats a state of the same name ("Washington"); show the chip's full name.
- Stopwords left in the rest text ("el año pasado" leaves "el"; "aves de la costa" leaves "la costa").
- Seasons ('last summer', 'winter 2024'): not for now (Yusuf, 2026-11-15).
