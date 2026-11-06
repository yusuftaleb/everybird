import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The Time panel's timeline on a synthetic list: Canada most months, and runs of lifers abroad (full dates, 3+ lifers
// within days in another country), which the strip shows only as bars: no trip labels. Runs in Chromium, WebKit and
// Firefox.
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
async function seed(page: Page, saved: object = syntheticSaved()) {
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
    saved,
  );
  await page.goto("/");
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").first()).toBeVisible();
}
const shown = (page: Page) => page.getByTestId("collage-stage").locator("[data-code]:not([data-off])").count();

for (const width of [1280, 390]) {
  test.describe(`timeline at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 600 });

    test("a keyboard range drives the collage; Clear resets it; no trip labels", async ({ page }) => {
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
      // Committed 350 ms after the last key: one re-pack, and the kept birds travel (CSS translate transitions).
      const travelled = page.evaluate(() => new Promise<boolean>((done) => {
        const end = performance.now() + 3000;
        const look = () => {
          if (document.getAnimations().some((a) => (a as CSSTransition).transitionProperty === "translate")) return done(true);
          if (performance.now() > end) return done(false);
          requestAnimationFrame(look);
        };
        look();
      }));
      await expect(page.getByTestId("collage-stats")).toContainText(`of ${total} species`);
      expect(await travelled).toBe(true);
      await expect(page.getByTestId("timeline-read")).toContainText("Apr 2020 to");

      // No trip brackets or labels, however many runs abroad the list has.
      const panel = page.getByTestId("filter-panel-time");
      await expect(panel.locator(".eb-trip, .eb-trips, img.eb-flag")).toHaveCount(0);
      await expect(panel).not.toContainText("Egypt");

      // Clear: top-right of the panel, a 44px press; the whole span again, and it goes.
      const clear = panel.getByTestId("time-clear");
      await expect(clear).toBeVisible();
      const head = (await panel.getByTestId("timeline-read").boundingBox())!;
      const btn = (await clear.boundingBox())!;
      const body = (await panel.boundingBox())!;
      expect(btn.x + btn.width, "Clear sits at the panel's right").toBeGreaterThan(body.x + body.width - 40);
      expect(Math.abs(btn.y + btn.height / 2 - (head.y + head.height / 2)), "Clear sits on the readout's line").toBeLessThan(14);
      const press = await clear.evaluate((el) => { const r = el.getBoundingClientRect(); const af = getComputedStyle(el, "::after"); return r.height - parseFloat(af.top) - parseFloat(af.bottom); });
      expect(Math.round(press), "Clear's press height").toBeGreaterThanOrEqual(44);
      await clear.click();
      await expect(lo).toHaveAttribute("aria-valuetext", "January 2019");
      await expect(page.getByTestId("collage-stats")).toHaveText(new RegExp(`^${total} species`));
      await expect(page.getByTestId("filter-tab-time")).toHaveText(/^Time$/);
      await expect(clear).toHaveCount(0);
      await expect.poll(() => shown(page)).toBe(total);
    });
  });
}

// Shaped like a real list: a lone early month (a few lifers on a trip years before birding began), a long empty gap,
// then dense months with one big month. The gap collapses to a break, so the strip fits a phone: no sideways scroll,
// the readout and both handles whole, quiet months still visible bars.
function gappySaved() {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const records: object[] = [];
  let k = 0;
  const add = (country: string, date: string) => records.push({ code: species[k++ * 7].code, source: "ebird", date, place: { country } });
  for (let i = 0; i < 4; i++) add("ZA", `2020-05-1${4 + (i % 3)}`);
  for (let y = 2023; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 9) break;
    const d = `${y}-${String(m).padStart(2, "0")}-10`;
    const n = y === 2025 && m === 5 ? 40 : m % 3 === 0 ? 0 : 1 + (m % 2);
    for (let i = 0; i < n; i++) add("CA", d);
  }
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

test.describe("timeline at 390px with a lone early month and a long gap", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("the gap collapses: the strip fits, nothing is cut, quiet months are bars", async ({ page }) => {
    await seed(page, gappySaved());
    await page.getByTestId("filter-tab-time").click();
    await expect(page.getByTestId("timeline-read")).toContainText("May 2020 to");
    await expect(page.getByTestId("time-gap")).toHaveCount(1);
    const m = await page.evaluate(() => {
      const box = (el: Element | null) => el!.getBoundingClientRect();
      const s = document.querySelector(".eb-time-scroll")!;
      const read = document.querySelector('[data-testid="timeline-read"]')!;
      const knobs = [...document.querySelectorAll(".eb-time-knob")].map((k) => box(k));
      const bars = [...document.querySelectorAll(".eb-time-bars rect:not([data-empty])")].map((r) => box(r).height);
      return {
        overflow: s.scrollWidth - s.clientWidth,
        page: document.documentElement.scrollWidth - innerWidth,
        read: { right: box(read).right, w: read.scrollWidth - read.clientWidth },
        knobs: knobs.map((k) => [k.left, k.right]),
        shortest: Math.min(...bars),
        vw: innerWidth,
      };
    });
    expect(m.overflow, "the strip scrolls sideways").toBeLessThanOrEqual(0);
    expect(m.page, "the page scrolls sideways").toBeLessThanOrEqual(0);
    expect(m.read.w).toBeLessThanOrEqual(0);
    expect(m.read.right).toBeLessThanOrEqual(m.vw);
    for (const [l, r] of m.knobs) { expect(l).toBeGreaterThanOrEqual(0); expect(r).toBeLessThanOrEqual(m.vw); }
    expect(m.shortest, "a month with one species is a visible bar beside the 40-species month").toBeGreaterThanOrEqual(6);
  });
});
