# Everybird

Every bird you've ever seen. Everybird turns a birder's life list into a sticker collage. Import an eBird export or an iNaturalist username, or tick birds off by hand, and your list is laid out as a collage you can filter, edit and share.

Your list never leaves your browser. The only network calls that carry user input are iNaturalist API requests (a username and place IDs).

## Run it

```
npm install
npm run dev        # http://localhost:3000
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
   3. `build-geo.ts`: `country-dots.v1.json` and `regions.v1.json`.
   4. `build-stickers.ts`: the 128/384 webp stickers into `../everybird-stickers/v1/`, the masks and each species' `ar` (must follow build-species).
   5. `link-index.ts`: appends new codes to `data/link-index.json` (append-only, so old share links keep working).
3. `npx tsx scripts/build-data/check-stickers.ts`: decodes every sticker and lists any broken file (rebuild those with `build-stickers.ts --codes a,b`).

## Data sources and licences

- **Stickers:** [huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker), CC BY 4.0. Credited wherever stickers appear.
- **Taxonomy:** eBird/Clements checklist, used for species names and codes. Every source, with its licence, is also listed on the in-app credits page (`/credits`).
- **Body masses:** [AVONET](https://doi.org/10.1111/ele.13898) (CC BY 4.0) via huashu's species table, with a few sourced overrides in `data/overrides.json`.
- **Regions:** place names from Natural Earth (public domain) and [Debian iso-codes](https://salsa.debian.org/iso-codes-team/iso-codes) ISO 3166-2 data (LGPL-2.1), used for names only.
- **Fonts:** Satoshi and Cabinet Grotesk from [Fontshare](https://www.fontshare.com) (loaded from their CSS, not bundled), and Geist Mono via `next/font/google`.

## Licence

MIT, (c) 2026 Yusuf Taleb. See `LICENSE`.
