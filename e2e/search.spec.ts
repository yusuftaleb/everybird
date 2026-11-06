import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

// A phone: 390px wide. The list: the first 1,000 species in the taxonomy (synthetic dates and countries).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

type Row = { code: string; com: string };
const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species.slice(0, 1000);

test("a bird picked from the search on a 1,000-species list ends on screen, ringed, with its card", async ({ page }) => {
  test.setTimeout(90_000);
  const saved = {
    v: 1,
    records: { ebird: species.map((s, i) => ({ code: s.code, source: "ebird", date: `${2015 + (i % 11)}-0${(i % 9) + 1}-1${i % 10}`, place: { country: ["CA", "US", "EG"][i % 3] } })), inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
  await page.goto("/make");
  await page.evaluate(
    (s) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(s, "everybird:v1");
          tx.oncomplete = () => done();
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    saved,
  );
  await page.goto("/my");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(1000, { timeout: 30_000 });

  // The targets: the birds lowest on the full stage (far below where the narrowed result sits, at the top of a
  // short stage), whose names pick out only them.
  await page.waitForTimeout(1500);
  const byDepth = await stage.evaluate((el) =>
    [...el.querySelectorAll<HTMLElement>("[data-code]")].map((b) => ({ code: b.dataset.code!, y: b.getBoundingClientRect().top })).sort((a, b) => b.y - a.y),
  );
  const coms = new Map(species.map((s) => [s.code, s.com]));
  const unique = (com: string) => species.filter((s) => s.com.toLowerCase().startsWith(com.toLowerCase())).length === 1;
  const targets = byDepth.map((d) => species.find((s) => s.code === d.code)!).filter((s) => unique(coms.get(s.code)!)).slice(0, 2);
  expect(targets).toHaveLength(2);
  for (const target of targets) {
    await page.evaluate(() => window.scrollTo(0, 0));
    const box = page.getByRole("combobox", { name: "Search your birds" });
    await box.fill(target.com);
    await expect(page.getByTestId("collage-stats")).toHaveText(/^\d+ of 1,000 species/);
    await expect(stage.locator("[data-code]:not([data-off])")).not.toHaveCount(1000); // the collage narrowed
    await page.waitForTimeout(1500); // and its birds have travelled to their narrowed spots (a birder reads the list)
    await page.getByRole("option", { name: new RegExp(`^${target.com.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).first().click();
    const dialog = page.locator(".eb-card[role=dialog]");
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(2000); // the travel, the scroll and the late correction are over
    const bird = stage.locator(`[data-code="${target.code}"]`);
    const r = (await bird.boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(r.y + r.height / 2, `${target.com} centre is on screen`).toBeGreaterThan(0);
    expect(r.y + r.height / 2, `${target.com} centre is on screen`).toBeLessThan(vh);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  }
});
