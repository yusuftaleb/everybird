import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openAdd } from "./add-birds";
import { pressAreas } from "./press-areas";
import { SAMPLE_COUNT } from "./sample";
import { fmt, plural, tagPlurals } from "../src/i18n/core";
import { localDay } from "../src/lib/file-name";
import { HTML_LANG, LANGS } from "../src/i18n/langs";
import { es } from "../src/i18n/messages/es";
import { nl } from "../src/i18n/messages/nl";
import { pl } from "../src/i18n/messages/pl";
import { fr } from "../src/i18n/messages/fr";
import { de } from "../src/i18n/messages/de";
import { it } from "../src/i18n/messages/it";
import { sv } from "../src/i18n/messages/sv";
import { da } from "../src/i18n/messages/da";
import { ru } from "../src/i18n/messages/ru";
import { ja } from "../src/i18n/messages/ja";
import { zhHans } from "../src/i18n/messages/zh-Hans";
import { zhHant } from "../src/i18n/messages/zh-Hant";
import { pt } from "../src/i18n/messages/pt";
import { storedLayouts } from "./layouts";

// Every flow end to end, in every engine: each way in (eBird life list, MyEBirdData, iNaturalist with a mocked API, tick
// by hand) and their merge, the filters (taxonomy, Places with several countries, a Time range), True size and the list
// view, the card (marks, remove, undo), the share image in all three formats, Copy link and the shared view it opens,
// backup, forget (the stored layouts with it) and restore.
//
// Viewports: by default each engine walks two widths, so the three engines cover all five between them (Chromium 390 and
// 1280, WebKit 390 and 1024, Firefox 768 and 1440). MATRIX=full walks every width in every engine:
//   MATRIX=full npx playwright test e2e/flows.spec.ts --project=chromium --project=webkit --project=firefox
const WIDTHS = [390, 768, 1024, 1280, 1440] as const;
const SAMPLE: Record<string, number[]> = { chromium: [390, 1280], webkit: [390, 1024], firefox: [768, 1440] };
const FULL = process.env.MATRIX === "full";

// The engine comes from the browserName fixture: a project built from devices[...] carries defaultBrowserType, not
// use.browserName, so reading the project's config made every engine walk Chromium's widths.
function sampled(engine: string, width: number) {
  test.skip(!FULL && !(SAMPLE[engine] ?? []).includes(width), `${engine} samples ${SAMPLE[engine]?.join(" and ")}px (MATRIX=full for all)`);
}

/**
 * A small synthetic eBird life list download (real species names, made-up places and dates). Northern Flicker is in
 * the MyEBirdData fixture too (as two rows, one a subspecies), so the merge must count it once.
 */
const LIFELIST = [
  "Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable",
  "1,700,species,Mallard,Anas platyrhynchos,2,Test Park,CA-BC,03 Mar 2024,L1,S1,,1",
  "2,8000,species,Bald Eagle,Haliaeetus leucocephalus,1,Test Park,CA-BC,12 Aug 2025,L1,S2,,1",
  "3,30000,species,American Robin,Turdus migratorius,1,Test Park,US-AZ,06 Sep 2026,L2,S3,,1",
  "4,11980,species,Northern Flicker,Colaptes auratus,1,Test Park,CA-BC,04 Apr 2025,L1,S4,,1",
].join("\n");
/**
 * tests/fixtures/ebird/mydata-basic.csv's species: Northern Flicker (twice), Yellow-rumped Warbler, Gilded Flicker and
 * Rüppell's Griffon (a "sp.", a slash and an unknown bird don't count). With the life list's four, one shared: 7.
 */
const MERGED = 7;
const MYDATA = readFileSync(resolve(__dirname, "../tests/fixtures/ebird/mydata-basic.csv"));
const inat = (f: string) => readFileSync(resolve(__dirname, `../tests/fixtures/inat/${f}.json`), "utf8");

