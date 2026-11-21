import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { openAdd } from "./add-birds";
import { LANGS } from "../src/i18n/langs";
import { es } from "../src/i18n/messages/es";
import { nl } from "../src/i18n/messages/nl";
import { pl } from "../src/i18n/messages/pl";
import { fr } from "../src/i18n/messages/fr";
import { de } from "../src/i18n/messages/de";
import { it } from "../src/i18n/messages/it";
import { sv } from "../src/i18n/messages/sv";
import { da } from "../src/i18n/messages/da";
import { ru } from "../src/i18n/messages/ru";
import { ja } from "../src/i18n/messages/ja";
import { zhHans } from "../src/i18n/messages/zh-Hans";
import { zhHant } from "../src/i18n/messages/zh-Hant";
import { pt } from "../src/i18n/messages/pt";

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
/** The collage title in the device copy (saving is debounced, so a reload waits for it). */
const storedName = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string | null>((resolve) => {
        const req = indexedDB.open("everybird");
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("kv")) return resolve(null);
          const get = db.transaction("kv").objectStore("kv").get("everybird:v1");
          get.onsuccess = () => { db.close(); resolve(get.result?.name ?? null); };
          get.onerror = () => resolve(null);
        };
        req.onerror = () => resolve(null);
      }),
  );

