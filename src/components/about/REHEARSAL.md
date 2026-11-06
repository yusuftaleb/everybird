# Rehearsal: About, "How it works" (HowItWorksStage)

Gold: `upload` (the Stageshow kit's file-dragged-from-the-desktop example). Kept: the corner-bleed composition (a desktop
column on the left, the window one gutter from the top running off the right and bottom), the file icon over its name,
the drag image that rides the arrow with a fixed grab offset and lights the drop target under it, `a.drag(..., { cursor:
'preserve' })`, and the start-of-loop picture. Changed: everything about the product. Finder became Everybird in a
browser window (the site's top bar, Settings' "Your sources" cards, the collage page with its head, the taxonomy filter
and the count in the hole); the look is the site's tokens (Paper, Surface, Hairline, Ink, Muted, Accent; Cabinet
Grotesk 700, Satoshi, Geist Mono labels; superellipse corners), and it follows the light/dark switch. The upload row
became the card's own "Reading your file… N rows" status and the "Added 197 species" banner. Borrowed from
`subscriptions`: a satellite that arrives at the beat it pays off (the share image). The filter glide is the product's
own motion (its travel curve and 0.64 s from `collage.css`), and the count ticks as the product's `Tally` does rather
than rolling digits. Cmd+Z in the gold became a real navigation (Settings in the top bar).

Beats (wide, about 14 s a loop):
1. 0.4 s: the cursor picks up `MyEBirdData.csv` on the desktop and carries it onto the eBird file card (the card lights
   in Accent, as the real drop target does); dropped, the status line reads the rows (0 to 4,812).
2. 3.4 s: "Added 197 species from your eBird export." opens with "See my collage" (the sources move down under it);
   pressed, the page swaps to the collage and the stickers arrive from the centre out while the count ticks to 197.
