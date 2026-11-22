import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { addDialog, openAdd } from "./add-birds";
import { SAMPLE_COUNT } from "./sample";
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
  await expect(page.getByRole("heading", { level: 1, name: "A lifetime of birds." })).toBeVisible();
  const stage = page.getByTestId("collage-stage");
  await expect(stage).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(new RegExp(`^Sample · ${SAMPLE_COUNT} species · \\d+ orders · \\d+ families · since `));
  // The sample is a demo: nothing to share or print (those are on the birder's own collage).
  await expect(page.getByRole("button", { name: "Share", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Print", exact: true })).toHaveCount(0);
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT);
  await expect(page.getByRole("contentinfo").getByRole("link", { name: "All credits" })).toHaveAttribute("href", "/about#credits");
  // "Make yours" opens the Add birds dialog on the landing.
  const make = page.getByRole("button", { name: /^Make yours/ });
  await expect(make).toHaveAttribute("aria-haspopup", "dialog");
  await make.click();
  await expect(addDialog(page)).toBeVisible();
  expect(errors).toEqual([]);
});

test("the landing sample is pre-packed: its stickers show without the species file or the layout worker's masks", async ({ page }) => {
  // Hold the big downloads forever: the sample must not wait for them.
  // The layout worker's masks are one binary file since masks.v3.bin (src/lib/layout/mask-file.ts).
  await page.route(/\/data\/(species\.v1\.json|masks\.v3\.bin)$/, () => {});
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT, { timeout: 10_000 });
  await expect(stage.locator("img").first()).toBeVisible();
});

