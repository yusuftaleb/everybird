---
name: Everybird
description: A lifetime of birds, as a sticker collage. Yusuf's personal-site design system (the /lifelist look) in a standalone app.
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
  line-dark: "#76767f"
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

Recorded from the shipped code (as of 2026-11-05): `src/styles/tokens.css`, `globals.css`, the component CSS, `collage-motion.ts`, `src/lib/share/image.ts`. Where the code and an intention differ, this file says what the code does and flags the gap under "Known gaps".

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
| Line | #857f74 | #76767f | Input borders, checkbox borders, switch track outline, hover borders |
| Hairline | #dedad2 | #3d3d45 | Every divider and resting border |
| Surface | #ebe8e1 | #28282f | Chips, quiet buttons, fields, selected tab, disabled fill |

- **Theme mechanism.** `:root` is light; `:root[data-theme=dark]` overrides. There is no `prefers-color-scheme` rule. `src/lib/theme.ts` stores the choice per device (`localStorage` `everybird:theme`); `THEME_SCRIPT` in `<head>` sets `data-theme` before first paint. Share images follow the current theme.
- **The One Voice Rule.** Accent marks "this one": the selected chip, the current tab, the primary action, the focus ring. Never decoration, never two accents.
- **The Quiet Disabled Rule.** Disabled is Surface fill, Hairline border, Muted text. Never a paler Accent (it reads as a new colour).
- **The Contrast Rule.** Muted on Paper and Accent on Paper meet AA in both themes. Line, the border that must be seen (fields, the switch's off-track ring in the dock and Settings rows, checkboxes, the dropzone), meets 3:1 (WCAG 1.4.11) against both grounds it sits on: light 3.61:1 on Paper and 3.25:1 on Surface; dark 3.69:1 on Paper and 3.25:1 on Surface (`tests/tokens.test.ts` checks all four). Dark Line was #6e6e78 (2.9:1 on Surface) until 2026-11-06, when Yusuf asked for 3:1 on grey; lifting the one token, rather than adding a border token, keeps every Line use (hover borders, the on-list tick box, empty-month ticks) one step above Hairline in both themes. Hairline stays decorative (dividers, resting borders) and is not held to 3:1.
- **Browser surfaces.** Selected text is tinted with Accent (`::selection`: Accent mixed 22% into transparent, text keeps its colour) and text carets are Accent (`caret-color` on inputs and textareas), in both themes (`globals.css`).
- Scrims are `rgb(0 0 0 / .28)`, except the first-visit welcome's, `.12`, so the sample stays in view behind it. Shadows are black at 8%/4% (Elevation below).

## Typography

**Display:** Cabinet Grotesk 700. **Body:** Satoshi (500 base, 600/700 for emphasis). **Mono:** Geist Mono via `next/font/google` (`--font-geist-mono`). Satoshi and Cabinet Grotesk load from Fontshare's CSS and are never committed (also drawn on the share canvas via the same families).

### Hierarchy (as shipped)
- **Page title** `.eb-pagehead-title` (Cabinet 700, `clamp(32px,5vw,48px)`, line-height 1.05, -0.02em): one page head (`PageHead`) for Collage, Settings and About, on a `.eb-page-titled` page: the same top offset (24px, 40px from 720px) and gap to the content (24px, 32px from 720px) on all three. `.eb-title` (`clamp(44px,9vw,72px)`, .95) is not used by the page heads.
- **Collage hero / head** (Cabinet 700, `clamp(28px,4vw,42px)` landing hero; `clamp(24px,4vw,40px)` the birder's collage title, verbatim, or "My collage").
- **Section heading** `.eb-h2` (Cabinet 700, `clamp(24px,4vw,28px)`, 1.15).
- **The count** `.eb-num` (Cabinet 700, `--f` x 1cqw, five digits at 85% (`--fs`), line-height .85, tabular numerals) over the 12px `.eb-mono` "SPECIES", 6px below: the species number at the centre of the collage, in a hole the packer keeps empty around exactly this text (`src/lib/layout/count-box.ts`: the shown count's width from measured glyph advances, the label at the layout's narrowest stage, grown by 0.17 F with round corners), so no sticker ever sits on "1,089" and a three-digit count's hole is where the old ellipse was. Change the type here and in count-box.ts together. The collage's geometry is CSS px of its container only, never the reader's text size: a bigger text size grows the labels around it and the count's label, capped at 1.25x (15px) and clamped to what the hole holds (`labelBounds`; under page zoom it shrinks with the stage); the number is in cqw and stays put, so text size never repacks the collage.
- **Card name** (Cabinet 700 18px; scientific name in Satoshi 600 italic 16px, `lang` attribute set).
- **Body** (Satoshi 500, 14px in the collage view, 15-16px elsewhere, 1.45-1.5; notes 14px Muted; ledes 16-17px Muted, max 640-720px).
- **Label** `.eb-mono` (Geist Mono 500, 12px, +0.06em, uppercase, Muted, tabular numerals): stats, dates, mass, status lines, footer.
- **Fields** are 16px so iOS does not zoom.
- **Scientific names** are italic and `lang`-tagged; they lead in the card, tooltip, list rows, order and family chips and the breadcrumb when "Scientific" is on.

## Layout

- Page container `.eb-page`: max 1152px, 16px gutters (32px from 720px), vertical gap 40px (56px from 720px); collage page 16/24px.
- Collage block `.eb-view`: one column, 12px between stats line, dock, filters and stage (LifeList's rhythm).
- Breakpoints actually used: 320/359 (top bar squeezes), 480, 560 (compact demo), 600 (filters become one "Choose an order" button + sheet; the controls bar is always two rows: view icons, "True" / "Sci." (or "Heaviest") and the magnifier, then Places and Time), 720 (gutters, hero in a row), 820 (list rows collapse), 880 (three source cards). The controls bar answers to its own width: under 820px the Places and Time buttons take a second row, under 600px they split it evenly at 36px (44px hit areas), so the landing's birds keep most of a phone's first screen; its inset is 4px all round (above the tabs, either side of the Hairline, under the buttons). Row one (tabs, tools, magnifier) never breaks: icon tabs under 460px of bar, short labels ("True", "Sci.", "Heaviest") under 540px, tighter under 330px and 310px (36px icon buttons with 44px presses).
- The dock responds to its own width with container queries (460, 540, 330 and 310px): tab labels hide, "Scientific" shortens, the switch tightens.
- Touch targets 44px (chips are 32px with a 44px `::after` hit area; nav links are drawn 40px, 36-40px on phones, and text buttons 36px, each with a 44px `::after` hit area; the theme switch keeps a 44px hit area when drawn at 40 or 36px; the Places and Time panels' Clear is a text button with the same 44px press). `e2e/flows.spec.ts` checks every page at its sampled widths in all three engines.
- Stage: positions in % of stage width (`cqw`); the stage height eases to the group's height.
- Stage growth: a list too big for the starting stage (wide 1120×700, medium 700×800, narrow 350×900 layout units) grows it taller, never wider, until the median sticker is 48px (wide), 40px (medium) or 30px (narrow) at the layout's width, up to 2:3 (narrow: twice its start). The spiral follows the grown stage's aspect, so a mid-size list (the 548-species sample on desktop) is a round-to-tall cluster around the count, not a wide oval; lists whose median sticker already meets the new floor on the starting stage keep their layouts (the 20/100/200-bird checks); lists that met only the old floors (wide about 200–380 species, medium 200–300, narrow 200–250) now grow a little taller.

## Elevation & Depth

Flat by default. Depth is hairline borders and the Surface tint. Floating things only get one shadow: `0 12px 32px rgb(0 0 0 / .08), 0 2px 6px rgb(0 0 0 / .04)` (bird card, tooltip, search results, toast, the Places and Time popovers, and the share dialog over its .28 scrim); the phone sheet uses `0 -8px 32px rgb(0 0 0 / .12)` over a .28 scrim. Everything else is an inset ring (the switch track). The share dialog had its own heavier `0 16px 48px / .18` until 2026-11-06, when Yusuf brought it in line. `tests/tokens.test.ts` fails on any other shadow in the app's CSS (About's demo scene excepted: it draws its own Stageshow depth).

**The Flat-At-Rest Rule.** No shadow on anything that does not float over the page.

**Layers** (the page's z-index ladder, tokens in `tokens.css`). In-page layers stay under 40 and inside their own blocks: the stage's birds (2-4), the controls bar (3) with its search results (8) and the Places and Time popovers (9), the tooltip (30), Tick by hand's sticky bar (2). Over the page, in order: the top bar `--z-topbar` 40; the share dialog's and bird card's scrims `--z-dialog-scrim` 49; the bird card (popover or sheet) `--z-dialog` 50; the undo toast `--z-toast` 60; the phones' bottom sheets (Places, Time, PickerSheet) `--z-sheet-scrim` 950 / `--z-sheet` 951; the first-visit welcome `--z-welcome` 955. A new layer takes a token and a place on this ladder, not a new number. The top bar is under every dialog, scrim, sheet and the toast; it never covers a popover because the popover's controls bar is kept clear of it on open.

## Shapes

**The Squircle Rule.** Corners are superellipses: `border-radius: calc(R * var(--one-if-corner-shape-supported, .566)); corner-shape: superellipse(2)`. The variable is 1 where `corner-shape` is supported and .566 (LifeList's fallback factor) where not. Radii in use: chip/field 8, nav link/button 12, result row 10, theme toggle 14, card/dock-adjacent panels/popovers 16, source card/sheet/tick panel 20. Circles (switch knob) and the 56px list thumbs are exempt.

Silhouette hit-testing (`collage-hit.ts`) makes a sticker clickable only where it is opaque.

## Components

### Welcome
The first visit to `/` with no list (`Welcome.tsx`): one Cabinet 700 line (24px, 22px on phones), "Make mine" (primary, arrow) and "Explore the sample" (quiet), a 44px ✕ top-right. From 601px a 400px card centred over the sample (Paper, Hairline, 20px squircle, the floating shadow); at 600px and under the phones' bottom sheet with full-width buttons. It rises 16px over 320ms on the UI ease; reduced motion fades only.

### Buttons
- Primary `.eb-btn`: Accent fill, Paper text, 44px high, 12px squircle, Satoshi 700 15px, icon 18px. Big variant 52px / 17px (hero CTA). Hover (fine pointers only): opacity .88.
- Quiet `.eb-btn-quiet`: Surface, Hairline border, Ink, 500; hover border Line. Danger: Accent text; confirm uses Accent solid.
- Text button `.eb-textbtn`: underlined with a Hairline underline, 36px drawn, a 44px hit area.
- On phones the Share/Add actions collapse to 44px icon buttons under 480px.

### Dock (controls bar, signature)
One row (two under 820px of bar: the Places and Time buttons below a Hairline), 4px padding, Hairline border, 16px, Paper background. Left: Collage/List tabs (site icons from `collage/icons.tsx`, 20px). Right: True size (collage) or Heaviest/Lightest first (list), Scientific (italic), the Places and Time dropdowns, the search magnifier. Resting tabs at 66% opacity; pressed tab: full opacity, Accent text, Surface fill, 600. Search turns the dock into a "Find a bird" field (tabs and tools fade to 0 and go inert); results drop under it at full width, whole list searched, in-filter hits first, the rest under "Elsewhere on the list"; picking a species shows its tooltip and a brief Accent ring.

### Chips and filters
`.eb-chip`: 32px, Surface, 1px Hairline, 8px squircle, 14px 500, muted count with tabular numerals, **no icon**. Selected: border Accent. Once a level has a choice, its other chips drop to 70% opacity; pressing the selected chip clears it. Mono rank label ("Order", "Family") leads each row; the breadcrumb ("All birds / Perching birds / Crows") has the current place in Accent 600. Taxonomy (orders, then families) is the only filter outside the controls bar; Places and Time are the bar's dropdowns (below). The taxonomy is the same on every page (the landing's sample included): from 600px the rank label and chips wrapping onto as many rows as they need, as /lifelist's; nothing scrolls sideways. The Time dropdown holds the timeline: a strip of months (at least 6px each; a run of 12 or more empty months, such as the years between a lone early lifer and regular birding, collapses to two months' width marked by a slanted break on the baseline; the strip scrolls sideways only below that, with no scrollbar: an edge with more beyond it fades; it opens on the latest months), a bar per month of new species (Muted inside the chosen range, Hairline outside, empty months a baseline tick; a square-root scale over the busiest month with a 12% floor, so one species is a clear bar beside a big trip's month), the range as a Surface band between two handles (a 16px Paper knob ringed in Accent, and once a range is chosen an Accent line through the bars; 44px hit areas that never overflow the strip, sliders for the keyboard), and mono years under it (where they fit). Nothing else: no trip brackets or country labels (removed 2026-11-06, Yusuf: on a big list they filled the panel with a cascade of flags; a trip is a Places country plus a Time range). A mono readout leads ("Mar 2020 to Jun 2021 · 178 species"), wrapping between its parts, never inside a date; once a range is chosen, Clear sits at the head's right, as the Places panel's (the same text button, 36px drawn, a 44px press), and resets the range to the whole span. Under 600px a level is one button ("Choose an order 18", 44px, 12px) opening a bottom sheet of wrapped chips. Hover (fine pointers) raises the border to Line.

### Places and Time dropdowns
Two buttons in the controls bar between Scientific and the search (`FilterDropdowns.tsx`): a Phosphor glyph (GlobeHemisphereWest, CalendarBlank, 18px), the label, a caret (Phosphor CaretDown, turning up when open), the dock tab's 44px height and resting 66% opacity. Open: the pressed tab's Surface fill. Filtering: Accent text, full opacity, 600, and the label says what: "Places · 2" (countries checked; the accessible name lists them, "Places: Canada, Egypt") or "Time · 2022–2024" ("2022" within a year, "Sep 2021" for one month, "from 2022", "to 2024"; spoken in full months). The buttons are the only place a place or time filter shows: there are no pills or removable chips for them. One panel at a time; a second tap, Esc or a press outside closes it and focus returns to the button; filters apply live. From 600px the panel is a popover under the bar (Paper, Hairline, 16px squircle, the floating shadow; Places 380px wide at the bar's right, Time the bar's full width); under 600px a bottom sheet (portalled to the body, modal, a close button). **Places** is a checklist of countries, never provinces or counties: each row a real checkbox (18px, Line border, Accent when checked with a Paper tick), the country's flag, the name (600 when checked), the species seen there in Muted; 44px rows, a Surface hover; sorted by count, then name; several may be checked (species seen in any of them); "Countries · N" and Clear head it (Clear once a country is checked); a "Find a country" field from 9 countries (the app's one field, `.eb-input` with the site's 16px lens). A list whose places are all lifer places says so in a Muted note at the top: "Showing where each lifer was first seen. Add MyEBirdData or iNaturalist for full country lists.", or for a MyEBirdData import saved before seen-here "Import Download My Data again for full country lists." (the link in Accent, to Settings). **Time** is the timeline (above). The bar keeps four groups at even gaps: view tabs | True size, Scientific | Places, Time | search (4px inside a group, 12px between).

### Flags
Countries carry flag-icons' 4x3 SVG flags (MIT, as yusuftaleb.com's places), imported so they are served from this origin: an `<img>` 18×13px, 2px corners, `object-fit: cover`, never shrinking, `alt=""` (the name is always beside it). No flag for a code the set lacks. Used in the Places checklist.

### Switches
Track 34x20 (30x18 in a narrow dock), Surface with a Line inset ring; knob 14px Muted. On: track Accent, knob Paper, knob travels 14px. 150ms UI ease `cubic-bezier(.16,1,.3,1)`. Settings rows (`.eb-setgroup`) make the whole row the switch: label 16/500, Muted note 14px, a live count, one 16px-radius bordered group split by Hairlines, min height 64px.

### Cards and tooltip
Bird card `.eb-card`: Paper, Hairline, 16px squircle, 12px 14px padding, max 300px, layout C (name top-left, mono mass top-right, mono date and place lines, "Mark as" and remove actions). /lifelist's palette and hierarchy: Paper, Hairline border, the one floating shadow; the name Ink (Cabinet 18px); the scientific name, mass, date and place Muted (mass, date and place Geist Mono 12px). The actions sit under a full-width Hairline and stay quiet: the mark toggles are outlined chips (no Surface fill on the card), their symbols Muted, a set mark an Accent border and check; "Remove from my list" is the card's only Accent (#92140c light, #f06a5f dark) with a faint Accent underline. On phones it is a bottom sheet (20px radius, 8px insets, 72vh). Opens in 150ms fade (sheet 320ms rise). The tooltip uses the card's look, `aria-hidden`, no pointer events, shown on mouse hover, keyboard `:focus-visible` or a search pick. List rows: 56px thumb, name, mass, place, date; Hairline between rows; collapse under 820px.

### Fields
`.eb-input` (in `styles/globals.css`, so it is styled on every page): 44px, Surface, 1px Line border, 8px squircle, 16px text, Muted placeholder, the global Accent focus ring; selects share it inside `.eb-select` with a Muted chevron mask; invalid is an Accent border. A search field wraps it in `.eb-input-wrap` with the site's lens (`SearchIcon`, 16px Muted at 12px, text from 40px, as Photography's search) and turns off the browser's search look (no pill, no native lens or clear button). One shared field style everywhere: Settings' fields, the bird search and the Places panel's "Find a country".

### Source cards (Settings)
Settings > Your list (quiet rows + menu, Yusuf 2026-11-06): one bordered group (Paper, Hairline, 16px squircle), a row per source split by Hairlines, 12px 16px padding, at least 68px. Left, two lines: the title (Satoshi 600 16px, plus " · file name" or " · username" in 500 once connected) over a Muted status sentence in the body font, 14px, sentence case, never uppercase mono ("Not added", "576 observations · 10 skipped why? · Updated 6 Nov"; each part kept on one line). "why?" is an Accent underlined text button with a 44px press; it opens the skipped entries under the row on Surface (12px squircle). Right: one quiet `.eb-btn-sm` (Add, Replace, Refresh, Tick birds) and, once connected, a square ⋯ quiet button (40px, 44 on touch) opening a menu popover under it at the row's right (Paper, Hairline, 16px squircle, the floating shadow, 4px inset, items 44px Satoshi 500 15px with a Surface highlight on focus and hover, Remove in Accent last; z 9; a 160ms rise, none with reduced motion). Nothing else on the row: Add opens the source's panel under it (Surface, 12px squircle, up to 640px: the guidance in Ink, eBird's `.eb-dropzone` (Paper, 1.5px dashed Line, 12px squircle) holding the primary "Choose your eBird file" and "or drop it here" (fine pointers only), or the username field and "Fetch my birds", then the "How do I…?" text-button disclosure). A dragged file rings the eBird rows in Accent and turns the drop zone's border Accent. Tick by hand is a disclosure: the list grows in (grid rows 0fr to 1fr, .32s; instant with reduced motion).

### Top bar
`.eb-topbar`: Hairline bottom border, one row at every width down to 320px, min height 60px (64 from 720). Wordmark "Everybird" (Cabinet 700 22px), then Collage / Settings / About (40px, 12px squircle, 66% opacity; `aria-current="page"`: Accent text, Surface fill, Hairline border), then the sun/moon theme toggle (44px, role switch, "Dark mode"). Sizes step down at 480 and 359px.

**Headroom** (`src/lib/headroom.ts`, every page, the shared view included): the bar is sticky on Paper and slides up out of view (`data-hidden`, `translateY(-100%)`, 200ms on the UI ease, `--ease-ui`; instant with reduced motion) once the page has scrolled 8px down in a row past the bar's own height, and slides back on 8px of upward scroll. Always shown at the top (scrollY at most the bar's height), while a dialog, sheet or popover is open (`useHoldTopBar` in `dialog-utils.ts`: the Places and Time popovers and sheets, PickerSheet, the bird card, the share dialog, the welcome), and while focus is inside it (focus arriving shows it at once, without the slide, and the page keeps its place). iOS rubber-banding past either end counts as the edge. Transform only: it keeps its place in the flow, so hiding never changes the page's height or scroll position; hidden is not removed (no `aria-hidden`, still focusable). The Places and Time popovers open with their controls bar clear of the shown bar (the page scrolls up just enough if the bar would cover it). Anchor jumps and `scrollIntoView` land below it: `html { scroll-padding-top: var(--topbar-h) }` (61px, 65 from 720), cancelled on the bar's own controls. Cost: a passive scroll listener reading `scrollY`, one rAF per scrolled frame, an attribute write only when the state flips; no React render, no layout reads (heights from ResizeObservers). Footer on every page: mono credit line, "All credits", "Made by Yusuf Taleb", and at the row's right edge the GitHub link (Phosphor GithubLogo 18px, Muted, Ink on hover and focus, a 44px press, "Everybird on GitHub"; when the row wraps it ends the last line, never alone on the left).

### Share image
1080x1920 story, 1080x1350 post and 1080x1080 square, drawn on canvas in the current theme. The count leads, in the middle of the collage like the app's Tally and /lifelist's `.yt-ll-mid`: Cabinet 700 tabular number (up to 112px story / 104px post / 96px square, shrinking so it stays within 26% of the collage width, measured with count-box.ts's glyph widths: "1,089" 84px on the story, "11,019" 69px; -0.02em; a label in the ring, in /lifelist's proportion) over a Geist Mono 500 uppercase Muted label ("SPECIES", filtered or not: the shown count only, as /lifelist; the filter label on top gives the context), in a hole the packer keeps empty around the drawn text, the number over the label grown by 0.17 x the number's size with round corners (`countLayout`, `packFrame` hole; the link preview's `ogCountHole` holds satori's line boxes). Top: only the name (Cabinet 700 60px) and the filter in words (Satoshi 500 34px, Accent), if any; otherwise the collage takes the room. The collage: no sticker longer than 30% of its width (36% for up to 24 birds), scaled about the centre to reach its edges, so 12 birds ring the count and 1,500 fill the frame; the story's collage is tall (952 × 1,244 with a name and the latest lifer) and packed for that aspect, so it is a tall rounded cluster with the count centred in its hole, and the post's is a little taller than wide (952 × 938); on both the birds' centres may also spread vertically (story up to 1.6×, post 1.25×, above and below separately) so a short list's ring becomes a tall oval reaching the head and the latest lifer row; the square is unchanged; a missing sticker is a thin Line outline. Bottom: the latest lifer row (its sticker, a mono "LATEST LIFER · SEP 2026" label over the name in Satoshi 600 34px), a Hairline rule, then a quiet footer on one line: the Everybird wordmark (Cabinet 700 30px) and beside it one line, the URL and the sticker credit merged ("everybird.yusuftaleb.com · stickers by huashu", mono 20px Muted, down to 17px; never truncated and never without the credit: if it doesn't fit it takes its own line under the wordmark). The full credit with the licence and its link ("Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker") is the share sheet's text. Link previews end the same way: the wordmark over the same line. The story keeps 160px clear at top (the progress bar and profile row; its title starts at 184, with air under that row) and 156px at bottom (the reply bar; measured on a real Instagram story, the footer then sits about 150px of screen above "Say something"), with the name and the footer (descenders too: the story footer sits 4px higher) inside those lines; post and square use 64px margins. The story and the post keep the head, collage and lifer-row gaps tighter (40/32/24px; the square 48/40/32) so the collage takes the height. The dialog's format control (Story 9:16 / Post 4:5 / Square 1:1) puts icon, label and Geist Mono ratio on one optical line: label and ratio share the baseline, both trimmed to cap height (`text-box`), the icon centred on the label's caps, 8px gaps; the control answers to its column's width (a container query): under 420px the row spans the column and drops the icons, under 260px the ratios go too. The preview is one 4:5 box for every format, the image letterboxed in it on Surface (`object-fit: contain`), so switching format never moves the controls or changes the format control: 320px wide beside the controls (in the full 820px dialog the column keeps the icons; in a narrower one, as at a 768px window, it drops them in every format), as wide as its height cap allows when stacked under 720px. The dialog never scrolls sideways: the preview never leaves the controls less than 300px beside it (min-width 0 on the flex children). The link-preview card (`/s/[token]/opengraph-image`) is 1200x630 with the same look: at most 60 birds packed around the count (at most 72px; tiles over 140px use the 384px stickers), the name, the latest lifer row and the footer on the right.

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
- **Optimize pass (impeccable, Task Z, 2026-11-06): nothing to change.** Measured on the production build at 4× CPU throttling: filtering frames at most 33.4 ms, a held timeline drag over 1,000 species 16.8 ms, the True size switch 8.7 ms during a 200,000-row parse; the share preview shows its spinner at once. The `perf` project (`e2e/filters.spec.ts`) holds these to its budget: no task over 50 ms, no frame over 50 ms. The one known gap is the frame budget past 3,000 species, which is its own follow-up.
- The About demo pauses off screen and in a hidden tab, and follows the site theme.

## Iconography

Two sets, never mixed within a control. The site's own 256-grid glyphs (`collage/icons.tsx`: Collage, List, direction arrow, close, filter lines, search; stroke 16-18, round caps) for the dock, list and taxonomy filters. Phosphor (`@phosphor-icons/react`, regular weight, Check bold) for Settings, share and card actions (Binoculars, CheckSquareOffset, FileCsv, LockSimple, ShareNetwork, DownloadSimple, LinkSimple, Trash, ArrowRight). Sizes 16/18/20/22. Always `aria-hidden`. **Filter chips carry no icon** (the Places and Time buttons in the bar are buttons, not chips, and use Phosphor throughout; flags are images, not icons) (the "Mark as" check and match-report check use `.eb-chip-icon` on their own buttons, not on filter chips). The old photo-or-recording mark (a small circle) is removed from the UI; the data is kept.

## Imagery and credit

Stickers are huashu-bird-sticker (CC BY 4.0), trimmed webp at 128 and 384px, hosted separately (`NEXT_PUBLIC_STICKER_BASE`), shown at their natural aspect (`ar`) with `object-fit: contain`. A sticker that fails to load falls back to a bird silhouette (Phosphor Bird path, 72% of the tile) in Line. **The credit rule:** on the site, the footer's "All credits" link (→ About's `#credits`, which carries "huashu-bird-sticker, CC BY 4.0" in full, linked to https://github.com/alchaincyf/huashu-bird-sticker) and the credit under the About demo; on share images and link previews, the footer line "everybird.yusuftaleb.com · stickers by huashu"; in the share sheet's text, the full credit with the licence and link. Sticker size encodes body mass by **painted area**, not by the tile's long side: a sticker's painted area follows mass^0.4 evened out and mass^⅔ in True size, so a long-tailed or long-legged bird (little of its box painted) gets a longer tile than an upright compact one of the same mass, and a peafowl reads bigger than a cormorant (`relSizes` in `pack.ts`: long side ∝ mass^exp / √(shape / SHAPE_REF), shape = the mask's painted share of the long side's square; the median sticker keeps its size). The order's mask shapes the packing.

**No sticker:** a species huashu has no sticker of its own for (212 of 11,201 in v1) shows the no-sticker outline, never another species' sticker: Phosphor's Bird stroked thin in Line (1.5px on the page, non-scaling; 2px on share images), at 72% of its box and centred, the same on every surface (collage, list rows, card, share images; `src/lib/bird-outline.ts`). It packs as a round blob. A sticker that fails to load shows the same outline.

## Voice and copy

- Plain words, second person, short sentences: "A lifetime of birds." "Make yours." Never "seen" for the list (heard-only birds count too): "on your list". "This link didn't open."
- Say what happened and what to do next; name the not-counted entries in plain words.
- Sentence case everywhere; mono labels are the only uppercase (by CSS).
- No em dashes in UI copy (none in our components; the vendored Stageshow kit under `src/components/about/stageshow/` is excluded, and its one "—" is in a code comment, not rendered text); no exclamation marks, no emoji, no hype.
- Numbers are exact and formatted ("197 species", "Sep 2026"); the filter is described in words on share images.
- Privacy is stated plainly: the list never leaves the browser. Analytics is Cloudflare Web Analytics (cookieless visit counts) plus an anonymous counter of a few actions (visits by page, collage made, image downloaded or shared, link copied), never counts, names, species or places; a daily-changing anonymous id counts unique visitors without tracking anyone across days.
- Attribution is part of the voice: About opens its credits with "Made by Yusuf Taleb".

## Accessibility

- Focus ring: 2px Accent, offset 2px, on `:focus-visible` everywhere; inside scaled birds the ring is divided by the scale so it is 2px at any size.
- 44px targets; the page works at 320px and with 200% text. On a touch screen (`pointer: coarse`) the small buttons (`.eb-btn-sm`: Add, Replace, Refresh, Cancel, Tick birds, the ⋯ menu button) grow from 40 to 44px; `e2e/flows.spec.ts` checks that on an emulated phone.
- Collage birds are real buttons with names; keyboard moves between birds, Enter/Space opens the card, Esc closes; exiting birds get `aria-hidden`.
- The Places and Time buttons have `aria-expanded`, `aria-controls` and `aria-haspopup="dialog"`; their panels are labelled dialogs; the country checklist uses real checkboxes named "Canada, 42 species"; the tooltip is `aria-hidden` (the card and focus carry the content).
- Switches are `role=switch` with `aria-checked`; tabs and pressed states are real ARIA.
- Search results are a listbox with `aria-selected`; Esc or the close button returns focus to the magnifier.
- A source row's ⋯ (`SourceMenu.tsx`) is a menu button: `aria-haspopup="menu"`, `aria-expanded`, a `role="menu"` of `menuitem`s; Enter, Space or ArrowDown opens on the first item, ArrowUp on the last; the arrows wrap, Home and End jump; Escape closes and focus returns to ⋯; Tab or a press outside closes it. "why?" and every Add are disclosures (`aria-expanded`, `aria-controls`).
- Decorative demo is `aria-hidden` with a visually hidden caption (`.eb-sr`).
- Reduced motion and the 1,500-bird fade as above. Colour never carries meaning alone (selected = border + position + weight).

## Pages

- **Collage `/`**: the birder's collage when the device holds a list, else the Landing with the pre-packed sample, a made-up demo birder ("Sample: a demo birder's life list") (hero: h1, one lede, "Make yours"). Head: "<name>'s birds" or "My collage", "Add birds" and Share in one row; stats line, dock, filters, stage, legend. Shared view `/s/[token]` is the same view read-only with "Make yours".
- **Settings `/settings`**: "Your sources" (eBird, iNaturalist, tick by hand as a page-wide multiselect), the match report, "Counting rules" switches, "Keep your list" (CSV, JSON backup, restore, forget); privacy footnote last.
- **About `/about`**: what Everybird is, the animated how-it-works demo, True size, privacy, every credit under `#credits`, "Made by Yusuf Taleb".
- Old `/make`, `/my`, `/credits` redirect to `/settings`, `/`, `/about#credits`.

## Do's and Don'ts

### Do:
- **Do** copy `/lifelist` exactly for shared patterns, and use the seven tokens through `var(--...)`.
- **Do** use the Squircle Rule for every new rounded surface and 44px targets.
- **Do** keep Accent for selection, focus and the primary action only.
- **Do** keep the credit one link away on every page (the footer's "All credits"), on the footer line of anything that travels without the site ("· stickers by huashu" on share images and link previews), and in full in the share text.
- **Do** honour reduced motion and the 1,500-bird fade in anything that animates many birds.

### Don't:
- **Don't** add icons to filter chips, shadows at rest, a second accent, gradients, or `prefers-color-scheme`.
- **Don't** commit font files, personal data or coordinates, or ship the photo-or-recording mark.
- **Don't** animate layout properties on birds (translate/scale/opacity only).
- **Don't** put em dashes, emoji or exclamation marks in copy.

## Known gaps (code versus the rules above)

- The dock (16px), dock tabs and switch (12px), tabs (10px), phone level button (12px) and card focus radii use plain `border-radius` without the squircle expression. Most match `/lifelist`'s own plain radii, so left alone; the Squircle Rule above applies to new surfaces.
- AGENTS.md's Commands section is long; it is the working reference, this file is the visual reference.