/** Imports LIFELIST from Settings' source rows. */
async function importLifeList(page: Page) {
  const dir = mkdtempSync(join(tmpdir(), "everybird-e2e-"));
  const file = join(dir, "ebird_world_life_list.csv");
  writeFileSync(file, LIFELIST);
  try {
    await page.goto("/settings");
    await openAdd(page, "file");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    await page.getByTestId("ebird-input").setInputFiles(file);
    await expect(page.getByTestId("see-collage")).toContainText("Your collage has 3 species");
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

for (const width of [390, 768, 1280]) {
  test(`Collage, Settings and About share one page head at ${width}`, async ({ page }) => {
    test.fixme(width === 390, "app: at 390px the collage head's three actions (Add birds, Print, Share) wrap under \"My birds\", so its title sits 5px above Settings' and About's (one page head, same top offset)");
    test.setTimeout(60_000);
    await importLifeList(page);
    await page.setViewportSize({ width, height: 900 });
    const got: Record<string, Awaited<ReturnType<typeof measureHead>>> = {};
    for (const [name, path, title] of [["collage", "/", "My birds"], ["settings", "/settings", "Settings"], ["about", "/about", "About"]] as const) {
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
  });
}

test("Add by hand: When and where is always in view, and only the species list scrolls in the dialog", async ({ page }) => {
  await page.goto("/settings");
  const dialog = await openAdd(page, "hand");
  await expect(dialog.getByLabel("Search birds")).not.toBeFocused(); // on Settings the list is part of the page
  // The search empty: the orders, a list that opens in place, in the list's scrolling box.
  await expect(dialog.getByRole("list", { name: "Species to tick" })).toBeVisible();
  const list = dialog.getByTestId("tick-tree");
  // No button to open it: the date, the year and the country are there all the time.
  await expect(dialog.getByRole("button", { name: "When and where" })).toHaveCount(0);
  const when = dialog.getByRole("group", { name: "When and where" });
  for (const label of ["Date (optional)", "Or a year", "Country (optional)"]) await expect(when.getByLabel(label, { exact: true })).toBeVisible();
  // The dialog itself does not scroll; the list does, and the bar stays in view while it does.
  expect(await dialog.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(when.getByLabel("Date (optional)", { exact: true })).toBeInViewport();
});

test("each source says what it brings, and the line above them sums them up", async ({ page }) => {
  await page.goto("/settings");
  // By hand first: Mallard (which the eBird file has too) and Snow Goose (which it doesn't), each added by a tap.
  const dialog = await openAdd(page, "hand");
  const list = dialog.getByRole("listbox", { name: "Species to tick" });
  for (const [q, name] of [["mallard", /^Mallard, Anas platyrhynchos/], ["snow goose", /^Snow Goose, Anser caerulescens/]] as const) {
    await dialog.getByLabel("Search birds").fill(q);
    await list.getByRole("option", { name }).click();
    await expect(list.getByRole("option", { name })).toHaveAttribute("aria-selected", "true");
  }
  await expect(dialog).toContainText("Ticked by hand · 2 species");
  const summary = page.getByTestId("see-collage");
  await expect(summary).toHaveText("Your collage has 2 species, all ticked by hand.");
  await openAdd(page, "file");
  await page.getByTestId("ebird-input").setInputFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
  await expect(summary).toHaveText("Your collage has 4 species: 3 from eBird, 1 ticked by hand. See my collage");
  await expect(page.getByTestId("source-ebird-list")).toContainText(/3 species · 2 only here · Imported \d{1,2} \w{3}/);
  await openAdd(page, "hand");
  await expect(dialog).toContainText("Ticked by hand · 2 species · 1 only here");
  await summary.getByRole("link", { name: "See my collage" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("collage-stats")).toHaveText(/^4 species/);
});

test("an eBird file is remembered on the next visit, and Remove (in its ⋯ menu) takes it away", async ({ page }) => {
  await importLifeList(page);
  await page.reload();
  await expect(page.getByTestId("see-collage")).toHaveText("Your collage has 3 species, all from eBird."); // no link on a return visit
  await openAdd(page, "file");
  const line = page.getByTestId("source-ebird-list");
  await expect(line.getByRole("heading", { level: 3 })).toHaveText("eBird life list · ebird_world_life_list.csv");
  await expect(line).toContainText(/csv3 species · Imported \d{1,2} \w{3}/);
  await line.getByRole("button", { name: "More for eBird life list" }).click();
  await page.getByRole("menuitem", { name: "Remove" }).click();
  await page.getByRole("button", { name: "Yes, remove it" }).click();
  await expect(line).toHaveCount(0);
  await expect(page.getByTestId("see-collage")).toHaveCount(0);
  // Focus goes to the eBird group, or (a display: contents group can't take focus in every browser) its first button.
  await expect(page.locator("#way-ebird:focus, #way-ebird button:focus")).toHaveCount(1);
});

// The quiet rows at a desktop width and on a phone (390, touch).
for (const width of [1280, 390]) {
  test.describe(`source rows at ${width}px`, () => {
    test.use({ viewport: { width, height: width < 600 ? 844 : 900 }, hasTouch: width < 600 });

  test("the ⋯ menu from the keyboard: open, arrows, Escape returns focus; Remove asks once", async ({ page }) => {
    await importLifeList(page);
    await openAdd(page, "file");
    const line = page.getByTestId("source-ebird-list");
    const more = line.getByRole("button", { name: "More for eBird life list" });
    await expect(more).toHaveAttribute("aria-haspopup", "menu");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    const menu = page.getByRole("menu", { name: "More for eBird life list" });
    const items = menu.getByRole("menuitem");
    await expect(items).toHaveText(["Replace", "Remove"]);
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("ArrowDown"); // wraps
    await expect(items.nth(0)).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(more).toBeFocused();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    // ArrowUp opens on the last item, Remove; Enter asks, "Keep it" changes nothing and focus returns to ⋯.
    await page.keyboard.press("ArrowUp");
    await expect(items.nth(1)).toBeFocused();
    await page.keyboard.press("Enter");
    const ask = page.getByRole("group", { name: "Remove your eBird life list download" });
    await expect(ask).toBeVisible();
    await expect(ask.getByRole("button", { name: "Yes, remove it" })).toBeFocused();
    await ask.getByRole("button", { name: "Keep it" }).click();
    await expect(more).toBeFocused();
    await expect(line).toHaveCount(1);
    // A press outside closes it (on the section's title).
    await more.click();
    await expect(menu).toBeVisible();
    await page.getByRole("heading", { level: 2, name: "Your list" }).click();
    await expect(menu).toHaveCount(0);
  });

  test("Add opens the source's panel under its row, with its guidance and how-to inside", async ({ page }) => {
    await page.goto("/settings");
    await openAdd(page, "file");
    await expect(page.getByTestId("ebird-drop")).toBeVisible();
    // No descriptors on the rows: two lines, "Not added", one button.
    const add = page.getByRole("button", { name: "Add eBird life list" });
    await expect(add).toHaveAttribute("aria-expanded", "false");
    const panel = page.getByRole("group", { name: "Add eBird life list" });
    await expect(panel).toBeHidden();
    await add.click();
    await expect(add).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toBeVisible();
    await expect(panel).toContainText("places each bird to the state or province");
    await expect(panel.getByRole("button", { name: "Choose your eBird file" })).toBeVisible();
    const how = panel.getByRole("button", { name: "How do I get this file?" });
    await expect(panel.getByText(/your World life list total/)).toBeHidden();
    await how.click();
    await expect(panel.getByText(/your World life list total/)).toBeVisible();
    // iNaturalist's Add opens its field, focused, with the guidance and its how-to.
    await page.getByRole("button", { name: "Add iNaturalist" }).click();
    const inat = page.getByRole("group", { name: "Add iNaturalist" });
    await expect(inat.getByPlaceholder("iNaturalist username")).toBeFocused();
    await expect(inat).toContainText("public, wild bird observations");
    await expect(inat.getByRole("button", { name: "How do I find my username?" })).toBeVisible();
    // A file chosen from the open panel lands, and the panel folds away.
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), panel.getByRole("button", { name: "Choose your eBird file" }).click()]);
    await chooser.setFiles({ name: "ebird_world_life_list.csv", mimeType: "text/csv", buffer: Buffer.from(LIFELIST) });
    await expect(page.getByTestId("source-ebird-list")).toContainText("3 species");
    await expect(page.getByRole("button", { name: "Add eBird life list" })).toHaveCount(0);
  });

    test("no row scrolls sideways, and every row keeps its button on the right", async ({ page }) => {
      await importLifeList(page);
      await openAdd(page, "file");
      const rows = await page.locator(".eb-src-main").evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect();
        const acts = el.querySelector(".eb-src-acts")!.getBoundingClientRect();
        return { right: Math.round(r.right - acts.right), top: acts.top >= r.top && acts.bottom <= r.bottom };
      }));
      expect(rows.length).toBe(8); // eBird's two, iNaturalist, observation.org's two, spreadsheet, Scythebill, iGoTerra
      for (const r of rows) expect(r).toEqual({ right: width < 480 ? 14 : 16, top: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    });
  });
}

test("a file dropped on a row is read", async ({ page }) => {
  await page.goto("/settings");
  await openAdd(page, "file");
  const zone = page.getByTestId("ebird-drop");
  await expect(zone).toBeVisible();
  const data = await page.evaluateHandle((text) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], "ebird_world_life_list.csv", { type: "text/csv" }));
    return dt;
  }, LIFELIST);
  const row = page.getByRole("heading", { level: 3, name: "MyEBirdData" });
  await row.dispatchEvent("dragover", { dataTransfer: data });
  await expect(zone).toHaveAttribute("data-over", "true");
  await row.dispatchEvent("drop", { dataTransfer: data });
  await expect(page.getByTestId("source-ebird-list")).toContainText("ebird_world_life_list.csv");
});

