import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// A phone: 390px wide, with touch (the test taps).
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
// One test at a time: a second worker would steal the CPU being measured.
test.describe.configure({ mode: "serial" });

type Row = { code: string };
const COUNTRIES = ["CA", "US", "EG", "GB", "ZA", "TR", "SA", "BY", "MX", "BR"];

/** A synthetic 1,000-species list: the first 1,000 species in the taxonomy, spread over ten countries and years. */
function syntheticSaved() {
  const file = JSON.parse(readFileSync(resolve(__dirname, "../public/data/species.v1.json"), "utf8")) as { species: Row[] };
  const records = file.species.slice(0, 1000).map((s, i) => ({
    code: s.code,
    source: "ebird",
    date: `${2015 + (i % 11)}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
    place: { country: COUNTRIES[i % COUNTRIES.length] },
  }));
  return {
    v: 1,
    records: { ebird: records, inat: [], manual: [] },
    unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} },
    rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

/** Put the list where the app's storage reads it (idb-keyval: database "everybird", store "kv", key "everybird:v1"), then open the collage (/). */
async function seedList(page: Page) {
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
}

/** Record long tasks and requestAnimationFrame deltas until `stop()`. */
async function startProbe(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __probe: { long: number[]; frames: number[]; stop: () => void } };
    const long: number[] = [];
    const frames: number[] = [];
    const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => long.push(e.duration)));
    po.observe({ entryTypes: ["longtask"] });
    let last = performance.now();
    let on = true;
    const tick = (t: number) => {
      frames.push(t - last);
      last = t;
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    w.__probe = { long, frames, stop: () => { on = false; po.disconnect(); } };
  });
}
async function stopProbe(page: Page) {
  return page.evaluate(() => {
    const p = (window as unknown as { __probe: { long: number[]; frames: number[]; stop: () => void } }).__probe;
    p.stop();
    return { long: Math.max(0, ...p.long), frame: Math.max(0, ...p.frames.slice(1)) };
  });
}

/** Probe an action at the budget: no task over 100 ms (50 ms headroom), no frame over 50 ms. */
function measurer(page: Page) {
  return async (what: string, act: () => Promise<void>, took: () => Promise<void>) => {
    await startProbe(page);
    await act();
    await took(); // the change must have taken effect before we measure
    await page.waitForTimeout(1000);
    const m = await stopProbe(page);
    console.log(`${what}: longest task ${m.long.toFixed(0)} ms, longest frame ${m.frame.toFixed(1)} ms`);
    expect(m.long, `longest task after ${what}`).toBeLessThanOrEqual(100);
    expect(m.frame, `longest frame after ${what}`).toBeLessThanOrEqual(50);
    expect(m.long, `longest task after ${what} (headroom)`).toBeLessThanOrEqual(50);
  };
}

test("the timeline on a 1,000-species list at 390px with 4x CPU: a held range drag stays smooth", async ({ page }) => {
  await seedList(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])").first()).toBeVisible();
  await page.getByTestId("filter-tab-time").tap();
  await expect(page.getByTestId("timeline")).toBeVisible();
  await page.waitForTimeout(1500);
  const measure = measurer(page);

  // 1. Drag the end handle a few years back and hold it: the collage previews the range over its current layout
  //    (birds outside it hidden; no re-pack). Measured while held, at the full budget. Letting go commits it: one
  //    re-pack and one travel of the ~900 kept birds (measured next).
  const hi = page.getByTestId("time-handle-hi");
  await hi.scrollIntoViewIfNeeded();
  const b = (await hi.boundingBox())!;
  const before = await page.getByTestId("timeline-read").innerText();
  await measure(
    "dragging the timeline's end handle (held)",
    async () => {
      await page.mouse.move(b.x + b.width / 2, b.y + 60);
      await page.mouse.down();
      await page.mouse.move(b.x + b.width / 2 - 200, b.y + 60, { steps: 12 });
    },
    () => expect(page.getByTestId("timeline-read")).not.toHaveText(before),
  );
  // Release: the range is committed, one re-pack and one travel (like a True size toggle, outside the budget).
  await startProbe(page);
  await page.mouse.up();
  await expect(page.getByTestId("collage-stats")).toContainText(" of 1,000 species");
  await page.waitForTimeout(1500);
  const rel = await stopProbe(page);
  // Logged, not asserted: over 13 runs its longest task was 57-101 ms (one over the hard bound), so not yet stable.
  console.log(`releasing the drag (one travel): longest task ${rel.long.toFixed(0)} ms, longest frame ${rel.frame.toFixed(1)} ms`);
});

test("filtering a 1,000-species list at 390px with 4x CPU slowdown stays smooth", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedList(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])").first()).toBeVisible();
  await page.waitForTimeout(1500); // let the first ripple finish

  const measure = async (what: string, act: () => Promise<void>, took: () => Promise<void>) => {
    await startProbe(page);
    await act();
    await took(); // the filter must have taken effect before we measure
    await page.waitForTimeout(1000);
    const m = await stopProbe(page);
    console.log(`${what}: longest task ${m.long.toFixed(0)} ms, longest frame ${m.frame.toFixed(1)} ms`);
    expect(m.long, `longest task after ${what}`).toBeLessThanOrEqual(100);
    expect(m.frame, `longest frame after ${what}`).toBeLessThanOrEqual(50);
    // Headroom (Task P1): no task over half the budget. The frame bound stays at 50 ms: at 4× the order step
    // still usually drops one vsync (33 ms) and sometimes two (50 ms), so a tighter frame bound would be flaky.
    expect(m.long, `longest task after ${what} (headroom)`).toBeLessThanOrEqual(50);
  };
  const pickFirstChip = async () => {
    // A CSS locator: getByRole("dialog") computes ARIA roles over the whole page (1,000+ bird buttons) on the
    // page's main thread at every poll, inside the probe window, which would measure Playwright, not the app.
    const dlg = page.locator('.eb-sheet[role="dialog"]');
    await dlg.locator(".eb-chip:not([data-selected])").first().tap();
    await expect(dlg).toHaveCount(0);
  };

  // 1. Tap an order (in the phone sheet). As on LifeList, the orders button then gives way to the breadcrumb.
  await measure(
    "choosing an order",
    async () => {
      await page.getByTestId("picker-order").tap();
      await pickFirstChip();
    },
    () => expect(page.getByTestId("picker-order")).toHaveCount(0),
  );

  // 2. Check a country in the Places sheet (the controls bar's dropdown; filters apply live, the sheet stays open).
  await page.getByTestId("filter-tab-places").tap();
  const sheet = page.locator('.eb-sheet[role="dialog"]');
  await expect(sheet.locator('input[type="checkbox"]').first()).toBeVisible();
  const box = (i: number) => sheet.locator('input[type="checkbox"]').nth(i);
  const stats = await page.getByTestId("collage-stats").innerText();
  await measure(
    "checking a country",
    () => box(0).tap(),
    () => expect(page.getByTestId("collage-stats")).not.toHaveText(stats),
  );

  // 3. Then a second country (the set widens: species seen in either).
  const one = await page.getByTestId("collage-stats").innerText();
  await measure(
    "checking a second country",
    () => box(1).tap(),
    () => expect(page.getByTestId("collage-stats")).not.toHaveText(one),
  );
});
