# Everybird glossary and translation rules

Read this before you translate a string or add a language. English (`messages/en.ts`) is the source of truth; every other `messages/<lang>.ts` has exactly its keys.

## Glossary

| English | es | pt | nl | pl | fr | de |
|---|---|---|---|---|---|---|
| life list | lista de vida | lista de vida | levenslijst | lista życia | liste de vie | Lebensliste |
| collage | collage | colagem | collage | kolaż | collage | Collage |
| sticker | sticker | adesivo | sticker | naklejka | autocollant | Sticker |
| latest lifer | Última especie nueva | Última espécie nova | Nieuwste soort | Najnowszy gatunek | Dernière nouvelle espèce | Neueste Art |
| species (count label) | especies | espécies | soorten | gatunki | espèces | Arten |
| True size | Tamaño real | Tamanho real | Ware grootte | Prawdziwy rozmiar | Taille réelle | Echte Größe |
| Scientific | Científico | Científico | Latijn (the label is short; its screen-reader text says "names") | Łacina (screen reader: "nazwy naukowe") | Latin (screen reader: "noms scientifiques") | Latein (screen reader: "wissenschaftliche Namen") |
| Make yours | Haz el tuyo | Faça a sua (a colagem) | Maak de jouwe | Stwórz swój | Crée le tien | Mach deine |
| Settings (top bar) | Ajustes | Ajustes | Instellingen | Ustawienia | Réglages | Optionen ("Einstellungen" doesn't fit the top bar) |
| About (top bar) | Acerca de | Sobre | Over | Info ("O aplikacji" doesn't fit the top bar) | Infos ("À propos" doesn't fit the top bar) | Über |
| My collage (untitled) | Mi collage | Minha colagem | Mijn collage | Mój kolaż | Mon collage | Meine Collage |
| Places (filter) | Lugares | Lugares | Plaatsen | Miejsca | Lieux | Orte |
| Map (view tab) | Mapa | Mapa | Kaart | Mapa | Carte | Karte |
| Time (filter) | Fechas | Datas | Tijd | Czas | Dates | Zeit |
| county | condado | condado | graafschap | hrabstwo | comté | Kreis |
| Heard only / Found dead | Solo oída / Encontrada muerta | Só ouvida / Encontrada morta | Alleen gehoord / Dood gevonden | Tylko słyszany / Znaleziony martwy | Entendu seulement / Trouvé mort | Nur gehört / Tot gefunden |
| birder | observador de aves | observador de aves | vogelaar | obserwator ptaków | observateur d'oiseaux | Vogelbeobachter |
| Ticked by hand (source) | Marcadas a mano | Marcadas à mão | Met de hand aangevinkt | Zaznaczone ręcznie | Cochées à la main | Von Hand abgehakt |
| skipped (entries) | omitidas | ignoradas | overgeslagen | pominięte | ignorées | übersprungen |
| backup | copia de seguridad | backup | back-up | kopia zapasowa | sauvegarde | Sicherung |
| Counting (Settings) | Recuento | Contagem | Tellen | Liczenie | Décompte | Zählung |
| (iNaturalist) observation, sighting | observación | observação | waarneming | obserwacja | observation | Beobachtung |
| Your list (Settings) | Tu lista | Sua lista | Je lijst | Twoja lista | Ta liste | Deine Liste |
| Conservation status | Estado de conservación | Estado de conservação | Beschermingsstatus | Status ochronny | Statut de conservation | Gefährdungsstatus |
| order / family (ranks) | orden / familia | ordem / família | orde / familie | rząd / rodzina | ordre / famille | Ordnung / Familie |

## Register

- **Spanish (es):** neutral, reading naturally in Spain and Latin America. "Tú", never "vosotros" or "usted". No regional words: "dispositivo" (not "ordenador" or "computadora"), "archivo", "descargar", "compartir".
- **Portuguese (pt):** Brazilian Portuguese with "você". Visitors in Portugal get this UI with pt_PT bird names.
- **Dutch (nl):** standard Netherlands Dutch that reads naturally in Flanders. Informal "je/jij", never "u".
- **Polish (pl):** informal "ty" ("Twoja lista", "Dodaj"), never "Pan/Pani". Never a second-person past tense: it shows the reader's gender ("pobrałeś/pobrałaś"). Use the imperative, the present, the impersonal "-no/-to" form for what happened ("Zapisano", "Usunięto", "Nie udało się …") or a participle ("kopia pobrana tam wcześniej"). Polish has three plural forms, so every Polish plural carries `one` (1), `few` (2–4, 22–24: "{n} gatunki") and `many` (0, 5+, teens: "{n} gatunków"), with `other` for fractions; where a name fills a slot, prefer the label form ("Usunięto: {name}", "Od: {month}"), which needs no agreement. Never decline a name or a variable ("Yusufa"), since the value can't follow; the link texts About checks against the nav ("Ustawienia") stay in the nominative. Typographic quotes are „…”. Numbers group with "." like es, pt and nl (count-box.ts sizes the count for "," and "." only). The whole file is an LLM draft awaiting a fluent speaker's review.
- **French (fr):** standard French that reads naturally in France, Belgium, Switzerland and Quebec, with informal "tu" ("Ta liste", "Ajoute"), never "vous", matching the informal register of es, pt and nl. Numbers group with "." (count-box.ts sizes the count for "," and "." only; French would use a narrow space). Bird names: France's (eBird `fr_FR`) for every French reader except Canada, which gets eBird's plain `fr` (North American French). The whole file is an LLM draft awaiting a fluent speaker's review.
- **German (de):** standard German (Germany) that reads naturally in Austria and Switzerland, with informal "du" ("Deine Liste", "Füge … hinzu"), never "Sie". Sentence case keeps every noun's capital (the family-label test allows it). Numbers group with ".". Bird names are eBird's one German set (`de_AT` and `de_CH` return it too). The whole file is an LLM draft awaiting a fluent speaker's review.
- **Every language** follows DESIGN.md "Voice and copy": plain words, second person, short sentences, sentence case (mono labels are uppercased by CSS, never in the string), no em dashes, no exclamation marks (nor "¡"), no emoji, no hype. Never "seen" for the list (heard-only birds count too): "on your list".

## Templates

- `{name}` is a variable: keep every one the English string has, spelled the same. You may move it.
- `<link>…</link>` (any `<tag>`) wraps words that become an element. Keep every tag; translate the words inside.
- Plurals are `{ one, other }`: `one` is used exactly when the number is 1, `other` for everything else (0 included). Write `{n}` where the number goes. A language with more forms (Polish, Russian) adds `few` and `many`; Intl.PluralRules then picks the form for the dictionary's language (`plural` in `core.ts`), and a missing one falls back to `other`.
- Numbers and dates come from `ui.num` and `ui.date` through `src/i18n/format.ts`, never from `Intl` or `toLocaleString`.

## Stays English in every language

- The credit lines `FOOTER_LINE` ("everybird.yusuftaleb.com · stickers by huashu") and `SHARE_CREDIT` (attribution; only the date stamp after them is translated).
- CSV column headers and the CSV's English name column, download file names, the backup JSON, stored data (`titleFromOldName`'s output), analytics values.
- Scientific names, IUCN abbreviations (LC … DD; their full names are translated), province and county names.
- Names: Everybird, eBird, iNaturalist, GitHub, CSV, JSON. These may equal English; `ALLOW_SAME` in `tests/i18n.test.ts` lists every value allowed to.

