---
name: Everybird
description: Every bird you've ever seen, as a sticker collage. Yusuf's personal-site design system (the /lifelist look) in a standalone app.
colors:
  ink: "#1e1e24"
  paper: "#f6f4ef"
  accent: "#92140c"
  muted: "#5f5f69"
  line: "#857f74"
  hairline: "#dedad2"
  surface: "#ebe8e1"
  ink-dark: "#ffffff"
  paper-dark: "#1e1e24"
  accent-dark: "#f06a5f"
  muted-dark: "#a9a9b2"
  line-dark: "#6e6e78"
  hairline-dark: "#3d3d45"
  surface-dark: "#28282f"
typography:
  display:
    fontFamily: "Cabinet Grotesk, Satoshi, system-ui, sans-serif"
    fontSize: "clamp(44px, 9vw, 72px)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Cabinet Grotesk, Satoshi, system-ui, sans-serif"
    fontSize: "clamp(24px, 4vw, 28px)"
    fontWeight: 700
    lineHeight: 1.15
  body:
    fontFamily: "Satoshi, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.45
  label:
    fontFamily: "Geist Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "12px"
    fontWeight: 500
    letterSpacing: "0.06em"
rounded:
  chip: "8px"
  control: "12px"
  card: "16px"
  panel: "20px"
spacing:
  gutter: "16px"
  gutter-wide: "32px"
  stack: "12px"
  section: "56px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 18px"
  button-quiet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    height: "32px"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.chip}"
    height: "44px"
    padding: "8px 12px"
---

# Design System: Everybird

Recorded from the shipped code (2026-11-05, HEAD 7ca2c44): `src/styles/tokens.css`, `globals.css`, the component CSS, `collage-motion.ts`, `src/lib/share/image.ts`. Where the code and an intention differ, this file says what the code does and flags the gap under "Known gaps".

## Overview

**Creative North Star: "The Sticker Sheet on Warm Paper"**

Everybird is an Operate surface (a tool that does one job) wearing Yusuf's personal-site clothes. The birds are the only colour and the only illustration; everything else is warm paper, near-black ink, one deep red and hairlines. The interface recedes so the collage leads.

**The match-/lifelist principle.** The collage page mirrors Yusuf's `/lifelist` (read-only reference: `framer-site/code-components/LifeList.tsx`, `PlacesMap.tsx`): the same dock, the same filter chips (no icons on filter chips), the same card (layout C), the same list rows, the same search (copied from his Photography page), the same motion constants. When the two differ, `/lifelist` wins unless Yusuf says otherwise. Do not "improve" a shared pattern on one side only.

**Key Characteristics:**
- Light by default, never the OS setting; dark only by the visitor's toggle.
- Flat: hairline borders, no shadows at rest. Shadows exist only on floating things (card, tooltip, results list, toast, sheet).
- One accent (a deep red) for selection, focus and the primary action. Rarity is the point.
- Superellipse corners, 44px touch targets, 16px gutters, everything works at 320px.
- Mono uppercase labels for numbers and meta; Cabinet Grotesk for display; Satoshi for everything else.
- The pages are Collage (`/`), Settings (`/settings`), About (`/about`), plus the shared view `/s/[token]`.

## Colors

Seven tokens, two themes, nothing else. `tests/tokens.test.ts` keeps `tokens.css` and `SHARE_COLORS` (share image) equal.

| Token | Light | Dark | Role |
|---|---|---|---|
| Ink | #1e1e24 | #ffffff | Text, the count, icons |
| Paper | #f6f4ef | #1e1e24 | Page and floating-surface background; text on Accent |
| Accent | #92140c | #f06a5f | Primary button, selected chip border, selected tab text, focus ring, links in notes, errors |
| Muted | #5f5f69 | #a9a9b2 | Secondary text, counts on chips, mono labels, placeholder |
| Line | #857f74 | #6e6e78 | Input borders, checkbox borders, switch track outline, hover borders |
| Hairline | #dedad2 | #3d3d45 | Every divider and resting border |
| Surface | #ebe8e1 | #28282f | Chips, quiet buttons, fields, selected tab, disabled fill |

