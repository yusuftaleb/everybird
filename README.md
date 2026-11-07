# Everybird

A lifetime of birds. Everybird turns a birder's life list into a sticker collage. Import an eBird export or an iNaturalist username, or tick birds off by hand, and your list is laid out as a collage you can filter, edit and share.

Your list never leaves your browser. The only network calls that carry user input are iNaturalist API requests (a username and place IDs). A share link carries the whole list in the link itself.

Live at https://everybird.yusuftaleb.com (share links, link previews and the share images' footer use this origin, `src/lib/share/origin.ts`).

## Pages

- **Collage** (`/`): your collage with the dock (Collage/List, True size, Scientific, search), filters, bird cards and Share. Without a list on the device it shows a sample.
- **Settings** (`/settings`): your sources (eBird files, iNaturalist, tick by hand), the match report, counting rules, and downloads, backup and restore.
- **About** (`/about`): how it works, privacy and every credit.
- **Shared view** (`/s/[token]`): a read-only collage from a share link. The old `/make`, `/my` and `/credits` redirect to Settings, Collage and About.

Light by default, with a sun/moon toggle in the top bar. The design system is in `DESIGN.md`.

## Run it

```
npm install
npm run dev        # http://localhost:3000 (use -p for another port)
npm test           # Vitest unit tests
npm run e2e        # Playwright (first time: npx playwright install chromium)
npm run data       # rebuild the species and geo data (see below)
```

## Rebuilding the data

The generated files in `public/data/` are committed, so you only need this to update a source. The pipeline needs
the raw sources in `data/raw/` (git-ignored) and the stickers repo checked out next to this one as
`../everybird-stickers` (or set `STICKERS_OUT`). In order:

1. `npx tsx scripts/build-data/fetch-sources.ts`: downloads the eBird taxonomy, huashu-bird-sticker, Natural Earth and iso-codes into `data/raw/` and writes `data/raw/manifest.json`.
2. `npm run data`, which runs:
   1. `copy-synonyms.ts`: publishes `data/inat-synonyms.json`.
   2. `build-species.ts`: `species.v1.json` and `taxonomy.v1.json` (masses from AVONET, `data/overrides.json` first).
   3. `build-geo.ts`: `regions.v1.json` (country and province names).
   4. `build-stickers.ts`: the 128/384 webp stickers into `../everybird-stickers/v1/`, the masks and each species' `ar` (must follow build-species).
   5. `link-index.ts`: appends new codes to `data/link-index.json` (append-only, so old share links keep working).
3. `npx tsx scripts/build-data/check-stickers.ts`: decodes every sticker and lists any broken file (rebuild those with `build-stickers.ts --codes a,b`).

## Data sources and licences

- **Stickers:** [huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker), CC BY 4.0. Credited wherever stickers appear.
- **Taxonomy:** eBird/Clements checklist, used for species names and codes. Every source, with its licence, is also listed on the in-app credits (About, `/about#credits`).
- **Body masses:** [AVONET](https://doi.org/10.1111/ele.13898) (CC BY 4.0) via huashu's species table, with a few sourced overrides in `data/overrides.json`.
- **Regions:** place names from Natural Earth (public domain) and [Debian iso-codes](https://salsa.debian.org/iso-codes-team/iso-codes) ISO 3166-2 data (LGPL-2.1), used for names only.
- **Fonts:** Satoshi and Cabinet Grotesk from [Fontshare](https://www.fontshare.com) (loaded from their CSS, not bundled), and Geist Mono via `next/font/google`.

## Licence

MIT, (c) 2026 Yusuf Taleb. See `LICENSE`. Stickers are CC BY 4.0 (huashu-bird-sticker) and the vendored Stageshow subset in `src/components/about/stageshow/` is MIT (its LICENSE beside it).