Country names come from `Intl.DisplayNames` (the one `Intl` exception), bird and family names from eBird's localized taxonomy (the names files).

## How to add a language

1. `src/i18n/langs.ts`: add the code to `LANGS`, and its entries to `HTML_LANG` and `LANG_NAMES` (the name in its own language).
2. `src/i18n/messages/<lang>.ts`: `export const <lang>: Messages = { … }`, every key of `en.ts` translated with this glossary (add the new column above). `npx tsc --noEmit` names any missing key and every `Record<Lang, …>` that needs an entry (`OG_LOCALE`, the smart search's word tables in `src/lib/search/dates.ts` and `smart.ts`); `tests/i18n.test.ts` names extra, empty or untranslated ones. Add it to `MESSAGES` in `src/i18n/server.ts` (the test helper `tests/i18n-render.tsx` imports that map), and to the language maps the tests and e2e specs keep (`OTHERS` in `tests/i18n.test.ts`, `NAV` in `tests/topbar-fit.test.ts`, `LANGS` in `tests/count-box.test.ts`, `MESSAGES` in `e2e/flows.spec.ts` and `e2e/settings.spec.ts`), or their checks skip it.
3. The count label must be at most 8 characters (`COUNT_LABEL_CHARS`), and the group separator no wider than "," (only "," and "." are measured).
4. The nav labels must fit the top bar: `tests/topbar-fit.test.ts` models it from the fonts' measured advances. A letter outside Latin-1 needs `scripts/dev/measure-glyphs.ts` to measure it (`EXTRA_CODEPOINTS`), Geist Mono's next/font `subsets` to load it (`app/[lang]/layout.tsx`) and the link preview's fonts to cover it (`pickFaces` in `og-server.ts`), and `foldName` (`src/lib/species/resolve.ts`) must fold it if NFD can't (Polish "ł").
5. The `ui_language` analytics values: `src/lib/analytics.ts` and `workers/stats/src/event.ts` together; the stats Worker must be deployed before the new value counts.
6. Nothing in `routes.ts`: its cookie value and `Accept-Language` rules derive from `LANGS`, so `/about` reaches `/<lang>/about` by itself.
7. eBird's locales for its bird names in `NAME_LOCALES` (the names build), with their regional fallbacks, and `pickNameLocale`; group names in `GROUP_LOCALES` (`build-groups.ts`). Until those exist the language shows English bird and group names.
