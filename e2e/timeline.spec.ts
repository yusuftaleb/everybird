import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Time panel's timeline on a synthetic list: Canada most months, and trips abroad (full dates, 3+ lifers within
// days in another country). Runs in Chromium and WebKit (the "webkit" project).
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
const shown = (page: Page) => page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").count();

for (const width of [1280, 390]) {
  test.describe(`timeline at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });

    test("keyboard range, a trip bracket and Play drive the collage", async ({ page }) => {
      await seed(page);
      const total = 53;
      await expect(page.getByTestId("collage-stats")).toContainText(`${total} species`);
      await page.getByTestId("filter-tab-time").click();
      const lo = page.getByRole("slider", { name: "Start month" });
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2019");
      // A range: the start a year on (PageUp), then three months on.
      await lo.focus();
      await page.keyboard.press("PageUp");
      for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowRight");
      await expect(lo).toHaveAttribute("aria-valuetext", "April 2020");
      await expect(page.getByTestId("collage-stats")).toContainText(`of ${total} species`);
      await expect(page.getByTestId("timeline-read")).toContainText("Apr 2020 to");

      // A trip bracket: the trip and its months.
      const egypt = page.getByRole("button", { name: /^Egypt trip, Sep 2021, 6 species/ });
      await egypt.click();
      await expect(egypt).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("collage-stats")).toContainText(`6 of ${total} species`);
      await expect.poll(() => shown(page)).toBe(6);

      // Play clears the time filter and grows the collage; Stop ends it with every bird back.
      await page.getByTestId("time-play").click();
      await expect(page.getByTestId("time-playhead")).toBeVisible();
      await expect(page.getByTestId("timeline-read")).toContainText(/ · \d+ species/);
      await page.waitForTimeout(1500);
      const mid = await shown(page);
      expect(mid).toBeGreaterThan(0);
      expect(mid).toBeLessThan(total);
      await page.getByTestId("time-stop").click();
      await expect(page.getByTestId("time-playhead")).toHaveCount(0);
      await expect.poll(() => shown(page)).toBe(total);
      await expect(page.getByTestId("collage-stats")).not.toContainText(" of ");
    });
  });
}

test("with reduced motion, Play steps a month at a time and places birds without the layer fade", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await seed(page);
  await page.getByTestId("filter-tab-time").click();
  await page.getByTestId("time-play").click();
  await expect(page.getByTestId("timeline-read")).toContainText("Jan 2019");
  await page.waitForTimeout(1350); // two 600 ms steps
  await expect(page.getByTestId("timeline-read")).toContainText("Mar 2019");
  await expect(page.getByTestId("collage-stage")).not.toHaveAttribute("data-fast", "");
  await page.getByTestId("time-play").click(); // pause
  await expect(page.getByRole("button", { name: "Resume" })).toBeVisible();
});
