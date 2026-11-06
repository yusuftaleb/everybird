import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Places and Time dropdowns in the controls bar, on a synthetic list: Canada most months, lifers in Egypt and Costa
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
          tx.oncomplete = () => done();
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    syntheticSaved(),
  );
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").first()).toBeVisible();
}

for (const width of [1280, 390]) {
  test.describe(`Places and Time dropdowns at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });

    test("several countries, the bar's summary, Esc back to the button; the bar never scrolls sideways", async ({ page }) => {
      await seed(page);
      const places = page.getByTestId("filter-tab-places");
      await places.click();
      const panel = page.getByTestId("filter-panel-places");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("checkbox")).toHaveCount(3);
      // By the row's name (the whole row is the label; dev builds park Next's badge over the phone sheet's corner).
      await panel.getByText("Egypt", { exact: true }).click();
      await panel.getByText("Costa Rica", { exact: true }).click();
      await expect(panel.getByTestId("country-CR")).toBeChecked();
      await expect(page.getByTestId("collage-stats")).toContainText("11 of 53 species");
      await expect(places).toContainText("Places · 2");
      await expect(places).toHaveAttribute("aria-label", "Places: Costa Rica, Egypt");
      await expect(panel.locator("img.eb-flag")).toHaveCount(3); // flag-icons, same origin
      await page.keyboard.press("Escape");
      await expect(panel).toHaveCount(0);
      await expect(places).toBeFocused();
      // The centre count is the shown count only, as /lifelist.
      await expect(page.locator(".eb-mid")).toHaveText(/^11species$/i);

      await page.getByTestId("filter-tab-time").click();
      await expect(page.getByTestId("timeline")).toBeVisible();
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
