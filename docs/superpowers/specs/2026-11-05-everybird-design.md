# Everybird design

**Status:** draft for Yusuf's approval, 2026-11-05.
**Name:** Everybird. **Tagline:** "Every bird you've ever seen."
**Home:** `everybird.yusuftaleb.com`. The code is open source, in a public GitHub repo that Vercel deploys from.

Everybird turns any birder's life list into the sticker collage that Yusuf built for his own site (https://www.yusuftaleb.com/lifelist). A birder drops in an eBird export, types an iNaturalist username, or ticks birds off by hand. They get every bird they've ever seen as one collage, sized by body mass, that they can filter, explore and share.

## Why

Birders spend years building their life lists, but the tools they log with show those lists as rows of text. Yusuf wants birders to look at what they've collected and feel proud of it. The whole point is fun.

The research (summarised under Evidence) found no tool that makes an illustrated collage from a life list. What birders do now:

- They share screenshots of their Merlin lists, each with a trip story.
- They hand-draw lifer maps, and others ask how.
- They paint their lifers.
- They keep lists in Excel because they don't trust apps to last.

## Who it's for

- **Birders in Yusuf's LinkedIn and Instagram networks** come first. He will launch with a LinkedIn post.
- **The audience is mixed:**
  - eBird regulars with years of checklists
  - iNaturalist users, many of whom photograph everything
  - people who use both
  - casual birders who keep no digital list at all
- **Each way in must work equally well.** No source counts as the "main" one.

## What success looks like

- Birders who see Yusuf's post try it, and post their own collages.
- A first-time visitor gets from landing to their own collage in about a minute, with no account. The exception is waiting for eBird's emailed export, if they choose the full export.
- The species count matches what the birder expects. Where it differs from eBird's or iNaturalist's own total, the page says why.
- It feels as smooth on a phone as Yusuf's own /lifelist page. He cares a lot about this.

## Goals

1. **Three ways in, combinable into one list:**
   - an eBird file
   - an iNaturalist username
   - ticking birds off by hand, with no upload
2. **The collage as the centre of the product.** It carries over the behaviour of /lifelist (see below).
3. **Filters that rearrange the collage:**
   - by taxonomy (order, then family)
   - by country
   - by date

   They behave the way the taxonomy filters on /lifelist do now: birds glide and rescale in place.
4. **A beautiful country map** that lights up where the birder has lifers, and picks the country filter (see Map).
5. **Sharing that makes it spread.**
6. **Each birder's own rules.** They can remove or add birds after an import, and mark birds.
7. **Their data stays theirs.** They can download their list at any time.

## Non-goals

- **Identifying birds.** Merlin and iNaturalist do that.
- **Logging new sightings,** or keeping checklists. eBird and iNaturalist do that.
- **Writing anything back** to eBird or iNaturalist.
- **Accounts, social feeds, followers, comments or leaderboards.**
- **Comparing birders with each other.** A list is only measured against the birder's own past.
- **Selling anything at launch.**

## Anti-goals

These would make it a failure even if it technically works:

- **It feels like a stats dashboard or a spreadsheet.** Charts may exist, but they never lead.
- **It's slow or janky on a phone,** or the collage stutters while filtering.
- **Personal data is uploaded or stored on a server.** That includes checklist locations, coordinates and the list itself.
- **Counts are silently wrong.** For example, birds are dropped because their names didn't match, or subspecies are counted as extra species.
- **It's pitched or styled as "another birding app" or a game.** r/birdwatching is openly tired of these.
- **It looks like a clone of LiferList,** which already covers the stats-and-poster side.

## What Yusuf decided

### Identity and hosting

- **Name and tagline:** Everybird, "Every bird you've ever seen." It must not be confused with existing products:
  - the iPhone app "Birding Life List - Flock"
  - the Lifer app
  - LiferList
  - "-dex" apps such as BirdDex
  - birdalbum.com, which uses the same stickers
  - Cornell's Wall of Birds
- **Hosting:** Vercel, deployed from a public GitHub repo, on the free plan. Vercel was chosen over GitHub Pages because it can run small server functions. Per-person link previews need them; see Sharing.

### Design system: the same as yusuftaleb.com

Everybird uses Yusuf's site design. The source of truth is `framer-site/HANDOFF.md`, under "Design direction" and "Tokens", and the code components in `framer-site/code-components/`.