test('"why?" after the skipped count opens the entries that weren\'t counted', async ({ page }) => {
  await page.goto("/settings");
  await openAdd(page, "file");
  await expect(page.getByTestId("ebird-drop")).toBeVisible();
  await page.getByTestId("ebird-input").setInputFiles({
    name: "ebird_world_life_list.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(LIFELIST + "\n4,900,spuh,duck sp.,Anatinae sp.,1,Test Park,CA-BC,04 Mar 2024,L1,S4,,0"),
  });
  const line = page.getByTestId("source-ebird-list");
  await expect(line).toContainText("1 skipped");
  const why = line.getByRole("button", { name: "Why 1 skipped?" });
  await expect(why).toHaveAttribute("aria-expanded", "false");
  const list = line.getByTestId("not-counted");
  await expect(list).toBeHidden();
  await why.click();
  await expect(why).toHaveAttribute("aria-expanded", "true");
  await expect(list).toBeVisible();
  await expect(list).toContainText("1 entry isn't a species");
});

test("the share dialog's Collage title titles the collage verbatim and is saved with the list", async ({ page }) => {
  await importLifeList(page);
  // Settings no longer has the field: the title lives in the share dialog.
  await expect(page.getByLabel("Name your collage", { exact: true })).toHaveCount(0);
  await page.getByRole("banner").getByRole("link", { name: "My birds" }).click();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your collage" });
  const shareTitle = dialog.getByLabel("Collage title");
  await expect(dialog.getByText("Shown as your collage’s title and on shares.")).toBeVisible();
  await shareTitle.fill("Ada's Life List");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ada's Life List" })).toBeVisible();
  // After a reload too (once the debounced save has landed).
  await expect.poll(() => storedName(page)).toBe("Ada's Life List");
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Ada's Life List" })).toBeVisible();
  // Empty: "My birds".
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.getByRole("dialog", { name: "Share your collage" }).getByLabel("Collage title").fill("");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "My birds" })).toBeVisible();
});

test("a list saved with an old bare name (v3) keeps the title it showed", async ({ page }) => {
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
      v: 3, name: "Ada",
      records: { ebird: [], "ebird-list": [], inat: [], manual: [{ code: "ostric2", source: "manual" }] },
      unmatched: [], edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
      savedAt: new Date().toISOString(),
    },
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Ada's birds" })).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Share your collage" }).getByLabel("Collage title")).toHaveValue("Ada's birds");
});

