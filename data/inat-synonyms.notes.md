# iNaturalist synonym reasons

One line per entry in `inat-synonyms.json` (iNaturalist scientific name -> eBird species code).

- `Cistothorus palustris` -> `marwre1` (Western Marsh Wren, *Cistothorus paludicola*): iNaturalist lumps the marsh wrens under *C. palustris*, which eBird now uses for Eastern Marsh Wren (`eamwre1`), so a plain name match picks the wrong species. Seeded from the ALIAS map in the website repo's `migrate_to_personal.py`.

Every other name in the website repo's `inat-firsts.json` already matches an eBird species name exactly, so none needs a synonym.

## Region rules (src/lib/import/inat-rules.ts)

Where iNaturalist lumps species eBird splits, one iNat name stands for two eBird species, and no synonym can pick one.
`REGION_RULES` decides per observation: the iNat subspecies if given, else place (and month), else a default; records
placed by region or default carry `assigned` and the card says so. Rules: Willet (`Tringa semipalmata` -> willet2 /
willet3), Marsh Wren (`Cistothorus palustris` -> eamwre1 / marwre1; the synonym above stays as its default), Great
Horned Owl (`Bubo virginianus` -> grhowl / grhowl19), Blue Whistling-Thrush (`Myophonus caeruleus` -> bluwht1 /
bluwht2) and Spotted Flycatcher (`Muscicapa striata` -> spofly2 / spofly3). Audit: Task W1 report (2026-11-06).
