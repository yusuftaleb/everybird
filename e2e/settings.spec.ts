import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

/** A small synthetic eBird life list download (real species names, made-up places and dates). */
const LIFELIST = [
  "Row #,Taxon Order,Category,Common Name,Scientific Name,Count,Location,S/P,Date,LocID,SubID,Exotic,Countable",
  "1,700,species,Mallard,Anas platyrhynchos,2,Test Park,CA-BC,03 Mar 2024,L1,S1,,1",
  "2,8000,species,Bald Eagle,Haliaeetus leucocephalus,1,Test Park,CA-BC,12 Aug 2025,L1,S2,,1",
  "3,30000,species,American Robin,Turdus migratorius,1,Test Park,US-AZ,06 Sep 2026,L2,S3,,1",
].join("\n");

/** The stored list's life-list file name (IndexedDB "everybird"/"kv", key everybird:v1), or null. */
const storedFile = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open("everybird");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("kv")) return resolve(null);
          const get = db.transaction("kv").objectStore("kv").get("everybird:v1");
          get.onsuccess = () => { db.close(); resolve(get.result?.sources?.["ebird-list"]?.file ?? null); };
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

async function importLifeList(page: Page) {
  const dir = mkdtempSync(join(tmpdir(), "everybird-e2e-"));
  const file = join(dir, "ebird_world_life_list.csv");
  writeFileSync(file, LIFELIST);
  try {
    await page.goto("/settings");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    await page.getByTestId("ebird-input").setInputFiles(file);
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 3 species.");
    // Saving is debounced: wait until the device copy holds the file's details before moving on.
    await expect.poll(() => storedFile(page), { timeout: 5000 }).toBe("ebird_world_life_list.csv");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The page head's measurements: the title's top, type, and the space from the head to the first visible content. */
const measureHead = (page: Page) =>
  page.evaluate(() => {
    const h = document.querySelector("main h1")!;
    const head = h.closest(".eb-pagehead")!;
    const cs = getComputedStyle(h);
    let next = head.nextElementSibling as HTMLElement | null;
    while (next && next.getBoundingClientRect().height === 0) next = next.nextElementSibling as HTMLElement | null;
    const top = h.getBoundingClientRect().top + scrollY;
    return {
      top: Math.round(top),
      size: cs.fontSize,
      lineHeight: cs.lineHeight,
      weight: cs.fontWeight,
      family: cs.fontFamily,
      gap: next ? Math.round(next.getBoundingClientRect().top - head.getBoundingClientRect().bottom) : null,
    };
  });

test("Collage, Settings and About share one page head at 390, 768 and 1280", async ({ page }) => {
  test.setTimeout(90_000);
  await importLifeList(page);
  for (const width of [390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const got: Record<string, Awaited<ReturnType<typeof measureHead>>> = {};
    for (const [name, path, title] of [["collage", "/", "My collage"], ["settings", "/settings", "Settings"], ["about", "/about", "About"]] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      if (name === "collage") await expect(page.getByTestId("collage-stats")).toBeVisible();
      got[name] = await measureHead(page);
    }
    expect(got.settings, `settings at ${width}`).toEqual(got.about);
    expect({ ...got.collage, gap: 0 }, `collage at ${width}`).toEqual({ ...got.settings, gap: 0 });
    // The same space under the head on every page (the collage has no line under its title, so its gap is from the title row).
    expect(got.collage.gap, `collage gap at ${width}`).toBe(got.about.gap);
    expect(got.settings.gap, `settings gap at ${width}`).toBe(got.about.gap);
  }
});

test("Tick by hand opens and closes from the keyboard, animated, and at once with reduced motion", async ({ page }) => {
  await page.goto("/settings");
  const btn = page.getByRole("button", { name: "Tick birds off a list" });
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(btn).toHaveAttribute("aria-controls", "tick");
  await btn.focus();
  await page.keyboard.press("Enter");
  await expect(btn).toHaveAttribute("aria-expanded", "true");
  const list = page.getByRole("listbox", { name: "Species to tick" });
  await expect(list).toBeVisible();
  // Tab moves on into the panel (its search field).
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Search birds")).toBeFocused();
  await btn.focus();
  await page.keyboard.press("Space");
  await expect(btn).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#tick")).toBeHidden();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.keyboard.press("Enter");
  // No animation: the panel is open and unclipped straight away.
  expect(await page.locator("#tick").evaluate((el) => [el.hasAttribute("hidden"), el.getAttribute("data-phase")])).toEqual([false, null]);
  await page.keyboard.press("Enter");
  expect(await page.locator("#tick").evaluate((el) => el.hasAttribute("hidden"))).toBe(true);
});

test("an eBird file is remembered on the next visit, and Remove takes it away", async ({ page }) => {
  await importLifeList(page);
  await page.reload();
  const line = page.getByTestId("source-ebird-list");
  await expect(line).toContainText("ebird_world_life_list.csv");
  await expect(line).toContainText(/ebird_world_life_list\.csv · 3 rows · imported \d{1,2} \w{3} \d{4}/i);
  await line.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(line).toHaveCount(0);
  await expect(page.getByTestId("see-collage")).toHaveCount(0);
});

test("Your name in Settings titles the collage and starts the share dialog; the dialog's edit stays in that share", async ({ page }) => {
  await importLifeList(page);
  const field = page.getByLabel("Your name", { exact: true });
  await field.fill("Ada Birder");
  await page.getByRole("banner").getByRole("link", { name: "Collage" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ada Birder's birds" })).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your collage" });
  const shareName = dialog.getByLabel("Your name (optional)");
  await expect(shareName).toHaveValue("Ada Birder");
  await shareName.fill("Ada B.");
  await dialog.getByRole("button", { name: "Close" }).click();
  // The collage and Settings keep the saved name, after a reload too.
  await expect(page.getByRole("heading", { level: 1, name: "Ada Birder's birds" })).toBeVisible();
  await page.goto("/settings");
  await expect(page.getByLabel("Your name", { exact: true })).toHaveValue("Ada Birder");
  // Empty: "My collage".
  await page.getByLabel("Your name", { exact: true }).fill("");
  await page.getByRole("banner").getByRole("link", { name: "Collage" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "My collage" })).toBeVisible();
});

test("the how-to folds behind a small disclosure per source, and Settings fits about 1.5 screens at 1280x800", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await importLifeList(page);
  const row = page.getByTestId("source-ebird-list");
  const how = row.getByRole("button", { name: "How do I get this file?" });
  await expect(how).toHaveAttribute("aria-expanded", "false");
  await expect(row.getByText(/your World life list total/)).toBeHidden();
  await how.click();
  await expect(row.getByText(/your World life list total/)).toBeVisible();
  await how.click();
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(height).toBeLessThanOrEqual(1.6 * 800);
});

// The collage's "Fix it" is a client navigation to /settings#match: the match report opens by itself there (it read
// the hash before the router had written it; review, 2026-11-06).
test("the collage's Fix it opens Settings with the match report open", async ({ page }) => {
  await page.goto("/about");
  await page.evaluate(
    (saved) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(saved, "everybird:v1");
          tx.oncomplete = () => { open.result.close(); done(); };
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    {
      v: 1,
      records: { ebird: [{ code: "ostric2", source: "ebird", date: "2020-05-01", place: { country: "KE" } }], inat: [], manual: [] },
      unmatched: [{ source: "ebird", row: 3, com: "Mystery Warbler", sci: "Nonexistens avis", reason: "no-match" }],
      edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
      savedAt: new Date().toISOString(),
    },
  );
  await page.goto("/");
  await page.getByTestId("unmatched-note").getByRole("link", { name: "Fix it" }).click();
  await expect(page).toHaveURL(/\/settings#match$/);
  await expect(page.locator("#match").getByRole("button", { name: /^Fix it/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#eb-match-rows")).toBeVisible();
});