// A life list download knows only where you first recorded each bird: the Add birds dialog says so under the eBird rows,
// with an inline link to MyEBirdData's Add panel (each row keeps its one button), and the collage's Places panel links to
// the same panel (/settings#add-mydata, which opens it in the page).
for (const width of [1280, 390]) test(`after a life list import, Settings and Places say places are first places only, one tap from MyEBirdData (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 800 });
  await importLifeList(page);
  await openAdd(page, "file");
  const note = page.getByTestId("places-lifer-note");
  await expect(note).toBeVisible();
  await expect(note.getByRole("button")).toHaveCount(0);
  await expect(note.getByRole("link", { name: "Add MyEBirdData for every place" })).toBeVisible();
  // The sentence starts at the rows' title edge.
  const title = page.getByTestId("ebird-drop").locator(".eb-src-title").first();
  const [nx, tx] = await Promise.all([note.evaluate((el) => el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft)), title.evaluate((el) => el.getBoundingClientRect().left)]);
  expect(Math.abs(nx - tx)).toBeLessThanOrEqual(1);
  const group = page.getByRole("group", { name: "Add MyEBirdData" });
  const choose = group.getByRole("button", { name: "Choose your eBird file" });
  await page.getByTestId("places-lifer-add").click();
  await expect(group).toBeVisible();
  await expect(choose).toBeFocused();

  await page.getByRole("banner").getByRole("link", { name: "My birds", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByTestId("filters-button").click();
  await page.getByTestId("places-lifer-only").getByRole("link", { name: "Add MyEBirdData" }).click();
  await expect(page).toHaveURL(/\/settings#add-mydata$/);
  await expect(group).toBeVisible();
  await expect(choose).toBeFocused();
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

// The language switch (preview variant lang:a, the default): the top bar's button beside the theme switch opens a menu
// of the languages; a choice sets the everybird-lang cookie and reloads, and every page follows it, after a reload
// too. Settings has no language select, only the English-names switch.
test("Language: Español from the top bar switches every page and stays after a reload", async ({ page, context }) => {
  await page.goto("/");
  const bar = page.getByTestId("topbar");
  const btn = bar.getByRole("button", { name: "Language: English" });
  await expect(btn).toHaveText("EN");
  await btn.click();
  const menu = page.getByRole("menu", { name: "Language" });
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toHaveAttribute("aria-checked", "true");
  await expect(menu.getByRole("menuitemradio", { name: "English" })).toBeFocused();
  await Promise.all([page.waitForEvent("load"), menu.getByRole("menuitemradio", { name: "Español" }).click()]);
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(bar.getByRole("button", { name: "Idioma: Español" })).toHaveText("ES");
  expect((await context.cookies()).find((c) => c.name === "everybird-lang")?.value).toBe("es");
  for (const [name, path] of [["Ajustes", "/settings"], ["Acerca de", "/about"], ["Mis aves", "/"]] as const) {
    await bar.getByRole("link", { name, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path === "/" ? "/" : path}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(bar.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  await page.goto("/settings");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveCount(0); // the language is the top bar's menu
  await expect(page.getByRole("switch", { name: "Mostrar los nombres de las aves en inglés" })).toBeVisible();
});

// (Settings' old 1.5-screen budget went with the 2026-11-19 Settings: every source row and Add by hand, open, in the page.)
test("Settings has no language select (?v=lang:b: no top-bar button either)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await importLifeList(page);
  await page.goto("/settings?v=lang:b");
  await expect(page.getByRole("combobox", { name: "Language" })).toHaveCount(0);
  await expect(page.getByTestId("topbar").getByRole("button", { name: /^Language/ })).toHaveCount(0);
});

const MESSAGES = { es, pt, nl, pl, fr, de, it, sv, da, ru, ja, 'zh-Hans': zhHans, 'zh-Hant': zhHant } as const;

// Settings' source rows in each language at 390 and 1280: each Add button is whole (the row buttons wrap under the
// text, never out of the page) and nothing scrolls sideways. For manual runs.
for (const lang of LANGS.filter((l) => l !== "en")) {
  for (const width of [390, 1280]) {
    test(`source rows fit in ${lang} at ${width}px`, async ({ page, context, baseURL }) => {
      const ui = MESSAGES[lang].ui;
      await context.addCookies([{ name: "everybird-lang", value: lang, url: baseURL! }]);
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.goto("/settings");
      // Every source row's Add button ("Add", named "Add <the row's title>")
      const fits = async (label: string) => {
        const btns = page.locator("#sources").getByRole("button").and(page.getByText(label, { exact: true }));
        await expect(btns.first()).toBeVisible();
        for (const b of await btns.all()) {
          const box = await b.boundingBox();
          expect(box!.x + box!.width, `${label} inside the page`).toBeLessThanOrEqual(width + 0.5);
          expect(box!.x, `${label} inside the page`).toBeGreaterThanOrEqual(0);
        }
      };
      await openAdd(page, "file", ui);
      await fits(ui.import.add);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    });
  }
}
