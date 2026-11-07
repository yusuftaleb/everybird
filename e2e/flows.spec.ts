import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_COUNT } from "./sample";

// Every flow end to end, in every engine: each way in (eBird life list, MyEBirdData, iNaturalist with a mocked API, tick
// by hand) and their merge, the filters (taxonomy, Places with several countries, a Time range), True size and the list
// view, the card (marks, remove, undo), the share image in all three formats, Copy link and the shared view it opens,
// backup, forget and restore.
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
const seeCollage = (page: Page) => page.getByTestId("see-collage");
const speciesIn = async (page: Page) => Number(/Your collage has ([\d,]+) species/.exec((await seeCollage(page).textContent()) ?? "")![1].replace(/,/g, ""));

/**
 * Waits out the collage's first appearance (its ripple), so a click lands on a bird that has stopped moving. Fails if
 * anything is still animating after 10 s (a stuck or endless animation is a bug, not something to click through).
 */
async function settled(page: Page) {
  await page.waitForFunction(() => document.getAnimations().filter((a) => a.playState === "running").length === 0, null, { timeout: 10_000 });
}

/** iNaturalist's API, answered from the synthetic fixtures (one user "testbirder" with six observations). */
async function mockInat(page: Page) {
  await page.route("https://api.inaturalist.org/v1/**", (route) => {
    const url = new URL(route.request().url());
    const json = (body: string) => route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body });
    if (url.pathname.startsWith("/v1/users/autocomplete")) return json(inat("users"));
    if (url.pathname.startsWith("/v1/observations")) return json(url.searchParams.get("id_above") === "0" ? inat("observations") : '{"total_results":6,"results":[]}');
    if (url.pathname.startsWith("/v1/places/")) return json(inat("places"));
    return route.fulfill({ status: 404, body: "{}" });
  });
}

/**
 * Controls whose press area is under 44px, and how far the page scrolls sideways. A control's press area counts an
 * absolutely placed ::after (the hit areas drawn smaller pills and underlines carry). Exempt: stickers (sized by mass,
 * reached by keyboard too), links inside running text (WCAG 2.5.8's inline exception), a checkbox inside its row's
 * label (the 44px row is the target), file inputs behind their buttons, and the small source buttons on a fine pointer
 * (40px for a mouse, 44px for touch: the touch test below holds them to 44px).
 */
