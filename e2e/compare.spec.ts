import { expect, test, type Locator, type Page } from "@playwright/test";
import linkIndex from "../data/link-index.json";
import { decodeCompare, encodeShare } from "../src/lib/share/link";

// Compare (/compare, src/components/compare/): the set-up (a name beside each link, Add a friend, the cap, Compare at
// two lists), the comparison (the pills, the diagram and its Circles | Bars, the groups, the stickers, Edit lists) and
// Share into the site's Share dialog in its Compare mode (What, the formats, Share image, Download, Copy link). Runs in
// Chromium and WebKit at 1440 × 900 and 390 × 844. Every list is synthetic: species from the link index, made-up names.
// COMPARE_PNG_DIR=<dir> (outside the repo) saves screenshots of the set-up, the comparison and the dialog.

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
const group = (page: Page, id: string | number) => page.getByTestId(`compare-group-${id}`);
const pills = (page: Page) => page.getByTestId("compare-pills").getByRole("listitem");
async function shot(page: Page, name: string, browser: string) {
  const dir = process.env.COMPARE_PNG_DIR;
  if (dir) await page.screenshot({ path: `${dir}/${browser}-${page.viewportSize()!.width}-${name}.png`, fullPage: true });
}
/** The chosen group's whole grid holds `n` birds (on a phone its first three rows hold fewer: "Show all" first). Retried,
 *  since the grid of the group chosen before may still show for a frame. */
