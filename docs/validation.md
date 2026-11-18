# Validation

What "complete and validated" means before launch (spec, "My calls" 11), how each part is checked, and the results so far. This file is public, so it holds **no personal data**: only the method and aggregate results. Species-level detail stays in `private/validation-report.md`, which is git-ignored.

## Historical launch checklist

Unchecked items below require Yusuf's confirmation; they are not claims that the live release is broken. Agents now run code checks only, with no browser, screenshot or visual testing. The stats/search release checks on 2026-11-16 passed lint, typecheck and 2,120 unit tests. Device and visual results are not inferred from those checks.

- [x] **The author's own data reproduces his list**, with every difference explained (automated, below).
- [ ] **A big list on a real phone:** a mid-range phone with a 1,000+ species list loads and filters smoothly, in Safari on iOS and Chrome on Android.
- [ ] **Every way in, on a phone:** eBird life list file, MyEBirdData.csv, iNaturalist username and ticking by hand, plus merging them, in Safari on iOS and Chrome on Android.
- [ ] **Copy link in Safari on an iPhone:** on the deployed site, open Share, tap Copy link once, then paste in Notes or Messages: the `/s/1…` link is there and opens the collage. Automated in WebKit (`e2e/share.spec.ts`, "Safari: Copy link writes the clipboard inside the click": the write happens during the click, while the page has user activation, and resolves to the link), but desktop WebKit can't read the clipboard back or reproduce iOS's stricter gesture rule, so a real iPhone is the proof.
- [ ] **Share images, by eye:** the exported story and post images look right in their intended destinations, and the link preview shows.
- [ ] **eBird CSV headers in other eBird site languages (optional, Yusuf):** unchecked. The parsers match eBird's English column names. Download a MyEBirdData and a life list with eBird's language set to Español, Português and Nederlands and confirm the headers are still English (aggregate result only, no rows or personal data in this file); if eBird localizes them, the importer needs those headers before launch in es and pt.
- [ ] **Three to five birder friends** try it privately with their own data. Their problems are logged and fixed.

## The author's data

### Method

`npx tsx scripts/validate/yusuf.ts` (add `--offline` to reuse the saved iNaturalist pages).

1. It reads three files from `private/`, copied by hand: eBird's life list download, the full `MyEBirdData.csv` export, and the author's hand-kept `lifelist.json` from his website.
2. It runs both eBird importers, and `importInat` live for his public iNaturalist username at one request per second. The raw API pages are saved to `private/inat-yusuftaleb.json` so re-runs need no network.
3. It merges with the default rules (`buildList`, earliest date wins) and diffs against `lifelist.json` by eBird code: species missing or extra, first dates, and heard-only or found-dead marks.
4. It classifies every difference. "Explained" means it is the author's own choice (a hand-corrected date, a mark or bird added by hand, an exclusion) or a known quirk of how his list was made. Anything else counts as unexplained and is left for him to decide, never forced.
5. It writes the species-level report to `private/validation-report.md` and prints one summary line.

### Results (2026-11-05)

```
eBird 185 · MyEBirdData 185 · merged 196 · target 197 · unexplained 0
```

- Both eBird files give the same species and the same first dates, and merging either one with iNaturalist gives the same list.
- iNaturalist: no unmatched names. The species that come only from iNaturalist are the 11 expected ones; the 12th in the spec's list is his own record (below). The existing synonym table (the marsh wren rule) was enough, so no new synonyms were needed.
- The merged list has 196 species and his list 197. The only species difference is one bird he added by hand that is in neither source.

