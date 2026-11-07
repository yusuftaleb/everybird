# Rehearsal: About, "How it works" (HowItWorksScene, HowItWorksStage, HowItWorksPoster)

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

## Refresh (2026-11-06): the current UI, the product's packing, a poster at once

What changed, and why each label is what it is:
- Settings mirrors "Your list" as shipped (SourceLine.tsx, ImportPanel.tsx): one bordered group of quiet rows (eBird
  life list, MyEBirdData, iNaturalist, Ticked by hand), each a title over a muted sentence-case status ("Not added",
  "None yet") and one button (Add, Tick birds). The file lands in MyEBirdData: "MyEBirdData · MyEBirdData.csv", "112
  species · 3 skipped why? · Imported 6 Nov", Replace and the ⋯ menu. The section's note ("Combine any of these into one
  list.") gives way to the summary line, "Your collage has 112 species, all from eBird." and "See my collage". The old
  "Added 197 species" banner, the uppercase mono status and the cards with descriptors are gone.
- The collage page: the page head with the title verbatim ("My collage": the list has no title yet), Add birds and
  Share; the stats line ("112 species · 7 orders · 31 families · since Mar 2019", "6 of 112 species · 1 family" on
  Herons); the controls bar (view tabs, True size, Scientific, Places and Time dropdowns, search; on phones the short
  labels and Places and Time on row two); the order chips wrapped (seven orders adding up to 112; on phones the "Choose
  an order 7" picker and its sheet).
- The birds are the product's own packing (scripts/build-data/build-howto.ts writes how-it-works-data.ts): packBest
  with the order masks, painted-area sizes (relSizes: the Great Blue Heron's long tile beside the compact Great Horned
  Owl), the count's hole from its text (collageHole), and Herons chosen as the product packs a filtered state (rel over
  the whole list, refBase). The share images are cardLayout + packFrame + fitPack, so the hole and the footer are the
  product's. tests/howto-data.test.ts fails if the file drifts from the packer, if a sticker's mask paints on the count
  or on another bird, or if the chips stop adding up; e2e/about.spec.ts checks the drawn pixels against the count.
- Share opens the share dialog in the window (both designs): the preview (one 4:5 box, the image letterboxed), Story /
  Post / Square with their ratios (icons and ratios dropped in the compact column, as the product does under 420 px),
  the collage title field and the three actions. The image is the centre-count card without a name (the collage has no
  title): stickers around "112 / SPECIES", "LATEST LIFER · OCT 2026" over Tricolored Heron, a hairline, the wordmark and
  "everybird.yusuftaleb.com · stickers by huashu" on one line. The old separate credit line is gone (the credit stays
  under the figure).
- The landing ("A lifetime of birds.") isn't in the story: the scene starts on Settings, as before.

Beats (wide, about 17 s a loop):
1. 0.4 s: the cursor picks up `MyEBirdData.csv` on the desktop and carries it onto the eBird rows, which ring in
   Accent as the real drop target does; dropped, the status line reads the rows (0 to 4,812).
2. 3.4 s: MyEBirdData connects and the summary line appears; "See my collage" is pressed and the page swaps to the
   collage: the stickers arrive from the centre out while the count ticks to 112.
3. 7.4 s: Herons pressed: the chips give way to the breadcrumb "All birds / Herons / Herons, Egrets, and Bitterns" (an
   order with one family), the six herons glide and grow into the middle, the rest step out, the count shows 6 over
   "SPECIES" (never "of 112"); "All birds" brings everyone back.
4. 10 s, payoff: Share; the dialog opens on Story, then Post and Square are pressed and the preview follows.
5. Reset with a cause: ✕ closes the dialog, Settings in the top bar takes the window back; the collage is cleared
   after it has faded. The cursor returns to rest beside the file.

Compact (under 560 px of column, 358 × 356): no desktop: the window sits on the page itself, inset 16; "Add" on
MyEBirdData opens its panel and "Choose your eBird file" is pressed (phones choose files); the stats line is left out
for room; the orders are the "Choose an order" picker, whose sheet rises over a scrim and takes the Herons press.

Poster: the collage made (112, every sticker), the file on the desktop. It is the figure's first frame for everyone
and the whole figure under reduced motion.

## Shows at once (2026-11-06)