// A synthetic list of 53 species: Canada most months 2019–2025, a week in Egypt (Sep 2021), one in Costa Rica (Feb 2023).
type Row = { code: string };
const TOTAL = 53;
function syntheticSaved() {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const records: object[] = [];
  let k = 0;
  const add = (country: string, date: string) => records.push({ code: species[k++ * 5].code, source: "ebird", date, place: { country } });
  for (let y = 2019; y <= 2025; y++) for (let m = 1; m <= 12; m += 2) add("CA", `${y}-${String(m).padStart(2, "0")}-10`);
  for (let i = 0; i < 6; i++) add("EG", `2021-09-0${1 + i}`);
  for (let i = 0; i < 5; i++) add("CR", `2023-02-1${i}`);
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

async function seed(page: Page) {
  await page.goto("/about");
  await page.evaluate(
    (saved) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(saved, "everybird:v1");
          tx.oncomplete = () => { open.result.close(); done(); };
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    syntheticSaved(),
  );
  await page.goto("/");
  await expect(shownBirds(page)).toHaveCount(TOTAL);
}

const shownBirds = (page: Page) => page.getByTestId("collage-stage").locator("[data-code]:not([data-off])");
const stats = (page: Page) => page.getByTestId("collage-stats");
// Settings' summary line ("Your list"; the Add birds dialog's own is "add-summary").
const seeCollage = (page: Page) => page.getByTestId("see-collage");
const speciesIn = async (page: Page) => Number(/Your collage has ([\d,]+) species/.exec((await seeCollage(page).textContent()) ?? "")![1].replace(/,/g, ""));

/**
 * Waits out the collage's first appearance (its ripple), so a click lands on a bird that has stopped moving. Fails if
 * anything is still animating after 10 s (a stuck or endless animation is a bug, not something to click through).
 */
async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running").length === 0, null, { timeout: 10_000 });
}

/** iNaturalist's API, answered from the synthetic fixtures (one user "testbirder" with six observations): the user lookup
 *  and the places on v1, the observations on v2 (src/lib/import/inat.ts). */
async function mockInat(page: Page) {
  await page.route("https://api.inaturalist.org/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: string) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body });
    if (url.pathname.startsWith("/v1/users/autocomplete")) return json(inat("users"));
    if (url.pathname.startsWith("/v2/observations")) return json(url.searchParams.get("id_above") === "0" ? inat("observations") : '{"total_results":6,"results":[]}');
    if (url.pathname.startsWith("/v1/places/")) return json(inat("places"));
    return route.fulfill({ status: 404, body: "{}" });
  });
}

