# iNaturalist synonym reasons

One line per entry in `inat-synonyms.json` (iNaturalist scientific name -> eBird species code). The file is empty
for now: every bird name iNaturalist uses either matches an eBird species name exactly or is one of the region rules
below.

- Removed 2026-11-06: `Cistothorus palustris` -> `marwre1`. iNaturalist now splits the marsh wrens like eBird
  (*C. palustris* Eastern Marsh Wren, *C. paludicola* Western), so the old synonym turned every Eastern Marsh Wren into
  a Western one.

## Region rules (src/lib/import/inat-rules.ts)

Where iNaturalist lumps species that eBird splits, one iNat name stands for two eBird species, and no synonym can pick
one. `REGION_RULES` decides per observation: the iNat subspecies if given, else place (and month), else a default;
records placed by region or default carry `assigned` and the card says so.

Audit (2026-11-06, full table in the Task W1 report): every split in huashu (21 `split_from` groups, 30 daughter
species, plus 11 AviList "split" groups recorded as `same`) checked against the live iNaturalist taxa API. iNaturalist
already splits 27 of the 32 groups, so their names match eBird's directly. It still lumps five, and four get a rule:

- Willet: `Tringa semipalmata` -> willet2 Saltmarsh / willet3 Prairie (Atlantic/Gulf/Caribbean in Apr-Aug, else
  Prairie; default Prairie).
- Great Horned Owl: `Bubo virginianus` -> grhowl / grhowl19 Tropical (South America). iNat keeps *B. nigrescens*
  (Paramo Horned Owl) as a species, so no subspecies maps to it.
- Blue Whistling-Thrush: `Myophonus caeruleus` -> bluwht1 Chinese (central and eastern China, Hong Kong) /
  bluwht2 Yellow-billed (everywhere else).
- Spotted Flycatcher: `Muscicapa striata` -> spofly2 / spofly3 Mediterranean (Balearics, Corsica, Sardinia in
  Jun-Jul).

No rule: European Robin (`Erithacus rubecula`; iNat keeps Canary Islands Robin, eBird `cairob1`, as ssp. *superbus*).
No region tells Tenerife and Gran Canaria from the other Canaries, and a rule would flag every European Robin as
"Assigned by region"; an iNat robin, *superbus* included, counts as European Robin.
