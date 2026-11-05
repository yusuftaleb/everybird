import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// enabled in Task 20 once the page can load a list
test.fixme(true, "enabled in Task 20 once the page can load a list");

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

/** Put the list where the app's storage reads it (idb-keyval: database "everybird", store "kv", key "everybird:v1"). */
async function seedList(page: Page) {
  await page.goto("/");
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
  await page.reload();
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
    expect(m.long, `longest task after ${what}`).toBeLessThanOrEqual(100);
    expect(m.frame, `longest frame after ${what}`).toBeLessThanOrEqual(50);
  };
  const pickFirstChip = async () => {
    const dlg = page.getByRole("dialog");
    await dlg.locator(".eb-chip:not([data-selected])").first().tap();
    await expect(dlg).toHaveCount(0);
  };

  // 1. Tap an order (in the phone sheet).
  await measure(
    "choosing an order",
    async () => {
      await page.getByTestId("picker-order").tap();
      await pickFirstChip();
    },
    () => expect(page.getByTestId("picker-order")).toHaveAttribute("data-selected", ""),
  );

  // 2. Tap a lit country's dots on the visible map (the ~10k-dot repaint).
  await page.getByTestId("filter-tab-places").tap();
  await expect(page.locator(".eb-map-lit").first()).toBeVisible();
  const spot = await page.evaluate(() => {
    const path = document.querySelector<SVGPathElement>(".eb-map-lit")!;
    const svg = path.ownerSVGElement!;
    const pt = svg.createSVGPoint();
    const p0 = path.getPointAtLength(0);
    pt.x = p0.x;
    pt.y = p0.y;
    const s = pt.matrixTransform(path.getScreenCTM()!);
    return { x: s.x, y: s.y, iso: path.getAttribute("data-testid")!.replace("map-country-", "") };
  });
  await measure(
    "tapping a country on the map",
    () => page.touchscreen.tap(spot.x, spot.y),
    () => expect(page.getByTestId(`map-country-${spot.iso}`)).toHaveAttribute("opacity", "1"),
  );

  // 3. Then a different country from the sheet (the map tap already selected one, so the label must change).
  const before = await page.getByTestId("picker-country").innerText();
  await measure(
    "choosing a country",
    async () => {
      await page.getByTestId("picker-country").tap();
      await pickFirstChip();
    },
    () => expect(page.getByTestId("picker-country")).not.toHaveText(before),
  );
});