for (const width of WIDTHS) {
  test.describe(`flows at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 }, hasTouch: width < 600 });
    test.beforeEach(({ browserName }) => sampled(browserName, width));

    test("ways in: an eBird life list, then MyEBirdData merges into it, a species in both counted once", async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/settings");
      await openAdd(page, "file");
      await expect(page.getByTestId("ebird-drop")).toBeVisible();
      await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
      await expect(seeCollage(page)).toContainText("Your collage has 4 species");
      await expect(page.getByTestId("source-ebird-list")).toContainText("ebird_world_life_list.csv");
      // The full export sits beside the life list download, and the two merge by species.
      await page.getByTestId("ebird-input").setInputFiles({ name: "MyEBirdData.csv", mimeType: "text/csv", buffer: MYDATA });
      await expect(page.getByTestId("source-ebird")).toContainText("MyEBirdData.csv");
      await expect(page.getByTestId("source-ebird-list")).toContainText("ebird_world_life_list.csv");
      // By species: the flicker both files have is one bird, so 4 + 4 - 1.
      await expect.poll(() => speciesIn(page)).toBe(MERGED);
      await seeCollage(page).getByRole("link", { name: "See my collage" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(stats(page)).toHaveText(new RegExp(`^${MERGED} species`));
      await expect(shownBirds(page)).toHaveCount(MERGED);
      await expect(shownBirds(page).and(page.getByRole("button", { name: /^Northern Flicker\b/ }))).toHaveCount(1);
      expect(errors).toEqual([]);
    });

    test("ways in: iNaturalist (mocked API), then birds ticked by hand join it", async ({ page }) => {
      test.setTimeout(60_000);
      await mockInat(page);
      await page.goto("/settings");
      await openAdd(page, "file");
      // The username field shows once Add is pressed, focused.
      await page.getByRole("button", { name: "Add iNaturalist" }).click();
      await expect(page.getByPlaceholder("iNaturalist username")).toBeFocused();
      await page.getByPlaceholder("iNaturalist username").fill("testbirder");
      await page.getByRole("button", { name: "Fetch my birds" }).click();
      await expect(seeCollage(page)).toContainText(/Your collage has [\d,]+ species, all from iNaturalist\. See my collage/, { timeout: 30_000 });
      const fromInat = await speciesIn(page);
      expect(fromInat).toBeGreaterThan(0);

      // Add by hand (Settings' Add by hand dialog, no switch to Import a file): a tap adds the bird at once.
      // Up to Your list's heading row, as a birder scrolls back to it: the top bar, hidden while the page scrolled down,
      // shows again (headroom).
      await page.evaluate(() => scrollTo(0, 0));
      await expect(page.getByTestId("topbar")).not.toHaveAttribute("data-hidden");
      const dialog = await openAdd(page, "hand");
      // The search empty, the orders as a list that opens in place; typed, its matches in their place.
      await expect(dialog.getByRole("list", { name: "Species to tick" })).toBeVisible();
      const list = dialog.getByRole("listbox", { name: "Species to tick" });
      // When and where stays closed ("Any time · Anywhere"), so the bird gets no date or place.
      await expect(dialog.getByTestId("tick-when")).toHaveAttribute("aria-expanded", "false");
      await dialog.getByLabel("Search birds").fill("mallard");
      const mallard = list.getByRole("option", { name: /^Mallard, Anas platyrhynchos/ });
      await mallard.click();
      await expect(mallard).toHaveAttribute("aria-selected", "true");
      await expect(dialog.getByTestId("undo-toast")).toContainText("Added Mallard.");
      await expect.poll(() => speciesIn(page)).toBe(fromInat + 1);
      // The dialog is modal: Esc closes it, and it neither showed nor hid the top bar.
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId("topbar")).not.toHaveAttribute("data-hidden");
      await page.getByRole("banner").getByRole("link", { name: "My birds" }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${fromInat + 1} species`));
    });

    test("filters: taxonomy, Places with two countries, a Time range; True size and the list view", async ({ page }) => {
      test.setTimeout(60_000);
      await seed(page);
      // Taxonomy: the first order, in the Taxa panel (a popover from 600px, the sheet below: its chips in both; round 6).
      // The panel stays open after a pick; Esc closes it, and the page keeps the breadcrumb.
      await page.getByTestId("taxa-button").click();
      await page.getByTestId("taxa-panel").getByTestId("level-order").locator(".eb-chip").first().click();
      await expect(stats(page)).toContainText(`of ${TOTAL} species`);
      // No count badge (round 6): the button is marked active and its name says what is chosen.
      await expect(page.getByTestId("taxa-button")).toHaveAttribute("data-active", "");
      await expect(page.getByTestId("taxa-button")).toHaveAttribute("aria-label", /^Taxa: \S/);
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("taxa-panel")).toHaveCount(0);
      const inOrder = Number(/^([\d,]+) of/.exec((await stats(page).textContent())!)![1]);
      await expect(shownBirds(page)).toHaveCount(inOrder);
      await page.getByTestId("filter-bar").getByRole("button", { name: "All birds" }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));

      // Places (in the one Filters panel): two countries (species seen in either), each drilled to from its continent.
      const filters = page.getByTestId("filters-button");
      await filters.click();
      const panel = page.getByTestId("filter-panel-places");
      await panel.getByTestId("drill-n:AF").click();
      await panel.getByText("Egypt", { exact: true }).click();
      await panel.getByTestId("places-path").getByRole("button", { name: "All continents" }).click();
      // Back at the top, focus is on the drill button of the row it came from (wait for it: the level re-renders).
      await expect(panel.getByTestId("drill-n:AF")).toBeFocused();
      await panel.getByTestId("drill-n:NA").click();
      await panel.getByText("Costa Rica", { exact: true }).click();
      await expect(stats(page)).toContainText(`11 of ${TOTAL} species`);
      await expect(filters).toHaveAttribute("data-active", "");
      await expect(filters).toHaveAttribute("aria-label", /^Filters, 1 in use: /);
      await page.keyboard.press("Escape");
      await expect(filters).toBeFocused();
      await filters.click();
      await panel.getByTestId("places-clear").click();
      await page.keyboard.press("Escape");
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));

      // Time (the same panel): a range from the keyboard (a year on), then Clear; then one country (Egypt's six lifers).
      await filters.click();
      const lo = page.getByRole("slider", { name: "Start month" });
      await lo.focus();
      await page.keyboard.press("PageUp");
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2020");
      await expect(stats(page)).toContainText(`of ${TOTAL} species`);
      await expect(filters).toHaveAttribute("data-active", "");
      await expect(filters).toHaveAttribute("aria-label", /^Filters, 1 in use: /);
      await page.getByTestId("time-clear").click();
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2019");
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
      await expect(page.getByTestId("time-clear")).toHaveCount(0);
      await panel.getByTestId("drill-n:AF").click();
      await panel.getByText("Egypt", { exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(stats(page)).toContainText(`6 of ${TOTAL} species`);
      await expect(shownBirds(page)).toHaveCount(6);

      // True size (the Collage's Display panel, round 6): the switch flips and every bird stays on the stage.
      await page.getByTestId("display-button").click();
      const trueSize = page.getByTestId("display-panel").getByRole("switch", { name: /^True size/ });
      await trueSize.click();
      await expect(trueSize).toHaveAttribute("aria-checked", "true");
      await page.keyboard.press("Escape");
      await expect(shownBirds(page)).toHaveCount(6);
      // The list view: one row per bird shown, the bar's Sort menu (and no Display button).
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.getByRole("button", { name: "Sort: Newest first" })).toBeVisible();
      await expect(page.getByTestId("display-button")).toHaveCount(0);
      await expect(page.locator(".eb-lrow")).toHaveCount(6);
      await page.getByRole("button", { name: "Collage", exact: true }).click();
      await expect(shownBirds(page)).toHaveCount(6);
    });

    test("the card: marks, remove and undo", async ({ page }) => {
      await seed(page);
      await settled(page);
      const bird = page.getByTestId("collage-stage").locator(".eb-bird").first();
      await bird.focus();
      await page.keyboard.press("Enter");
      const card = page.getByRole("dialog");
      await expect(card).toBeVisible();
      const heard = card.getByRole("button", { name: "Heard only" });
      await heard.click();
      await expect(heard).toHaveAttribute("aria-pressed", "true");
      await heard.click();
      await expect(heard).toHaveAttribute("aria-pressed", "false");
      await card.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL - 1} species`));
      await page.getByRole("button", { name: "Undo" }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
    });

    test("share: all three image formats, download, Copy link and the shared view it opens", async ({ page, context, baseURL, browserName }) => {
      test.setTimeout(120_000);
      // Chromium hands over its real clipboard; elsewhere Playwright can't grant clipboard reads, so a stand-in records
      // what the dialog writes (through the same ClipboardItem or writeText call).
      if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      else
        await page.addInitScript(() => {
          const w = window as unknown as { __clip: string[] };
          w.__clip = [];
          const clip = {
            write: async (items: ClipboardItem[]) => { for (const it of items) w.__clip.push(await (await it.getType("text/plain")).text()); },
            writeText: async (t: string) => { w.__clip.push(t); },
          };
          Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
        });
      await seed(page);
      await page.getByRole("button", { name: "Share", exact: true }).click();
      const dialog = page.getByRole("dialog", { name: "Share your collage" });
      const preview = dialog.getByTestId("share-preview");
      // The PNG is twice the design (IMAGE_SCALE): 2160 × 3840 for a 1080 × 1920 story. The preview is a canvas at its
      // box's size (speed audit finding 8), so the size is read from the downloaded file.
      for (const [format, w, h] of [["Story", 2160, 3840], ["Post", 2160, 2700], ["Square", 2160, 2160]] as const) {
        await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
        await expect(preview.getByRole("img", { name: `Preview of the ${format.toLowerCase()} image` })).toBeVisible({ timeout: 30_000 });
        await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
        expect(dl.suggestedFilename()).toBe(`everybird-${format.toLowerCase()}-${localDay()}.png`);
        const png = readFileSync((await dl.path())!);
        // The PNG signature, then the IHDR chunk's width and height (big-endian, at bytes 16 and 20).
        expect(png.subarray(1, 4).toString("latin1")).toBe("PNG");
        expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }).toEqual({ w, h });
      }
      await dialog.getByLabel("Card title").fill("Ada's big year");
      await dialog.getByRole("button", { name: "Copy link" }).click();
      await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
      const url = browserName === "chromium"
        ? await page.evaluate(() => navigator.clipboard.readText())
        : await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip.at(-1)!);
      expect(url).toMatch(/\/s\/1/);
      expect(url.length).toBeLessThan(2000);
      // The shared view: read-only, whose list it is, and the visitor's own list untouched.
      await page.goto(new URL(new URL(url).pathname, baseURL).toString());
      await expect(page.getByRole("heading", { level: 1, name: "Ada's big year" })).toBeVisible(); // verbatim
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
      await expect(shownBirds(page)).toHaveCount(TOTAL);
      await expect(page.getByRole("link", { name: /^Make yours/ }).first()).toHaveAttribute("href", "/settings");
      await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
    });

    test("your data: name the collage, download a backup, forget the list, restore it (the title with it)", async ({ page }) => {
      await seed(page);
      // The card's title is set in the share dialog, and saved with the list.
      await page.goto("/");
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await page.getByRole("dialog", { name: "Share your collage" }).getByLabel("Card title").fill("Kalin's lifers");
      await page.keyboard.press("Escape");
      const storedName = () => page.evaluate(() => new Promise<string | undefined>((done) => {
        const r = indexedDB.open("everybird");
        r.onsuccess = () => { const g = r.result.transaction("kv").objectStore("kv").get("everybird:v1"); g.onsuccess = () => { r.result.close(); done(g.result?.name); }; };
      }));
      await expect.poll(storedName).toBe("Kalin's lifers");
      // The birder's own collage keeps its finished layouts on the device (src/lib/layout/layout-store.ts).
      await expect.poll(() => storedLayouts(page), { timeout: 30_000 }).toBeGreaterThan(0);
      await page.goto("/settings");
      await expect.poll(storedName).toBe("Kalin's lifers");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON backup" }).click()]);
      expect(dl.suggestedFilename()).toBe(`everybird-backup-${localDay()}.json`);
      const backup = readFileSync((await dl.path())!);
      expect(JSON.parse(backup.toString()).records).toBeTruthy();
      expect(JSON.parse(backup.toString()).name).toBe("Kalin's lifers");
      const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
      expect(csv.suggestedFilename()).toBe(`everybird-kalins-lifers-life-list-${localDay()}.csv`);

      // Forget asks once, in ConfirmDialog (an alertdialog portalled to the body, focus on its action).
      await page.getByRole("button", { name: "Forget my list" }).click();
      const ask = page.getByRole("alertdialog", { name: /^Forget this list on this device\?/ });
      const yes = ask.getByRole("button", { name: "Yes, forget it" });
      await expect(yes).toBeFocused();
      await yes.click();
      await expect(ask).toHaveCount(0);
      await expect(page.getByTestId("data-toast")).toHaveText("This device no longer holds your list.");
      // The list is gone: the downloads leave with it, and so do the stored layouts.
      await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
      await expect.poll(() => storedLayouts(page)).toBe(0);
      await page.getByRole("banner").getByRole("link", { name: "My birds" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "A lifetime of birds." })).toBeVisible();

      await page.goto("/settings");
      await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: backup });
      await expect(page).toHaveURL(/\/$/);
      // The collage page is always "My birds"; the restored title names the share card again.
      await expect(page.getByRole("heading", { level: 1, name: "My birds" })).toBeVisible();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
      await expect(shownBirds(page)).toHaveCount(TOTAL);
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Share your collage" }).getByLabel("Card title")).toHaveValue("Kalin's lifers");
    });
    test("landing, About, the collage (Places, Time, list, card, share) and Settings: no sideways scroll, every control a 44px press", async ({ page }) => {
      test.setTimeout(60_000);
      const check = async (where: string) => {
        const m = await pressAreas(page);
        expect(m.sideways, `${where}: the page scrolls sideways`).toBeLessThanOrEqual(0);
        expect(m.small, `${where}: controls under 44px`).toEqual([]);
      };
      await page.goto("/");
      await expect(shownBirds(page)).toHaveCount(SAMPLE_COUNT);
      await check("landing");
      await page.goto("/about");
      await check("about");
      await seed(page);
      await check("collage");
      await page.getByTestId("filters-button").click();
      await expect(page.getByTestId("filters-panel")).toBeVisible();
      await check("filters (Places and Time)");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "List", exact: true }).click();
      await check("list");
      await page.getByRole("button", { name: "Collage", exact: true }).click();
      const bird = page.getByTestId("collage-stage").locator(".eb-bird").first();
      await bird.focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog")).toBeVisible();
      await check("card");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Share", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Share your collage" })).toBeVisible();
      await check("share dialog");
      await page.goto("/settings");
      await check("settings");
      await openAdd(page, "file");
      await expect(page.getByTestId("ebird-drop")).toBeVisible();
      await check("add birds: import a file");
      const hand = await openAdd(page, "hand");
      await expect(hand.getByRole("list", { name: "Species to tick" })).toBeVisible();
      await check("add birds: by hand");
      // Opened, its fields (the date with its calendar button, Country and the State or province select, off until a
      // country is picked) take a 44px press too.
      await hand.getByTestId("tick-when").click();
      await expect(hand.getByLabel("State or province", { exact: true })).toBeDisabled();
      await check("add birds: by hand, When and where open");
    });
  });
}

// A phone: a touch screen where (pointer: coarse) matches, so the 44px touch rule is live (the small source buttons,
// 40px for a mouse, grow to 44px). Firefox can't emulate a mobile device, so Chromium and WebKit run it.
test.describe("on a touch screen (pointer: coarse)", () => {
  test.use({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });
  test.beforeEach(({ browserName }) => test.skip(browserName === "firefox", "Firefox has no mobile emulation (isMobile)"));

  test("every control on Settings and the collage takes a 44px press, the small source buttons included", async ({ page }) => {
    await page.goto("/settings");
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches), "(pointer: coarse) matches").toBe(true);
    await openAdd(page, "file");
    await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
    await expect(seeCollage(page)).toContainText("Your collage has 4 species");
    const small = page.locator(".eb-btn-sm");
    expect(await small.count(), "the source row's small buttons").toBeGreaterThan(0);
    // Every one on screen (the hidden ones, in folded panels, take no room)
    const heights = (await small.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))).filter((h) => h > 0);
    expect(heights.length, "the source row's small buttons on screen").toBeGreaterThan(0);
    for (const h of heights) expect(Math.round(h)).toBeGreaterThanOrEqual(44);
    expect((await pressAreas(page)).small, "Add birds: controls under 44px").toEqual([]);
    // Add by hand on touch: its group rows and the closed When and where row are 44px (import.css), then its fields.
    const hand = await openAdd(page, "hand");
    const when = hand.getByTestId("tick-when");
    expect(Math.round((await when.boundingBox())!.height), "When and where's row").toBeGreaterThanOrEqual(44);
    expect((await pressAreas(page)).small, "Add by hand: controls under 44px").toEqual([]);
    await when.click();
    await expect(hand.getByLabel("State or province", { exact: true })).toBeVisible();
    expect((await pressAreas(page)).small, "Add by hand, When and where open: controls under 44px").toEqual([]);
    await page.keyboard.press("Escape");
    await expect(hand).toHaveCount(0);
    await seeCollage(page).getByRole("link", { name: "See my collage" }).click();
    await expect(shownBirds(page)).toHaveCount(4);
    expect((await pressAreas(page)).small, "collage: controls under 44px").toEqual([]);
  });
});

const MESSAGES = { es, pt, nl, pl, fr, de, it, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const;

// A short pass per language (every one but English): the sample collage draws and Settings' Add birds offers
// each source and Add by hand in the language's words. For manual runs.
for (const lang of LANGS.filter((l) => l !== "en")) {
  test.describe(`a short pass in ${lang}`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    test("the sample and Settings speak the language", async ({ page, context, baseURL }) => {
      const ui = MESSAGES[lang].ui;
      await context.addCookies([{ name: "everybird-lang", value: lang, url: baseURL! }]);
      await page.goto("/");
      await expect(page.locator("html")).toHaveAttribute("lang", HTML_LANG[lang]);
      await expect(shownBirds(page).first()).toBeVisible();
      // The count's word for the sample's count in this language (H7: "548 gatunków", "548 видов").
      tagPlurals(lang, ui);
      await expect(page.getByTestId("collage-stage")).toContainText(plural(ui.count.word, SAMPLE_COUNT));
      await page.goto("/settings");
      const sources = await openAdd(page, "file", ui);
      // Each source row's button reads "Add", named "Add <the row's title>"
      const add = sources.getByRole("button", { name: fmt(ui.import.addLabel, { title: ui.import.ebird.listTitle }), exact: true });
      await expect(add).toHaveText(ui.import.add);
      // Add by hand: the button at the end of Your list's heading row, opening its dialog titled in the language.
      await sources.getByRole("button", { name: ui.add.hand, exact: true }).click();
      await expect(page.getByRole("dialog", { name: ui.add.hand })).toBeVisible();
    });
  });
}