| Token | Light | Dark | Use |
|---|---|---|---|
| Ink | #1e1e24 | #ffffff | text |
| Paper | #f6f4ef | #1e1e24 | page background |
| Accent | #92140c | #f06a5f | selected and active states, map points |
| Muted | #5f5f69 | #a9a9b2 | secondary text |
| Line | #857f74 | #6e6e78 | meaningful strokes, input borders |
| Hairline | #dedad2 | #3d3d45 | decorative edges, chip borders |
| Surface | #ebe8e1 | #28282f | chips, inputs, placeholders |

- **Mood:** warm editorial paper, with light and dark themes.
- **Type:**
  - Cabinet Grotesk 700, in sentence case, for titles and headings
  - Satoshi for body text
  - Geist Mono for dates, tags and labels
- **Chips:**
  - 8px squircle radius, Surface fill and a 1px Hairline border, Accent when selected
  - a Phosphor icon and a label
  - the same chips as the Places map and the Life list filters on the site
- **Cards:** superellipse corners, as in `PlacesMap` (`squirclePath()`).
- **Icons:** Phosphor.
- **Motion:** the /lifelist curves.
  - Travel: `cubic-bezier(.45,0,.1,1)`, 640ms.
  - Arrival: `cubic-bezier(.25,.8,.25,1)`, 480ms.
  - Reduced-motion users get instant changes.
- **Fonts and licences:**
  - Satoshi and Cabinet Grotesk come from Fontshare. Check that their licence allows use in an open-source web app.
  - Geist Mono is OFL.
  - Phosphor is MIT.

### Bird names

- **Birders see eBird (Clements) names,** the field standard.
- **AviList 2026 is the sticker side.** huashu, the sticker source, follows it. A translation table connects the two.

### The three ways in

1. **eBird file.** Two eBird files are accepted:
   - The simple life list download: My eBird, click the World life list total, then Download. It's quick, and gives one row per species with a first date and place.
   - The full "Download My Data" export, `MyEBirdData.csv`, which eBird emails. It has every observation, with coordinates and media IDs.

   The page explains both in plain steps.
2. **iNaturalist username.** The page fetches the user's public bird observations directly.
3. **By hand.** The birder searches for or browses birds and ticks them off. They can add a date and a place to any bird, but these are optional.

Any combination can be merged into one list.

### The collage, carried over from /lifelist

Everything that makes /lifelist work comes along:

- **Stickers:** huashu stickers.
- **Sizes:** each bird's size follows its body mass. The default "evened out" scale gives a tile's long side ∝ mass^0.2. The True size switch uses mass^⅓, and the birds morph in place between the two.
- **Filters:** they drill down one level at a time, with a breadcrumb.
- **Grouping:** the stage fits the group being shown.
- **Phone filters:** on phones, a single button opens a bottom sheet of filter chips.
- **Bird cards:** a tooltip or card per bird shows the name, scientific name, first date (month and year), place and average body mass.
- **List view:** runs by body mass, heaviest first by default, with a toggle for lightest first.
- **Marks:**
  - `*` heard only
  - `†` found dead
  - `◦` photographed. This symbol is my call; the builder may choose another.
- **Smooth motion on phones** is a requirement, not a polish item.

### Places (Yusuf, 2026-11-05)

- **Use eBird's lowest region level,** not the town or the eBird location name. The format is region, then state or province, then country, for example "Okanagan-Similkameen, British Columbia, Canada". eBird calls these levels subnational2, subnational1 and country.
- **Where a country has no second level in eBird,** or a source only gives the state or province, use "British Columbia, Canada". If it only gives a country, use "Canada".
- **This applies everywhere:** bird cards, list view, shared views and downloads.
- **Where it comes from:**
  - `MyEBirdData.csv` has "State/Province" (a code like `CA-BC`) and "County" (a name like "Okanagan-Similkameen").
  - The simple life list download only has the state or province code (confirmed), so it shows "British Columbia, Canada".
  - iNaturalist observations carry a place hierarchy and coordinates, which have to be resolved to the matching region. The builder decides how.
  - Hand-ticked birds can take an optional region picked from a list.
- **Exact coordinates** stay on the device, and are only used to work out the region.
- **Share links** carry the region code where it fits within the length limit, and otherwise the country.

### Filters

