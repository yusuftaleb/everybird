// English: the source of truth for every language. `Messages` is this file's shape, so es.ts, pt.ts and nl.ts fail
// `tsc` when a key is missing, and tests/i18n.test.ts fails when one is extra, empty or left in English.
//
// Values are plain data: strings with `{name}` variables and `<tag>chunk</tag>` markup (src/i18n/core.ts `fmt`,
// `rich`), `{ one, other }` plurals (`plural`) and arrays of strings. No functions, so `ui` can cross from a server
// layout to the client I18nProvider.
//
// `ui` is everything client code renders; `page` is server-only (About's prose, page metadata) and never reaches the
// provider. One key per area, in this order; a later task adds its area as a new key at the end of `ui` (collage,
// filters, card, landing, shared, places, settings, import, share, orders, ...) or of `page`, in all four files at once.
import { EN_UI, type Widen } from './en-ui'

const page = {
  /** Page metadata (title, description, Open Graph, Twitter) per language (generateMetadata under app/[lang]). Titles
   *  get " · Everybird" in code; the landing title describes the tool. The shared view's are og.ts's, from `ui`. */
  meta: {
    title: 'Everybird · Turn your bird life list into a collage',
    description: 'Turn your bird life list into a free sticker collage. Import from eBird, iNaturalist or observation.org, then share images or print a poster.',
    about: {
      title: 'About',
      description: 'What Everybird is, how it works, what True size means, and the data, stickers, fonts and code it is built from.',
    },
    settings: { title: 'Settings' },
  },
  /** About (app/[lang]/(app)/about/page.tsx). `<tag>` words become links; proper names, licences and the Buy Me a Coffee button stay as they are. */
  about: {
    lede: "Everybird turns any birder's life list into a sticker collage.",
    what: { head: 'What it is', body: 'Your life list is already the record of a lifetime of birds. Everybird lays it out as one collage: every species a sticker, sized by its body mass, with the count in the middle. Filter it by group, place, year or conservation status, then share it as an image or a link.' },
    how: {
      head: 'How it works',
      steps: [
        'Bring your list on <link>Settings</link>: an eBird or observation.org file, an iNaturalist username, or birds ticked by hand. Combine them if you keep more than one record.',
        "Each bird is matched to this year's eBird taxonomy and keeps its earliest date. Rows that don't match are listed, so nothing is dropped quietly.",
        'The collage, the filters and the share images are all made in your browser.',
      ],
      privacy: "Your list never leaves your browser. We count visits with Cloudflare Web Analytics, anonymous and cookieless, and a few actions (a collage made, an image shared or saved, a link copied) with a small counter of our own that never sees your birds, names or places. A daily-changing anonymous id lets us count unique visitors without tracking anyone across days. Neither runs if your browser asks not to be tracked. Your language choice is kept in a small cookie on this device; it never leaves it except to show you the right page. The visit count includes your browser's language (just “es”, “pt”, “nl” or “pl”).",
    },
    size: {
      head: 'What True size means',
      even: "Each sticker is sized from the bird's average body mass, from AVONET, by the area it covers on the page, so a peafowl's train or a heron's legs don't make it read small. The default evens sizes out: the area follows mass to the power of 0.4, so small birds stay visible next to big ones.",
      true: "True size uses the cube root of mass for length instead. Birds are roughly similar in density, so mass tracks volume, and its cube root tracks length: a bird eight times heavier is drawn about twice as long, covering four times the area. It's an estimate of relative size, not a measured length. Slim, long-necked birds can look a little small and chunky ones a little big, swimming poses hide part of the body, and each species uses one average mass, so males, females and seasons aren't told apart.",
    },
    status: {
      head: 'Conservation status',
      body: "Each species' status is its global IUCN Red List category, from {source}. It is global, not regional: a bird common where you live can still be threatened worldwide, and the other way round. Species without a category show none.",
    },
    credits: {
      head: 'Credits',
      madeBy: "Made by <you>Yusuf Taleb</you>. It grew out of the <life>life list on his site</life>, and is built from other people's generous work.",
      coffee: 'If you enjoy Everybird, you can buy Yusuf a coffee.',
      /** Each credit's mono label (its kind, then the licence). */
      label: {
        stickers: 'Stickers · CC BY 4.0',
        inspiration: 'Inspiration',
        taxonomy: 'Taxonomy',
        masses: 'Body masses · CC BY 4.0',
        redList: 'Red List categories · CC BY 4.0',
        api: 'API',
        countries: 'Country names · Public domain',
        regions: 'Region names · LGPL-2.1',
        fonts: 'Fonts · ITF Free Font License',
        mono: 'Font · OFL',
        flags: 'Flags · MIT',
        phosphor: 'Icons · MIT',
        icons8: 'Icons',
        code: 'Code · MIT',
      },
      stickers: { lead: 'Every bird sticker comes from huashu-bird-sticker by alchaincyf, licensed <cc>CC BY 4.0</cc>. The stickers were resized and trimmed for the web; nothing else was changed.', commit: 'Source commit <code>{sha}</code>.', tail: "About 2% of species don't have a sticker yet; they show as an outline, and new drawings arrive automatically as the sticker set grows." },
      inspiration: "Teddy Warner's Avian Visitors showed how lovely a wall of birds can be. Everybird started there.",
      taxonomyTitle: 'eBird and Clements',
      taxonomy: 'Bird names, species and their order follow the eBird/Clements taxonomy, version {version}, from the Cornell Lab of Ornithology. eBird and observation.org files are read in your browser.',
      masses: "Sticker sizes use body masses from AVONET (Tobias et al. 2022, Ecology Letters), via huashu's species table.",
      birdbase: "Sticker sizes for species that AVONET has no mass for use body masses from BIRDBASE (Şekercioğlu et al. 2025, Scientific Data).",
      redList: "IUCN Red List categories as given for BirdLife {birdlife} in AviList: The Global Avian Checklist, {version} (AviList Core Team, {year}), via huashu's species table, licensed <cc>CC BY 4.0</cc>. Everybird matched them to eBird species.",
      api: "Observations come from iNaturalist's public API, called straight from your browser, about once a second.",
      countries: 'Country names, most region names and the continent globes’ coastlines come from Natural Earth.',
      regions: "The rest of the state and province names come from Debian's iso-codes ISO 3166-2 data, used for names only.",
      fonts: 'Satoshi and Cabinet Grotesk by Indian Type Foundry, served by Fontshare.',
      mono: 'Geist Mono by Vercel, under the SIL Open Font License.',
      flags: 'Country flags from flag-icons by Panayiotis Lipiridis, under the MIT licence.',
      phosphor: 'Icons from Phosphor Icons, under the MIT licence.',
      icons8: 'The site icon’s origami bird: <link>Origami</link> (Fluent Systems Regular) by Icons8.',
      code: "Everybird's code is open source under the <link>MIT licence</link>.",
    },
  },
}
export const en = { ui: EN_UI, page }

export { EN_UI }

export type Messages = Widen<typeof en>
export type Ui = Messages['ui']