3. 7.4 s: Herons pressed: the order row gives way to the breadcrumb "All birds / Herons / Herons, Egrets, and Bitterns"
   (the product's FilterBar for an order with one family), the six herons glide and grow into the middle, the rest step
   out, the count shows 6 over "SPECIES" (never "of 197"), held 1 s. "All birds" in the breadcrumb (the product's way
   back, and the cause of the data returning) brings everyone back while the cursor travels on to Share.
4. 9.8 s, payoff: Share pressed; the share image comes up on the desktop, straddling the window's left edge, one gutter
   from the bottom, and holds 2.3 s. It is the product's centre-count post (cardLayout in `src/lib/share/image.ts`):
   "Sam Reyes" on top, sixteen stickers packed around "197 / SPECIES", the latest lifer row (the Tricolored Heron's
   sticker and name), a hairline, the wordmark (the site's address as filler) and the credit "Stickers:
   huashu-bird-sticker, CC BY 4.0" on its own line, as the product sets it when it doesn't fit beside the wordmark.
5. Reset with a cause: Settings in the top bar; the window swaps back to Your sources and the image leaves with the
   collage. The banner and the row count were put back while Settings was out of sight; the collage is cleared after it
   has faded. The cursor returns to rest beside the file, where the next loop picks it up.

Compact (under 560 px of column, 358 × 356): no desktop, so no tinted field either: the window sits on the page itself
(transparent stage, the window's hairline and the ground shadow), inset 16 at the top and left, off the right and
bottom; so "Choose your eBird file" is pressed instead of the drag (phones choose files; the drop hint is hidden on touch
in the product too); the chips drop "Perching birds" (on phones the product shows the "Choose an order" picker instead); the breadcrumb sets
at 12 px so it fits; all six herons show (before H1 the Black-crowned Night Heron was wide-only, so the phone showed five
birds under "6"); the share image comes up over the window on the share dialog's scrim, as the product presents it.

Poster (reduced motion, thumbnails): the collage made (197) with the share image beside it and the file still on the
desktop: file in, collage, image out, readable without motion.

## Smoothness (H1, 2026-11-06)

Profiled at 4× CPU in Chromium (DevTools trace, two loops from mount) and in WebKit (rAF pacing; Playwright's WebKit has
no CPU throttle). What ran on the main thread, and what changed:
- Bird animations were not composited: each bird had a `transform` transition and a `translate` keyframe arrival on one
  element, which Chromium rejects as incompatible (compositeFailed 64, 110 times in two loops) and runs on the main
  thread. Each bird is now two elements (place on the outer, arrival on the inner), one transform property each. The
  share image's `translate` + `scale` became one `transform`; the pages' `visibility` step went (opacity alone hides).
- Layout every frame: the banner and the row status opened with the kit's `Collapse` (`grid-template-rows`), laying out
  the whole Settings column per frame. The banner now opens over the column (opacity and a short drop) while the
  sources move down by a transform; the status line keeps its height and only its words fade.
- The drag rendered the whole scene per frame (`a.put` inside the drag's `flushSync`) and hit-tested with
  `elementFromPoint`. The drag image is now moved by a direct style write and the drop card is lit from its measured
  rect, so the drag beat's script time fell from about 157 ms to 18 ms per loop at 4×.

Main-thread work per loop at 4× (Chromium trace, 1280 wide, mean of four loops each, before = main): tasks 1,139 → 797
ms, script 429 → 266 ms, paint 457 → 251 ms, layout 68 → 29 ms, layouts 336 → 230, paints 965 → 777; animations that
fell back to the main thread (compositeFailed 64) 110 → 0 in two loops. At 390 (one loop): tasks 563 → 418 ms, layouts
331 → 224, paint 320 → 152 ms. Frame pacing (rAF, headless, two loops): no dropped frames before or after in Chromium at
4× or in WebKit on this machine; rAF can't see compositor misses, so the trace is the measure.
- The counters write text only when the shown number changes, in `contain: strict` boxes (the count, the status line).
- `will-change` only where it pays: the two pages and the share image (each arrives whole), the drag image (moves every
  frame), and the small things that land on a transform (the banner, the sources, the breadcrumb, the Share button),
  which the film's "lands on a transform" line asked for. The buttons and the drag image's inner box lost theirs.
- Fewer things in flight: on a filter the silhouettes only fade (stickers still shrink as they step out).

## No overlaps

The positions live in `how-it-works-data.ts`. Every sticker's drawn box (from its `ar` in species.v1.json, contained
in its square) clears every other by at least 2 px, and the count's hole, in the collage (all birds, wide and compact,
and Herons chosen) and in the share image; no real sticker sits under the share image's column on the wide stage. The
share image's collage was packed centre-out around the hole by a greedy packer; the collage's hand placement was nudged
apart. The check (and the packer) are scratch scripts, not part of the repo; rerun one if a position changes.

## Captured

Headless Chromium via the kit's `film.mjs`, against a production build of the branch (sticker server on 4982):
`--states` and the loop at 1280 and 390, posters (reduced motion) at both widths, a 40 ms close-up of the drag.

Film: `--gate` ends `rehearsal passed` on the wide loop, `--states` at both widths and the 390 loop. Left, judged in the
frames: `same-box content change` and `jump: span` on the ticking count and row status (the product's own Tally tick,
intended); `half-pixel glyph` on the card titles' icons while the sources move (an 18 px box; the glyph's ink is 17 px,
the move ends on whole pixels); `inconclusive` coverage from sampling gaps in headless Chrome.

Fixed on the way (H1): a cut sticker peeking from under the share image (the Tricolored Heron and the Great Egret
moved right of its column), the breadcrumb and the order row overlapping mid-swap (the outgoing row now leaves first),
the cursor covering "All birds" as it pressed (it aims under the label), the share image 17 px from the bottom edge
(one gutter now), the share image's "197" over "SPECIES" and its credit under the wordmark too tight.

Review: no fresh-eye reviewer (subagents were ruled out); mine, against `verify.md` and the frames above.

Assumptions: "Sam Reyes", 4,812 rows and the Tricolored Heron as the latest lifer are invented; the 197 total, 112
perching birds, 21 waterfowl and six herons are a believable list, not anyone's real one. Sticker codes are public
taxonomy codes. Stickers load from the configured sticker base (`NEXT_PUBLIC_STICKER_BASE`), so the demo needs the
stickers site to be live (Task 25) in production.

Unresolved: the share image's small text is set larger than its true scale (a 180 px picture of a 1080 px image), and
its "Latest lifer" label and the site's address are filler bars. The collage page leaves out the controls bar (Collage
/ List, True size, Scientific, search, and the Places and Time dropdowns) for room; the demo never showed the old
controls either (no Play, no year chips, no map). The collage shows 17 stickers under "197" (a miniature, as before).

Not checked: real devices and touch, Firefox, headed Safari over a long run (headed WebKit windows were throttled by the
OS once covered, for the old and new demo alike, so its long runs measure the window manager, not the page), toggling
reduced motion during playback, a theme switch mid-loop, and the demo with the production stickers site (not live yet).
