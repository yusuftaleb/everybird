// English's client strings (`ui`), alone in this module: the I18nProvider's fallback imports it, so the server-only
// `page` prose (en.ts) never reaches the client bundle. en.ts re-exports it; see there for the shape of the values.
import type { Plural } from '../core'

export const EN_UI = {
  /** Number separators (src/i18n/format.ts): grouped from 4 digits. */
  num: { group: ',', decimal: '.' },
  /** Dates: the 12 short months, January first the share images' date stamp too ("14 Nov 2026", no lead). */
  date: {
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  },
  /** The count's label under the number (Tally, share images, link previews). At most 8 characters: the hole is sized for it. */
  count: {
    label: 'species',
    /** The settled count for screen readers (Tally's live region): "12 species". {n} is the formatted number. */
    live: { one: '{n} species', other: '{n} species' },
  },
  /** The top bar (TopBar, ThemeToggle) and the footer (SiteFooter) on every page. */
  shell: {
    nav: {
      /** The nav's aria-label. */
      label: 'Everybird',
      collage: 'Collage',
      settings: 'Settings',
      about: 'About',
    },
    /** The theme switch's aria-label. */
    darkMode: 'Dark mode',
    footer: {
      credits: 'All credits',
      madeBy: 'Made by Yusuf Taleb',
      coffee: 'Buy me a coffee',
      /** The GitHub link's aria-label. */
      github: 'Everybird on GitHub',
    },
    /** The top bar's language button (LanguageMenu, variant lang:a): its aria-label ({name} from LANG_NAMES) and its menu's. */
    language: {
      button: 'Language: {name}',
      menu: 'Language',
    },
  },
  /** Settings (SettingsPage). */
  settings: {
    /** Your data > the language select's label (LanguageField). */
    language: 'Language',
    /** The button after the language select: the language changes (and the page reloads) only when it is pressed. */
    languageChange: 'Change language',
    /** Your data > the English-names switch (EnglishNamesSwitch), shown when the UI isn't English. */
    enNames: {
      label: 'Show bird names in English',
      note: 'Wherever bird names appear, on this device.',
    },
    /** "See my collage", after the summary line once an import landed. */
    seeCollage: 'See my collage',
    /** Your data (SettingsPage, RestoreBackup). */
    data: {
      head: 'Your data',
      noteMine: 'Your list lives on this device. Download it, or move it to another device with the backup.',
      noteRestore: 'Moving from another device? Restore the backup you downloaded there.',
      /** Name your collage (NameField). */
      name: {
        label: 'Name your collage',
        placeholder: 'e.g. Yusuf’s life list',
        helper: 'Shown as your collage’s title and on shares.',
      },
      downloadCsv: 'Download CSV',
      downloadJson: 'Download JSON backup',
      restore: 'Restore from backup',
      forget: 'Forget my list',
      restoreAsk: 'Replace your list with this backup? Download your current list first if you want to keep it.',
      restoreYes: 'Yes, replace it',
      restoreKeep: 'Keep my list',
      forgetAsk: 'Forget this list on this device? Download a backup first if you want to keep it.',
      forgetYes: 'Yes, forget it',
      forgetKeep: 'Keep it',
      /** A backup that couldn't be read: the lead, then why (fromJson's BackupError reason). English shows fromJson's
       *  own message as the reason, so its wording stays exactly as it was. */
      restoreFailed: "Couldn't restore this backup.",
      restoreWhy: {
        json: 'This file is not valid JSON.',
        notBackup: 'This is not an Everybird backup.',
        version: 'Unsupported backup version.',
        damaged: 'Parts of this backup are damaged.',
      },
    },
  },
  /** The collage page and the collage block every page shares (CollagePage, CollageView, ControlsBar, DockSearch,
   *  Collage's stage, Notices, UndoToast). The stats line and the Timeline readout join their parts with " · " in code. */
  collage: {
    /** The collage page's title when the collage has none (pageTitle). */
    untitled: 'My collage',
    addBirds: 'Add birds',
    share: 'Share',
    /** The collage block's accessible name: the birder's own, the landing sample, a shared link's. */
    regionYours: 'Your collage',
    regionSample: 'Sample collage',
    regionShared: 'Shared collage',
    /** Under the stats: rows no species matched, and the link to Settings' match report (joined by " · " in code). */
    unmatched: { one: "{n} row couldn't be matched", other: "{n} rows couldn't be matched" },
    fix: { one: 'Fix it', other: 'Fix them' },
    /** The stats line's parts ("197 species · 20 orders · 50 families · since Jan 2020"; filtered "12 of 197 species"). */
    stats: {
      species: { one: '{n} species', other: '{n} species' },
      /** Plural on {total}. */
      of: { one: '{n} of {total} species', other: '{n} of {total} species' },
      orders: { one: '{n} order', other: '{n} orders' },
      families: { one: '{n} family', other: '{n} families' },
      since: 'since {date}',
      threatened: '{n} threatened',
      threatenedGlobal: '{n} globally threatened',
      threatenedSr: '(Vulnerable, Endangered or Critically Endangered)',
    },
    /** The stage's placeholder while the first layout is packed. */
    arranging: 'arranging the stickers',
    /** The legend under the collage (its parts joined by " · " in code). */
    legend: {
      latest: 'Latest: {name}',
      latestOn: 'Latest: {name}, <time>{date}</time>',
      sizesEven: 'Sizes follow body mass, evened out so small birds stay visible',
      sizesTrue: 'Sizes follow body mass at true scale',
      marks: '* heard only · † found dead',
    },
    /** The stage's accessible name. */
    stage: {
      even: {
        one: 'Collage of {n} species, sized by body mass. Use the arrow keys to move between birds.',
        other: 'Collage of {n} species, sized by body mass. Use the arrow keys to move between birds.',
      },
      trueScale: {
        one: 'Collage of {n} species, sized by body mass at true scale. Use the arrow keys to move between birds.',
        other: 'Collage of {n} species, sized by body mass at true scale. Use the arrow keys to move between birds.',
      },
    },
    /** The controls bar. `…Short` labels show on narrow bars; `…Sr` follows the label for screen readers only. */
    controls: {
      view: 'View',
      collage: 'Collage',
      list: 'List',
      heaviestFirst: 'Heaviest first',
      lightestFirst: 'Lightest first',
      heaviest: 'Heaviest',
      lightest: 'Lightest',
      sortedHeaviest: 'Sorted by body mass, heaviest first. Reverse order',
      sortedLightest: 'Sorted by body mass, lightest first. Reverse order',
      trueSize: 'True size',
      trueShort: 'True',
      trueSr: 'sticker sizes',
      trueTitle: 'Size by body mass at true scale (big birds dwarf small ones)',
      sci: 'Scientific',
      sciShort: 'Sci.',
      sciSr: 'names',
      markNewest: 'Mark latest lifer',
      markFirst: 'Mark first lifer',
      newestSr: ', latest lifer',
      firstSr: ', first lifer',
    },
    /** The dock search (DockSearch). */
    search: {
      find: 'Find a bird',
      close: 'Close search',
      results: 'Matching birds and groups',
      elsewhere: 'Elsewhere on the list',
      order: 'Order',
      family: 'Family',
      species: 'Species',
      noneYour: 'No bird on your list matches “{q}”.',
      noneThis: 'No bird on this list matches “{q}”.',
      matches: { one: '{n} match', other: '{n} matches' },
    },
    /** The close buttons' aria-label (the welcome, sheets, the Places and Time sheet). */
    close: 'Close',
    /** "Removed … · Undo" (UndoToast; Tick by hand uses it too). */
    undo: 'Undo',
    removed: { one: 'Removed {name}.', other: 'Removed {n} birds.' },
    /** Notices on every page of the app (Notices.tsx); `loadFailed` on a shared view too. */
    notices: {
      memory: "This list won't be saved on this device. Your browser is blocking storage (private browsing does this), so download a backup before you leave.",
      forgetFailed: "Couldn't clear this device's copy. Clear this site's data in your browser settings to remove it.",
      loadFailed: "Couldn't load the bird data. Check your connection and reload the page.",
    },
  },
  /** The taxonomy filter (FilterBar, LevelRow, SheetPicker, PickerSheet, Chip), the Filters button, panel and chips
   *  (Filters, filter-summary.ts) and the Time panel (Timeline, timeline.ts). */
  filters: {
    label: 'Filters',
    nav: 'Filter by group',
    all: 'All birds',
    /** A level's mono label and its sheet's title. */
    rank: { order: 'Orders', family: 'Families', country: 'Countries', year: 'Years' },
    /** The phone's picker button. */
    choose: { order: 'Choose an order', family: 'Choose a family', country: 'Choose a country', year: 'Choose a year' },
    /** A removable chip's aria-label. */
    remove: 'Remove {label} filter',
    /** The Filters sections' names (the panel, the chips and the button's spoken text). */
    group: 'Bird group',
    places: 'Places',
    time: 'Time',
    status: 'Conservation status',
    clear: 'Clear',
    /** The Filters panel's head and sheet button ({species} is "118 species"), the chip row and its chips. */
    panel: {
      chips: 'Active filters',
      head: 'Filters · {n} · {species}',
      headNone: 'Filters · {species}',
      show: 'Show {species}',
      manyPlaces: '{n} places',
      manyStatuses: '{n} statuses',
      openChip: 'Show {label} in Filters',
      clearChip: 'Remove all {label}',
      clearAll: 'Clear all',
      clearAllLabel: 'Clear all filters',
    },
    /** The count-first heads of the Places and Status lists ("20 countries"), and " · 7 checked" after them. */
    countHead: {
      continent: { one: '{n} continent', other: '{n} continents' },
      region: { one: '{n} region', other: '{n} regions' },
      country: { one: '{n} country', other: '{n} countries' },
      province: { one: '{n} state or province', other: '{n} states and provinces' },
      county: { one: '{n} county', other: '{n} counties' },
      status: { one: '{n} category', other: '{n} categories' },
      checked: '{n} checked',
    },
    timeline: {
      /** Full month names, January first (the sliders' value text, the Time button's spoken text). */
      months: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      /** A month in full ("March 2020"). */
      month: '{month} {year}',
      /** A range, both months included ("Mar 2020 to Jun 2021"). */
      range: '{from} to {to}',
      from: 'From {month}',
      upTo: 'Up to {month}',
      /** The Time button's short summary ("Time · from 2022"). */
      sumFrom: 'from {year}',
      sumTo: 'to {year}',
      /** The Time button's spoken text. */
      spokenFrom: 'from {month}',
      spokenUpTo: 'up to {month}',
      start: 'Start month',
      end: 'End month',
      empty: 'This list has no dates, so there is no timeline.',
    },
    /** The Time section's basis switch (Filter.basis) and how "seen" reads in chips, labels and share images. */
    basis: {
      label: 'Count a bird by',
      first: 'First seen',
      any: 'Seen any time',
      seenIn: 'Seen in {places}',
      seenTime: 'Seen: {time}',
    },
  },
  /** The Places panel (PlacesList, PlacesDrill, places-shared). Country names come from the data
   *  (src/lib/i18n-places.ts); province and county names are local names. */
  places: {
    head: { continent: 'Continents', region: 'Regions', country: 'Countries', province: 'States and provinces', county: 'Counties' },
    find: { continent: 'Find a country or region', region: 'Find a region', country: 'Find a country', province: 'Find a state or province', county: 'Find a county' },
    noMatch: { continent: 'No place matches.', region: 'No region matches.', country: 'No country matches.', province: 'No state or province matches.', county: 'No county matches.' },
    allCountries: 'All countries',
    /** The breadcrumb's first step when the top level lists the continents. */
    allContinents: 'All continents',
    /** The drilled level's first row, the parent's own checkbox ("All of Canada"). */
    allOf: 'All of {place}',
    /** The drill buttons' aria-labels (design a). */
    drill: { continent: 'Show countries in {place}', country: 'Show states and provinces in {place}', province: 'Show counties in {place}' },
    /** The disclosure buttons' and open groups' names (design b). */
    group: { continent: 'Countries in {place}', country: 'States and provinces in {place}', province: 'Counties in {place}' },
    none: 'No places on this list.',
    emptyFiltered: 'No places here under the other filters.',
    emptyNow: 'No places here on your list now.',
    /** The lifer-only note; <link> goes to Settings' MyEBirdData panel. */
    note: {
      add: 'Places only knows where you first recorded each bird. <link>Add MyEBirdData</link> to filter by every place you recorded each bird, down to the county.',
      reimport: 'Places only knows where you first recorded each bird. <link>Import MyEBirdData again</link> to filter by every place you recorded each bird.',
    },
    /** The Places panel's line about birds only on the observation.org life list (no places); <link> goes to the observations' Add panel. */
    unplaced: {
      plain: 'Birds only on your observation.org life list have no places, so a place filter leaves them out.',
      add: 'Birds only on your observation.org life list have no places, so a place filter leaves them out. <link>Add the observations export</link> to place them by country and province.',
    },
    /** Three or more places on the share image ("Canada and 2 more"; two are joined by " + " in code). */
    andMore: '{first} and {n} more',
    /** Each continent's name by id (`CONTINENTS` in src/lib/places/continents.ts): the Places top level, its breadcrumb and the share image. */
    continents: { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', SA: 'South America', OC: 'Oceania', AN: 'Antarctica' },
    regions: {
      latam: 'Latin America & Caribbean',
      me: 'Middle East',
      'northern-africa': 'Northern Africa',
      'eastern-africa': 'Eastern Africa',
      'middle-africa': 'Middle Africa',
      'southern-africa': 'Southern Africa',
      'western-africa': 'Western Africa',
      'northern-america': 'Northern America',
      'central-america': 'Central America',
      'south-america': 'South America',
      caribbean: 'Caribbean',
      'central-asia': 'Central Asia',
      'eastern-asia': 'Eastern Asia',
      'south-eastern-asia': 'South-eastern Asia',
      'southern-asia': 'Southern Asia',
      'western-asia': 'Western Asia',
      'eastern-europe': 'Eastern Europe',
      'northern-europe': 'Northern Europe',
      'southern-europe': 'Southern Europe',
      'western-europe': 'Western Europe',
      'australia-nz': 'Australia & New Zealand',
      melanesia: 'Melanesia',
      micronesia: 'Micronesia',
      polynesia: 'Polynesia',
    },
  },
  /** Global IUCN Red List categories (the codes LC … DD stay as they are): their full names, the share image's label for
   *  Vulnerable + Endangered + Critically Endangered, and the card badge's spoken suffix. */
  iucn: {
    names: {
      LC: 'Least Concern',
      NT: 'Near Threatened',
      VU: 'Vulnerable',
      EN: 'Endangered',
      CR: 'Critically Endangered',
      EW: 'Extinct in the Wild',
      EX: 'Extinct',
      DD: 'Data Deficient',
      NE: 'Not evaluated',
    },
    threatened: 'Threatened',
    /** The card pill's name (a button whose tip shows the full name). */
    pillName: 'Red List: {name}',
  },
  /** The Status panel (StatusList). {n} is formatted. */
  status: {
    threatenedNote: '{n} threatened: Vulnerable, Endangered or Critically Endangered.',
    list: 'Categories',
    none: 'No categories here under the other filters.',
  },
  /** The bird card and the hover tooltip (BirdCard, BirdTip), the list view (ListView), the marks (Marks) and the
   *  card's edit actions (EditBird). */
  card: {
    close: 'Close',
    noDrawing: 'No drawing yet for this species.',
    assignedRegion: 'Assigned by region',
    assignedDefault: 'Assigned by default',
    mass: 'Average body mass',
    massFamily: 'Average body mass, estimated from its family',
    massOrder: 'Average body mass, estimated from its order',
    massGenus: 'Average body mass, estimated from its genus',
    heard: 'Heard only',
    dead: 'Found dead',
    /** The list view's accessible name. */
    list: 'Life list',
    marks: 'Marks',
    markAs: 'Mark as',
    resetMarks: 'Marks from my records',
    remove: 'Remove from my list',
  },
  /** The landing page (Landing, SampleDemo) and the first visit's welcome (Welcome). */
  landing: {
    title: 'A lifetime of birds.',
    lede: 'Your life list as a sticker collage, from eBird, iNaturalist, or by hand.',
    makeYours: 'Make yours',
    samplePrefix: "Sample: a demo birder's life list",
    sampleFailed: "Couldn't load the sample collage. Check your connection and reload the page.",
    welcome: 'A lifetime of birds, as a sticker collage.',
    makeMine: 'Make mine',
    explore: 'Explore the sample',
  },
  /** The shared view's page (/s/[token]) and SharedView. A link's own title and the page metadata are og.ts's. */
  shared: {
    brokenTitle: "This link didn't open",
    brokenLede: "It may be cut off, or made by a newer Everybird. Everybird turns a birder's life list into a sticker collage.",
    lede: "Everybird turns a birder's life list into a sticker collage.",
    /** The h1 of a link without a title. */
    untitled: "A birder's life list",
    endCta: 'Your list, from eBird, iNaturalist or by hand, as a collage like this.',
    noPlacesDates: 'This link carries no places or dates, so those filters are left out.',
    noPlaces: 'This link carries no places, so those filters are left out.',
    noDates: 'This link carries no dates, so those filters are left out.',
  },
  /** Plain labels for the bird orders (scientific name -> label): every order in species.v1.json. English is a copy of
   *  src/lib/species/orders.ts ORDERS (tests/i18n.test.ts keeps them equal). */
  orders: {
    Struthioniformes: 'Ostriches',
    Casuariiformes: 'Cassowaries and emu',
    Apterygiformes: 'Kiwis',
    Rheiformes: 'Rheas',
    Tinamiformes: 'Tinamous',
    Anseriformes: 'Waterfowl',
    Galliformes: 'Gamebirds',
    Columbiformes: 'Pigeons and doves',
    Mesitornithiformes: 'Mesites',
    Pterocliformes: 'Sandgrouse',
    Otidiformes: 'Bustards',
    Musophagiformes: 'Turacos',
    Cuculiformes: 'Cuckoos',
    Caprimulgiformes: 'Nightjars',
    Nyctibiiformes: 'Potoos',
    Steatornithiformes: 'Oilbird',
    Podargiformes: 'Frogmouths',
    Aegotheliformes: 'Owlet-nightjars',
    Apodiformes: 'Swifts and hummingbirds',
    Gruiformes: 'Cranes and rails',
    Charadriiformes: 'Shorebirds and gulls',
    Phoenicopteriformes: 'Flamingos',
    Podicipediformes: 'Grebes',
    Opisthocomiformes: 'Hoatzin',
    Eurypygiformes: 'Kagu and sunbittern',
    Phaethontiformes: 'Tropicbirds',
    Gaviiformes: 'Loons',
    Sphenisciformes: 'Penguins',
    Procellariiformes: 'Albatrosses and petrels',
    Ciconiiformes: 'Storks',
    Suliformes: 'Cormorants',
    Pelecaniformes: 'Herons',
    Cathartiformes: 'New World vultures',
    Accipitriformes: 'Hawks and eagles',
    Strigiformes: 'Owls',
    Coliiformes: 'Mousebirds',
    Leptosomiformes: 'Cuckoo-roller',
    Trogoniformes: 'Trogons',
    Bucerotiformes: 'Hornbills and hoopoes',
    Coraciiformes: 'Kingfishers and bee-eaters',
    Piciformes: 'Woodpeckers',
    Cariamiformes: 'Seriemas',
    Falconiformes: 'Falcons',
    Psittaciformes: 'Parrots',
    Passeriformes: 'Perching birds',
  },
  /** The share dialog (ShareDialog), the share images' words (image.ts) and the link preview's (og.ts, the image
   *  route). The credits (FOOTER_LINE, SHARE_CREDIT) and the download names stay English and are not here. */
  share: {
    title: 'Share your collage',
    /** The format control's group name and its three segments (their 9:16, 4:5, 1:1 hints are in code). */
    formats: 'Image format',
    format: { story: 'Story', post: 'Post', square: 'Square', desktop: 'Desktop' },
    /** A format button's spoken name: the label and its ratio, which the button hides when it is tight. */
    formatName: '{name}, {ratio}',
    /** The orientation switch above the format control (Vertical or Horizontal; Square has neither). */
    orientation: { group: 'Orientation', vertical: 'Vertical', horizontal: 'Horizontal' },
    countSize: { label: 'Count size', small: 'Small', medium: 'Medium', large: 'Large', hide: 'Hide' },
    /** The preview image's alt text, per format. */
    preview: { story: 'Preview of the story image', post: 'Preview of the post image', square: 'Preview of the square image', desktop: 'Preview of the desktop image', wide: 'Preview of the wide post image' },
    failed: "Couldn't make the image.",
    imageFailed: 'Couldn’t make the image. Try again.',
    linkFailed: 'Couldn’t make the link. Try again.',
    tooLarge: 'This list is too large for a link. Share the image instead.',
    nameLabel: 'Collage title',
    namePlaceholder: 'My 2024 birds',
    nameOptional: '(optional)',
    showLatest: 'Show latest lifer',
    shareImage: 'Share image',
    download: 'Download image',
    copyLink: 'Copy link',
    /** After a download; {file} is the file's name (everybird-story.png, English in every language). */
    saved: 'Saved {file}.',
    savedPost: 'Saved {file}. Post it from your photos or files.',
    /** Copy link's note: `copied`, then the level's reason when the list was too large for regions, then `dropped`
     *  (joined by a space in code). Copied by hand: the reason, `dropped`, then `copyThis`. */
    copied: 'Link copied.',
    level: {
      countries: 'Your list is large, so the link carries countries instead of regions.',
      dates: 'Your list is large, so the link carries dates but no places.',
      species: 'Your list is large, so the link carries the species only, without dates or places.',
    },
    dropped: { one: '{n} bird is too new for links and left out.', other: '{n} birds are too new for links and left out.' },
    copyThis: 'Copy this link:',
    /** The hand-copy field's aria-label. */
    linkField: 'Share link',
    filters: 'Showing your filters: {label}',
    filtersNoLabel: 'Showing your filters.',
    clearFilters: 'Clear filters',
    /** The latest lifer row's mono label on the images and the link preview ("LATEST LIFER · SEP 2026"; upper-cased in code). */
    latestLifer: 'Latest lifer',
    /** A link made before titles carries a bare name: its title (og.ts shareTitle). */
    oldLinkTitle: "{name}'s life list",
    /** The shared page's document title for a link without a title ({n} formatted). */
    untitledTitle: { one: 'A life list: {n} species', other: 'A life list: {n} species' },
    /** The "Dark image" switch, and Download's short label in the row of quiet buttons. */
    dark: 'Dark image',
    bigYear: {
      label: 'Big Year',
      year: 'Year',
      target: 'Target',
      targetPlaceholder: 'Species',
      card: 'Big Year {year}',
      cardLifer: 'Big Year {year} · New species in {year}',
    },
    downloadShort: 'Download',
    /** Print mode (a poster in A1 to A4; the sizes, PNG, PDF and dpi stay as they are). */
    print: {
      print: 'Print',
      entry: 'Print a poster',
      size: 'Poster size',
      inches: '{w} × {h} in',
      sizeLine: '{size} · {w} × {h} cm · {pw} × {ph} px at 150 dpi',
      sizeLineIn: '{w} × {h} in · {pw} × {ph} px at 150 dpi',
      make: 'Make poster',
      making: 'Making the poster',
      makingNote: 'Making the poster.',
      again: 'Make again',
      cancel: 'Cancel',
      png: 'Download PNG',
      pdf: 'Download PDF',
      ready: 'Your {size} poster is ready.',
      missing: { one: '1 sticker didn’t load and is drawn as an outline. Make the poster again to retry.', other: '{n} stickers didn’t load and are drawn as outlines. Make the poster again to retry.' },
      soft: 'Some stickers come from smaller files for now, so the biggest birds may print a little soft.',
      failedMemory: 'Couldn’t make the poster. Try a smaller size.',
      failed: 'Couldn’t make the poster. Try again.',
      back: 'Share images',
      previewAlt: 'Preview of the {size} poster',
      bulk: {
        title: 'Multiple posters (ZIP)',
        splitLabel: 'Split by',
        splits: {
          batches: 'Up to 1,000 per poster',
          family: 'Family',
          order: 'Order',
          country: 'Country',
          continent: 'Continent',
          province: 'State or province',
          year: 'Year',
        },
        batch: 'Part {n}',
        count: { one: '{n} poster', other: '{n} posters' },
        empty: 'No posters to make for this choice.',
        png: 'Download PNGs (ZIP)',
        pdf: 'Download PDFs (ZIP)',
        progress: 'Poster {done} of {total}',
        makingNote: 'Making the ZIP.',
        ready: { one: 'Saved {file} ({n} poster).', other: 'Saved {file} ({n} posters).' },
        failed: 'Couldn’t make the ZIP. Try again.',
      },
      showNames: 'Show species names',
      namesCap: '{size} fits up to {max} species with names. Pick a larger size or filter your list.',
      namesNoFit: 'Names won’t fit cleanly on {size}. Pick a larger size or filter your list.',
    },
  },
  /** Settings > Your list (ImportPanel, SourceLine, SourceMenu, EbirdDrop, InatForm, NotCounted, MatchReport,
   *  SpeciesSearch, source-counts.ts) and the import jobs' messages (use-import-jobs.ts). eBird, MyEBirdData and
   *  iNaturalist are names and stay as they are. */
  import: {
    head: 'Your list',
    combine: 'Combine any of these into one list.',
    privacy: 'Your list never leaves your browser. We count visits anonymously.',
    /** The eBird rows' group (its aria-label). */
    ebirdGroup: 'eBird files',
    /** The summary line ("Your collage has 199 species: 185 from eBird, 11 more from iNaturalist, 3 ticked by hand.").
     *  `head` is plural on the total, each part on its own number; the parts are joined with ", " in code. */
    summary: {
      head: { one: 'Your collage has {n} species', other: 'Your collage has {n} species' },
      list: '{head}: {parts}.',
      /** One source, plural on the total: "Your collage has 576 species, all from iNaturalist." */
      one: '{head}, {all}.',
      all: {
        ebird: { one: 'all from eBird', other: 'all from eBird' },
        inat: { one: 'all from iNaturalist', other: 'all from iNaturalist' },
        obsorg: { one: 'all from observation.org', other: 'all from observation.org' },
        sheet: { one: 'all from your spreadsheet', other: 'all from your spreadsheet' },
        scythebill: { one: 'all from Scythebill', other: 'all from Scythebill' },
        manual: { one: 'all ticked by hand', other: 'all ticked by hand' },
      },
      /** The first part. */
      first: {
        ebird: { one: '{n} from eBird', other: '{n} from eBird' },
        inat: { one: '{n} from iNaturalist', other: '{n} from iNaturalist' },
        obsorg: { one: '{n} from observation.org', other: '{n} from observation.org' },
        sheet: { one: '{n} from your spreadsheet', other: '{n} from your spreadsheet' },
        scythebill: { one: '{n} from Scythebill', other: '{n} from Scythebill' },
        manual: { one: '{n} ticked by hand', other: '{n} ticked by hand' },
      },
      /** A later part: the species it adds to the ones before (eBird is always first when it is on the list). */
      more: {
        inat: { one: '{n} more from iNaturalist', other: '{n} more from iNaturalist' },
        obsorg: { one: '{n} more from observation.org', other: '{n} more from observation.org' },
        sheet: { one: '{n} more from your spreadsheet', other: '{n} more from your spreadsheet' },
        scythebill: { one: '{n} more from Scythebill', other: '{n} more from Scythebill' },
        manual: { one: '{n} ticked by hand', other: '{n} ticked by hand' },
      },
    },
    /** A row's counts (countParts): "185 species · 12 only here". */
    species: { one: '{n} species', other: '{n} species' },
    onlyHere: '{n} only here',
    onlyEbird: '{n} only in eBird',
    onlyObsorg: '{n} only in observation.org',
    /** "· 10 skipped why?" (SourceRow): the entries that weren't counted, and the button that says why. */
    skipped: { one: '{n} skipped', other: '{n} skipped' },
    why: 'why?',
    whyLabel: { one: 'Why {n} skipped?', other: 'Why {n} skipped?' },
    /** A row's status. */
    notAdded: 'Not added',
    noneYet: 'None yet',
    detailsUnknown: 'Details unknown',
    usernameUnknown: 'Username unknown: enter it again to refresh',
    imported: 'Imported {date}',
    updated: 'Updated {date}',
    /** The row's buttons and its ⋯ menu ({title} is the source's name). */
    add: 'Add',
    addLabel: 'Add {title}',
    replace: 'Replace',
    replaceLabel: 'Replace {name}',
    more: 'More for {title}',
    remove: 'Remove',
    /** Remove's one question; {what} is the row's `…What` below. */
    removeLabel: 'Remove {what}',
    removeAsk: 'Remove {what}? Its birds leave your collage unless another source has them. Your edits stay.',
    removeYes: 'Yes, remove it',
    keep: 'Keep it',
    /** The two observation.org rows (ObsOrgDrop), their notes, errors and the built sentences (obsorg-copy.ts). Menu names in the how-to are observation.org's own (English) site. */
    obsorg: {
      group: 'observation.org files',
      input: 'observation.org file',
      choose: 'Choose your observation.org file',
      howTo: 'How do I get this file?',
      rows: {
        'obsorg-list': { title: 'observation.org life list', guide: 'Your Observed species list from observation.org. It gives each bird\'s first date, but no places.', help: 'On observation.org: open Observed species, choose Birds and Life list, then Export as CSV. Everybird reads the CSV, not the Excel file.', what: 'your observation.org life list' },
        obsorg: { title: 'observation.org observations', guide: 'Every bird observation you made on observation.org. It places each bird by country and province, so Places can filter them.', help: 'On observation.org: open your Observations, choose Birds, then Export as CSV. Everybird reads the CSV, not the Excel file.', what: 'your observation.org observations' },
      },
      /** A connected row's name when the browser gave no file name. */
      fallback: { 'species-list': 'observation.org Observed species', observations: 'observation.org observations export' },
      /** Under the rows while only the life list is on the list; <link> opens the observations' Add panel. */
      note: 'Your observation.org life list has no places, so Places can\'t filter these birds. <link>Add the observations export</link> to place each bird by country and province.',
      errors: {
        unknown: 'Couldn\'t read this file. Use observation.org\'s Observed species export or your observations export, as a CSV.',
        noBirds: 'No birds in this file. On observation.org, choose Birds before you export.',
        damaged: 'Couldn\'t read this file. It may be damaged or not an observation.org export.',
        xlsx: 'This is an Excel file. Everybird reads CSV files: export as CSV and add that file instead.',
        data: 'Couldn\'t load Everybird\'s bird data. Check your connection and try again.',
      },
      notSpecies: { one: '{n} entry isn\'t a species: birds only identified to a group (like “Motacilla spec.”), either/or IDs, hybrids, forms and varieties.', other: '{n} entries aren\'t species: birds only identified to a group (like “Motacilla spec.”), either/or IDs, hybrids, forms and varieties.' },
      escape: { one: '{n} observation marked as an escape isn\'t counted.', other: '{n} observations marked as escapes aren\'t counted.' },
      uncertain: { one: '{n} observation marked uncertain isn\'t counted.', other: '{n} observations marked uncertain aren\'t counted.' },
      both: '{escape} and {uncertain} aren\'t counted.',
      bothEscape: { one: '{n} observation marked as an escape', other: '{n} observations marked as escapes' },
      bothUncertain: '{n} marked uncertain',
      notCountedLabel: { one: '{n} observation not counted', other: '{n} observations not counted' },
      notCountedAsk: { one: 'Why {n} not counted?', other: 'Why {n} not counted?' },
      whereList: 'observation.org life list row {row}',
      whereRow: 'observation.org row {row}',
    },
    sheet: {
      title: 'Spreadsheet or list',
      what: 'your spreadsheet or list',
      guide: 'Upload an Excel (.xlsx), CSV or text file, or paste a list below. Any column of English or scientific bird names works; dates, places and a column of ticks (x) are optional.',
      choose: 'Choose your file',
      input: 'Spreadsheet or list file',
      pasteLabel: 'Paste a list of bird names',
      pastePlaceholder: 'Paste bird names, one per line, or columns from a spreadsheet:\nMallard\nBarn Swallow, 2024-05-12, France',
      checkPaste: 'Check pasted list',
      fallback: { file: 'Spreadsheet', paste: 'Pasted list' },
      review: {
        matched: { one: '{n} species matched', other: '{n} species matched' },
        duplicates: { one: '{n} duplicate', other: '{n} duplicates' },
        notSpecies: { one: '{n} not a species', other: '{n} not species' },
        unmatched: { one: '{n} unmatched', other: '{n} unmatched' },
        suggestion: '{name} → {suggestion}',
        more: '{n} more',
        note: 'You can fix any unmatched names after adding.',
        add: { one: 'Add {n} species', other: 'Add {n} species' },
        replace: { one: 'Replace with {n} species', other: 'Replace with {n} species' },
        addEmpty: 'Add list',
        cancel: 'Cancel',
      },
      whereRow: 'Spreadsheet row {row}',
      errors: {
        unsupported: 'Everybird can’t read this format. Save it as Excel (.xlsx) or CSV and add that file instead.',
        unknown: 'Couldn’t read this file. Use an Excel (.xlsx), CSV or text file.',
        noBirds: 'No birds found in this file or list.',
        damaged: 'Couldn’t read this file. It may be damaged or not a spreadsheet.',
      },
    },
    scythebill: {
      title: 'Scythebill',
      what: 'your Scythebill export',
      guide: 'Your Scythebill CSV export, or its export formatted for eBird. Places each bird by country, state or province, and county.',
      help: 'In Scythebill: Reports, then Export, and choose CSV or formatted for eBird.',
      howTo: 'How do I get this file?',
      choose: 'Choose your Scythebill file',
      input: 'Scythebill file',
      fallback: { csv: 'Scythebill CSV', 'ebird-record': 'Scythebill eBird export' },
      whereRow: 'Scythebill row {row}',
      errors: {
        unknown: 'Couldn\'t read this file. Use a Scythebill CSV export or a Scythebill file formatted for eBird.',
        noBirds: 'No birds found in this Scythebill file.',
        damaged: 'Couldn’t read this file. It may be damaged or not a Scythebill export.',
      },
    },
    /** The two eBird rows (EbirdDrop). */
    ebird: {
      listTitle: 'eBird life list',
      /** A file's name when it wasn't kept. */
      listFile: 'eBird life list download',
      fullFile: 'eBird full export',
      listWhat: 'your eBird life list download',
      fullWhat: 'your eBird full export',
      listGuide: 'Your World life list from eBird. It downloads at once, and places each bird to the state or province.',
      fullGuide: 'eBird’s full export of every checklist. It places birds down to the region (county), and joins your life list if you add both.',
      listHelp: "On eBird: My eBird, then your World life list total, then Download. It's instant, and places go down to the state or province.",
      fullHelp: 'On eBird: Download My Data (under My eBird). eBird emails you MyEBirdData.csv; it places birds down to the region (county).',
      choose: 'Choose your eBird file',
      drop: 'or drop it here',
      howTo: 'How do I get this file?',
      /** The hidden file input's aria-label. */
      input: 'eBird file',
      reading: 'Reading your file…',
      readingRows: { one: 'Reading your file… {n} row', other: 'Reading your file… {n} rows' },
      /** Under the rows with only the life list download; <link> opens MyEBirdData's Add panel. */
      liferNote: 'Your eBird life list only says where you first recorded each bird, so Places filters by those first places. <link>Add MyEBirdData</link> to filter by every place you recorded each bird, down to the county.',
      liferLink: 'Add MyEBirdData for every place',
      /** use-import-jobs.ts: a file that isn't an eBird export, and one that failed to read. */
      unknownFile: "Couldn't read this file. Use eBird's life list download or MyEBirdData.csv.",
      damaged: "Couldn't read this file. It may be damaged or not an eBird export.",
    },
    /** iNaturalist's row (InatForm). */
    inat: {
      what: 'your iNaturalist birds',
      refresh: 'Refresh',
      refreshLabel: 'Refresh {user} from iNaturalist',
      cancel: 'Cancel',
      change: 'Change username',
      guide: 'Your public, wild bird observations identified to species. iNaturalist sees the username; your list stays here.',
      guideReplaces: 'Fetching replaces only your iNaturalist birds. Your edits stay.',
      /** The field's label and placeholder. */
      username: 'iNaturalist username',
      fetch: 'Fetch my birds',
      keepUser: 'Keep {user}',
      howTo: 'How do I find my username?',
      help: 'Use your username (on your iNaturalist profile, after the @), not your display name. Only public, wild bird observations identified to species count.',
      fetched: 'Fetched {n} of {total}',
      lookingUp: 'Looking up “{user}”…',
      cancelled: 'Cancelled. Nothing was changed.',
      /** use-import-jobs.ts inatMessage, by the import's error code. */
      errors: {
        unknownUser: "We couldn't find an iNaturalist user called “{user}”. Check the username (not the display name).",
        noBirds: '“{user}” has no public bird observations on iNaturalist yet.',
        network: "Couldn't reach iNaturalist. Check your connection and try again.",
        rateLimited: 'iNaturalist is busy right now. Wait a minute, then try again.',
      },
    },
    /** What "why?" opens under a row (NotCounted). Plural on the entries or rows; the fix link is `collage.fix`. */
    notCounted: {
      groups: {
        one: "{n} entry isn't a species: birds only identified to a group (like “duck sp.”), either/or IDs (like “Greater/Lesser Scaup”) and hybrids. eBird leaves these off life lists too.",
        other: "{n} entries aren't species: birds only identified to a group (like “duck sp.”), either/or IDs (like “Greater/Lesser Scaup”) and hybrids. eBird leaves these off life lists too.",
      },
      notCountable: {
        one: '{n} species eBird marks as not countable, like escaped or introduced birds:',
        other: '{n} species eBird marks as not countable, like escaped or introduced birds:',
      },
      unmatched: {
        one: "{n} row couldn't be matched to this year's eBird taxonomy.",
        other: "{n} rows couldn't be matched to this year's eBird taxonomy.",
      },
    },
    /** The match report (MatchReport, #match); its head is `collage.unmatched`, its button `collage.fix`. */
    match: {
      note: "Not in this year's eBird taxonomy, so not counted yet. Pick the right bird for each.",
      inatRow: 'iNaturalist observation {row}',
      listRow: 'eBird life list row {row}',
      ebirdRow: 'eBird row {row}',
      row: 'Row {row}',
      use: 'Use {name}',
      byHand: 'Fix by hand',
      find: 'Find the right species for {name}',
    },
    /** The species search (SpeciesSearch, and Tick by hand's field); its results' name is `collage.search.matches`. */
    search: {
      placeholder: 'Common or scientific name',
      none: "No bird by that name in eBird's taxonomy.",
    },
  },
  /** Tick by hand (ImportPanel's row, TickList). The removal toast is `collage.removed`. */
  tick: {
    title: 'Ticked by hand',
    button: 'Tick birds',
    /** The button's aria-label and the list's heading. */
    label: 'Tick birds off a list',
    search: 'Search birds',
    order: 'Order',
    allOrders: 'All orders',
    family: 'Family',
    allFamilies: 'All families',
    list: 'Species to tick',
    /** A row's name for screen readers when the bird is already on the list ({name} is "Common, Scientific"). */
    onListLabel: '{name}, already on your list',
    onList: 'On your list',
    toRemove: 'To remove',
    bar: 'Add or remove the ticked birds',
    selected: { one: '{n} selected', other: '{n} selected' },
    toRemoveN: { one: '{n} to remove', other: '{n} to remove' },
    date: 'Date (optional)',
    datePlaceholder: 'Date: YYYY-MM-DD, YYYY-MM or YYYY',
    dateError: 'Use YYYY-MM-DD, YYYY-MM or YYYY.',
    country: 'Country (optional)',
    noCountry: 'No country',
    region: 'Region (optional)',
    wholeCountry: 'Whole country',
    addN: { one: 'Add {n} to my list', other: 'Add {n} to my list' },
    removeN: { one: 'Remove {n} from my list', other: 'Remove {n} from my list' },
    keepThem: 'Keep them',
    added: { one: 'Added {n} bird to your list.', other: 'Added {n} birds to your list.' },
  },
  /** Settings > Counting (RulesSwitches). */
  rules: {
    head: 'Counting',
    note: 'Only full species count, as on eBird; subspecies roll up into their species.',
    heard: 'Hide heard-only birds',
    heardNote: '* Birds you only heard. {n} on your list.',
    dead: 'Hide found-dead birds',
    deadNote: '† Birds you found dead. {n} on your list.',
    research: 'Research-grade iNaturalist only',
    researchNote: {
      one: 'Count iNaturalist sightings only once the community agrees on the ID. Affects {n} bird.',
      other: 'Count iNaturalist sightings only once the community agrees on the ID. Affects {n} birds.',
    },
    researchOff: 'For iNaturalist sightings. Add iNaturalist above to use it.',
  },
  /** About's "How it works" figure (HowItWorksDemo): its sticker credit (<link> is huashu-bird-sticker's repo) and the caption that tells the same story in words ({total} is the demo's species count). The scene itself draws the product's own keys. */
  demo: {
    credit: 'Stickers: <link>huashu-bird-sticker</link>, CC BY 4.0',
    caption: 'An animation of Everybird at work: an eBird export file is dropped onto Settings, under Your list, and its rows are read; MyEBirdData is connected and the collage has {total} species, all from eBird. Then the collage builds, stickers arriving around the count as it rolls up to {total} species. Choosing the Herons order brings the six herons into the middle; All birds, in the breadcrumb, brings everyone back. Share opens the share dialog: the image, with the stickers around {total} species, the latest lifer and the footer line, in the Story, Post and Square formats.',
  },
  /** Item 9's smart search (DockSearch): the "Understood as" chips, their apply button and the seen-dates note. */
  search: {
    understood: 'Understood as',
    show: 'Show these birds',
    note: 'Your list only has first-seen dates; import MyEBirdData.csv for every sighting',
  },
}

/** A messages type with its string literals widened: strings stay strings, plurals `Plural`, string arrays `readonly string[]`. */
export type Widen<T> = T extends string
  ? string
  : T extends readonly string[]
    ? readonly string[]
    : T extends Plural
      ? [Exclude<keyof T, keyof Plural>] extends [never]
        ? Plural
        : { [K in keyof T]: Widen<T[K]> }
      : { [K in keyof T]: Widen<T[K]> }

export type Ui = Widen<typeof EN_UI>