All three rearrange the collage:

- **Taxonomy:** order, then family, as on /lifelist.
- **Country:** the country of each bird's first sighting.
- **Date:** by year. Trips can also be grouped as runs of sightings close in time and place. People reminisce by trip ("Amazing trip to Egypt," "From Ecuador last year").

Filters can be combined, for example "Egypt, 2024, herons."

### Map

**Decided (Yusuf, 2026-11-05): the map is a country picker, similar to the world map on an eBird profile.** There is no pin map and no sticker map.

- **Style:** the site's dotted world map, from `PlacesMap`.
- **Countries with lifers light up** in Accent. The more lifers, the stronger the colour.
- **Tapping a country** filters the collage to that country. It's the same filter as the country chips, so the map is just a nicer way to pick a country. A small label shows the country name and lifer count.
- **It works for every way in,** because it only needs each bird's country.
- **Later, not in the first release:** provinces and states light up when you zoom into a country.

Yusuf first asked for "a way nicer map", then wasn't sure whether to keep one. Claude recommended this smaller version: once places are regions (see Places), pins add nothing, and they're what every other tool already does.

### Charts

Charts are complementary and small, such as lifers by year. They never lead the page.

### Sharing

- **The share image is the main share action.** Instagram posts can't contain links, and image posts do well on LinkedIn.
- **Sizes:**
  - a tall story image (9:16)
  - a 4:5 post image, for Instagram and LinkedIn
- **The share card shows:**
  - the collage, or the current filtered view
  - the species count
  - the latest lifer
  - the name and tagline
- **A share link comes second.** When it's posted, the link preview shows that person's own collage.
- **What a share link opens (my call):**
  - A read-only, interactive copy of the shared collage, with filters, True size and bird cards, plus a "Make your own" button.
  - The link carries:
    - the species
    - each bird's first month and country, so the date and country filters work
    - the marks
    - an optional display name the birder types in
  - It never carries town names or coordinates.
- **Link length (my call):**
  - A link must fit comfortably in a LinkedIn post, so aim for under about 2,000 characters.
  - If a very large list doesn't fit with months and countries, the link drops to species only, and the page says the date and country filters aren't available for that link.
  - The link format carries a version number from day one, so old links keep working.

### Additions Yusuf accepted from the research

- **Edit after import:** remove birds, add birds, and set marks. Merlin users complain that they can't apply stricter personal rules to what eBird syncs.
- **Photographed mark:** birds the birder has photo evidence for. Some birders keep photo-only life lists.
- **Download:** the list as CSV and JSON. People keep lists in Excel because apps disappear.
- **Trip and date grouping** (see Filters).
- **Count and latest lifer** on the share card. r/birding users already show "Latest Lifer: … (#n)" next to their names.
- **Maybe later:** sticker-album sets with empty slots, like "Owls of North America 6/19." Some birders keep themed mini-lists because they can be completed.

## My calls (Claude's, not Yusuf's)

These are mine. Yusuf should check them while reading.

1. **Everything runs in the visitor's browser.** Files are parsed on the page, and iNaturalist is called from the page. There are no accounts and no uploads.
2. **The list is saved on the device** between visits, with a one-click "forget my list." It can also be moved to another device as a downloaded file.
3. **Share links are self-contained.** They encode the shared view, at least the species and the first year or month, in the URL. That means there's no database.
4. **A small Vercel function draws per-person link previews** from that URL. Even this function never receives private data such as coordinates, only what the birder chose to share.
5. **Default counting follows eBird's.** Only full species count; eBird calls these "countable". Subspecies and forms roll up into their species. Hybrids, "sp." entries, slashes and domestic birds don't count. Escapees are excluded. Switches let birders hide heard-only or found-dead birds.
6. **Merging uses Yusuf's own rule:** each species takes its earliest date from any source, with that record's place.
7. **iNaturalist defaults:**
   - Count non-captive bird observations identified to species, whether research grade or not, with a switch for research grade only.
   - Sound-only observations get the heard-only mark automatically.
   - "Dead" annotations get the found-dead mark.
