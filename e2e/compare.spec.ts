import { expect, test, type Locator, type Page } from "@playwright/test";
import linkIndex from "../data/link-index.json";
import { localDay } from "../src/lib/file-name";
import { decodeCompare, encodeShare } from "../src/lib/share/link";

// Compare (/compare, src/components/compare/): the set-up (a name beside each link, Add a friend, the cap, Compare at
// two lists, at the form's foot), the comparison (My birds' page head with Edit lists and Share, the chips: a person, a
// pair, all three, Yet to see, Every bird; every region of the circles pressed, by pointer and keyboard; the bars beside
// the circles; the heading and the stickers under one heading per family, one family open at a time; Edit lists) and Share into the site's Share dialog in its Compare mode (What, the
// formats, Share image, Download, Copy link). Runs in Chromium and WebKit at 1440 × 900 and 390 × 844. Every list is
// synthetic: species from the link index, made-up names. COMPARE_PNG_DIR=<dir> (outside the repo) saves screenshots
// of the set-up, the comparison and the dialog.

const codes = linkIndex as string[];
const range = (from: number, n: number) => codes.slice(from, from + n);
/** The birder's own list (0–59), Sam's (40–89) and Ada's (50–59 and 80–109). */
const MINE = range(0, 60);
const SAM = range(40, 50);
const ADA = [...range(50, 10), ...range(80, 30)];
/** The birder's collage title: a v1 list's bare name "Robin", as the app migrates it (titleFromOldName). */
const ME = "Robin's birds";

function saved() {
  const records = MINE.map((code, i) => ({ code, source: "ebird", date: `${2018 + (i % 7)}-${String((i % 12) + 1).padStart(2, "0")}-10`, place: { country: "CA" } }));
  return {
    v: 1, name: "Robin", records: { ebird: records, inat: [], manual: [] }, unmatched: [],
    edits: { removed: [], added: [], marks: {}, fixes: {} }, rules: { hideHeard: false, hideDead: false, researchOnly: false },
    savedAt: new Date().toISOString(),
  };
}

/** Puts the list where the app's storage reads it (idb-keyval: database "everybird", store "kv"), then opens /compare. */
async function seed(page: Page) {
  await page.goto("/about");
  await page.evaluate(
    (s) =>
      new Promise<void>((done, fail) => {
        const open = indexedDB.open("everybird");
        open.onupgradeneeded = () => open.result.createObjectStore("kv");
        open.onsuccess = () => {
          const tx = open.result.transaction("kv", "readwrite");
          tx.objectStore("kv").put(s, "everybird:v1");
          tx.oncomplete = () => { open.result.close(); done(); };
          tx.onerror = () => fail(tx.error);
        };
        open.onerror = () => fail(open.error);
      }),
    saved(),
  );
  await page.goto("/compare");
  await expect(page.getByTestId("compare-row-mine")).toHaveText(/Your list · 60 species/);
}

