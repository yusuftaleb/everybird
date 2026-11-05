# Everybird

Every bird you've ever seen. Everybird turns a birder's life list into a sticker collage. Import an eBird export or an iNaturalist username, and your list is laid out as a collage you can filter, edit and share.

Your list never leaves your browser. The only network calls that carry user input are iNaturalist API requests (a username and place IDs).

## Run it

```
npm install
npm run dev        # http://localhost:3000
npm test           # Vitest unit tests
npm run e2e        # Playwright (first time: npx playwright install chromium)
npm run data       # rebuild the species and geo data
```

## Data sources and licences

- **Stickers:** [huashu-bird-sticker](https://github.com/alchaincyf/huashu-bird-sticker), CC BY 4.0. Credited wherever stickers appear.
- **Taxonomy:** eBird/Clements checklist, used for species names and codes. Other taxonomy and geography sources are listed on the in-app credits page as they are added.
- **Fonts:** Satoshi and Cabinet Grotesk from [Fontshare](https://www.fontshare.com) (loaded from their CSS, not bundled), and Geist Mono via `next/font/google`.

## Licence

MIT, (c) 2026 Yusuf Taleb. See `LICENSE`.