// Lower bounds with slack. Since round 6 the taxonomy chips live in the dock's Taxa panel (no chip rows or picker over
// the stage), and from 320px the top bar is one line again (--topbar-h 61px, its icon tabs under 620px), so the stage
// starts higher than when these bounds were set; the dock's second row at 390 takes some of that back.
test("at 1280x800 and 390x844 the landing's birds fill a little under half of the first screen", async ({ page }) => {
  for (const [width, height, share] of [[1280, 800, 0.43], [390, 844, 0.41]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    const stage = page.getByTestId("collage-stage");
    await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT);
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
    // Settings has no collage: the probe taps iNaturalist's Add in the source rows, which opens its panel
    // (aria-expanded) while the eBird file is read.
    await page.goto("/settings");
    const dialog = await openAdd(page, "file");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    const sw = dialog.getByRole("button", { name: "Add iNaturalist" });
    await expect(sw).toHaveAttribute("aria-expanded", "false");
    // A phone-like main thread (4x CPU slowdown).
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    // In-page probes, so nothing depends on Playwright's polling: every text the import toast shows (its visible line,
    // with its time; the toast comes and goes, so the probe watches the body), long tasks, the switch's input-to-update
    // latency (pointerdown's timeStamp is when the input arrived, so a busy main thread counts against it) and what the
    // toast read at that moment.
    await page.evaluate(() => {
      type Probe = { texts: string[]; times: number[]; long: [number, number][]; down: number; lat: number[]; atClick: string; stop: () => void };
      const toast = () =>
        document.querySelector('[data-testid="import-toast"] .eb-toast-line > span[aria-hidden="true"]:not(.eb-toast-spin)')?.textContent ??
        document.querySelector('[data-testid="import-toast"]')?.textContent ?? "";
      const el = document.querySelector<HTMLElement>('#sources button[aria-label="Add iNaturalist"]')!;
      const p: Probe = { texts: [], times: [], long: [], lat: [], down: 0, atClick: "", stop: () => {} };
      const mo = new MutationObserver(() => {
        const t = toast();
        if (t === p.texts[p.texts.length - 1]) return;
        p.texts.push(t);
        p.times.push(performance.now());
      });
      mo.observe(document.body, { childList: true, characterData: true, subtree: true });
      const po = new PerformanceObserver((l) => l.getEntries().forEach((e) => p.long.push([e.startTime, e.duration])));
      po.observe({ entryTypes: ["longtask"] });
      el.addEventListener("pointerdown", (e) => { p.down = e.timeStamp; p.atClick = toast(); }, true);
      new MutationObserver(() => p.lat.push(performance.now() - p.down)).observe(el, { attributes: true, attributeFilter: ["aria-expanded"] });
      p.stop = () => { po.disconnect(); mo.disconnect(); };
      (window as unknown as { __eb: Probe }).__eb = p;
    });

    await page.getByTestId("ebird-input").setInputFiles(file);
    // As soon as the first row count shows, tap Add. It is scrolled to and measured now, not before the import.
    // MyEBirdData streams the file, so its line ends with how far through it is: "… 1,200 rows · 45%" (ImportToast.tsx).
    await page.waitForFunction(() => (window as unknown as { __eb: { texts: string[] } }).__eb.texts.some((t) => / rows · \d+%$/.test(t)), null, { polling: "raf" });
    await page.evaluate(() => document.querySelector('#sources button[aria-label="Add iNaturalist"]')!.scrollIntoView({ block: "center" }));
    const box = (await sw.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 8 species", { timeout: 120_000 });

    const probe = await page.evaluate(() => {
      const p = (window as unknown as { __eb: { texts: string[]; times: number[]; long: [number, number][]; lat: number[]; atClick: string; stop: () => void } }).__eb;
      p.stop();
      // The done line: "Done · …", or "Your collage has …" for the first birds into an empty list (D1).
      const done = p.texts.findIndex((t) => t.startsWith("Done") || t.startsWith("Your collage has"));
      const end = p.times[done >= 0 ? done : p.times.length - 1]; // the toast's done line: the parse is done
      return { texts: p.texts, latency: p.lat[0], atClick: p.atClick, longest: Math.max(0, ...p.long.filter(([t]) => t < end).map(([, d]) => d)) };
    });
    const counts = probe.texts.map((t) => /([\d,]+) rows/.exec(t)?.[1]).filter(Boolean);
    console.log(
      `large file (4x CPU): ${counts.length} progress updates (${counts[0]} … ${counts[counts.length - 1]} rows); ` +
        `switch responded in ${probe.latency?.toFixed(1)} ms while showing "${probe.atClick}"; longest main-thread task while parsing ${probe.longest.toFixed(0)} ms`,
    );
    expect(new Set(counts).size).toBeGreaterThanOrEqual(2); // the progress text updates
    expect(probe.atClick).toMatch(/^Reading your file… [\d,]+ rows · \d+%$/); // the tap landed while the worker was parsing
    expect(probe.latency).toBeLessThan(200); // and the panel opened within 200 ms
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
  // Long enough that the read (in the worker) is still going after the walk through the three pages.
  writeFileSync(file, buildSyntheticMyData(300_000));
  try {
    await page.goto("/settings");
    await openAdd(page, "file");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    await page.getByTestId("ebird-input").setInputFiles(file);
    // The import's toast: "Reading your file… 1,200 rows · 45%" while the file is read.
    await expect(page.getByTestId("import-toast")).toContainText(/Reading your file… [\d,]+ rows/);
    // Away (client-side links: the provider above the routes, and the worker, stay) and back.
    await page.getByRole("link", { name: "Everybird", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "A lifetime of birds." })).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "About" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "About" })).toBeVisible();
    await page.getByRole("banner").getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 8 species", { timeout: 90_000 });
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
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT);
  await page.getByRole("button", { name: "Find a bird" }).click();
  const box = page.getByRole("combobox", { name: "Find a bird" });
  await expect(box).toBeFocused();
  await box.fill("grebe");
  const options = page.getByRole("listbox", { name: "Matching birds and groups" }).getByRole("option");
  await expect(options.first()).toBeVisible();
  await expect(page.getByTestId("collage-stats")).toHaveText(new RegExp(`${SAMPLE_COUNT} species`)); // typing never narrows
  const species = options.filter({ hasText: /Species$/ }).first();
  const name = (await species.locator(".eb-result-name").textContent())!.replace(/\s*\(.*$/, "");
  await species.click();
  await expect(box).toHaveCount(0);
  await expect(page.getByTestId("bird-tip")).toContainText(name);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(stage.locator("[data-ring]")).toHaveCount(1);
  await expect(page.getByTestId("collage-stats")).toHaveText(new RegExp(`${SAMPLE_COUNT} species`));
  // An order drills the filter into it.
  await page.getByRole("button", { name: "Find a bird" }).click();
  await page.getByRole("combobox", { name: "Find a bird" }).fill("grebes");
  await page.getByRole("option", { name: /^Grebes \(Podicipediformes\)/ }).click();
  await expect(page.getByTestId("collage-stats")).toHaveText(new RegExp(` of ${SAMPLE_COUNT} species`));
  // Esc returns focus to the magnifier.
  await page.getByRole("button", { name: "Find a bird" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Find a bird" })).toBeFocused();
});

test("hovering a bird on desktop shows its tooltip; a click still opens the card", async ({ page }) => {
  await page.goto("/");
  const stage = page.getByTestId("collage-stage");
  await expect(stage.locator("[data-code]:not([data-off])")).toHaveCount(SAMPLE_COUNT);
  await page.waitForTimeout(1500); // the first appearance has played
  const bird = stage.locator(".eb-bird").first();
  await bird.scrollIntoViewIfNeeded();
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
  await openAdd(page, "file");
  await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
  await expect(page.getByTestId("see-collage")).toContainText("Your collage has 3 species");
  await page.getByTestId("see-collage").getByRole("link", { name: "See my collage" }).click();
  await expect(page.getByTestId("collage-stats")).toHaveText(/^3 species/);
  await expect(page.getByTestId("collage-stage").locator("[data-code]:not([data-off])")).toHaveCount(3);
  await expect(page.getByText(NOT_SAVED)).toBeVisible();
});
