import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { pressAreas } from "./press-areas";

// The Filters panel's Places and Time sections (the controls bar's one Filters button), on a synthetic list: Canada most months, lifers in Egypt and Costa
// Rica (full dates, 3+ lifers within days in another country).
type Row = { code: string };
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
async function seed(page: Page, data: object = syntheticSaved(), theme: "light" | "dark" = "light") {
  await page.goto("/about");
  await page.evaluate(
    ([saved, theme]) =>
      new Promise<void>((done, fail) => {
        localStorage.setItem("everybird:theme", theme);
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(saved, "everybird:v1");
          tx.oncomplete = () => done();
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    [data, theme] as const,
  );
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").first()).toBeVisible();
}

for (const width of [1280, 390]) {
  test.describe(`Places and Time in Filters at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });

    test("several countries, the bar's summary, Esc back to the button; the bar never scrolls sideways", async ({ page }) => {
      await seed(page);
      const filters = page.getByTestId("filters-button");
      await filters.click();
      const panel = page.getByTestId("filter-panel-places");
      await expect(panel).toBeVisible();
      // The top level is the continents; a drill button shows one's countries, the breadcrumb steps back.
      await expect(panel.getByTestId("continent-AF")).toBeVisible();
      await expect(panel.getByTestId("continent-NA")).toBeVisible();
      await panel.getByTestId("drill-n:AF").click();
      // By the row's name (the whole row is the label; dev builds park Next's badge over the phone sheet's corner).
      await panel.getByText("Egypt", { exact: true }).click();
      await panel.getByTestId("places-path").getByRole("button", { name: "All continents" }).click();
      await panel.getByTestId("drill-n:NA").click();
      await panel.getByText("Costa Rica", { exact: true }).click();
      await expect(panel.getByTestId("country-CR")).toBeChecked();
      await expect(page.getByTestId("collage-stats")).toContainText("11 of 53 species");
      await expect(filters.getByTestId("filters-count")).toHaveText("1");
      await expect(filters).toHaveAttribute("aria-label", "Filters: Places: Costa Rica, Egypt");
      await expect(panel.locator("img.eb-flag")).toHaveCount(2); // flag-icons, same origin: North America's two countries
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("filters-panel")).toHaveCount(0);
      await expect(filters).toBeFocused();
      // The centre count is the shown count only, as /lifelist.
      await expect(page.locator(".eb-mid")).toHaveText(/^11species$/i);

      // Time is a section of the same panel.
      await filters.click();
      await expect(page.getByTestId("filter-panel-time").getByTestId("timeline")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Play/ })).toHaveCount(0);
      const m = await page.evaluate(() => {
        const d = document.querySelector(".eb-dock")!;
        return { dock: d.scrollWidth - d.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
      });
      expect(m.dock).toBeLessThanOrEqual(0);
      expect(m.page).toBeLessThanOrEqual(0);
    });
  });
}

// More than SEARCH_FROM countries: the panel's "Find a country" is the app's one field (globals.css .eb-input), not
// the browser's search pill: Surface, a Line border, 44px tall, the site's 16px lens at 12px, Muted placeholder, the
// Accent focus ring; in both themes. (The collage page loads no Settings CSS, so this needs the shared style.)
function manyCountriesSaved() {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const isos = ["CA", "EG", "CR", "MX", "US", "FR", "DE", "BE", "NL", "DK", "CH", "AU", "NZ", "JP", "BR", "PE"];
  const records = isos.flatMap((country, i) => [0, 1].map((j) => ({ code: species[(i * 2 + j) * 5].code, source: "ebird", date: `2022-0${1 + (i % 9)}-1${j}`, place: { country } })));
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}
for (const theme of ["light", "dark"] as const) {
  test(`Find a country is the app's field style (${theme})`, async ({ page }) => {
    await seed(page, manyCountriesSaved(), theme);
    await page.getByTestId("filters-button").click();
    const find = page.getByTestId("places-find");
    await expect(find).toBeVisible();
    await find.focus();
    const m = await find.evaluate((el) => {
      const cs = getComputedStyle(el);
      const probe = (v: string) => {
        const d = document.createElement("div");
        d.style.color = `var(${v})`;
        document.body.append(d);
        const c = getComputedStyle(d).color;
        d.remove();
        return c;
      };
      const icon = el.parentElement!.querySelector("svg.eb-input-icon")!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        h: box.height, bg: cs.backgroundColor, border: cs.borderTopColor, borderW: cs.borderTopWidth,
        appearance: cs.appearance || cs.getPropertyValue("-webkit-appearance"),
        pad: cs.paddingLeft, font: cs.fontSize, outline: cs.outlineStyle, outlineColor: cs.outlineColor,
        icon: { w: icon.width, left: icon.left - box.left },
        surface: probe("--surface"), line: probe("--line"), accent: probe("--accent"),
        theme: document.documentElement.dataset.theme,
      };
    });
    expect(m.theme).toBe(theme);
    expect(m.h).toBe(44);
    expect(m.bg).toBe(m.surface);
    expect(m.border).toBe(m.line);
    expect(m.borderW).toBe("1px");
    expect(m.appearance).toBe("none");
    expect(m.pad).toBe("40px");
    expect(m.font).toBe("16px");
    expect(m.icon.w).toBe(16);
    expect(m.icon.left).toBe(12);
    expect(m.outline).toBe("solid");
    expect(m.outlineColor).toBe(m.accent);
    await find.fill("new z");
    await expect(page.getByTestId("filter-panel-places").getByTestId("country-NZ")).toBeVisible();
  });
}

