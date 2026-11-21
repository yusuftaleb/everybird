# Everybird

A lifetime of birds. Everybird turns a birder's life list into a sticker collage. Import an eBird, observation.org, iGoTerra or Scythebill export or a spreadsheet, use an iNaturalist username, or tick birds off by hand, and your list is laid out as a collage you can filter, edit and share, and also read as a list, a map or a tree of birds.

Your list never leaves your browser. The only network calls that carry user input are iNaturalist API requests (a username and place IDs). A share link carries the whole list in the link itself. Anonymous usage counts (visits, and a few actions such as a collage made or an image shared, never list contents) are sent to a stats endpoint, and Cloudflare Web Analytics counts visits without cookies; both are skipped with Do Not Track or Global Privacy Control. Pages in Russian, Japanese and Chinese load their fonts from Google Fonts.

Live at https://everybird.yusuftaleb.com (share links, link previews and the share images' footer use this origin, `src/lib/share/origin.ts`). It is served by a Cloudflare Worker (OpenNext); the release steps are in `AGENTS.md`.

## Pages

- **My birds** (`/`): your collage under a head with "Add birds" (one dialog for every import and for adding by hand, opening on Import a file) and Share; the controls bar (the Collage, List, Map and Tree views (the Tree a fan of the orders that opens down to the species), each view's own one-press switches (True size, the list's sort direction, Scientific names, Lifers only and Time scale in the Tree), in the Tree the Level and Layout menus (Fan, Radial, Rectangular), in the Collage the Arrangement menu (Fit or Oval, the share images' setting too), Filters, search), the taxonomy chips (orders, families, genera), the active filter chips and bird cards (with a link to the bird's Bird Album page). Without a list on the device it shows a sample, with a short guided tour.
- **Settings** (`/settings`): your list (its sources, the match report), adding by hand, counting rules, bird names in English (in the other languages), and downloads, backup and restore, all in the page.
- **About** (`/about`): how it works, privacy and every credit.
- **Compare** (`/compare`, a tab in the top bar): paste up to five friends' share links, a name beside each (filled from the link when it carries one), or press "Compare with mine" on a shared collage, then Compare. The lists show as pills; beside the diagram (circles for two or three lists, a flower for four to six, or bars, each list in its own colour) the groups (Yet to see, Both, each list's own, Every bird) choose which birds show as a sticker grid under both. Edit lists goes back to the names and links. Share opens the site's Share dialog on the comparison: the comparison card or a wish list of the birds you've yet to see, in story, post or square, and Copy link for a link to the comparison (`/c/[token]`, read-only).
- **Shared view** (`/s/[token]`): a read-only collage from a share link. The old `/make`, `/my` and `/credits` redirect to Settings, Collage and About.

Light by default, with a sun/moon toggle in the top bar. The interface is in English, Español, Português (Brazil), Nederlands, Polski, Français, Deutsch, Italiano, Svenska and Dansk; the language menu sits in the top bar. The design system is in `DESIGN.md`.

## Current capabilities

