# Product

## Platform
Web (Next.js 16 app router, React 19), mobile first, works from 320px.

## Stack
Next.js, React, Web Workers for layout and import parsing, IndexedDB/localStorage for the list, Playwright and Vitest, Vercel (not yet deployed).

## Users
Birders with a life list (eBird export, iNaturalist username, or ticking by hand) who want to see and share it. Phone first; shared links are opened by non-birders too.

## Product Purpose
Turn any birder's life list into a sticker collage they can filter, edit and share. Success: a first-time birder sees their own collage within a minute and posts it.

## Positioning
Yusuf's personal-site design language as a standalone app; the collage page mirrors his /lifelist.

## Operating Context
Operate mode. The list never leaves the browser; share links carry the whole list.

## Capabilities and Constraints
Stickers are huashu-bird-sticker (CC BY 4.0) and must be credited wherever they appear. Fonts load from Fontshare, never committed. Personal data (private/) is never committed. The landing sample is a made-up demo birder (generated, seeded), never anyone's real list. Anything outward-facing needs Yusuf's yes first.

## Brand Commitments
Light by default with a toggle; one accent; the "match /lifelist" principle; Yusuf credited on About and in the footer.

## Evidence on Hand
Spec `docs/superpowers/specs/2026-11-05-everybird-design.md`, plan `docs/superpowers/plans/2026-11-05-everybird.md`, `docs/validation.md`, DESIGN.md.

## Product Principles
Birds lead, interface recedes. Plain words. Private by default. Honest about what was and was not counted.

## Accessibility & Inclusion
Keyboard and screen-reader usable collage, 44px targets, reduced motion, AA contrast in both themes.