const link = (origin: string, name: string, birds: string[]) => `${origin}/s/${encodeShare({ v: 1, name, titled: true, birds: birds.map((code) => ({ code })) }).token}`;
const rows = (page: Page) => page.getByTestId(/^compare-row-\d+$/);
const chip = (page: Page, id: string | number) => page.getByTestId(`compare-chip-${id}`);
/** The people's chips (each its name, its count in `.eb-count`). */
const pills = (page: Page) => page.getByTestId(/^compare-chip-\d+$/);
const shown = (page: Page) => page.getByTestId("compare-shown");
type C = { cx: number; cy: number; r: number };
async function shot(page: Page, name: string, browser: string) {
  const dir = process.env.COMPARE_PNG_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${browser}-${page.viewportSize()!.width}-${name}.png`, fullPage: true });
}
/** The families' counts (each heading's, in taxonomic order) of the chosen group's birds (FamilyAccordion). */
const famCounts = async (page: Page) =>
  (await page.getByTestId("family-accordion").locator(".eb-lhead-count").allTextContents()).map((c) => +c.replace(/\D/g, ""));
/** The chosen group holds `n` birds: its families' counts sum to `n`, the first family alone is open (on a new choice)
 *  and its grid holds that family's birds. Retried, since the group chosen before may still show for a frame. */
async function expectAll(page: Page, n: number) {
  await expect(async () => {
    const counts = await famCounts(page);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(n);
    const heads = page.getByTestId("family-accordion").locator(".eb-facc-btn");
    await expect(heads.first()).toHaveAttribute("aria-expanded", "true", { timeout: 500 });
    await expect(page.getByTestId("family-accordion").locator('.eb-facc-btn[aria-expanded="true"]')).toHaveCount(1, { timeout: 500 });
    await expect(page.getByTestId("compare-birds").getByRole("listitem")).toHaveCount(counts[0], { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
/** The point of region `mask` (bit i: inside circle i, outside the others) farthest from every circle's edge, in the
 *  drawing's units: a press there is surely in that region. */
function inRegion(circles: C[], mask: number): [number, number] {
  let best: [number, number] = [0, 0], room = -1;
  for (let x = 0; x <= 320; x += 2) for (let y = 0; y <= 260; y += 2) {
    const d = circles.map((c) => Math.hypot(x - c.cx, y - c.cy) - c.r);
    if (!d.every((v, i) => (mask & (1 << i) ? v < 0 : v > 0))) continue;
    const m = Math.min(...d.map(Math.abs));
    if (m > room) { room = m; best = [x, y]; }
  }
  return best;
}
/** Clicks the diagram at (x, y) in its drawing's units (its viewBox). */
async function pressDiagram(page: Page, at: (circles: C[]) => [number, number]) {
  const svg = page.getByTestId("compare-diagram");
  const circles = await svg.locator("circle.eb-compare-circle").evaluateAll((els) =>
    els.map((e) => ({ cx: +e.getAttribute("cx")!, cy: +e.getAttribute("cy")!, r: +e.getAttribute("r")! })));
  const [x, y] = at(circles);
  const box = (await svg.boundingBox())!;
  await svg.click({ position: { x: (x * box.width) / 320, y: (y * box.height) / 260 } });
}

/** The Share dialog on a phone: the preview box has the card's shape and its row no more room (12px gaps either side). */
async function expectNoBands(dialog: Locator) {
  const preview = dialog.getByTestId("share-preview");
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  // The box eases to a new format's shape (420ms): measured once it has settled.
  await expect(preview).not.toHaveAttribute("data-resizing");
  await preview.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined))));
  const [top, pv, below] = await Promise.all([".eb-share-formats", '[data-testid="share-preview"]', ".eb-share-scroll"].map((q) => dialog.locator(q).boundingBox()));
  const ar = await preview.evaluate((el) => {
    const img = el.querySelector<HTMLImageElement>("img.eb-share-in")!;
    return img.naturalWidth / img.naturalHeight;
  });
  expect(Math.abs(pv!.width / pv!.height - ar)).toBeLessThan(0.02);
  expect(Math.round(pv!.y - (top!.y + top!.height))).toBeLessThanOrEqual(13);
  expect(Math.round(below!.y - (pv!.y + pv!.height))).toBeLessThanOrEqual(13);
}

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test.describe(`at ${viewport.width} × ${viewport.height}`, () => {
    test.use({ viewport });

    test("the set-up, the comparison and Edit lists", async ({ page, baseURL, browserName }) => {
      test.setTimeout(90_000);
      await seed(page);
      // From here on (WebKit reports the seed's page's fetches, cut short by the next page load, as errors).
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      // The same page head as the comparison's and My birds': the title and its line, no buttons (Compare is the form's, at
      // its foot: Add a friend at the left, Compare at the right, its right edge on the link boxes').
      const title = page.getByRole("heading", { level: 1, name: "Compare life lists" });
      await expect(title).toBeVisible();
      await expect(title).toHaveClass(/eb-pagehead-title/);
      await expect(page.locator(".eb-pagehead .eb-lede-sm")).toHaveText("Paste your friends’ Everybird links to see which birds you share. Up to 6 lists.");
      await expect(page.locator(".eb-pagehead-actions").getByRole("button")).toHaveCount(0);
      await expect(page.locator(".eb-compare-foot").getByRole("button")).toHaveText(["Add a friend", "Compare"]);
      const linkBox = (await page.getByTestId("compare-link-0").boundingBox())!;
      const foot = (await page.getByTestId("compare-submit").boundingBox())!;
      expect(Math.abs(foot.x + foot.width - (linkBox.x + linkBox.width))).toBeLessThanOrEqual(1);
      expect(foot.y).toBeGreaterThan(linkBox.y + linkBox.height);
      const setupTitle = (await title.boundingBox())!;
      const setupHead = (await page.locator(".eb-pagehead").boundingBox())!;
      const setupFont = await title.evaluate((el) => getComputedStyle(el).fontSize);
      await expect(page.getByTestId("compare-name-mine")).toHaveValue(ME);
      const submit = page.getByTestId("compare-submit");
      await expect(submit).toBeDisabled();
      // A link fills its row's name; Compare works from two lists.
      await page.getByTestId("compare-link-0").fill(link(baseURL!, "Sam", SAM));
      await expect(page.getByTestId("compare-name-0")).toHaveValue("Sam");
      await expect(submit).toBeEnabled();
      await page.getByTestId("compare-add").click();
      await expect(rows(page)).toHaveCount(2);
      await page.getByTestId("compare-link-1").fill(link(baseURL!, "Ada", ADA));
      await expect(page.getByTestId("compare-name-1")).toHaveValue("Ada");
      await shot(page, "setup", browserName);

      await submit.click();
      // The page head, as My birds': the title, the line, Edit lists and Share at its right end.
      await expect(page.getByRole("heading", { level: 1, name: "Compare life lists" })).toBeVisible();
      // The head where it was in the set-up, its title in the same type: only the line and the buttons change. (On a
      // phone the title may wrap beside Edit lists and Share where it fit on one line alone.)
      const resultsTitle = (await title.boundingBox())!;
      const resultsHead = (await page.locator(".eb-pagehead").boundingBox())!;
      expect(Math.abs(resultsHead.y - setupHead.y)).toBeLessThanOrEqual(1);
      expect(Math.abs(resultsTitle.x - setupTitle.x)).toBeLessThanOrEqual(1);
      if (viewport.width >= 640) expect(Math.abs(resultsTitle.y - setupTitle.y)).toBeLessThanOrEqual(1);
      expect(await title.evaluate((el) => getComputedStyle(el).fontSize)).toBe(setupFont);
      await expect(page.getByText("See which birds your lists share and which you’re yet to see. Choose people below to see the birds only they share.")).toBeVisible();
      await expect(page.getByTestId("compare-edit")).toBeFocused();
      await expect(page.getByTestId("compare-edit")).toHaveAccessibleName("Edit lists");
      await expect(page.getByTestId("compare-share")).toBeEnabled();
      const head = (await page.locator(".eb-pagehead-row").boundingBox())!;
      const shareBox = (await page.getByTestId("compare-share").boundingBox())!;
      expect(Math.abs(shareBox.x + shareBox.width - (head.x + head.width))).toBeLessThanOrEqual(1);
      // Share in the head's row, beside the title (on a phone the buttons centre on the title, which may take two lines).
      if (viewport.width >= 640) expect(Math.abs(shareBox.y + shareBox.height / 2 - (resultsTitle.y + resultsTitle.height / 2))).toBeLessThanOrEqual(8);
      await expect(page.getByTestId("compare-submit")).toHaveCount(0);
      for (const b of [page.getByTestId("compare-edit"), page.getByTestId("compare-share")]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

      // The chips: each person with their count, then Yet to see and Every bird; it opens on Yet to see.
      await expect(pills(page).locator(".eb-compare-chip-name")).toHaveText([ME, "Sam", "Ada"]);
      await expect(pills(page).locator(".eb-count")).toHaveText(["60", "50", "40"]);
      await expect(chip(page, "need").locator(".eb-count")).toHaveText("50");
      await expect(chip(page, "every").locator(".eb-count")).toHaveText("110");
      await expect(chip(page, "need")).toHaveAttribute("aria-pressed", "true");
      await expect(shown(page)).toHaveText("Yet to see · 50");
      const birds = page.getByTestId("compare-birds").getByRole("listitem");
      await expect(birds.first()).toBeVisible();
      // The birds under one heading per family, every bird in some family, no "Show all": the first family open.
      await expect(page.getByTestId("compare-more")).toHaveCount(0);
      await expectAll(page, 50);
      // One family open at a time: opening the second closes the first; pressing the open one closes it, so none is open.
      const heads = page.getByTestId("family-accordion").locator(".eb-facc-btn");
      const counts = await famCounts(page);
      expect(counts.length).toBeGreaterThan(1);
      await heads.nth(1).click();
      await expect(heads.nth(1)).toHaveAttribute("aria-expanded", "true");
      await expect(heads.first()).toHaveAttribute("aria-expanded", "false");
      await expect(birds).toHaveCount(counts[1]);
      await heads.nth(1).click();
      await expect(heads.nth(1)).toHaveAttribute("aria-expanded", "false");
      await expect(page.getByTestId("compare-birds")).toHaveCount(0);
      await heads.first().click();
      await expect(birds).toHaveCount(counts[0]);
      await expect(page.getByTestId("compare-region-1")).toHaveAccessibleName(`Only ${ME}: 40.`);
      await expect(page.getByTestId("compare-region-6")).toHaveAccessibleName("Only Sam and Ada: 10.");
      // The circles at the left, the bars at the right, side by side from 640px; stacked under it.
      const circlesBox = (await page.getByTestId("compare-diagram").boundingBox())!;
      const barsBox = (await page.getByTestId("compare-bars").boundingBox())!;
      if (viewport.width >= 640) {
        expect(barsBox.x).toBeGreaterThan(circlesBox.x + circlesBox.width);
        expect(barsBox.y).toBeLessThan(circlesBox.y + circlesBox.height);
      } else {
        expect(barsBox.y).toBeGreaterThanOrEqual(circlesBox.y + circlesBox.height);
      }
      await expect(page.getByTestId("compare-bars").getByRole("button")).toHaveText([`${ME}60`, "Sam50", "Ada40"]);
      // Every sticker in the same box, contained, never cropped.
      const pics = await page.locator(".eb-compare-tile-pic").evaluateAll((els) => els.map((e) => {
        const r = e.getBoundingClientRect();
        const img = e.querySelector("img");
        return { w: Math.round(r.width), h: Math.round(r.height), fit: img ? getComputedStyle(img).objectFit : "contain", over: e.scrollHeight > e.clientHeight + 1 };
      }));
      expect(new Set(pics.map((p) => `${p.w}x${p.h}`)).size).toBe(1);
      expect(pics.every((p) => p.fit === "contain" && !p.over)).toBe(true);
      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await shot(page, "results-yet-to-see", browserName);

      // A person: only Sam's birds, Sam's region and bar marked.
      await chip(page, 1).click();
      await expect(chip(page, 1)).toHaveAttribute("aria-pressed", "true");
      await expect(chip(page, "need")).toHaveAttribute("aria-pressed", "false");
      await expect(shown(page)).toHaveText("Only Sam · 20");
      await expectAll(page, 20);
      await expect(page.getByTestId("compare-part-2")).not.toHaveAttribute("data-off");
      await expect(page.getByTestId("compare-part-1")).toHaveAttribute("data-off", "");
      await expect(page.getByTestId("compare-part-7")).toHaveAttribute("data-off", "");
      await expect(page.getByTestId("compare-rank-1")).not.toHaveAttribute("data-off");
      await expect(page.getByTestId("compare-rank-0")).toHaveAttribute("data-off", "");
      await shot(page, "results-person", browserName);
      // A pair: the birds on exactly those two lists.
      await chip(page, 0).click();
      await expect(shown(page)).toHaveText(`${ME} & Sam · 10`);
      await expect(page.getByTestId("compare-part-3")).not.toHaveAttribute("data-off");
      await expect(page.getByTestId("compare-region-3")).toHaveAttribute("aria-pressed", "true");
      await expectAll(page, 10);
      await shot(page, "results-pair", browserName);
      // All three.
      await chip(page, 2).click();
      await expect(shown(page)).toHaveText("On every list · 10");
      await expect(page.getByTestId("compare-part-7")).not.toHaveAttribute("data-off");
      await shot(page, "results-all", browserName);

      // Every region of the circles, pressed: its people chosen.
      const expected: Record<number, string> = {
        1: "Only you · 40", 2: "Only Sam · 20", 4: "Only Ada · 20", 3: `${ME} & Sam · 10`, 5: `${ME} & Ada · 0`, 6: "Sam & Ada · 10", 7: "On every list · 10",
      };
      for (const [mask, text] of Object.entries(expected)) {
        await pressDiagram(page, (cs) => inRegion(cs, +mask));
        await expect(shown(page)).toHaveText(text);
        await expect(page.getByTestId(`compare-region-${mask}`)).toHaveAttribute("aria-pressed", "true");
      }
      // Outside the circles: every bird.
      await pressDiagram(page, () => [2, 2]);
      await expect(chip(page, "every")).toHaveAttribute("aria-pressed", "true");
      await expect(shown(page)).toHaveText("Every bird · 110");
      // The keyboard: Tab reaches each region, Enter chooses it.
      await page.getByTestId("compare-chip-every").focus();
      await page.keyboard.press("Tab");
      await expect(page.locator(".eb-compare-region").first()).toBeFocused();
      await page.getByTestId("compare-region-6").focus();
      await page.keyboard.press("Enter");
      await expect(shown(page)).toHaveText("Sam & Ada · 10");
      await page.getByTestId("compare-region-4").focus();
      await page.keyboard.press(" ");
      await expect(shown(page)).toHaveText("Only Ada · 20");
      // A bar chooses its person.
      await page.getByTestId("compare-rank-0").click();
      await expect(shown(page)).toHaveText("Only you · 40");
      // Yet to see again clears the people.
      await chip(page, "need").click();
      await expect(page.getByRole("button", { pressed: true })).toHaveCount(1);

      // Edit lists: the rows as left; removing one leaves two lists.
      await page.getByTestId("compare-edit").click();
      await expect(page.getByRole("heading", { level: 1, name: "Compare life lists" })).toBeFocused();
      await expect(page.locator(".eb-pagehead-actions").getByRole("button")).toHaveCount(0);
      await expect(page.locator(".eb-compare-foot").getByRole("button")).toHaveText(["Add a friend", "Compare"]);
      await expect(page.getByTestId("compare-name-0")).toHaveValue("Sam");
      await expect(page.getByTestId("compare-name-1")).toHaveValue("Ada");
      await page.getByRole("button", { name: "Remove Ada" }).click();
      await expect(rows(page)).toHaveCount(1);
      await submit.click();
      await expect(pills(page).locator(".eb-compare-chip-name")).toHaveText([ME, "Sam"]);
      await expect(shown(page)).toHaveText("Yet to see · 30");
      await chip(page, 0).click();
      await chip(page, 1).click();
      await expect(shown(page)).toHaveText("Both · 20");
      await chip(page, "every").click();
      await expect(shown(page)).toHaveText("Every bird · 90");
      expect(errors).toEqual([]);
    });

    test("six lists at most: one paste fills the rows, the rest left out with a note", async ({ page, baseURL }) => {
      await seed(page);
      const six = Array.from({ length: 6 }, (_, i) => link(baseURL!, `Friend ${i + 1}`, range(200 + 10 * i, 5))).join("\n");
      await page.getByTestId("compare-link-0").fill(six);
      await expect(rows(page)).toHaveCount(5);
      await expect(page.getByTestId("compare-name-4")).toHaveValue("Friend 5");
      await expect(page.getByTestId("compare-status")).toHaveText("Up to 6 lists can be compared, so the rest weren’t added.");
      await expect(page.getByTestId("compare-add")).toBeDisabled();
      await page.getByTestId("compare-submit").click();
      await expect(pills(page)).toHaveCount(6);
      await expect(chip(page, "need")).toBeVisible();
      // Six lists: the flower, a petal each, and its middle.
      await expect(page.getByTestId("compare-diagram").locator("circle.eb-compare-circle, circle.eb-compare-core")).toHaveCount(7);
    });

    test("Share opens the Share dialog on the comparison: What, the formats, Share image, Download and Copy link", async ({ page, context, baseURL, browserName }) => {
      test.setTimeout(120_000);
      // The share sheet records what it is handed; Chromium's clipboard is real, WebKit's a stand-in that records the write.
      if (browserName === "chromium") await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
      await page.addInitScript((stub) => {
        const w = window as unknown as { __shared: { name: string; text?: string }[]; __clip: string[] };
        w.__shared = [];
        w.__clip = [];
        Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
        Object.defineProperty(navigator, "share", {
          configurable: true,
          value: async (d: ShareData) => { w.__shared.push({ name: d.files?.[0]?.name ?? "", text: d.text }); },
        });
        if (stub) {
          const clip = {
            write: async (items: ClipboardItem[]) => { for (const it of items) w.__clip.push(await (await it.getType("text/plain")).text()); },
            writeText: async (t: string) => { w.__clip.push(t); },
          };
          Object.defineProperty(navigator, "clipboard", { value: clip, configurable: true });
        }
      }, browserName !== "chromium");
      await seed(page);
      await page.getByTestId("compare-link-0").fill(`${link(baseURL!, "Sam", SAM)} ${link(baseURL!, "Ada", ADA)}`);
      await expect(rows(page)).toHaveCount(2);
      await page.getByTestId("compare-submit").click();
      // From the keyboard (WebKit doesn't focus a button on a click), so focus comes back to it when the dialog closes.
      await page.getByTestId("compare-share").focus();
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: "Share" });
      await expect(dialog).toBeVisible();
      const what = dialog.getByTestId("share-what");
      await expect(what.getByRole("button")).toHaveText(["Comparison", "Wish list"]);
      await expect(what.getByRole("button", { name: "Comparison" })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("button", { name: /^Post/ })).toHaveAttribute("aria-pressed", "true");
      await expect(dialog.getByRole("group", { name: "Image format" }).getByRole("button")).toHaveText(["Story", "Post", "Square"]);
      await expect(dialog.getByLabel("Card title")).toHaveCount(0);
      await expect(dialog.getByRole("group", { name: "Orientation" })).toHaveCount(0);
      await expect(dialog.getByTestId("share-options").getByRole("switch")).toHaveText(["Transparent background"]);
      const preview = dialog.getByTestId("share-preview");
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      await expect(preview.getByRole("img")).toHaveAttribute("alt", new RegExp(`^Only ${ME}: 40\\.`));
      const note = dialog.getByTestId("share-link-note");
      await expect(note).toHaveText("A comparison link carries every list in it, so ask the others before you share it.");

      // On a phone the preview's row is as tall as the card it shows: nothing empty above or below it.
      if (viewport.width < 720) await expectNoBands(dialog);
      // Each format, downloaded at its size.
      for (const [format, w, h] of [["Story", 1080, 1920], ["Post", 1080, 1350], ["Square", 1080, 1080]] as const) {
        await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
        await expect(preview).toHaveAttribute("data-format", format.toLowerCase());
        await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        const size = await page.evaluate(async () => {
          const img = document.querySelector<HTMLImageElement>('[data-testid="share-preview"] img.eb-share-in')!;
          const bmp = await createImageBitmap(await (await fetch(img.src)).blob());
          return [bmp.width, bmp.height];
        });
        expect(size).toEqual([w, h]);
        if (format !== "Square") await shot(page, `share-comparison-${format.toLowerCase()}`, browserName);
        const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
        expect(dl.suggestedFilename()).toBe(`everybird-comparison-${format.toLowerCase()}-${localDay()}.png`);
      }
      // Share image (on the last format, Square): the share sheet gets the PNG and the full sticker credit.
      await dialog.getByRole("button", { name: "Share image" }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([
        { name: `everybird-comparison-square-${localDay()}.png`, text: "Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker" },
      ]);
      // The wish list: the birds Robin has yet to see.
      await what.getByRole("button", { name: "Wish list" }).click();
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      await expect(preview.getByRole("img")).toHaveAttribute("alt", "50 of your friends’ birds you’ve yet to see");
      for (const format of ["Story", "Post", "Square"]) {
        await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
        await expect(preview).toHaveAttribute("data-format", format.toLowerCase());
        await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        if (format !== "Square") await shot(page, `share-wish-${format.toLowerCase()}`, browserName);
      }
      const [wish] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
      expect(wish.suggestedFilename()).toBe(`everybird-wish-list-square-${localDay()}.png`);
      // Copy link: the comparison link, every list in it by its name.
      await dialog.getByRole("button", { name: "Copy link" }).click();
      await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
      const url = browserName === "chromium"
        ? await page.evaluate(() => navigator.clipboard.readText())
        : await page.evaluate(() => (window as unknown as { __clip: string[] }).__clip.at(-1)!);
      expect(url).toMatch(/\/c\/c/);
      expect(decodeCompare(url.split("/c/")[1]).map((p) => p.name)).toEqual([ME, "Sam", "Ada"]);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(page.getByTestId("compare-share")).toBeFocused();
    });
  });
}

test.describe("the collage's Share dialog at 390 × 844", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("the preview's row is as tall as the card: no empty band above or below it", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    await seed(page);
    await page.goto("/");
    await page.getByRole("button", { name: "Share", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Share your collage" });
    for (const format of ["Post", "Square", "Story"]) {
      await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
      await expect(dialog.getByTestId("share-preview")).toHaveAttribute("data-format", format.toLowerCase(), { timeout: 30_000 });
      await expectNoBands(dialog);
      if (format === "Post") await shot(page, "collage-share", browserName);
    }
  });
});