8. *(Replaced by Yusuf's decision; see "Places" under What Yusuf decided.)*
9. **Birds that couldn't be matched are always listed** ("12 rows couldn't be matched"), with a way to fix them by hand.
10. **The code is MIT licensed.** There's a credits page for:
    - huashu (required by its licence)
    - AVONET
    - eBird and Clements
    - iNaturalist
    - Natural Earth
    - Teddy Warner's Avian Visitors, the inspiration
    - the fonts
11. **First release:**
    - all three ways in, plus merging
    - the collage with all three filters, true size and cards
    - editing and marks
    - the map
    - share images
    - downloads

    **Later:** charts, sets with empty slots, and per-person link previews if they slip.

    **Stretch:** a "my year in birds" card around New Year 2027, which suits the season. It isn't tied to the launch.

    **Launch gate (Yusuf, 2026-11-05):** there's no date. Yusuf posts on LinkedIn only once the first release is **complete and validated**. What "validated" means is my call:
    - his own eBird and iNaturalist data reproduce his list, with every difference explained
    - a 1,000+ species list loads and filters smoothly on a real mid-range phone
    - every way in works on a real phone, in Safari and Chrome
    - share images look right when posted to LinkedIn and Instagram
    - three to five birder friends try it privately first, with their own data, and their problems are fixed
12. **Launch framing:** "your existing record, made beautiful." Lead with a collage image, never "a new app."
13. **Analytics: cookieless visit counts only,** with Vercel Web Analytics or similar. A few anonymous events are allowed, such as "collage made", "image downloaded" and "link copied", with no list contents and no locations. The privacy line says: "We count visits anonymously. Your list never leaves your browser." This is the only way to tell whether the launch worked.

## Facts the builder needs

### eBird

- **There is no API for a person's own data.** eBird's public API covers recent sightings, hotspots and taxonomy, not personal lists. Files are the only way in.
- **Simple life list download** (`ebird_world_life_list.csv`). Confirmed with Yusuf's real file on 2026-11-05. It has one row per taxon, newest first, with these columns:
  `Row #, Taxon Order, Category, Common Name, Scientific Name, Count, Location, S/P, Date, LocID, SubID, Exotic, Countable`.
  - `Countable` is `1` for life-list species and `0` for the rest. `Category` is `species`, `spuh` or `slash` (others such as `hybrid` and `domestic` are likely). Counting can simply follow `Countable = 1`.
  - `Exotic` is empty, `N` (naturalized), `P` (provisional) or `X` (escapee). Yusuf's 5 naturalized species, such as House Sparrow and European Starling, are countable.
  - `S/P` is **only the state or province code** (`CA-BC`, `EG-DK`), with no county. People who use this file get places like "British Columbia, Canada". Showing the region instead needs the full export.
  - `Date` reads like `30 Sep 2026`. `Location` is the eBird location name, which is not shown (see Places).
- **`MyEBirdData.csv`.** Confirmed with Yusuf's real file. It has every observation, with these columns:
  `Submission ID, Common Name, Scientific Name, Taxonomic Order, Count, State/Province, County, Location ID, Location, Latitude, Longitude, Date, Time, Protocol, Duration (Min), All Obs Reported, Distance Traveled (km), Area Covered (ha), Number of Observers, Breeding Code, Observation Details, Checklist Comments, ML Catalog Numbers`.
  - **There's no Category or Countable column.** Rows include "sp." entries, slashes and subspecies, such as "Northern Flicker (Red-shafted)" and "Yellow-rumped Warbler (Audubon's)". They must be rolled up to species with the eBird taxonomy (`category` and `reportAs`), keyed by taxonomic order or scientific name.
  - **`County` is a name, not a code** ("Okanagan-Similkameen"), and is filled for 1,002 of 1,009 rows. `State/Province` is a code (`CA-BC`). The region display needs a code-to-name table for states and provinces, such as eBird's region list or ISO 3166-2.
  - **Latitude and longitude** are on every row. `Date` is ISO (`2024-02-03`).
  - **`ML Catalog Numbers`** is filled on 66 rows, holding Macaulay media IDs. A media ID can be a photo or a recording. Telling which needs a lookup, or the mark could be labelled "photo or sound." The builder decides.
- **Subspecies must roll up.** Someone's eBird photo life-list tool was criticised for counting them separately.
- **The eBird species list** (taxonomy) can be bundled as a static file. Yusuf's copy is `content/lifelist/ebird-taxonomy-species.json`, from the eBird API. eBird updates it about once a year, so the build needs a way to refresh it.

### iNaturalist

