# Rehearsal: About, "How it works" (HowItWorksStage)

Gold: `upload` (the Stageshow kit's file-dragged-from-the-desktop example). Kept: the corner-bleed composition (a desktop
column on the left, the window one gutter from the top running off the right and bottom), the file icon over its name,
the drag image that rides the arrow with a fixed grab offset and lights the drop target under it, `a.drag(..., { cursor:
'preserve' })`, and the start-of-loop picture. Changed: everything about the product. Finder became Everybird in a
browser window (the site's top bar, Settings' "Your sources" cards, the collage page with its head, the Orders chips and
the count in the hole); the look is the site's tokens (Paper, Surface, Hairline, Ink, Muted, Accent; Cabinet Grotesk
700, Satoshi, Geist Mono labels; superellipse corners), and it follows the light/dark switch. The upload row became the
card's own "Reading your file… N rows" status and the "Added 197 species" banner. Borrowed from `subscriptions`: a
satellite that arrives at the beat it pays off (the share image). The filter glide is the product's own motion (its
travel curve and 0.64 s from `collage.css`), and the count ticks as the product's `Tally` does rather than rolling digits.
Cmd+Z in the gold became a real navigation (Settings in the top bar).

Beats (wide, about 15 s a loop):
1. 0.4 s: the cursor picks up `MyEBirdData.csv` on the desktop and carries it onto the eBird file card (the card lights
   in Accent, as the real drop target does); dropped, the status reads the rows (0 to 4,812).
2. 3.4 s: "Added 197 species from your eBird export." opens with "See my collage"; pressed, the page swaps to the
   collage and the stickers arrive from the centre out while the count ticks to 197.
3. 7.4 s: Herons pressed: the six herons glide and grow into the middle, the rest step out, "6 of 197 species". Pressed
   again (the product's way to clear a chosen chip), everyone comes back.
4. 10.6 s, payoff: Share pressed; the share image (post format: "Sam Reyes", "197 species", the stickers, the wordmark and
   "Stickers: huashu-bird-sticker, CC BY 4.0") comes up on the desktop, straddling the window's left edge, and holds 2.3 s.
5. Reset with a cause: Settings in the top bar; the window swaps back to Your sources and the image leaves with the
   collage. The banner and the row count were put back while Settings was out of sight; the collage is cleared after it
   has faded. The cursor returns to rest beside the file, where the next loop picks it up.

Compact (under 560 px of column, 358 × 356): no desktop, so "Choose your eBird file" is pressed instead of the drag
(phones choose files; the drop hint is hidden on touch in the product too); the chips drop "Perching birds"; the share
image comes up over the window on the share dialog's scrim, as the product presents it.

Poster (reduced motion, thumbnails): the collage made (197) with the share image beside it and the file still on the
desktop: file in, collage, image out, readable without motion.

Captured (headless Chrome via the kit's `film.mjs`, against a copy of the repo served on :3500 with stickers on :4500):
- Contact sheets at the shown width (viewport 1280, stage at 720) and at 390 (stage at 358), 18 frames each, 1 s apart.
- `--states` at both widths (every mark, settled and +0.7 s).
- Close-ups at 50 to 90 ms: the drop, the page swap to the collage, the Herons glide, the share arrival, the loop seam.
- Reduced motion (the poster) at 1280 and 390, light and dark; the dark theme poster at 1280.
- The slot height before and after load: 470 px at a 720 column, 356 px at 358 (no layout shift).

Film:
- `--gate`: `rehearsal passed` on the wide loop, the 390 loop and `--states` at both widths. No framing, crop, inset,
  stack or icon lines remain.
- Fixed on the way: a share image covering the chips (moved below them), a "Settings" link and the Herons chip cut by
  the compact crop (top bar sized to the visible column, one chip dropped), a compact window taller than wide (stage
  height 356, so what shows is square), the count's box moving as the number changed width (a fixed 140/104 px box, as
  the product's `.eb-mid`), a snap that cut the share image's entrance (the hidden Settings reset moved earlier), the
  cursor not ending where it started, dead air at the seam (shorter opening wait, rest point next to the file), a
  blank frame in the page swap (the two pages now overlap).
- Candidates left, judged in the frames: `same-box content change` on the ticking count and row status (the product's
  own Tally tick, intended); `jump: span "0".."9"` on the ticking digits (text, not geometry); `steps in its box` on the
  nav link as its weight changes 500 → 600 (a hidden bold copy holds its width; the glyphs thicken, nothing travels);
  one font-swap jump on the file name in the first 50 ms of a cold page (fonts from Fontshare; on the real page the
  demo mounts later, when it nears the viewport); `inconclusive` coverage from 27 to 43 ms sampling gaps in headless
  Chrome.

Review: the skill asks for a fresh-eye reviewer; this task ruled out subagents, so the review was mine, against
`verify.md` and the `upload` gold still, from the frames above. What I checked: one hero window, one satellite; the
window bleeds right and bottom with one gutter; no plate behind a whole window; real words only on the story (Your
sources, eBird file, its button and status, the banner, My collage, Share, three chips, the count, the share image);
filler is Bar lines in the cards and the product's silhouette fallback at the collage's edges; stickers only where the
eye lands. Differences from the gold: busier (five beats to its three), and the lower desktop column is empty until the
share image arrives, as the gold's desktop is below its file.

Assumptions: "Sam Reyes" and 4,812 rows are invented; the 197 total, 18 visible stickers and six herons are a
believable list, not anyone's real one. Sticker codes are public taxonomy codes. Stickers load from the configured
sticker base (`NEXT_PUBLIC_STICKER_BASE`), so the demo needs the stickers site to be live (Task 25) in production.

Unresolved: the share image's credit line is 6 px at the wide size (it is a picture of the image; the page credits the
stickers in words right under the demo and in the footer). The dock (Collage/List, True size) is left out of the
collage page for room.

Not checked: real devices and touch, Safari and Firefox (headless Chromium only), live frame pacing on a slow machine,
toggling reduced motion during playback, a theme switch mid-loop (the stage re-reads `data-theme` and takes the new
tokens; not filmed), and the demo with the production stickers site (not live yet).
