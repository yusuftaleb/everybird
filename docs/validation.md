# Validation

What "complete and validated" means before launch (spec, "My calls" 11), how each part is checked, and the results so far. This file is public, so it holds **no personal data**: only the method and aggregate results. Species-level detail stays in `private/validation-report.md`, which is git-ignored.

## Launch checklist

- [x] **The author's own data reproduces his list**, with every difference explained (automated, below).
- [ ] **A big list on a real phone:** a mid-range phone with a 1,000+ species list loads and filters smoothly, in Safari on iOS and Chrome on Android.
- [ ] **Every way in, on a phone:** eBird life list file, MyEBirdData.csv, iNaturalist username and ticking by hand, plus merging them, in Safari on iOS and Chrome on Android.
- [ ] **Share images, by eye:** the story and post images posted to LinkedIn and Instagram look right, and the link preview shows.
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

## Licences

- **Satoshi and Cabinet Grotesk (Fontshare, ITF Free Font License v2.0, 17 Aug 2026).** Read from the `FFL.txt` that ships in Fontshare's download, because the licence web page needs JavaScript. It allows personal and commercial use on websites and in apps, through the Fontshare API or self-hosted, with credit optional. It forbids redistributing the font files, including through "publicly accessible servers" or a repository, and modifying or subsetting them. So an open-source web app may use them as Everybird does: loaded from Fontshare's CSS, with the font files never committed (AGENTS.md already says so). The licence also bars offering the fonts as a choice for users to make their own content with. Everybird only uses them for its own pages and images, so that clause doesn't apply.
- **Geist Mono:** SIL Open Font License. **Phosphor:** MIT. **Stickers:** huashu-bird-sticker, CC BY 4.0, credited on every page, in share images and on `/credits`. **AVONET:** CC BY 4.0. **Natural Earth:** public domain (country shapes and most region names). **Debian iso-codes:** LGPL-2.1, ISO 3166-2 subdivision names that Natural Earth lacks, used as data for names only and credited on `/credits`.

## Analytics

Vercel Web Analytics is cookieless. It is rendered only on Vercel. Three events carry one anonymous property each: `collage_made {source}`, `image_downloaded {format}` and `link_copied {level}`. They never carry counts, names, species or places (`src/lib/analytics.ts`, `tests/analytics.test.ts`, and the share e2e test).