- **There's a public API that needs no key.** Example: `api.inaturalist.org/v1/observations?user_login=…&iconic_taxa=Aves&captive=false`. It returns:
  - date and place
  - coordinates, which can be blurred
  - photos and sounds
  - quality grade
  - annotations such as alive or dead
- **Rate limits:** iNaturalist asks callers to stay around one request per second. Paging past 10,000 results needs `id_above`.
- **Bird names differ from eBird's.** Matching is mostly by scientific name, plus a table of known differences. huashu's species table has iNaturalist IDs for only 645 species.
- **Yusuf has already done this for his own list:** `scripts/lifelist/migrate_to_personal.py`, `content/lifelist/inat-firsts.json` (first non-captive sighting per species).

### Stickers: huashu-bird-sticker

- **Source:** github.com/alchaincyf/huashu-bird-sticker.
- **Licences:** the stickers are CC BY 4.0, with credit and a link to the repo required. The data is MIT.
- **Coverage:** `data/species.csv` has 11,011 species following AviList 2026, and 10,973 have stickers.
  - 10,983 rows carry an eBird species code, in the `ebird` column. That is the translation table.
  - About 120 species are listed as split, broadened, narrowed or new compared with the old checklist, and need checking by hand.
  - 10,592 stickers meet huashu's own quality bar. The other ~380 are weaker. 38 species have no sticker yet, so a fallback is needed, such as a neutral silhouette.
  - huashu also ships names in up to 43 languages, which could support search in other languages later.

### Body mass

- **Source:** AVONET, via huashu's data. Yusuf's `content/lifelist/overrides.json` shows the pattern for filling gaps and matching splits, with a source for each override.
- **Missing masses:** some species will have none, so a fallback is needed, for example the family's median.

### Country shapes

Natural Earth (public domain) is already used by the site's `PlacesMap`.

## Constraints

- **Big lists:** lists range from 20 to several thousand species. Top listers pass 5,000. Everything must stay smooth on a mid-range phone at the size of a typical list (hundreds) and still work at thousands.
- **The collage has to be laid out in the browser.** /lifelist calculates every layout ahead of time, for every filter state, both size modes and three widths, in `build_lifelist.py`. Everybird can't, because every list and filter combination is different. The /lifelist approach for smooth True size morphs must be kept: lay out the true-size view starting from each bird's evened-out position, so birds keep their neighbours. It's described in HANDOFF "Life list v6".
- **No pre-built sticker sheet per person.** /lifelist uses one prebuilt atlas, a 2048×2906 webp. Everybird has to serve stickers for any of ~11,000 species at small sizes, quickly. At /lifelist's current size of about 63 KB per sticker, a 1,000-bird list would be 63 MB, which is far too much.
- **Privacy:** the birder's file, coordinates and list never leave the browser. Only what they explicitly share goes into a share link.
- **Free hosting:** stay within Vercel's free-plan limits, and GitHub's for the repo and any image hosting.
- **Accessibility, to the site's standard:**
  - keyboard access to every bird and control
  - visible focus
  - reduced-motion support
  - the token contrast ratios above
  - accessible names for birds
- **Attribution:** huashu's CC BY 4.0 credit is mandatory wherever the stickers appear, including on share images. A small credit line is enough.

## Reference: what exists today

- **`framer-site/code-components/LifeList.tsx`:** the collage component, with filters, True size morph, cards, phone sheet, list view and motion. Its performance fixes are in HANDOFF "Life list v5".
- **`framer-site/scripts/lifelist/`:** the data pipeline.
  - `build_lifelist.py`: packing, size modes and the atlas.
  - `enrich_lifelist.py`: taxonomy, mass and sticker matching.
  - `parse_lifelist.py`: the eBird life list.
  - `migrate_to_personal.py`: the merge with iNaturalist.
- **`framer-site/content/lifelist/`:** Yusuf's list, the eBird taxonomy, overrides and the town gazetteer.
- **`framer-site/HANDOFF.md`:** sections "Life list v4" to "v7.7" give the design decisions and their reasons.

## Evidence (research, 2026-11-05)

### Closest tools

- **LiferList** (liferlist.netlify.app):
  - It runs in the browser and accepts files from eBird, iNaturalist, BirdTrack and Scythebill, or a pasted list.
  - It has charts, countries, a map, a year-in-review story, and a poster built from Wikipedia and iNaturalist photos. It's collecting emails for printed posters.
  - It has no illustrations, no collage and no ticking birds off by hand.
