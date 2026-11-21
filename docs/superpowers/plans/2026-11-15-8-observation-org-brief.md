# Item 8: observation.org import (brief, 2026-11-15)

Requested by Koen (observation.org user, via the site's contact form). Yusuf approved adding it as item 8, built after item 6 on its own stacked branch, feat/nf-8-observation-org. Turn this brief into a full plan with superpowers:writing-plans first, and add item 8 to the 2026-11-15 checklist.

## The real export (verified 2026-11-15 from Koen's file)
A real export sits in the main checkout at private/observation-org/ (git-ignored). It is personal data: read it for testing, never commit it or copy rows from it. Fixtures must be synthetic.

- File name: `observation-<YYYY-MM-DD-HH-MM>-species_observed_<user>.csv`. This is observation.org's "Observed species" (life list) export, not a per-observation export.
- UTF-8, no BOM, comma-delimited, header row, LF. Dates ISO `YYYY-MM-DD`.
- Columns: `name,scientific name,group,date first observed,date last observed,number of observations,number of individuals,number of photos,number of sounds,species type`.
- `name` and `group` are in the user's site language (Dutch here: group `Vogels`). The header row stayed English. Don't rely on `name` or `group` text; match on `scientific name`.
- `species type` values seen (Dutch): `soort` (species), `ondersoort` (subspecies), `verzamelsoort` (aggregate, e.g. `Motacilla spec.`, `Monticola solitarius / saxatilis`), `hybride` (`A x B`), `synoniem` (synonym), `forma`, `variëteit`. Expect English values (species, subspecies, ...) for English-language accounts; handle both.
- No locations, so seen-here places are unknown: the Places filter has nothing for these birds (say so, like the eBird life-list note). The first-observed date is the lifer date.

## Matching results on the real file (954 rows)
- All 823 `soort` rows match `species.v1.json` exactly by scientific name (case-insensitive).
- 80 subspecies all reduce to species already listed (binomial). Count none twice.
- Synonyms: `Corvus cornix` is a full eBird species (Hooded Crow): count it. `Milvus aegyptius` is in eBird a group of Black Kite (`Milvus migrans`): map it there.
- Aggregates, hybrids, forma and variety: skip and list them in the match report, as the other imports do for slashes, spuhs and hybrids.
- Expected: 823 species, or 824 with Hooded Crow.

## Scope
- A third eBird-like file input on the landing and in Settings ("observation.org"), with a short how-to: on observation.org, open Observed species, choose Birds and Life list, then Export as CSV. Confirm the exact menu wording from the live site in the Orca browser before writing it.
- Also accept the XLSX export only if it is trivial; otherwise CSV only, and say so.
- Reuse the iNaturalist name pipeline (synonyms, regional splits) for names that don't match exactly.
- Merge with existing lists as the other sources do; the match report lists skipped rows.
- Match DESIGN.md; no new visual language.

## Additions from Yusuf (2026-11-15)

### Dutch as a third language
Add Dutch (nl) to the i18n item (1+7), on the same layer as Spanish and Brazilian Portuguese: UI strings, share images, link previews, About, errors and aria labels. Bird names come from eBird's Dutch common names (`nl_NL`), and search works in Dutch and English. Language picker, browser default and locale stamp work as for the other languages. If the i18n branch has already shipped by the time you read this, add Dutch as a follow-up on its own branch (feat/nf-1-7-nl) before item 8.

### Locations for observation.org birds
The "Observed species" export has no locations, so the Places filter knows nothing for these birds. Plan for both:
1. **Now:** the life-list CSV, with the same visible note as the eBird life-list import: Places only works with a per-observation export.
2. **Also now (sample received 2026-11-15):** the per-observation export. Build both in item 8: the observations file gives seen-here places; the species-list file gives all-time lifers (Koen's observations export covers only the last 5 years). Accept either file alone, or both merged like eBird's two files.


### The per-observation export (verified 2026-11-15 from Koen's second file)
Real file (personal data, never commit): private/observation-org/observation-<YYYY-MM-DD-HH-MM>-observations-<user>.csv (the file Yusuf received on 2026-11-15), about 6.8 MB, 16,525 rows over 5 years. Parse in a worker like MyEBirdData.csv.

- File name: `observation-<YYYY-MM-DD-HH-MM>-observations-<user>.csv`. UTF-8, no BOM, comma-delimited, quoted fields, English header row.
- 40 columns: `id,date,time,created,modified,species name,scientific name,family,species type,species group,number,sex,life stage,activity,method,counting method,related species,related species name,source,location,lat,lng,accuracy,country division,country,validation status,validator id,validator name,last validation date,notes,substrate,is certain,is escape,obscurity,embargo date,external reference,uuid,has photos,has sounds,link`.
- Use only: `date` (ISO), `scientific name`, `species type`, `country`, `country division`, `is certain`, `is escape`. Never read or store `location`, `lat`, `lng`, `notes`, `link`, validator fields or ids (privacy rule: no location names or coordinates).
- `country` and `country division` are names in the account's language (Dutch here: `België`, `Nederland`, `Spanje`, `Verenigd Koninkrijk`; divisions `Antwerpen`, `Oost-Vlaanderen`, `Cuzco`, `Murcia`). Ocean records have country `World` (division e.g. `Southern Atlantic Ocean`): no country. 209 rows have an empty division: country only.
- Country names → ISO codes: build a reverse map with `Intl.DisplayNames([lang], { type: 'region' })` over all ISO codes for nl, en, fr, de, es (and normalise accents and case). Check every country in the real file resolves (25 values, all listed above or in the file). Divisions → eBird sub1: match names against regions.v1.json sub1 names (normalised), with a small alias table for local spellings (e.g. Cuzco/Cusco); unmatched divisions fall back to country only. No reverse geocoding from coordinates.
- Filters: skip `is escape` = True (6 rows) and `is certain` = False (111 rows). Ignore validation status (most are automatic or unknown).
- Species: 814 distinct `soort` names, all match species.v1.json exactly. Same rules as the species list for subspecies, synonyms, aggregates and hybrids. `Aves indet.` and similar are skipped.
- A species seen in several countries keeps every place with its earliest date there (existing seen-here model, src/lib/list/seen.ts). Expected for Koen: 25 country values, about 24 countries plus ocean.