async function pressAreas(page: Page) {
  return page.evaluate(() => {
    const small: string[] = [];
    const fine = matchMedia("(pointer: fine)").matches;
    const sel = 'a[href], button, [role="button"], [role="switch"], [role="option"], [role="slider"], input, select, summary';
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest("[inert], [aria-hidden=true]") || el.closest(".eb-bird, .ebd")) continue;
      if (el.matches('input[type="file"]') || (el.matches('input[type="checkbox"]') && el.closest("label"))) continue;
      if (fine && el.matches(".eb-btn-sm")) continue;
      const cs = getComputedStyle(el);
      const b = el.getBoundingClientRect();
      if (cs.visibility === "hidden" || b.width === 0 || b.height === 0) continue;
      if (el.tagName === "A" && cs.display === "inline" && /^(P|LI|SPAN|SMALL|FIGCAPTION|DD)$/.test(el.parentElement?.tagName ?? "")) continue;
      let w = b.width, h = b.height;
      const af = getComputedStyle(el, "::after");
      if (af.content !== "none" && af.position === "absolute") {
        const t = parseFloat(af.top), l = parseFloat(af.left);
        if (t < 0) h = b.height - 2 * t;
        if (l < 0) w = b.width - 2 * l;
        w = Math.max(w, parseFloat(af.width) || 0);
        h = Math.max(h, parseFloat(af.height) || 0);
      }
      if (Math.round(w) < 44 || Math.round(h) < 44) small.push(`${(el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40)} ${Math.round(w)}x${Math.round(h)}`);
    }
    return { small, sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth };
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
      // The username field shows once Add is pressed, focused.
      await page.getByRole("button", { name: "Add iNaturalist" }).click();
      await expect(page.getByPlaceholder("iNaturalist username")).toBeFocused();
      await page.getByPlaceholder("iNaturalist username").fill("testbirder");
      await page.getByRole("button", { name: "Fetch my birds" }).click();
      await expect(seeCollage(page)).toContainText(/Your collage has [\d,]+ species, all from iNaturalist\. See my collage/, { timeout: 30_000 });
      const fromInat = await speciesIn(page);
      expect(fromInat).toBeGreaterThan(0);

      await page.getByRole("button", { name: "Tick birds off a list" }).click();
      const list = page.getByRole("listbox", { name: "Species to tick" });
      await expect(list).toBeVisible();
      await page.getByLabel("Search birds").fill("mallard");
      const mallard = list.getByRole("option", { name: /^Mallard, Anas platyrhynchos/ });
      await mallard.click();
      await expect(mallard).toHaveAttribute("aria-selected", "true");
      await page.getByRole("button", { name: "Add 1 to my list" }).click();
      await expect.poll(() => speciesIn(page)).toBe(fromInat + 1);
      await page.getByRole("banner").getByRole("link", { name: "Collage" }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${fromInat + 1} species`));
    });

    test("filters: taxonomy, Places with two countries, a Time range; True size and the list view", async ({ page }) => {
      test.setTimeout(60_000);
      await seed(page);
      // Taxonomy: the first order (chips from 600px, the "Choose an order" sheet below).
      if (width < 600) {
        await page.getByTestId("picker-order").click();
        await page.getByRole("dialog", { name: "Order" }).locator(".eb-chip").first().click();
      } else {
        await page.getByTestId("level-order").locator(".eb-chip").first().click();
      }
      await expect(stats(page)).toContainText(`of ${TOTAL} species`);
      const inOrder = Number(/^([\d,]+) of/.exec((await stats(page).textContent())!)![1]);
      await expect(shownBirds(page)).toHaveCount(inOrder);
      await page.getByRole("button", { name: "All birds" }).click();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));

      // Places: two countries (species seen in either).
      const places = page.getByTestId("filter-tab-places");
      await places.click();
      const panel = page.getByTestId("filter-panel-places");
      await panel.getByText("Egypt", { exact: true }).click();
      await panel.getByText("Costa Rica", { exact: true }).click();
      await expect(stats(page)).toContainText(`11 of ${TOTAL} species`);
      await expect(places).toContainText("Places · 2");
      await page.keyboard.press("Escape");
      await expect(places).toBeFocused();
      await places.click();
      await panel.getByTestId("places-clear").click();
      await page.keyboard.press("Escape");
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));

      // Time: a range from the keyboard (a year on), then Clear; then one country (Egypt's six lifers).
      const time = page.getByTestId("filter-tab-time");
      await time.click();
      const lo = page.getByRole("slider", { name: "Start month" });
      await lo.focus();
      await page.keyboard.press("PageUp");
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2020");
      await expect(stats(page)).toContainText(`of ${TOTAL} species`);
      await expect(time).toContainText(/Time · /);
      await page.getByTestId("time-clear").click();
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2019");
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
      await expect(page.getByTestId("time-clear")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await places.click();
      await panel.getByText("Egypt", { exact: true }).click();
      await page.keyboard.press("Escape");
      await expect(stats(page)).toContainText(`6 of ${TOTAL} species`);
      await expect(shownBirds(page)).toHaveCount(6);

      // True size: the switch flips and every bird stays on the stage.
      const trueSize = page.getByRole("switch", { name: /sticker sizes/ });
      await trueSize.click();
      await expect(trueSize).toHaveAttribute("aria-checked", "true");
      await expect(shownBirds(page)).toHaveCount(6);
      // The list view: one row per bird shown.
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.getByRole("button", { name: /^Sorted by body mass/ })).toBeVisible();
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
      await card.getByRole("button", { name: "Remove from my list" }).click();
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
      for (const [format, w, h] of [["Story", 1080, 1920], ["Post", 1080, 1350], ["Square", 1080, 1080]] as const) {
        await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
        await expect(preview.getByRole("img", { name: `Preview of the ${format.toLowerCase()} image` })).toBeVisible({ timeout: 30_000 });
        await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        const size = await page.evaluate(async () => {
          const img = document.querySelector<HTMLImageElement>('[data-testid="share-preview"] img')!;
          const blob = await (await fetch(img.src)).blob();
          const bmp = await createImageBitmap(blob);
          return { w: bmp.width, h: bmp.height, type: blob.type };
        });
        expect(size).toEqual({ w, h, type: "image/png" });
        const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
        expect(dl.suggestedFilename()).toBe(`everybird-${format.toLowerCase()}.png`);
      }
      await dialog.getByLabel("Collage title").fill("Ada's big year");
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
      await page.goto("/settings");
      await page.getByLabel("Name your collage", { exact: true }).fill("Kalin's lifers");
      await expect.poll(() => page.evaluate(() => new Promise<string | undefined>((done) => {
        const r = indexedDB.open("everybird");
        r.onsuccess = () => { const g = r.result.transaction("kv").objectStore("kv").get("everybird:v1"); g.onsuccess = () => { r.result.close(); done(g.result?.name); }; };
      }))).toBe("Kalin's lifers");
      const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download JSON backup" }).click()]);
      expect(dl.suggestedFilename()).toMatch(/^everybird-backup-\d{4}-\d{2}-\d{2}\.json$/);
      const backup = readFileSync((await dl.path())!);
      expect(JSON.parse(backup.toString()).records).toBeTruthy();
      expect(JSON.parse(backup.toString()).name).toBe("Kalin's lifers");
      const [csv] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download CSV" }).click()]);
      expect(csv.suggestedFilename()).toMatch(/^everybird-\d{4}-\d{2}-\d{2}\.csv$/);

      await page.getByRole("button", { name: "Forget my list" }).click();
      await page.getByRole("button", { name: "Yes, forget it" }).click();
      // The list is gone: the downloads leave with it.
      await expect(page.getByRole("button", { name: "Download CSV" })).toHaveCount(0);
      await page.getByRole("banner").getByRole("link", { name: "Collage" }).click();
      await expect(page.getByRole("heading", { level: 1, name: "A lifetime of birds." })).toBeVisible();

      await page.goto("/settings");
      await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: backup });
      await expect(page).toHaveURL(/\/$/);
      await expect(page.getByRole("heading", { level: 1, name: "Kalin's lifers" })).toBeVisible();
      await expect(stats(page)).toHaveText(new RegExp(`^${TOTAL} species`));
      await expect(shownBirds(page)).toHaveCount(TOTAL);
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
      await page.getByTestId("filter-tab-places").click();
      await check("places");
      await page.keyboard.press("Escape");
      await page.getByTestId("filter-tab-time").click();
      await check("time");
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
      await expect(page.getByTestId("ebird-drop")).toBeVisible();
      await page.getByRole("button", { name: "Tick birds off a list" }).click();
      await expect(page.getByRole("listbox", { name: "Species to tick" })).toBeVisible();
      await check("settings");
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
    await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
    await expect(seeCollage(page)).toContainText("Your collage has 4 species");
    const small = page.locator(".eb-btn-sm");
    expect(await small.count(), "the source row's small buttons").toBeGreaterThan(0);
    for (const h of await small.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height))) expect(Math.round(h)).toBeGreaterThanOrEqual(44);
    expect((await pressAreas(page)).small, "Settings: controls under 44px").toEqual([]);
    await seeCollage(page).getByRole("link", { name: "See my collage" }).click();
    await expect(shownBirds(page)).toHaveCount(4);
    expect((await pressAreas(page)).small, "collage: controls under 44px").toEqual([]);
  });
});