- **Birda** (iPhone) imports from eBird and iNaturalist into a social app.
- **eBird's Phylogeny Explorer** shows a life list on the family tree of birds.
- **Avian Visitors and its forks** are collages of live feeder and hotspot sightings, not life lists.
- **Yearbird and auklet** are desktop and R tools.

### Collecting apps (2025–26)

Lifer, BirdDex, Birdey, birdr, Birderdex and Birdex are all phone apps where you identify a bird to collect a card. None imports an existing record.

### What birders said on Reddit (read through Yusuf's Safari)

- They share Merlin life-list screenshots sorted by date, with trip stories ("Show me your favorite screenshot from your life list", r/birding).
- A hand-made 2025 lifer map was "extremely tedious." The replies asked how to make one, and one said "As good as eBird is, it doesn't have a graphic option that is this clear."
- One birder likes Merlin's format, "with the pictures and map ranges and order of finding them," but Merlin can't apply their stricter rules.
- Photo-only life lists are common. On someone's photo-life-list tool: "I've long wondered why the eBird team hasn't made this feature available." The complaint about it was that subspecies counted separately.
- People keep lists in Excel: apps "can get pulled at a moment's notice." A 74-year-old birder found list apps "too complicated."
- Birders paint their lifers, and keep themed mini-lists for the fun of completing them.
- r/birdwatching is wary of new apps: "There's already an overabundance of them," and "yet another vibe coder."

### iNaturalist forum and BirdForum

- Merging eBird and iNaturalist lists is a recurring, unsolved request (May 2026 thread).
- Personal listing rules vary widely: heard-only, photo-only, dead birds, and counting only what's on eBird.

## Left to the builder

- **Framework and project structure.** React fits, since `LifeList.tsx` is React. The Vercel function suggests Next.js, but a static app plus one function is fine too.
- **The layout algorithm in the browser,** and how it stays fast.
- **How stickers are resized, hosted and loaded:** sizes, format, sprite sheets or single images, and caching.
- **How share links are encoded.**
- **How the country map is drawn,** in SVG or canvas, plus its zoom and label details.
- **How trips are detected.**
- **The details of matching names,** and the fix-by-hand flow.
- **Whether to look up eBird media types,** or label the mark "photo or sound."
- **Which charts.**
- **The exact share-card layout,** within the design system.
- **How sets with empty slots work,** if built.
- **Testing.** At minimum, real eBird and iNaturalist exports, including Yusuf's own. His list must come out at his 197 species, or the differences must be explained.

## Testing prerequisites

- **Received 2026-11-05:** Yusuf's `ebird_world_life_list.csv` (192 rows, 185 countable species) and `MyEBirdData.csv` (1,009 rows, 93 checklists, 2024-02-03 to 2026-09-30). Both are in `~/Downloads/`.
  - These are **personal data**. Don't commit them to the public repo. Keep them in an ignored local folder, or make a scrubbed copy without coordinates or comments, and only with Yusuf's agreement.
- **First checks (Claude, 2026-11-05):**
  - Rolling `MyEBirdData.csv` up to species gives the same 185 species as the life list file's `Countable = 1` rows.
  - All 185 are in his hand-kept `lifelist.json` (197 species).
  - The 12 species only in `lifelist.json` must come from his iNaturalist data or his own edits: *Acridotheres tristis, Astur atricapillus, Bostrychia hagedash, Columba livia, Icterus galbula, Larus michahellis, Melaenornis pammelaina, Strix nebulosa, Uraeginthus angolensis, Vanellus armatus, Vireo huttoni, Zonotrichia albicollis*.
  - So the target is: eBird file plus iNaturalist `yusuftaleb` under the default rules gives 197, with any difference explained.
- **Still wanted:** an export from a birder with **a big list** (1,000+ species), shared with their permission, to test speed and matching at scale.
- His iNaturalist username (`yusuftaleb`) is already known and public.

His merged list of 197 species is hand-edited from both sources. So "matches 197" means: after merging his eBird file and his iNaturalist data under the default rules, the differences from `framer-site/content/lifelist/lifelist.json` can each be explained. They include his manual marks, his own exclusions and corrected South Africa dates.

