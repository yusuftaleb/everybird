# Product

## Platform
Web (Next.js 16 app router, React 19), mobile first, works from 320px.

## Stack
Next.js, React, Web Workers for layout and import parsing, IndexedDB/localStorage for the list, and Vitest. Live on Cloudflare Workers (OpenNext) at https://everybird.yusuftaleb.com; stickers and generated data on Cloudflare R2; Cloudflare Web Analytics and a Cloudflare Worker with D1 (`workers/stats`) for anonymous counts and a private Access-protected dashboard. Playwright specs are retained for Yusuf; agents run code checks only.

## Users
Birders with a life list (eBird or observation.org export, iNaturalist username, or ticking by hand) who want to see and share it. Phone first; shared links are opened by non-birders too.

## Product Purpose
Turn any birder's life list into a sticker collage they can filter, edit and share. Success: a first-time birder sees their own collage within a minute and posts it.

## Positioning
Yusuf's personal-site design language as a standalone app; the collage page mirrors his /lifelist.

## Operating Context
Operate mode. The list never leaves the browser; share links carry the whole list.

## Capabilities and Constraints
Stickers are huashu-bird-sticker (CC BY 4.0) and must be credited wherever they appear. Fonts load from Fontshare, never committed. Personal data (private/) is never committed. The landing sample is a made-up demo birder (generated, seeded), never anyone's real list. Anything outward-facing needs Yusuf's yes first.

The interface supports English, Spanish, Brazilian Portuguese and Dutch. Smart search and Filters narrow the collage; sharing supports vertical and horizontal images, links and A4–A1 posters. Stats days follow America/Vancouver after the documented November 2026 cutover. Search titles/descriptions are localized, the homepage declares the Everybird site name, and sample-list text is excluded from snippets.

## Brand Commitments
Light by default with a toggle; one accent; the "match /lifelist" principle; Yusuf credited on About and in the footer.

## Evidence on Hand
Spec `docs/superpowers/specs/2026-11-05-everybird-design.md`, the original plan (in the git history), `docs/validation.md`, DESIGN.md.

## Product Principles
Birds lead, interface recedes. Plain words. Private by default. Honest about what was and was not counted.

## Accessibility & Inclusion
Keyboard and screen-reader usable collage, 44px targets, reduced motion, AA contrast in both themes.
