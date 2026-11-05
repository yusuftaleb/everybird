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
- `npm test`: Vitest unit tests (`tests/**/*.test.{ts,tsx}`; node by default, add `// @vitest-environment jsdom` for component tests)
- `npm run e2e`: Playwright specs in `e2e/` (starts `next dev` on port 3100; set `BASE_URL` to test a deployed URL instead)
- `npm run data`: rebuild `public/data/*` from `data/raw/` (`scripts/build-data/`)
- `npm run lint`, `npm run build`

## Structure

- `app/`: Next.js app router (layout, pages). Imports styles via `@/styles/...`.
- `src/`: `lib/` (species, import, list, layout, share), `components/`, `styles/` (`tokens.css` holds the design tokens, `globals.css` the base styles). The `@/*` alias maps to `./src/*`.
- `tests/`: Vitest unit tests; `tests/fixtures/` are synthetic only.
- `e2e/`: Playwright specs.
- `data/`: hand-kept overrides and synonyms; `data/raw/` is git-ignored. `public/data/`: generated JSON the app loads.
- `scripts/build-data/`, `scripts/validate/`: data build and validation scripts.
- `private/`: Yusuf's real files. Git-ignored. Never read from tests or commit.
- Fonts: Satoshi and Cabinet Grotesk load from Fontshare in `app/layout.tsx`; Geist Mono via `next/font/google`.