- HowItWorksPoster is server-rendered in the slot's fixed height: both designs in the HTML, the slot's width picking
  one (a container query, the stage's own 560 px rule) and scaling it (calc(100cqw / 720px) where the browser divides
  lengths, Chromium and WebKit; a measured --k in Firefox). Layout and text are there with the HTML.
- Stickers: every demo sticker is the 128 px file (stickerUrl with sv), so the poster's 24 files are small and shared
  by every state; the six biggest are preloaded from the head (react-dom preload) with a preconnect to the sticker
  host; the rest start as the poster's HTML parses. Each fades in as it loads (data-ld), set before hydration by the
  head's STICKER_READY_SCRIPT (src/lib/sticker-ready.ts, a capture-phase load listener), so stickers don't wait for the
  page's JavaScript.
- The live stage's code loads after the page's load event, at an idle moment. In view (35%), once the poster's
  stickers are decoded (or 3 s) and after a 0.6 s hold, the stage mounts under the poster and the poster fades out as
  the story starts. It pauses off screen and in a hidden tab as before; under reduced motion it never mounts.

Measured (time-to-first-visible, Chromium, Slow 4G: 562.5 ms latency, 1.4 Mbps down, cache disabled, production build,
median of three; "text" is the slot showing the scene with text, "stickers" every sticker of the shown frame drawn):
| Scroll to the figure | Width | Motion | Before: text | Before: stickers | After: text | After: stickers |
|---|---|---|---|---|---|---|
| Right after load (from navigation) | 1280 | default | 6.29 s | 11.47 s (the loop's collage beat) | 1.48 s | 3.98 s |
| Right after load (from navigation) | 1280 | reduced | 6.30 s | 9.05 s | 1.48 s | 3.98 s |
| Right after load (from navigation) | 390 | default | 6.33 s | 10.07 s | 1.48 s | 3.98 s |
| Right after load (from navigation) | 390 | reduced | 6.29 s | 8.60 s | 1.49 s | 4.01 s |
| 8 s after load, from the credits (from the scroll) | 1280 | default | 1.56 s | 6.72 s | 0.05 s | 0.05 s |
| 8 s after load, from the credits (from the scroll) | 1280 | reduced | 1.55 s | 4.02 s | 0.04 s | 0.04 s |
| 8 s after load, from the credits (from the scroll) | 390 | default | 1.55 s | 5.28 s | 0.04 s | 0.04 s |
| 8 s after load, from the credits (from the scroll) | 390 | reduced | 1.56 s | 3.67 s | 0.04 s | 0.04 s |

1.48 s is when the slot's HTML has arrived (the page's first bytes take about that long on this network); the
"after" stickers are all 24 of the poster's. The measuring script polls every frame in the page
(`checkVisibility({ opacityProperty: true })` on the slot's stages and stickers).

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

Since the refresh the positions are the product's packing (`scripts/build-data/build-howto.ts`, see above): no
sticker's painted mask touches another's or the count's hole, in the collage (wide and compact, all birds and Herons
chosen) and in the three share images. `tests/howto-data.test.ts` checks the masks and that the file matches the
packer; `e2e/about.spec.ts` checks the drawn stickers' pixels against the count's text in both engines. (Boxes may
cross where a sticker's transparent corner sits beside the text, as in the product.)

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

Assumptions: the list is invented (112 species in seven orders, 4,812 rows, three skipped, imported 6 Nov, the
Tricolored Heron the latest lifer in Oct 2026), not anyone's real one; the collage has no title, so the share image has
no name. Sticker codes are public
taxonomy codes. Stickers load from the configured sticker base (`NEXT_PUBLIC_STICKER_BASE`), so the demo needs the
stickers site to be live (Task 25) in production.

Unresolved: the share image's small text (the lifer row, the footer) is set 1.25 to 1.5 times its true scale so it
reads as text in a 168 px preview. The collage and the images show 24 stickers under "112" (a miniature: the packing is
the product's for these 24). The compact page leaves out the stats line for room.

Not checked: real devices and touch, Firefox, headed Safari over a long run (headed WebKit windows were throttled by the
OS once covered, for the old and new demo alike, so its long runs measure the window manager, not the page), toggling
reduced motion during playback, a theme switch mid-loop, and the demo with the production stickers site (not live yet).
