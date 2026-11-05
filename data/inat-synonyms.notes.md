# iNaturalist synonym reasons

One line per entry in `inat-synonyms.json` (iNaturalist scientific name -> eBird species code).

- `Cistothorus palustris` -> `marwre1` (Western Marsh Wren, *Cistothorus paludicola*): iNaturalist lumps the marsh wrens under *C. palustris*, which eBird now uses for Eastern Marsh Wren (`eamwre1`), so a plain name match picks the wrong species. Seeded from the ALIAS map in the website repo's `migrate_to_personal.py`.

Every other name in the website repo's `inat-firsts.json` already matches an eBird species name exactly, so none needs a synonym.
