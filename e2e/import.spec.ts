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
  await expect(page.getByRole("heading", { level: 1, name: "Every bird you've ever seen." })).toBeVisible();
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^Sample: Yusuf's life list · 197 species · \d+ orders · \d+ families · since /);
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197);
  await expect(page.getByRole("link", { name: /^Make yours/ })).toHaveAttribute("href", "/settings");
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "All credits" })).toHaveAttribute("href", "/about#credits");
  expect(errors).toEqual([]);
});

test("the landing sample is pre-packed: its stickers show without the species file or the layout worker's masks", async ({ page }) => {
  // Hold the big downloads forever: the sample must not wait for them.
  await page.route(/\/data\/(species\.v1|masks\/.*)\.json$/, () => {});
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197, { timeout: 10_000 });
  await expect(stage.locator("img").first()).toBeVisible();
});

// The taxonomy is /lifelist's on both since 2026-11-06 (it was one sideways strip, and the bounds 0.6 and 0.5): at
// 1280 the order chips wrap onto three rows (the stage starts at 0.50 of the screen), at 390 the "Choose an order"
// button and the bar's 4px insets sit over it (0.47). The birds still hold close to half the first screen.
test("at 1280x800 and 390x844 the landing's birds fill most of the first screen", async ({ page }) => {
  for (const [width, height, share] of [[1280, 800, 0.45], [390, 844, 0.45]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const stage = page.getByTestId("collage-stage");
    await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197);
    const top = await stage.evaluate((el) => el.getBoundingClientRect().top);
    expect((height - top) / height).toBeGreaterThanOrEqual(share);
  }
});

test("large file shows progress and stays responsive", async ({ page }) => {
  test.setTimeout(180_000);
  const dir = mkdtempSync(join(tmpdir(), "everybird-e2e-"));
  const file = join(dir, "MyEBirdData.csv");
  writeFileSync(file, buildSyntheticMyData(200_000));
  try {
    // Settings has no collage: the probe taps the top bar's Dark mode switch, which re-renders the page's colours.
    await page.goto("/settings");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    const sw = page.getByRole("switch", { name: "Dark mode" });
    await expect(sw).toHaveAttribute("aria-checked", "false");
    // A phone-like main thread (4x CPU slowdown).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // In-page probes, so nothing depends on Playwright's polling: every text the eBird status line shows (with
    // its time), long tasks, the switch's input-to-update latency (pointerdown's timeStamp is when the input
    // arrived, so a busy main thread counts against it) and what the status line read at that moment.
    await page.evaluate(() => {
      type Probe = { texts: string[]; times: number[]; long: [number, number][]; down: number; lat: number[]; atClick: string; stop: () => void };
      const status = document.querySelector('[data-testid="ebird-drop"]')!.parentElement!.querySelector('[role="status"]')!;
      const el = document.querySelector<HTMLElement>('.eb-theme[role="switch"]')!;
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
    // As soon as the first row count shows, tap the switch. It is scrolled to and measured now, not before the import.
    await page.waitForFunction(() => (window as unknown as { __eb: { texts: string[] } }).__eb.texts.some((t) => / rows$/.test(t)), null, { polling: "raf" });
    await page.evaluate(() => document.querySelector(".eb-theme")!.scrollIntoView({ block: "center" }));
    const box = (await sw.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 8 species.", { timeout: 120_000 });

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
    await page.getByTestId("see-collage").getByRole("link", { name: "See my collage" }).click();
    await expect(page.getByTestId("collage-stats")).toHaveText(/^8 species/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("an import keeps running while the birder moves between the pages", async ({ page }) => {
  test.setTimeout(120_000);
  const dir = mkdtempSync(join(tmpdir(), "everybird-e2e-"));
  const file = join(dir, "MyEBirdData.csv");
  writeFileSync(file, buildSyntheticMyData(100_000));
  try {
    await page.goto("/settings");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    await page.getByTestId("ebird-input").setInputFiles(file);
    const status = page.getByTestId("ebird-drop").locator("xpath=..").getByRole("status");
    await expect(status).toHaveText(/^Reading your file/);
    // Away (client-side links: the provider above the routes, and the worker, stay) and back.
    await page.getByRole("link", { name: "Everybird", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Every bird you've ever seen." })).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 8 species.", { timeout: 90_000 });
    await page.getByTestId("see-collage").getByRole("link", { name: "See my collage" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("collage-stats")).toHaveText(/^8 species/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("search (Photography's): the magnifier opens the field; a species shows its tooltip in place, an order drills in", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197);
  await page.getByRole("button", { name: "Find a bird" }).click();
  const box = page.getByRole("combobox", { name: "Find a bird" });
  await expect(box).toBeFocused();
  await box.fill("grebe");
  const options = page.getByRole("listbox", { name: "Matching birds and groups" }).getByRole("option");
  await expect(options.first()).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(/197 species/); // typing never narrows
  const species = options.filter({ hasText: /Species$/ }).first();
  const name = (await species.locator(".eb-result-name").textContent())!.replace(/\s*\(.*$/, "");
  await species.click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId("bird-tip")).toContainText(name);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(stage.locator("[data-ring]")).toHaveCount(1);
  await expect(page.getByTestId("collage-stats")).toHaveText(/197 species/);
  // An order drills the filter into it.
  await page.getByRole("button", { name: "Find a bird" }).click();
  await page.getByRole("combobox", { name: "Find a bird" }).fill("grebes");
  await page.getByRole("option", { name: /^Grebes \(Podicipediformes\)/ }).click();
  await expect(page.getByTestId("collage-stats")).toHaveText(/ of 197 species/);
  // Esc returns focus to the magnifier.
  await page.getByRole("button", { name: "Find a bird" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Find a bird" })).toBeFocused();
});

test("hovering a bird on desktop shows its tooltip; a click still opens the card", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(197);
  await page.waitForTimeout(1500); // the first appearance has played
  const bird = stage.locator(".eb-bird").first();
  await bird.scrollIntoViewIfNeeded(); // the wrapped order chips push the stage's top row near the fold
  await page.waitForTimeout(300);
  const bb = (await bird.boundingBox())!;
  const code = await bird.getAttribute("data-code");
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  const tip = page.getByTestId("bird-tip");
  await expect(tip).toBeVisible();
  await expect(tip).toHaveAttribute("aria-hidden", "true");
  void code;
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(tip).toHaveCount(0);
});

test("works in memory when storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
  });
  await page.goto("/settings");
  await expect(page.getByText(NOT_SAVED)).toBeVisible();
  await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
  await expect(page.getByTestId("see-collage")).toContainText("Your collage has 3 species.");
  await page.getByTestId("see-collage").getByRole("link", { name: "See my collage" }).click();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^3 species/);
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(3);
  await expect(page.getByText(NOT_SAVED)).toBeVisible();
});