## Changes after approval (Yusuf, 2026-11-05)

Decisions made after the approval above. The approved body is unchanged; where it differs, this section wins.

- **Pages:** Collage (`/`), Settings (`/settings`) and About (`/about`), with a top bar. The shared view stays at `/s/[token]`. The old `/make`, `/my` and `/credits` redirect.
- **Search:** copied from his Photography page, over the whole list. Picking a species shows its tooltip.
- **Match /lifelist exactly:** the dock, filters, card and list follow his `/lifelist`; filter chips have no icons.
- **Theme:** light by default (not the OS setting), with a toggle.
- **Tick by hand:** a page-wide multiselect on Settings.
- **The photo-or-recording mark** (a small circle) is removed from the UI. The data is kept.
- **The sample list** (the landing demo) is approved.
- **Share links carry the whole list.**
- **Credit:** his credit sits on About ("Made by Yusuf Taleb") and in the footer.
- **Places and Time (2026-11-06):** two dropdown buttons in the controls bar, the only place a place or time filter shows. Places is a multi-select checklist of countries (seen-here counts; species seen in any checked country); province and county filters are gone; the dotted map is removed from the app. Time is the timeline in a dropdown; Play is removed. Flags come from flag-icons (MIT). The centre count shows only the shown count ("species"), never "of N", in the app, share images and link previews.
- **Polish decisions (2026-11-06):** un-ticking a bird already on the list in Tick by hand, then confirming, removes it with the card's "Removed … · Undo" toast (about 6 s; Undo restores exactly what was there); the timeline's trip lanes are 44px apart so each bracket takes a full 44px press; dark Line is #76767f (3:1 on Surface as well as Paper); the share dialog takes the one floating shadow.
- **Time and Places fixes (2026-11-06, T2):** the timeline has no trips: month bars, the range handles and the year axis only (on a 700-species list the trip labels filled the panel). Trips are gone from the data too (no trip filter; an old one is ignored); a trip is a Places country plus a Time range. The Time panel gets Clear at its head's right, as Places has, once a range is set. "Find a country" uses the app's one field style (`.eb-input`, now global, with the site's 16px lens).
- **Home and share images (2026-11-06, S4):** the production origin is `https://everybird.yusuftaleb.com` (`SHARE_ORIGIN`; share links, `metadataBase`, the share images' footer); stickers stay on `https://yusuftaleb.github.io/everybird-stickers` until `NEXT_PUBLIC_STICKER_BASE` points at the R2 bucket's domain `https://stickers.yusuftaleb.com` (`scripts/deploy/upload-stickers-r2.ts`). The story keeps 160px top and 220px bottom clear (was 250/340) and its collage is a tall rounded cluster; the post's collage is a little taller. A complete link preview is cached a year at the CDN (`s-maxage=31536000`): a token is content-addressed.
- **Stickers on R2 (2026-11-06):** stickers load from Cloudflare R2 at `https://stickers.yusuftaleb.com` (the code default in `src/lib/sticker-url.ts` and Vercel's `NEXT_PUBLIC_STICKER_BASE` for production and preview): all 22,038 files with `Cache-Control: public, max-age=31536000, immutable`, `Content-Type: image/webp` and CORS GET/HEAD `*`. GitHub Pages (`https://yusuftaleb.github.io/everybird-stickers`) keeps the same files as the fallback, one environment variable away.
- **Phone controls, wrapped chips, footer credit (2026-11-06):** on phones (600px and under, as /lifelist) the controls bar is two rows: the view icons, "True" and "Sci." (list view: "Heaviest"/"Lightest") and the search, then Places and Time; the taxonomy is the "Choose an order" button and sheet on every page, the landing included. From 600px the landing's taxonomy no longer scrolls sideways in one strip: the rank label and chips wrap onto rows, as /lifelist's and every other collage (the strip and `compact` are gone). The site footer drops the inline "Stickers: huashu-bird-sticker, CC BY 4.0" line: its "All credits" link (→ /about#credits) carries the attribution on the web; About's credits and the credit under the How it works demo keep it inline.
- **Share-image credit (2026-11-06):** share images (story, post, square) and link previews drop their separate "Stickers: huashu-bird-sticker, CC BY 4.0" line: the footer is the Everybird wordmark and one quiet line, "everybird.yusuftaleb.com · stickers by huashu" (never truncated; it moves under the wordmark before it would be cut). The share sheet's text carries the full credit, "Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker". Copy link stays the bare URL. About#credits is unchanged.
- **No stand-in stickers (2026-11-06, Yusuf):** "don't borrow from other species". The split-sibling stand-ins (522cfad, 30 species) are reverted and the card's "Illustration: … (stand-in)" line removed; every species without its own huashu sticker (212) shows the no-sticker outline: Phosphor's Bird stroked thin in Line, the same on the page and in share images. Masses are unchanged. The iNaturalist region rules (Willet etc.) stay: they place names, not pictures.
- **A made-up sample birder (2026-11-06):** the landing sample is no longer Yusuf's public 197-species list. `public/data/sample.v1.json` is a demo birder generated from a fixed seed by `scripts/build-data/build-sample.ts` (no input file, nothing from the website or `private/`): 548 species, home in New South Wales from March 2018 plus trips to Queensland, Tasmania and ten other countries (New Zealand, Kenya, Japan, South Africa, Spain, the UK, Thailand, Malaysian Borneo, Costa Rica and the USA, in California), each species chosen where huashu's range text names the country or the part visited, months and sub1 regions only. The stats line reads "Sample: a demo birder's life list". Its share link fits at the dates level (no places) under 2,000 characters; every sample species is in the link index.
- **First-visit welcome (2026-11-06):** the first time someone opens `/` with no list on the device, a small dialog over the sample says "Every bird you've ever seen, as a sticker collage." with "Make mine" (→ Settings, Your sources) and "Explore the sample" (✕, Esc and a press outside do the same). It is remembered per device (`localStorage` `everybird:welcomed`; without storage, once per page load), never shown with a list, on Settings, About or a shared link. A card on wider screens, a bottom sheet on phones, with a light scrim so the sample stays visible.
- **Sample review (2026-11-06):** a short deny list in `build-sample.ts` (`DENY`, per zone, each with its reason) keeps out draws a birder would query (Canada Jay and Varied Bunting in California, Western Swamphen in Kenya, Common Bulbul in Spain, two South African misplacements, two vagrants, Japanese Leaf Warbler in Thailand). The welcome's "Make mine" puts keyboard focus on Settings' "Your sources".
- **Weekly huashu sync (2026-11-06):** a GitHub Action (`.github/workflows/huashu-sync.yml`, Mondays 14:00 UTC, plus a manual dry run) keeps the stickers current with upstream huashu-bird-sticker. The pinned upstream is `data/huashu.lock.json` (blob SHAs, record digests, the crosswalk); only changed stickers are rebuilt and uploaded to R2, and each run with changes opens one PR (never merged automatically) with a species/code/change table and a before/after thumbnail sheet. Redrawn stickers never replace a published file: they get a sticker version `sv` and a new file name `<code>.<sv>.webp`, so only they get new URLs and every other URL stays as it was. Stickers that upstream removes show the outline. When a species on yusuftaleb.com/lifelist changes, an issue lists it for Framer. Each run rebuilds at most 600 stickers (website species first) and the next run continues the rest once its PR is merged; a large backlog can be run in one go from a laptop. A run that looks like an upstream schema change or hits an upstream inconsistency stops and opens an issue instead of shipping. Local data builds refuse to run on another huashu commit than the lock's. The R2 token expires 2027-11-06 and must be rotated before then.
- **Site icon (2026-11-06, Yusuf):** the origami bird from yusuftaleb.com's nav (Icons8 "Origami"), Accent on a Paper tile, coral on the dark tile when the browser is dark; replaces the Veery sticker icon, which had no backdrop. Credited on About ("Icons: Icons8", linked).
- **Taller stages for mid-size lists (2026-11-06, Yusuf):** the 548-species sample on desktop barely grew and stayed a wide oval: the wide layout's 36px median-sticker floor was met early and the spiral's stretch (1.7) kept the cluster landscape on a taller stage. The floors are now wide 48, medium 40, narrow 30 px (narrow 30 is the most that keeps a 200-bird phone list on its starting stage), and on a grown stage the spiral's x : y is the stretch times start height / grown height (up to `maxH`), so the cluster follows the stage's aspect. Lists that fit the starting stage keep their layouts exactly; the landing sample pack is rebuilt.