- Smart search and one Filters panel for places, time, taxonomy and conservation status, driving every view alike (the Map has no filter of its own: it is the world's countries, with pinch or +/− to zoom and a drag to pan).
- Share on one screen, with nothing to scroll on a laptop: Share image is two presses from the collage; the other options are one plain list beside the preview, a row each with its control at the right (Fit or Oval, Light or Dark colours, the count hidden, small, medium, large or beside the title as segmented choices; switches for the latest lifer and a transparent background; a species goal for a year or all time on images), and the dialog stays pinned at its top while Export in batches or a goal opens under it. Every dropdown is in the language menu's quiet style. The latest lifer shows where it was seen (province or state and country), with its sticker on posters too. Images and posters spread the birds evenly, edge to edge. Print, beside Share, opens the same dialog on the poster, of the view on screen: the collage, or the Tree or the Map as drawn, at the paper's size (PNG and PDF); Export in batches makes a ZIP of one image, or one poster, for each group (by number of birds, family, order, place or year).
- Share images of every view (Map and Tree draw their own: the Map's the whole world under two equal totals (species and countries) with its five countries with the most species and their flags; the Tree's at the level on screen, in the layout on screen in every format, every tip named, under four equal totals (species, genera, families, orders), with its Arrangement (Fan, Radial, Rectangular; a Fan is horizontal, the others vertical), Show oldest lineage, Lifers only and Hide totals), with a transparent background and a count size option.
- Vertical/Horizontal sharing: Story 9:16 or Desktop 16:9, Post 4:5 or 5:4, and Square; print posters A4–A1 and US 12×18 to 24×36 inches in either orientation, with a quiet head (the title) and one-line foot, and species names at 18pt that read at arm's length.
- Search metadata in every language, a `WebSite` site-name declaration on the homepage, and the landing demo excluded from search snippets. Google's displayed result can lag a deployment.
- Private anonymous-usage dashboard at `https://stats.yusuftaleb.com/dashboard`, behind Cloudflare Access. Days now follow America/Vancouver; the completed 2026-11-16 transition is documented in [the stats README](workers/stats/README.md).
- Sticker updates use the weekly [huashu sync workflow](.github/workflows/README.md); uploaded files only become live when the app's updated data is merged and deployed with `npm run cf:deploy` (a push to main does not deploy).

## Run it

```
npm install
npm run dev        # http://localhost:3000 (use -p for another port)
npm test           # Vitest unit tests
npm run e2e        # Yusuf only; agents do not run browser or visual tests
npm run data       # rebuild the species and geo data (see below)
```

Agents run lint, typecheck and unit tests only (see `AGENTS.md`). Existing browser specs are retained for Yusuf.

## Rebuilding the data

The generated files in `public/data/` are committed, so you only need this to update a source. The pipeline needs
the raw sources in `data/raw/` (git-ignored) and the stickers repo checked out next to this one as
`../everybird-stickers` (or set `STICKERS_OUT`). In order:

1. `npx tsx scripts/build-data/fetch-sources.ts`: downloads the eBird taxonomy, huashu-bird-sticker, Natural Earth and iso-codes into `data/raw/` and writes `data/raw/manifest.json`.
2. `npm run data`, which runs:
   1. `copy-synonyms.ts`: publishes `data/inat-synonyms.json`.
   2. `build-species.ts`: `species.v1.json` and `taxonomy.v1.json` (masses: `data/overrides.json` first, then AVONET, then BIRDBASE by name, then the genus, family or order median).
   3. `build-names.ts`: the bird names per language (`names.*.v1.json`).
   4. `build-groups.ts`: `groups.v1.json`, the eBird species groups the smart search matches.
   5. `build-geo.ts`: `regions.v1.json` (country and province names).
   6. `build-stickers.ts`: the 128/384 webp stickers into `../everybird-stickers/v1/`, the masks and each species' `ar` (must follow build-species).
   7. `link-index.ts`: appends new codes to `data/link-index.json` (append-only, so old share links keep working).
3. `npx tsx scripts/build-data/check-stickers.ts`: decodes every sticker and lists any broken file (rebuild those with `build-stickers.ts --codes a,b`).
4. Outside `npm run data`, when their sources change: `build-map.ts` (the Map view's shapes), `build-tree.ts` (the Tree view), `build-album.ts` (Bird Album links), `build-sample.ts` and `build-sample-pack.ts` (the landing sample); see `AGENTS.md`.
5. `npx tsx scripts/build-data/data-files.ts`: the content-hashed names of the data files, which a release uploads before deploying.

## Data sources and licences

- **Stickers:** [huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker), CC BY 4.0. Credited wherever stickers appear.
- **Taxonomy:** eBird/Clements checklist, used for species names and codes. Every source, with its licence, is also listed on the in-app credits (About, `/about#credits`).
- **Body masses:** [AVONET](https://doi.org/10.1111/ele.13898) (CC BY 4.0) via huashu's species table, with a few sourced overrides in `data/overrides.json`; and [BIRDBASE](https://doi.org/10.1038/s41597-025-05615-3) (CC BY 4.0) for the species AVONET gives no mass for. Its compact extract is `data/raw/birdbase/` (see its README).
- **Regions:** place names and the Map view's shapes from Natural Earth (public domain), and [Debian iso-codes](https://salsa.debian.org/iso-codes-team/iso-codes) ISO 3166-2 data (LGPL-2.1), used for names only; Vietnam's provinces from OCHA's COD-AB (CC BY 3.0 IGO).
- **Bird tree:** [AvesData](https://github.com/McTavishLab/AvesData) (McTavish et al.), CC BY 4.0; the full credit is on the About page.
- **Bird names:** eBird's name sets, with the IOC World Bird List v15.2 (Gill, Donsker & Rasmussen, CC BY 3.0) filling eBird's gaps in Italian, Swedish, Danish, Russian, Japanese and Traditional Chinese.
- **Fonts:** Satoshi and Cabinet Grotesk from [Fontshare](https://www.fontshare.com) (loaded from their CSS, not bundled), and Geist Mono via `next/font/google`.

## Licence

MIT, (c) 2026 Yusuf Taleb. See `LICENSE`. Stickers are CC BY 4.0 (huashu-bird-sticker) and the vendored Stageshow subset in `src/components/about/stageshow/` is MIT (its LICENSE beside it).