/** A MyEBirdData-style list: one species per entry of `where` ("CA-BC|Capital", "CA-ON", "EG"), seen there. */
function seenSaved(where: string[]) {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const records = where.map((w, i) => {
    const [sub, county] = w.split("|");
    const country = sub.slice(0, 2);
    const date = `2022-${String(1 + (i % 12)).padStart(2, "0")}-10`;
    return {
      code: species[i * 5].code, source: "ebird", date,
      place: { country, ...(sub.includes("-") ? { sub1: sub } : {}) }, seen: [`${date}|${sub}${county ? `|${county}` : ""}`],
    };
  });
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}
const provincesSaved = () => seenSaved(["CA-BC|Capital", "CA-BC|Capital", "CA-BC|Greater Vancouver", "CA-ON", "CA-ON", "EG"]);
/** 21 species: ten in British Columbia's Capital, four in its Okanagan-Similkameen, three in Ontario, two in King
 * County (Washington), two in Egypt. */
const drilledSaved = () =>
  seenSaved([
    ...Array<string>(10).fill("CA-BC|Capital"), ...Array<string>(4).fill("CA-BC|Okanagan-Similkameen"),
    ...Array<string>(3).fill("CA-ON"), ...Array<string>(2).fill("US-WA|King"), ...Array<string>(2).fill("EG"),
  ]);

/** Neither the page, the dock nor the panel's body scrolls sideways. `body` is null with no panel open, so a check of
 * it where the panel should be open fails (toBeLessThanOrEqual needs a number) instead of passing on a silent 0. */
const sideways = (page: Page) =>
  page.evaluate(() => {
    const d = document.querySelector(".eb-dock")!;
    const b = document.querySelector<HTMLElement>(".eb-drop-body");
    return { dock: d.scrollWidth - d.clientWidth, body: b ? b.scrollWidth - b.clientWidth : null, page: document.documentElement.scrollWidth - innerWidth };
  });
/** Every control is a 44px press (pressAreas), and every checklist row in the panel, the checkbox's target, too. */
async function pressable(page: Page, panel: Locator, where: string) {
  expect((await pressAreas(page)).small, `${where}: controls under 44px`).toEqual([]);
  const rows = await panel.locator(".eb-check").evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().height)));
  expect(rows.length, where).toBeGreaterThan(0);
  for (const h of rows) expect(h, `${where}: a row under 44px`).toBeGreaterThanOrEqual(44);
}
/** A row's checkbox, pressed by its name (the whole row is the label). */
const row = (panel: Locator, testId: string) => panel.locator("label.eb-check", { has: panel.page().getByTestId(testId) }).locator(".eb-check-name");