- **Theme mechanism.** `:root` is light; `:root[data-theme=dark]` overrides. There is no `prefers-color-scheme` rule. `src/lib/theme.ts` stores the choice per device (`localStorage` `everybird:theme`); `THEME_SCRIPT` in `<head>` sets `data-theme` before first paint. Share images follow the current theme.
- **The One Voice Rule.** Accent marks "this one": the selected chip, the current tab, the primary action, the focus ring. Never decoration, never two accents.
- **The Quiet Disabled Rule.** Disabled is Surface fill, Hairline border, Muted text. Never a paler Accent (it reads as a new colour).
- **The Contrast Rule.** Muted on Paper and Accent on Paper meet AA in both themes. Map country opacity starts at .6 so the lowest step is 3:1 on Paper.
- Scrims are `rgb(0 0 0 / .28)`. Shadows are black at 8%/4%.

## Typography

**Display:** Cabinet Grotesk 700. **Body:** Satoshi (500 base, 600/700 for emphasis). **Mono:** Geist Mono via `next/font/google` (`--font-geist-mono`). Satoshi and Cabinet Grotesk load from Fontshare's CSS and are never committed (also drawn on the share canvas via the same families).

### Hierarchy (as shipped)
- **Page title** (Cabinet 700, `clamp(36px,7vw,56px)` on Settings/About pagehead; `clamp(44px,9vw,72px)` for `.eb-title`, line-height .95, -0.02em): page heads.
- **Collage hero / head** (Cabinet 700, `clamp(28px,4vw,42px)` landing hero; `clamp(24px,4vw,40px)` the birder's "<name>'s birds").
- **Section heading** `.eb-h2` (Cabinet 700, `clamp(24px,4vw,28px)`, 1.15).
- **The count** `.eb-num` (Cabinet 700, `--f` x 1cqw, line-height .85, tabular numerals): the species number at the centre of the collage.
- **Card name** (Cabinet 700 18px; scientific name in Satoshi 600 italic 16px, `lang` attribute set).
- **Body** (Satoshi 500, 14px in the collage view, 15-16px elsewhere, 1.45-1.5; notes 14px Muted; ledes 16-17px Muted, max 640-720px).
- **Label** `.eb-mono` (Geist Mono 500, 12px, +0.06em, uppercase, Muted, tabular numerals): stats, dates, mass, status lines, footer.
- **Fields** are 16px so iOS does not zoom.
- **Scientific names** are italic and `lang`-tagged; they lead in the card, tooltip, list rows, order and family chips and the breadcrumb when "Scientific" is on.

## Layout

- Page container `.eb-page`: max 1152px, 16px gutters (32px from 720px), vertical gap 40px (56px from 720px); collage page 16/24px.
- Collage block `.eb-view`: one column, 12px between stats line, dock, filters and stage (LifeList's rhythm).
- Breakpoints actually used: 320/359 (top bar squeezes), 480, 560 (compact demo), 600 (filters become one "Choose an order" button + sheet), 720 (gutters, hero in a row), 820 (list rows collapse), 880 (three source cards; Places puts chips left of the map, capped 280px).
- The dock responds to its own width with container queries (460, 400, 330px): tab labels hide, "Scientific" shortens, the switch tightens.
- Touch targets 44px (chips are 32px with a 44px `::after` hit area; nav links 40px, 36-40px on phones).
- Stage: positions in % of stage width (`cqw`); the stage height eases to the group's height.

## Elevation & Depth

Flat by default. Depth is hairline borders and the Surface tint. Floating things only get one shadow: `0 12px 32px rgb(0 0 0 / .08), 0 2px 6px rgb(0 0 0 / .04)` (bird card, tooltip, search results, toast); the phone sheet uses `0 -8px 32px rgb(0 0 0 / .12)` over a .28 scrim.

**The Flat-At-Rest Rule.** No shadow on anything that does not float over the page.

## Shapes

**The Squircle Rule.** Corners are superellipses: `border-radius: calc(R * var(--one-if-corner-shape-supported, .566)); corner-shape: superellipse(2)`. The variable is 1 where `corner-shape` is supported and .566 (LifeList's fallback factor) where not. Radii in use: chip/field 8, nav link/button 12, result row 10, theme toggle 14, card/dock-adjacent panels/popovers 16, source card/sheet/tick panel 20. Circles (switch knob) and the 56px list thumbs are exempt.

Silhouette hit-testing (`collage-hit.ts`) makes a sticker clickable only where it is opaque.

## Components

### Buttons
- Primary `.eb-btn`: Accent fill, Paper text, 44px high, 12px squircle, Satoshi 700 15px, icon 18px. Big variant 52px / 17px (hero CTA). Hover (fine pointers only): opacity .88.
- Quiet `.eb-btn-quiet`: Surface, Hairline border, Ink, 500; hover border Line. Danger: Accent text; confirm uses Accent solid.
- Text button `.eb-textbtn`: underlined with a Hairline underline, 36px.
- On phones the Share/Add actions collapse to 44px icon buttons under 480px.

### Dock (controls bar, signature)
One row, 4px padding, Hairline border, 16px, Paper background. Left: Collage/List tabs (site icons from `collage/icons.tsx`, 20px). Right: True size (collage) or Heaviest/Lightest first (list), Scientific (italic), the search magnifier. Resting tabs at 66% opacity; pressed tab: full opacity, Accent text, Surface fill, 600. Search turns the dock into a "Find a bird" field (tabs and tools fade to 0 and go inert); results drop under it at full width, whole list searched, in-filter hits first, the rest under "Elsewhere on the list"; picking a species shows its tooltip and a brief Accent ring.

### Chips and filters
`.eb-chip`: 32px, Surface, 1px Hairline, 8px squircle, 14px 500, muted count with tabular numerals, **no icon**. Selected: border Accent. Once a level has a choice, its other chips drop to 70% opacity; pressing the selected chip clears it. Mono rank label ("Order", "Family") leads each row; the breadcrumb ("All birds / Perching birds / Crows") has the current place in Accent 600. Tabs (Places, Time) are 36px, 10px radius, same pressed treatment as the dock. Under 600px a level is one button ("Choose an order 18", 44px, 12px) opening a bottom sheet of wrapped chips. Hover (fine pointers) raises the border to Line.

### Switches
Track 34x20 (30x18 in a narrow dock), Surface with a Line inset ring; knob 14px Muted. On: track Accent, knob Paper, knob travels 14px. 150ms ease-out. Settings rows (`.eb-setgroup`) make the whole row the switch: label 16/500, Muted note 14px, a live count, one 16px-radius bordered group split by Hairlines, min height 64px.

### Cards and tooltip
Bird card `.eb-card`: Paper, Hairline, 16px squircle, 12px 14px padding, max 300px, layout C (name top-left, mono mass top-right, mono date and place lines, "Mark as" and remove actions). On phones it is a bottom sheet (20px radius, 8px insets, 72vh). Opens in 150ms fade (sheet 320ms rise). The tooltip uses the card's look, `aria-hidden`, no pointer events, shown on mouse hover, keyboard `:focus-visible` or a search pick. List rows: 56px thumb, name, mass, place, date; Hairline between rows; collapse under 820px.

### Fields
`.eb-input`: 44px, Surface, 1px Line border, 8px squircle, 16px text; selects share it inside `.eb-select` with a Muted chevron mask; invalid is an Accent border. One shared field style everywhere.

### Source cards (Settings)
`.eb-way`: 20px squircle, Hairline; one anatomy: icon (Phosphor, Accent, 22px) + title, a sentence, one 44px control row, a muted line. Three columns from 880px. Drop target turns the border Accent and the fill Surface.

### Top bar
`.eb-topbar`: Hairline bottom border, one row at every width down to 320px, min height 60px (64 from 720). Wordmark "Everybird" (Cabinet 700 22px), then Collage / Settings / About (40px, 12px squircle, 66% opacity; `aria-current="page"`: Accent text, Surface fill, Hairline border), then the sun/moon theme toggle (44px, role switch, "Dark mode"). Sizes step down at 480 and 359px. Footer on every page: mono credit line, "All credits", "Made by Yusuf Taleb".

### Share image
1080x1920 story and 1080x1350 post, drawn on canvas in the current theme: name (Cabinet 700 56px, optional), count ("197 species", Cabinet 96px), filter in words (Satoshi 500 32px, Accent), the collage (no sticker wider than 22% of it; a missing sticker is a thin Line outline), a Hairline rule, "Latest lifer: <name> · <Mon YYYY>" (Satoshi 32px), then the Everybird wordmark and URL left and the sticker credit right (22px). The story keeps 250px clear at top and 340px at bottom for app chrome. The link-preview card (`/s/[token]/opengraph-image`) is 1200x630: at most 60 birds, the count at 120px with "species" on its baseline, the latest lifer and its date on separate lines.

## Motion

Source of truth: `src/components/collage/collage-motion.ts` (ported from LifeList).

| Name | Value | Use |
|---|---|---|
| TRAVEL | `cubic-bezier(.45,0,.1,1)`, 640ms | A kept bird moving to its new place; stage height easing |
| EASE_OUT (arrive) | `cubic-bezier(.25,.8,.25,1)`, 480ms starting at 160ms | An arriving bird grows from `translate(12%,12%) scale(.76)` and fades in; card and hover lift |
| EASE_IN | `cubic-bezier(.4,0,1,1)`, 180ms | A leaving bird shrinks and fades |
| Ripple | 0 to 120ms by distance from the count | Delay of each bird's move; first appearance ripples over 0-480ms |
| UI ease | `cubic-bezier(.16,1,.3,1)` 150-320ms | Chips, switches, sheets, breadcrumb rise (`translateY(-4px)`) |
| Tab opacity | `cubic-bezier(.25,.1,.25,1)` 250ms | Dock/nav/tab resting to pressed |

- **Compositor only.** Birds move by writing CSS variables (`--x --y --k --md`) and animating `translate`/`scale`/`opacity`; unchanged values are skipped; big changes are written in chunks over several frames (cost units: WRITE_START 100, WRITE_MIN 50, WRITE_MAX 800); birds out of the viewport skip their animation.
- **The 1,500 rule.** Above 1,500 visible birds (`CROSSFADE_AT`) a change is a 200ms opacity fade instead of travel (`data-fast`, `data-many`).
- **Reduced motion.** `prefers-reduced-motion` gets the same 200ms fade, no travel, no growth, no stage height easing, no switch transitions; UI transitions go to `none`; sheets and breadcrumbs fade only. About's demo shows its poster.
- Hover/press affordances only under `(hover: hover) and (pointer: fine)`.
- The About demo pauses off screen and in a hidden tab, and follows the site theme.

## Iconography

Two sets, never mixed within a control. The site's own 256-grid glyphs (`collage/icons.tsx`: Collage, List, direction arrow, close, filter lines, search; stroke 16-18, round caps) for the dock, list and filters. Phosphor (`@phosphor-icons/react`, regular weight, Check bold) for Settings, share and card actions (Binoculars, CheckSquareOffset, FileCsv, LockSimple, ShareNetwork, DownloadSimple, LinkSimple, Trash, ArrowRight). Sizes 16/18/20/22. Always `aria-hidden`. **Filter chips carry no icon** (the "Mark as" check and match-report check use `.eb-chip-icon` on their own buttons, not on filter chips). The old photo-or-recording mark (a small circle) is removed from the UI; the data is kept.

## Imagery and credit

Stickers are huashu-bird-sticker (CC BY 4.0), trimmed webp at 128 and 384px, hosted separately (`NEXT_PUBLIC_STICKER_BASE`), shown at their natural aspect (`ar`) with `object-fit: contain`. A sticker that fails to load falls back to a bird silhouette (Phosphor Bird path, 72% of the tile) in Line. **The credit rule:** "Stickers: huashu-bird-sticker, CC BY 4.0", linked to https://github.com/alchaincyf/huashu-bird-sticker, appears wherever stickers appear: footer on every page, under the About demo, and in every share image. Sticker size encodes body mass (the "True size" switch); the order's mask shapes the packing.

## Voice and copy

- Plain words, second person, short sentences: "Every bird you've ever seen." "Make yours." "This link didn't open."
- Say what happened and what to do next; name the not-counted entries in plain words.
- Sentence case everywhere; mono labels are the only uppercase (by CSS).
- No em dashes in UI copy (none ship in components); no exclamation marks, no emoji, no hype.
- Numbers are exact and formatted ("197 species", "Sep 2026"); the filter is described in words on share images.
- Privacy is stated plainly: the list never leaves the browser. Analytics records only three events and never counts, names or places.
- Attribution is part of the voice: About opens its credits with "Made by Yusuf Taleb".

## Accessibility

- Focus ring: 2px Accent, offset 2px, on `:focus-visible` everywhere; inside scaled birds the ring is divided by the scale so it is 2px at any size.
- 44px targets; the page works at 320px and with 200% text.
- Collage birds are real buttons with names; keyboard moves between birds, Enter/Space opens the card, Esc closes; exiting birds get `aria-hidden`.
- The country map has a screen-reader country list that is never a Tab stop; the tooltip is `aria-hidden` (the card and focus carry the content).
- Switches are `role=switch` with `aria-checked`; tabs and pressed states are real ARIA.
- Search results are a listbox with `aria-selected`; Esc or the close button returns focus to the magnifier.
- Decorative demo is `aria-hidden` with a visually hidden caption (`.eb-sr`).
- Reduced motion and the 1,500-bird fade as above. Colour never carries meaning alone (selected = border + position + weight).

## Pages

- **Collage `/`**: the birder's collage when the device holds a list, else the Landing with the pre-packed sample (hero: h1, one lede, "Make yours"). Head: "<name>'s birds" or "My collage", "Add birds" and Share in one row; stats line, dock, filters, stage, legend. Shared view `/s/[token]` is the same view read-only with "Make yours".
- **Settings `/settings`**: "Your sources" (eBird, iNaturalist, tick by hand as a page-wide multiselect), the match report, "Counting rules" switches, "Keep your list" (CSV, JSON backup, restore, forget); privacy footnote last.
- **About `/about`**: what Everybird is, the animated how-it-works demo, True size, privacy, every credit under `#credits`, "Made by Yusuf Taleb".
- Old `/make`, `/my`, `/credits` redirect to `/settings`, `/`, `/about#credits`.

## Do's and Don'ts

### Do:
- **Do** copy `/lifelist` exactly for shared patterns, and use the seven tokens through `var(--...)`.
- **Do** use the Squircle Rule for every new rounded surface and 44px targets.
- **Do** keep Accent for selection, focus and the primary action only.
- **Do** write the credit wherever a sticker appears.
- **Do** honour reduced motion and the 1,500-bird fade in anything that animates many birds.

### Don't:
- **Don't** add icons to filter chips, shadows at rest, a second accent, gradients, or `prefers-color-scheme`.
- **Don't** commit font files, personal data or coordinates, or ship the photo-or-recording mark.
- **Don't** animate layout properties on birds (translate/scale/opacity only).
- **Don't** put em dashes, emoji or exclamation marks in copy.

## Known gaps (code versus the rules above)

- The dock (16px), dock tabs and switch (12px), tabs (10px), phone level button (12px) and card focus radii use plain `border-radius` without the squircle expression. Most match `/lifelist`'s own plain radii, so left alone; the Squircle Rule above applies to new surfaces.
- AGENTS.md's Commands section is long; it is the working reference, this file is the visual reference.