| Difference | Count | Explained? |
|---|---:|---|
| Date corrected by hand (iNaturalist's year was wrong) | 4 | yes |
| Heard-only mark set by hand (not in the source data) | 2 | yes |
| Bird added by hand, in neither source | 1 | yes |
| Earlier iNaturalist record that the old migration script on his website skipped (its name filter for domestic birds also excluded one wild species). Everybird keeps it by his own earliest-date rule | 1 | yes; flagged for the author to decide whether to update his list |

No importer or synonym bugs were found.

### Seen here (2026-11-06)

The Places filter counts species seen in a place, not only lifers there (Task PL). The script now also checks that: it tallies the full `MyEBirdData.csv` again on its own, row by row, rolling each row up to its species, and compares the species per country with the importer's seen-here data.

```
seen-here Canada: MyEBirdData 178 (independent tally 178, match) · merged with iNat 182 · lifers there 182 · countries 2, mismatched 0
```

- Every country in the export matches the independent tally (2 countries, 0 mismatches).
- Canada: 178 species seen in the eBird export, 182 once iNaturalist is merged in, the same as the lifers there.
- Offline runs replay iNaturalist pages saved before seen-here existed, so some observation places are missing from the cache and the merged figure can be low. A live run refreshes the cache. The eBird check doesn't depend on it.

## Imported places

- `data/place-registry.v1.json` combines the November 17 eBird audit (253 top-level places and 3,669 subdivisions), the 2023 eBird reference, the November 15 iNaturalist admin-level 0/10 snapshot (253 entries and 3,578 subdivisions), and the pinned ISO 3166-2 data. The app reads it through `public/data/regions.v1.json`. Verified equivalents share a Places ID. Distinct regions keep the source label and can have a verified containing region. The High Seas remain a Places entry outside continent filters. [eBird Explore](https://ebird.org/explore) · [2023 eBird reference](https://support.ebird.org/helpdesk/attachments/48293281603)
- Future importers call `resolveImportedPlace` with the source namespace, native ID, and any known edition. Add catalogue rows for verified equivalents and parents. Save the returned place in the record and pass it to `SeenAgg`. The list store projects saved source IDs into the same Places filters, cards, and exports. Backups retain the source IDs so registry corrections can apply when they are restored. Observation.org names are scoped by their export country. Established aliases are useful there, and coverage of their full division catalogue remains unverified.
- Regenerate from the local public metadata snapshots with `npx tsx scripts/build-data/build-place-registry.ts <audit-directory> <pinned-iso_3166-2.json>` and `npx tsx scripts/build-data/data-files.ts`. The refresh keeps older catalogue editions and additional source namespaces. Review any reported edition-sensitive IDs before publishing the data.
- Vietnam uses separate IDs for its 34 current provinces. Former provinces that merged roll up under their modern successor and retain their names. The codes in an eBird export identify the edition independently of observation dates. Ambiguous legacy codes without a confident match stay at country level. Reimport the full export to use its coordinates. [Vietnam's 2025 reorganization](https://vanban.chinhphu.vn/?classid=1&docid=213930&orggroupid=1&pageid=27160)
- Observation.org country aliases are pinned from its public countries endpoint in English, Dutch, German, French, Spanish and Portuguese. To refresh, save the complete response for each locale using its `Accept-Language` header and run `npx tsx scripts/build-data/build-obsorg-countries.ts <YYYY-MM-DD> <country-responses.json...>` before rebuilding the registry. The public regions endpoint represents a separate, smaller list. The export's complete `Country Division` catalogue remains unverified. [Countries endpoint](https://observation.org/api/v1/countries/) · [Regions endpoint](https://observation.org/api/v1/regions/)
- Observation.org coordinates use a browser-only fallback for Vietnam and Slovenia when the row lacks a known division and has suitable accuracy, `obscurity=False`, and a blank embargo field. The browser loads only public boundary data, uses the point in memory, and retains the region only when the point and its uncertainty fall safely inside one area.
- `public/data/vietnam-boundaries.v1.json` uses 2025 GSO Vietnam boundaries. Regenerate from `vnm_admin1.geojson` with `uv run --no-project --with shapely python scripts/build-data/build-vietnam-boundaries.py <geojson>`. [OCHA/HDX](https://data.humdata.org/dataset/cod-ab-vnm) · [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/)
- `public/data/slovenia-boundaries.v1.json` uses statistical regions from the Surveying and Mapping Authority of the Republic of Slovenia, with simplified geometry. Everybird keys `SI-SR01` through `SI-SR12` use the national statistical region codes. Regenerate from GeoJSON in EPSG:4326 with `SIFRA` and `NAZIV` using `uv run --no-project --with shapely python scripts/build-data/build-slovenia-boundaries.py <geojson>`. Run `npx tsx scripts/build-data/data-files.ts` after updating boundary assets. [Register of Spatial Units](https://podatki.gov.si/dataset/register-prostorskih-enot) · [Geohub statistical regions layer](https://geohub.gov.si/ags/rest/services/TEMELJNE_VSEBINE/GH_Prostorske_enote/MapServer/1520) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)

## Licences

- **Satoshi and Cabinet Grotesk (Fontshare, ITF Free Font License v2.0, 17 Aug 2026).** Read from the `FFL.txt` that ships in Fontshare's download, because the licence web page needs JavaScript. It allows personal and commercial use on websites and in apps, through the Fontshare API or self-hosted, with credit optional. It forbids redistributing the font files, including through "publicly accessible servers" or a repository, and modifying or subsetting them. So an open-source web app may use them as Everybird does: loaded from Fontshare's CSS, with the font files never committed (AGENTS.md already says so). The licence also bars offering the fonts as a choice for users to make their own content with. Everybird only uses them for its own pages and images, so that clause doesn't apply.
- **Geist Mono:** SIL Open Font License. **Phosphor:** MIT. **Stickers:** huashu-bird-sticker, CC BY 4.0, credited on every page, in share images and on `/credits`. **AVONET:** CC BY 4.0. **BIRDBASE:** CC BY 4.0 (Şekercioğlu et al. 2025), body masses for species AVONET has none for, credited on `/credits`. **Natural Earth:** public domain (country shapes and most region names). **Debian iso-codes:** LGPL-2.1, ISO 3166-2 subdivision names that Natural Earth lacks, used as data for names only and credited on `/credits`.

## Analytics

Moved from Vercel Web Analytics to Cloudflare on 2026-11-06 (Vercel's custom events need Pro). Nothing uses cookies or local storage, nothing carries list contents, and neither part runs with Do Not Track or Global Privacy Control on.

- **Visits:** Cloudflare Web Analytics, cookieless, rendered only on the app's own pages (Collage, Settings, About) and only in production (`VERCEL_ENV=production`). It never loads on a shared view (`/s/<token>`, whose token is the list), and links out of a shared view are full page loads, so the beacon can't see a token in its history (`e2e/share-link.spec.ts`, `tests/analytics-beacon.test.tsx`).
- **Events:** a small counter of our own (`workers/stats`, a Cloudflare Worker with D1). The app sends `{n, p}` (plus `d: 'touch'` on an iPad that reports a Mac) from the production hostname only: `visit` (landing, collage, settings, about, shared), `collage_made` (source), `image_downloaded` and `shared` (format), `link_copied` (level). Values are fixed lists on both ends (`src/lib/analytics.ts`, `tests/analytics.test.ts`, the share e2e tests).
- **What the Worker stores:** day, event, value, country (from Cloudflare), a coarse device class, a visit's browser language (two or three letters, never the UI language or anything else), and an anonymous id that changes every day, keyed with a secret, so we can count unique visitors without tracking anyone across days. No IPs, User-Agents, names, species, places or timestamps. At most 200 events per id per day. `npm run stats` prints the aggregates.