for (const width of [1280, 390]) {
  test.describe(`Places drills down at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });
    const press = (l: Locator) => (width < 600 ? l.tap() : l.click());

    test("drill from North America to Canada to British Columbia to a county; the bar names it; back, Esc and 44px presses", async ({ page }) => {
      await seed(page, drilledSaved());
      const places = page.getByTestId("filters-button");
      const stats = page.getByTestId("collage-stats");
      await places.click();
      const panel = page.getByTestId("filter-panel-places");
      const head = panel.locator(".eb-places-head");
      await expect(head).toContainText("2 continents");
      await press(panel.getByTestId("drill-n:NA"));
      await expect(panel.getByTestId("place-all")).toBeFocused();
      await expect(head).toContainText("2 countries");
      await expect(panel.getByTestId("places-path")).toContainText("All continents/North America");
      const canada = panel.getByTestId("drill-c:CA");
      await expect(canada).toBeVisible();
      await pressable(page, panel, "countries");

      if (width < 600) await canada.tap();
      else {
        await canada.focus();
        await page.keyboard.press("Enter");
      }
      await expect(panel.getByTestId("place-all")).toBeFocused();
      await expect(head).toContainText("2 states and provinces");
      await expect(panel.getByTestId("places-path")).toContainText("All continents/North America/Canada");
      await press(row(panel, "place-s:CA-BC"));
      await expect(panel.getByTestId("place-s:CA-BC")).toBeChecked();
      await expect(stats).toContainText("14 of 21 species");
      await expect(places.getByTestId("filters-count")).toHaveText("1");
      await expect(places).toHaveAttribute("aria-label", "Filters: Places: British Columbia, Canada");
      await pressable(page, panel, "provinces");

      await press(panel.getByTestId("drill-s:CA-BC"));
      await expect(panel.getByTestId("place-all")).toBeFocused();
      await expect(head).toContainText("2 counties");
      await expect(panel.getByTestId("place-all")).toBeChecked(); // "All of British Columbia" is the checked province
      await press(row(panel, "place-k:CA-BC|Capital"));
      await expect(panel.getByTestId("place-k:CA-BC|Capital")).toBeChecked();
      await expect(panel.getByTestId("place-all")).not.toBeChecked(); // the county narrows its province away
      await expect(stats).toContainText("10 of 21 species");
      await expect(places.getByTestId("filters-count")).toHaveText("1");
      await expect(places).toHaveAttribute("aria-label", "Filters: Places: Capital, British Columbia");
      await pressable(page, panel, "counties");
      let m = await sideways(page);
      expect(m.body).not.toBeNull();
      expect(m.body).toBeLessThanOrEqual(0);

      await press(panel.getByTestId("places-path").getByRole("button", { name: "North America" }));
      await expect(canada).toBeFocused();
      await expect(head).toContainText("2 countries");
      await page.keyboard.press("Escape");
      await expect(page.getByTestId("filters-panel")).toHaveCount(0);
      await expect(places).toBeFocused();
      await expect(stats).toContainText("10 of 21 species"); // closing keeps the county
      m = await sideways(page);
      expect(m.dock).toBeLessThanOrEqual(0);
      expect(m.page).toBeLessThanOrEqual(0);
    });
  });
}

// Reopened, the panel starts at the selection's level, so a checked county is in view (checking "Canada" there would
// otherwise silently replace it).
test("reopens at a checked county's level", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await seed(page, drilledSaved());
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").first()).toBeVisible();
  const places = page.getByTestId("filters-button");
  await places.click();
  const panel = page.getByTestId("filter-panel-places");
  await panel.getByTestId("drill-n:NA").click();
  await panel.getByTestId("drill-c:CA").click();
  await panel.getByTestId("drill-s:CA-BC").click();
  await row(panel, "place-k:CA-BC|Capital").click();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await places.click();
  await expect(panel.locator(".eb-places-head")).toContainText("2 counties");
  await expect(panel.getByTestId("places-path")).toContainText("All continents/North America/Canada/British Columbia");
  await expect(panel.getByTestId("place-k:CA-BC|Capital")).toBeChecked();
});

// Down to a county. Seen-here places: Canada (British Columbia's Capital and Greater Vancouver, Ontario) and Egypt.
test("a province, then a county", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await seed(page, provincesSaved());
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").first()).toBeVisible();
  const places = page.getByTestId("filters-button");
  await places.click();
  const panel = page.getByTestId("filter-panel-places");
  await panel.getByTestId("drill-n:NA").click();
  await panel.getByTestId("drill-c:CA").click();
  await expect(panel.getByTestId("places-path")).toContainText("Canada");
  await panel.getByTestId("place-s:CA-BC").check();
  await expect(places).toHaveAttribute("aria-label", "Filters: Places: British Columbia, Canada");
  await expect(page.getByTestId("collage-stats")).toContainText("3 of 6 species");
  await panel.getByTestId("drill-s:CA-BC").click();
  await panel.getByTestId("place-k:CA-BC|Capital").check();
  await expect(places).toHaveAttribute("aria-label", "Filters: Places: Capital, British Columbia");
  await expect(page.getByTestId("collage-stats")).toContainText("2 of 6 species");
  const m = await page.evaluate(() => {
    const b = document.querySelector<HTMLElement>(".eb-drop-body")!;
    return { body: b.scrollWidth - b.clientWidth, page: document.documentElement.scrollWidth - innerWidth };
  });
  expect(m.body).toBeLessThanOrEqual(0);
  expect(m.page).toBeLessThanOrEqual(0);
});

// The lifer-only note's link is a client navigation to /settings#add-mydata: the Add birds dialog opens there at "Import a
// file", with MyEBirdData's Add panel open, its picker focused and in view; with MyEBirdData already on the list (saved
// before seen-here), its Replace is focused.
test("the lifer-only note opens MyEBirdData's Add panel on Settings, or focuses its Replace", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const life = syntheticSaved() as ReturnType<typeof syntheticSaved> & { records: Record<string, object[]> };
  const lifeList = { ...life, v: 2, records: { ebird: [], "ebird-list": life.records.ebird.map((r) => ({ ...r, source: "ebird" })), inat: [], manual: [] } };
  await seed(page, lifeList);
  await page.getByTestId("filters-button").click();
  await page.getByTestId("places-lifer-only").getByRole("link", { name: "Add MyEBirdData" }).click();
  await expect(page).toHaveURL(/\/settings#add-mydata$/);
  await expect(page.getByTestId("places-lifer-note")).toBeVisible();
  await expect(page.getByRole("group", { name: "Add MyEBirdData" })).toBeVisible();
  const choose = page.getByRole("group", { name: "Add MyEBirdData" }).getByRole("button", { name: "Choose your eBird file" });
  await expect(choose).toBeFocused();
  await expect(choose).toBeInViewport();
  // A hard load of the address does the same.
  await page.goto("/about");
  await page.goto("/settings#add-mydata");
  await expect(choose).toBeFocused();

  await seed(page);
  await page.getByTestId("filters-button").click();
  await page.getByTestId("places-lifer-only").getByRole("link", { name: "Import MyEBirdData again" }).click();
  await expect(page).toHaveURL(/\/settings#add-mydata$/);
  await expect(page.getByTestId("source-ebird").getByRole("button", { name: /^Replace/ })).toBeFocused();
  // And the reason beside it, in the Places panel's words.
  await expect(page.getByTestId("ebird-detail")).toBeVisible();
  await expect(page.getByTestId("ebird-detail")).toContainText("Import MyEBirdData again");
});
