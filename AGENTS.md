# Everybird: agent instructions

Everybird turns any birder's life list into a sticker collage. Read these before any work:

- **Spec (approved by Yusuf, 2026-11-05):** `docs/superpowers/specs/2026-11-05-everybird-design.md`
- **Plan (25 tasks):** `docs/superpowers/plans/2026-11-05-everybird.md`

## Rules

- **Never commit personal data.** `private/` holds Yusuf's real eBird exports and his `lifelist.json`, and it's git-ignored. Test fixtures must be synthetic. Never commit coordinates, checklist comments or anything copied from those files.
- **Credit the stickers** wherever they appear, including share images: "Stickers: huashu-bird-sticker, CC BY 4.0", linking https://github.com/alchaincyf/huashu-bird-sticker.
- **Never commit the font files** for Satoshi and Cabinet Grotesk. Load them from Fontshare's CSS.
- **Read-only references** in Yusuf's website repo (`/Users/yusuf/orca/projects/personal_website/framer-site/`): `code-components/LifeList.tsx`, `code-components/PlacesMap.tsx`, `scripts/lifelist/*.py` and `HANDOFF.md` ("Life list v4" to "v7.7"). Don't edit that repo.
- **Ask Yusuf first, every time,** before anything outward-facing: creating GitHub repos, pushing, enabling GitHub Pages, creating or deploying the Vercel project, or posting anything. That's plan Task 25.
- **Keep this file current** as commands and structure change.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Commands

- `npm run dev`: Next dev server (port 3000)
- `npm test`: Vitest unit tests (`tests/**/*.test.{ts,tsx}`; node by default, add `// @vitest-environment jsdom` for component tests). `tests/pack.test.ts` packs 5,000-bird lists on all three layouts (about 20 s); `SKIP_PERF=1` skips only the timing bounds
- `npm run e2e`: Playwright specs in `e2e/` (starts the sticker server on `127.0.0.1:4100` and `next dev` on port 3100 with `NEXT_PUBLIC_STICKER_BASE=http://127.0.0.1:4100`; set `BASE_URL` to test a deployed URL instead). A `next dev` already running on 3100 is reused as is, so start it with that variable or stop it first.
- `npm run stickers:serve`: serves `../everybird-stickers` (or `$STICKERS_DIR`) with CORS on `127.0.0.1:4100` only (or `$PORT`), for dev: run it next to `NEXT_PUBLIC_STICKER_BASE=http://127.0.0.1:4100 npm run dev`. Without the variable the app loads stickers from `https://yusuftaleb.github.io/everybird-stickers` (not live until Task 25). Script: `scripts/dev/serve-stickers.mjs`.
- `npm run data`: rebuild `public/data/*` from `data/raw/` (`scripts/build-data/`)
- `data/inat-synonyms.json` (iNaturalist sci name to eBird code, reasons in `inat-synonyms.notes.md`): `npm run data` publishes it via `scripts/build-data/copy-synonyms.ts` to `public/data/inat-synonyms.v1.json`.
- `npx tsx scripts/build-data/build-stickers.ts [--force]`: trimmed 128/384 webp stickers into `${STICKERS_OUT:-../everybird-stickers}/v1/` (a separate git repo, never pushed from here), masks into `public/data/masks/<Order>.v1.json`, and the `ar` values in `species.v1.json`. Resumable: skips codes whose two webp files exist (`--force` regenerates). **Run it after `build-species`** (`npm run data` does). build-species carries existing `ar` over by code, but species new to the file keep `ar: 1` until build-stickers runs.
- `npx tsx scripts/build-data/build-sample.ts [lifelist.json]`: rebuilds `public/data/sample.v1.json` (the landing demo) from the PUBLIC website list `framer-site/content/lifelist/lifelist.json`, keeping only code, YYYY-MM and `{country, sub1}`. Never point it at `private/`. Not part of `npm run data`. Yusuf approves the file before launch.
- `npm run lint`, `npm run build`

## Structure

- `app/`: Next.js app router (layout, pages). Imports styles via `@/styles/...`.
- `app/page.tsx` renders `components/app/Home` (thin). `src/components/app/`: `Home` (landing until there is a list, then `CollagePage`), `CollageView` (stats, view tabs, True size, filters, collage or list, legend, card; shared by the landing demo `SampleDemo` and the birder's page), `use-collage-layout.ts` (one layout client per mounted collage, layout class from width, idle prefetch), `RestoreBackup`, `SiteFooter` (sticker credit; Task 24 adds /credits there). `src/components/import/`: `ImportPanel` (the three ways in), `EbirdDrop`, `InatForm`, `AddBirds`, `MatchReport`, `RulesSwitches`, `SpeciesSearch`. `src/components/edit/EditBird.tsx` (marks and remove, in the bird card).
- `src/`: `lib/` (species, import, list, layout, share), `components/` (`collage/`: `Collage` stage with keyboard and motion, `Bird`, `Tally`, `TrueSizeSwitch`, `collage-motion.ts` style writer, `collage-hit.ts` silhouette hit-testing, `collage.css`), `styles/` (`tokens.css` holds the design tokens, `globals.css` the base styles). The `@/*` alias maps to `./src/*`.
- `tests/`: Vitest unit tests; `tests/fixtures/` are synthetic only.
- `e2e/`: Playwright specs.
- `data/`: hand-kept overrides and synonyms; `data/raw/` is git-ignored. `public/data/`: generated JSON the app loads.
- `scripts/build-data/`, `scripts/validate/`: data build and validation scripts.
- `private/`: Yusuf's real files. Git-ignored. Never read from tests or commit.
- Fonts: Satoshi and Cabinet Grotesk load from Fontshare in `app/layout.tsx`; Geist Mono via `next/font/google`.
