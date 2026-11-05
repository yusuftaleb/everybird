import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildSyntheticMyData } from "../scripts/validate/synthetic-list";

const NOT_SAVED = "This list won't be saved on this device";

/** A small synthetic eBird life list download (real species names, made-up places and dates). */
const LIFELIST = [
  "Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable",
  "1,700,species,Mallard,Anas platyrhynchos,2,Test Park,CA-BC,03 Mar 2024,L1,S1,,1",
  "2,8000,species,Bald Eagle,Haliaeetus leucocephalus,1,Test Park,CA-BC,12 Aug 2025,L1,S2,,1",
  "3,30000,species,American Robin,Turdus migratorius,1,Test Park,US-AZ,06 Sep 2026,L2,S3,,1",
].join("\n");

test("sample collage renders on landing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Everybird" })).toBeVisible();
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^197 species · \d+ orders · \d+ families · since /);
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197);
  await expect(page.getByRole("heading", { name: "Make yours" })).toBeVisible();
  await expect(page.getByRole("link", { name: "huashu-bird-sticker" })).toHaveAttribute("href", "https://github.com/alchaincyf/huashu-bird-sticker");
  expect(errors).toEqual([]);
});

test("large file shows progress and stays responsive", async ({ page }) => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(join(tmpdir(), "everybird-e2e-"));
  const file = join(dir, "MyEBirdData.csv");
  writeFileSync(file, buildSyntheticMyData(200_000));
  try {
    await page.goto("/");
    await expect(page.getByTestId("collage-stage")).toBeVisible();
    const sw = page.getByRole("switch", { name: "True size" });
    await expect(sw).toHaveAttribute("aria-checked", "false");
    const box = (await sw.boundingBox())!;
    // A phone-like main thread (4x CPU slowdown).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // In-page probes, so nothing depends on Playwright's polling: every text the eBird status line shows (with
    // its time), long tasks, the switch's input-to-update latency (pointerdown's timeStamp is when the input
    // arrived, so a busy main thread counts against it) and what the status line read at that moment.
    await page.evaluate(() => {
      type Probe = { texts: string[]; times: number[]; long: [number, number][]; down: number; lat: number[]; atClick: string; stop: () => void };
      const status = document.querySelector('[data-testid="ebird-drop"]')!.parentElement!.querySelector('[role="status"]')!;
      const el = document.querySelector<HTMLElement>('[role="switch"]')!;
      const p: Probe = { texts: [], times: [], long: [], lat: [], down: 0, atClick: "", stop: () => {} };
      const mo = new MutationObserver(() => {
        const t = status.textContent ?? "";
        if (t === p.texts[p.texts.length - 1]) return;
        p.texts.push(t);
        p.times.push(performance.now());
      });
      mo.observe(status, { childList: true, characterData: true, subtree: true });
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => p.long.push([e.startTime, e.duration])));
      po.observe({ entryTypes: ["longtask"] });
      el.addEventListener("pointerdown", (e) => { p.down = e.timeStamp; p.atClick = status.textContent ?? ""; }, true);
      new MutationObserver(() => p.lat.push(performance.now() - p.down)).observe(el, { attributes: true, attributeFilter: ["aria-checked"] });
      p.stop = () => { po.disconnect(); mo.disconnect(); };
      (window as unknown as { __eb: Probe }).__eb = p;
    });

    await page.getByTestId("ebird-input").setInputFiles(file);
    // As soon as the first row count shows, tap the switch (no actionability waits: it was measured above).
    await page.waitForFunction(() => (window as unknown as { __eb: { texts: string[] } }).__eb.texts.some((t) => / rows$/.test(t)), null, { polling: "raf" });
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("collage-stats")).toHaveText(/^8 species/, { timeout: 120_000 });

    const probe = await page.evaluate(() => {
      const p = (window as unknown as { __eb: { texts: string[]; times: number[]; long: [number, number][]; lat: number[]; atClick: string; stop: () => void } }).__eb;
      p.stop();
      const end = p.times[p.times.length - 1]; // the status line's last change: the parse is done
      return { texts: p.texts, latency: p.lat[0], atClick: p.atClick, longest: Math.max(0, ...p.long.filter(([t]) => t < end).map(([, d]) => d)) };
    });
    const counts = probe.texts.map((t) => /([\d,]+) rows/.exec(t)?.[1]).filter(Boolean);
    console.log(
      `large file (4x CPU): ${counts.length} progress updates (${counts[0]} … ${counts[counts.length - 1]} rows); ` +
        `switch responded in ${probe.latency?.toFixed(1)} ms while showing "${probe.atClick}"; longest main-thread task while parsing ${probe.longest.toFixed(0)} ms`,
    );
    expect(new Set(counts).size).toBeGreaterThanOrEqual(2); // the progress text updates
    expect(probe.atClick).toMatch(/^Reading your file… [\d,]+ rows$/); // the tap landed while the worker was parsing
    expect(probe.latency).toBeLessThan(200); // and the switch flipped within 200 ms
    expect(probe.longest).toBeLessThan(200);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("works in memory when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
  });
  await page.goto("/");
  await expect(page.getByText(NOT_SAVED)).toBeVisible();
  await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
  await expect(page.getByTestId("collage-stats")).toHaveText(/^3 species/);
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(3);
  await expect(page.getByText(NOT_SAVED)).toBeVisible();
});
