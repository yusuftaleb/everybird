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

    test("keyboard range and a trip bracket drive the collage", async ({ page }) => {
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

      // A trip bracket: the trip and its months.
      const egypt = page.getByRole("button", { name: /^Egypt trip, Sep 2021, 6 species/ });
      await egypt.click();
      await expect(egypt).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("collage-stats")).toContainText(`6 of ${total} species`);
      await expect.poll(() => shown(page)).toBe(6);
    });
  });
}

// Shaped like a real list: a lone early month (a few lifers on a trip years before birding began), a long empty gap,
// then dense months with one big month. The gap collapses to a break, so the strip fits a phone: no sideways scroll,
// the readout and both handles whole, quiet months still visible bars, the one-month trip a tick.
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
  test("the gap collapses: the strip fits, nothing is cut, quiet months are bars, a short trip is a tick", async ({ page }) => {
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
    await expect(page.getByRole("button", { name: /^South Africa trip/ })).toHaveAttribute("data-tick", "");
  });
});

// Trips in the strip's last months: their labels would run past the end, so they run leftwards, and the lanes keep
// them clear of the labels they run back over (one at a time: the United States runs right to the end, Egypt and
// Costa Rica flip back over it).
function endTripsSaved() {
  const species = (JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] }).species;
  const records: object[] = [];
  let k = 0;
  const add = (country: string, date: string) => records.push({ code: species[k++ * 7].code, source: "ebird", date, place: { country } });
  for (let y = 2023; y <= 2026; y++) for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 9) break;
    add("CA", `${y}-${String(m).padStart(2, "0")}-10`);
    add("CA", `${y}-${String(m).padStart(2, "0")}-20`);
  }
  for (let i = 0; i < 4; i++) add("US", `2025-03-0${2 + i}`);
  for (let i = 0; i < 4; i++) add("EG", `2026-08-0${2 + i}`);
  for (let i = 0; i < 4; i++) add("CR", `2026-09-1${2 + i}`);
  return {
    v: 1, records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

test.describe("timeline at 390px with trips at the strip's end", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
  test("end labels run leftwards, no two labels overlap, and each trip takes its own 44px press", async ({ page }, info) => {
    await seed(page, endTripsSaved());
    await page.getByTestId("filter-tab-time").click();
    await expect(page.getByRole("button", { name: /^Costa Rica trip/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Costa Rica trip/ })).toHaveAttribute("data-end", "");
    await expect(page.getByRole("button", { name: /^Egypt trip/ })).toHaveAttribute("data-end", "");
    const m = await page.evaluate(() => {
      const strip = document.querySelector(".eb-time-track")!.getBoundingClientRect();
      const labels = [...document.querySelectorAll(".eb-trip-label")].map((el) => {
        const r = el.getBoundingClientRect();
        return { name: el.textContent, l: r.left, r: r.right, t: r.top, b: r.bottom };
      });
      return { strip: { l: strip.left, r: strip.right }, labels, page: document.documentElement.scrollWidth - innerWidth };
    });
    expect(m.page, "the page scrolls sideways").toBeLessThanOrEqual(0);
    for (const a of m.labels) {
      expect(a.l, `${a.name} starts before the strip`).toBeGreaterThanOrEqual(m.strip.l - 0.5);
      expect(a.r, `${a.name} runs past the strip`).toBeLessThanOrEqual(m.strip.r + 0.5);
      for (const b of m.labels) {
        if (a === b) continue;
        const overlap = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
        expect(overlap, `${a.name} overlaps ${b.name}`).toBe(false);
      }
    }
    // Each bracket takes a 44px press (its ::after), and no two presses overlap: the lanes are 44px apart.
    const presses = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".eb-trip")].map((el) => {
      const r = el.getBoundingClientRect();
      const af = getComputedStyle(el, "::after");
      const t = r.top + parseFloat(af.top), l = r.left + parseFloat(af.left);
      const h = parseFloat(af.height), w = r.width - parseFloat(af.left) - parseFloat(af.right);
      return { name: el.getAttribute("aria-label"), t, b: t + h, l, r: l + w, h };
    }));
    expect(new Set(presses.map((p) => Math.round(p.t))).size, "the trips sit in more than one lane").toBeGreaterThan(1);
    for (const a of presses) {
      expect(Math.round(a.h), `${a.name}: press height`).toBeGreaterThanOrEqual(44);
      for (const b of presses) {
        if (a === b) continue;
        const overlap = a.l < b.r - 0.5 && b.l < a.r - 0.5 && a.t < b.b - 0.5 && b.t < a.b - 0.5;
        expect(overlap, `${a.name}'s press overlaps ${b.name}'s`).toBe(false);
      }
    }
    if (process.env.SHOT_DIR) {
      // The whole width: the strip bleeds into the page's gutters.
      const box = (await page.getByTestId("timeline").boundingBox())!;
      await page.screenshot({ path: `${process.env.SHOT_DIR}/after-timeline-end-trips-390-${info.project.name}.png`, clip: { x: 0, y: box.y - 8, width: 390, height: box.height + 16 } });
    }
  });
});