async function expectAll(page: Page, n: number) {
  await expect(async () => {
    const more = page.getByTestId("compare-more");
    if (await more.isVisible()) await more.click({ timeout: 1000 });
    await expect(page.getByTestId("compare-birds").getByRole("listitem")).toHaveCount(n, { timeout: 500 });
  }).toPass({ timeout: 10_000 });
}
/** Clicks the diagram at (x, y) in its drawing's units (its viewBox). */
async function pressDiagram(page: Page, at: (circles: { cx: number; cy: number; r: number }[]) => [number, number]) {
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
      await expect(page.getByRole("heading", { level: 1, name: "Compare with friends" })).toBeVisible();
      await expect(page.getByText("Paste your friends’ Everybird links. Up to 6 lists.")).toBeVisible();
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
      await expect(pills(page)).toHaveText([`${ME}60`, "Sam50", "Ada40"]);
      await expect(page.getByTestId("compare-edit")).toBeFocused();
      await expect(page.getByTestId("compare-share")).toBeEnabled();
      await expect(page.getByTestId("compare-summary")).toHaveText("3 lists · 110 species");
      await expect(page.getByTestId("compare-groups").getByRole("button")).toHaveText([
        "Yet to see50", "On every list10", "Only you40", "Only Sam20", "Only Ada20", "Every bird110",
      ]);
      await expect(group(page, "need")).toHaveAttribute("aria-pressed", "true");
      const birds = page.getByTestId("compare-birds").getByRole("listitem");
      await expect(birds.first()).toBeVisible();
      await expect(page.getByTestId("compare-more")).toHaveText("Show all 50");
      await expect(page.getByTestId("compare-diagram")).toHaveAttribute("aria-label",
        `Only ${ME}: 40. Only Sam: 20. Only Ada: 20. Only ${ME} and Sam: 10. Only ${ME} and Ada: 0. Only Sam and Ada: 10. On every list: 10.`);
      // From 640px the diagram and the groups are two equal columns across the content: the counts end under Share.
      if (viewport.width >= 640) {
        const share = (await page.getByTestId("compare-share").boundingBox())!;
        const groups = (await page.getByTestId("compare-groups").boundingBox())!;
        expect(Math.abs(groups.x + groups.width - (share.x + share.width))).toBeLessThanOrEqual(1);
      }
      // Nothing scrolls sideways.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
      await shot(page, "results", browserName);

      // A group from the list, then from the diagram: a list's own part, the middle (every list).
      await group(page, 1).click();
      await expect(group(page, 1)).toHaveAttribute("aria-pressed", "true");
      await expect(group(page, "need")).toHaveAttribute("aria-pressed", "false");
      await expectAll(page, 20);
      // The diagram shows the chosen group: Sam's own part (mask 2) at full strength, the rest faded.
      await expect(page.getByTestId("compare-part-2")).not.toHaveAttribute("data-off");
      await expect(page.getByTestId("compare-part-1")).toHaveAttribute("data-off", "");
      await expect(page.getByTestId("compare-part-7")).toHaveAttribute("data-off", "");
      await shot(page, "results-chosen", browserName);
      await pressDiagram(page, ([a]) => [a.cx - 0.75 * a.r * Math.sqrt(3) / 2, a.cy - 0.75 * a.r / 2]);
      await expect(group(page, 0)).toHaveAttribute("aria-pressed", "true");
      await pressDiagram(page, (cs) => [cs.reduce((s, c) => s + c.cx, 0) / 3, cs.reduce((s, c) => s + c.cy, 0) / 3]);
      await expect(group(page, "all")).toHaveAttribute("aria-pressed", "true");
      await expectAll(page, 10);

      // Circles | Bars: the bars, most species first, each choosing its list's own birds.
      await page.getByTestId("compare-view-bars").click();
      await expect(page.getByTestId("compare-diagram")).toHaveCount(0);
      await expect(page.getByTestId("compare-bars").getByRole("button")).toHaveText([`${ME}60`, "Sam50", "Ada40"]);
      await page.getByTestId("compare-rank-2").click();
      await expect(group(page, 2)).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("compare-view-circles").click();
      await expect(page.getByTestId("compare-diagram")).toBeVisible();

      // Edit lists: the rows as left; removing one leaves two lists.
      await page.getByTestId("compare-edit").click();
      await expect(page.getByRole("heading", { level: 1, name: "Compare with friends" })).toBeFocused();
      await expect(page.getByTestId("compare-name-0")).toHaveValue("Sam");
      await expect(page.getByTestId("compare-name-1")).toHaveValue("Ada");
      await page.getByRole("button", { name: "Remove Ada" }).click();
      await expect(rows(page)).toHaveCount(1);
      await submit.click();
      await expect(pills(page)).toHaveText([`${ME}60`, "Sam50"]);
      await expect(page.getByTestId("compare-groups").getByRole("button")).toHaveText(["Yet to see30", "Both20", "Only you40", "Only Sam30", "Every bird90"]);
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
      await expect(dialog.getByLabel("Collage title")).toHaveCount(0);
      await expect(dialog.getByRole("group", { name: "Orientation" })).toHaveCount(0);
      await expect(dialog.getByTestId("share-options").getByRole("switch")).toHaveText(["Transparent background"]);
      const preview = dialog.getByTestId("share-preview");
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      await expect(preview.getByRole("img")).toHaveAttribute("alt", new RegExp(`^Only ${ME}: 40\\.`));
      const note = dialog.getByTestId("share-link-note");
      await expect(note).toHaveText("A comparison link carries every list in it, so ask the others before you share it.");
      await shot(page, "share", browserName);

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
        const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
        expect(dl.suggestedFilename()).toBe("everybird-compare.png");
      }
      // Share image: the share sheet gets the PNG and the full sticker credit.
      await dialog.getByRole("button", { name: "Share image" }).click();
      await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared)).toEqual([
        { name: "everybird-compare.png", text: "Stickers: huashu-bird-sticker (CC BY 4.0) github.com/alchaincyf/huashu-bird-sticker" },
      ]);
      // The wish list: the birds Robin has yet to see.
      await what.getByRole("button", { name: "Wish list" }).click();
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      await expect(preview.getByRole("img")).toHaveAttribute("alt", "50 of your friends’ birds you’ve yet to see");
      const [wish] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
      expect(wish.suggestedFilename()).toBe("everybird-wish-list.png");
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
