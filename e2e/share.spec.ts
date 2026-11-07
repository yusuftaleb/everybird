import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_COUNT } from "./sample";

// The landing demo's sample list (the made-up demo birder) restored as the birder's own list (from Settings), so their collage
// and its Share button appear. SHARE_PNG_DIR (optional) saves the downloaded images there for a look.
const sample = JSON.parse(readFileSync("public/data/sample.v1.json", "utf8")) as { birds: { code: string }[] };
const backup = JSON.stringify({
  v: 1,
  records: { ebird: sample.birds.map((b) => ({ ...b, source: "ebird" })), inat: [], manual: [] },
  unmatched: [],
  edits: { removed: [], added: [], marks: {}, fixes: {} },
  rules: { hideHeard: false, hideDead: false, researchOnly: false },
  savedAt: "2026-11-05T00:00:00.000Z",
});
const OUT = process.env.SHARE_PNG_DIR;

async function openShare(page: Page) {
  await page.goto("/settings");
  await expect(page.getByTestId("ebird-drop")).toBeVisible();
  // Restore from backup on Settings opens the collage (/).
  await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("region", { name: "Your collage" })).toBeVisible();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share your collage" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** The preview's PNG: its size, type and how many distinct colours it has (stickers drawn, not just text). */
async function previewInfo(page: Page) {
  return page.evaluate(async () => {
    const img = document.querySelector<HTMLImageElement>('[data-testid="share-preview"] img')!;
    const blob = await (await fetch(img.src)).blob();
    const bmp = await createImageBitmap(blob);
    const c = document.createElement("canvas");
    c.width = bmp.width;
    c.height = bmp.height;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    const colours = new Set<number>();
    for (let i = 0; i < d.length; i += 4 * 7) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    // Rows that are anything but the paper colour (the top-left pixel), counted from the top and from the bottom.
    const paper = (d[0] << 16) | (d[1] << 8) | d[2];
    const rowBlank = (y: number) => {
      for (let x = 0; x < c.width; x++) {
        const i = 4 * (y * c.width + x);
        if (((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]) !== paper) return false;
      }
      return true;
    };
    let clearTop = 0, clearBottom = 0;
    while (clearTop < c.height && rowBlank(clearTop)) clearTop++;
    while (clearBottom < c.height && rowBlank(c.height - 1 - clearBottom)) clearBottom++;
    return { w: bmp.width, h: bmp.height, type: blob.type, colours: colours.size, clearTop, clearBottom };
  });
}

// WebKit and Firefox run only the layout test at the end: WebKit's desktop build shares files natively (Share image
// opens the share sheet, not a download), and Playwright can't grant either engine clipboard permissions.
const chromiumOnly = (browserName: string) => test.skip(browserName !== "chromium", "Chromium only: native share and clipboard permissions (flows.spec.ts covers the other engines with a clipboard stand-in)");

test("story image is 1080×1920 PNG, post is 1080×1350 and square is 1080×1080", async ({ page, browserName }) => {
  chromiumOnly(browserName);
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const dialog = await openShare(page);
  const preview = dialog.getByTestId("share-preview");

  await expect(preview.getByRole("img", { name: "Preview of the story image" })).toBeVisible({ timeout: 30_000 });
  await expect(preview).toHaveAttribute("aria-busy", "false");
  const story = await previewInfo(page);
  expect(story).toMatchObject({ w: 1080, h: 1920, type: "image/png" });
  expect(story.colours).toBeGreaterThan(2000); // the stickers are in it (a tainted canvas would not export at all)
  // Instagram's safe zones stay empty: nothing in the top 160px or the bottom 220px.
  expect(story.clearTop).toBeGreaterThanOrEqual(160);
  expect(story.clearBottom).toBeGreaterThanOrEqual(220);

  // Download gives the same file under the format's name.
  const [dl] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
  expect(dl.suggestedFilename()).toBe("everybird-story.png");
  if (OUT) { mkdirSync(OUT, { recursive: true }); await dl.saveAs(join(OUT, "everybird-story.png")); }

  await dialog.getByRole("button", { name: /Post/ }).click();
  await expect(preview.getByRole("img", { name: "Preview of the post image" })).toBeVisible({ timeout: 30_000 });
  await expect(preview).toHaveAttribute("aria-busy", "false");
  expect(await previewInfo(page)).toMatchObject({ w: 1080, h: 1350, type: "image/png" });
  // Share image falls back to a download where the browser can't share files (desktop Chromium here).
  const [dl2] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Share image" }).click()]);
  expect(dl2.suggestedFilename()).toBe("everybird-post.png");
  if (OUT) await dl2.saveAs(join(OUT, "everybird-post.png"));

  await dialog.getByRole("button", { name: /Square/ }).click();
  await expect(preview.getByRole("img", { name: "Preview of the square image" })).toBeVisible({ timeout: 30_000 });
  await expect(preview).toHaveAttribute("aria-busy", "false");
  const square = await previewInfo(page);
  expect(square).toMatchObject({ w: 1080, h: 1080, type: "image/png" });
  expect(square.colours).toBeGreaterThan(2000);
  const [dlSq] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
  expect(dlSq.suggestedFilename()).toBe("everybird-square.png");
  if (OUT) await dlSq.saveAs(join(OUT, "everybird-square.png"));
  await dialog.getByRole("button", { name: /Post/ }).click();
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });

  // The name is kept in the list and re-renders the image.
  await dialog.getByLabel("Your name (optional)").fill("Ada Birder");
  await expect(preview).toHaveAttribute("aria-busy", "true");
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  if (OUT) {
    const [dl3] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
    await dl3.saveAs(join(OUT, "everybird-post-named.png"));
  }

  // Esc closes and focus returns to the Share button.
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Share", exact: true })).toBeFocused();
  expect(errors).toEqual([]);
});

test("copy link puts a /s/1… URL under 2000 chars on the clipboard", async ({ page, context, baseURL, browserName }) => {
  chromiumOnly(browserName);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url.startsWith(`${new URL(baseURL!).origin}/s/1`)).toBe(true);
  expect(url.length).toBeLessThan(2000);
  // And it opens the shared collage.
  await page.goto(url);
  await expect(page.getByText(`${SAMPLE_COUNT} species`).first()).toBeVisible();
});

// Safari keeps a clipboard write only while the click's user activation lasts, and iOS drops it once the handler waits
// on anything slow, so Copy link must call clipboard.write inside the click with a promised ClipboardItem (the link
// arrives after). WebKit's real clipboard takes the write here (it can't be read back: readText is NotAllowedError), so
// a wrapper around the real write records when it was called and what the item resolves to. The link is made after an
// import (the link module), so a write inside the click that resolves to the link can only be the promised item.
test("Safari: Copy link writes the clipboard inside the click, with a promised ClipboardItem", async ({ page, baseURL, browserName }) => {
  test.skip(browserName !== "webkit", "WebKit only: Safari's user-activation rule for the clipboard");
  await page.addInitScript(() => {
    const w = window as unknown as { __writes: { event?: string; active?: boolean; result?: string; text?: string }[] };
    w.__writes = [];
    const clip = navigator.clipboard;
    const real = clip.write.bind(clip);
    clip.write = (items: ClipboardItem[]) => {
      const rec: (typeof w.__writes)[number] = {
        event: window.event?.type,
        active: (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive,
      };
      w.__writes.push(rec);
      const got = items[0].getType("text/plain");
      got.then(async (b) => { rec.text = await b.text(); }, () => {});
      const p = real(items);
      p.then(() => { rec.result = "resolved"; }, (e: Error) => { rec.result = `rejected ${e.name}`; });
      return p;
    };
  });
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
  const writes = await page.evaluate(() => (window as unknown as { __writes: unknown[] }).__writes);
  expect(writes).toEqual([{ event: "click", active: true, result: "resolved", text: expect.stringMatching(/\/s\/1/) }]);
  const text = (writes[0] as { text: string }).text;
  expect(text.startsWith(`${new URL(baseURL!).origin}/s/1`)).toBe(true);
});

/** Records what track() would send (src/lib/analytics.ts: the window.__everybirdStats seam stands in for the network). */
async function recordStats(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __everybirdStats: (b: string) => void; __stats: string[] };
    w.__stats = [];
    w.__everybirdStats = (b) => { w.__stats.push(b); };
  });
  return async () => (await page.evaluate(() => (window as unknown as { __stats: string[] }).__stats)).map((b) => JSON.parse(b) as Record<string, string>);
}

test("visits, downloads and copy link each send one anonymous event: {n, p} only, no list contents", async ({ page, context, baseURL, browserName }) => {
  chromiumOnly(browserName);
  test.setTimeout(90_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const stats = await recordStats(page);
  const dialog = await openShare(page);
  await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
  await dialog.getByRole("button", { name: /Square/ }).click();
  await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  await expect(dialog.getByRole("img", { name: "Preview of the square image" })).toBeVisible();
  await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Download image" }).click()]);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
  // The level in the Worker's words (regions/countries/dates/species → full/compact/minimal/species).
  expect(await stats()).toEqual([
    { n: "visit", p: "settings" },
    { n: "visit", p: "collage" },
    { n: "image_downloaded", p: "story" },
    { n: "image_downloaded", p: "square" },
    { n: "link_copied", p: expect.stringMatching(/^(full|compact|minimal|species)$/) },
  ]);
});

test("Share image counts `shared` when the share sheet resolves, nothing when it's closed, a download when it fails", async ({ page, browserName }) => {
  chromiumOnly(browserName);
  test.setTimeout(90_000);
  const stats = await recordStats(page);
  // A share sheet that takes files and resolves, rejects with AbortError (closed) or fails, as window.__shareMode says.
  await page.addInitScript(() => {
    const w = window as unknown as { __shareMode: string };
    w.__shareMode = "resolve";
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => w.__shareMode === "resolve" ? Promise.resolve() : Promise.reject(new DOMException("no", w.__shareMode === "abort" ? "AbortError" : "NotAllowedError")),
    });
  });
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: /Post/ }).click();
  await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const share = dialog.getByRole("button", { name: "Share image" });
  await share.click();
  await expect.poll(async () => (await stats()).filter((e) => e.n !== "visit")).toEqual([{ n: "shared", p: "post" }]);
  await page.evaluate(() => { (window as unknown as { __shareMode: string }).__shareMode = "abort"; });
  await share.click();
  await page.evaluate(() => { (window as unknown as { __shareMode: string }).__shareMode = "fail"; });
  await Promise.all([page.waitForEvent("download"), share.click()]);
  await expect.poll(async () => (await stats()).filter((e) => e.n !== "visit")).toEqual([
    { n: "shared", p: "post" },
    { n: "image_downloaded", p: "post" },
  ]);
});

// The dialog never scrolls sideways, whatever the format, the window width or the name's length: the format control
// fits its column (Square was added later and pushed it out once). The preview is one box for every format, so the
// controls' column, and with it the format control (its icons), never changes with the format.
// SHOT_DIR (optional) saves each width and format, light and dark, there.
test("the dialog never scrolls sideways at 390, 768, 1000 and 1280px, with a long name, in every format", async ({ page }, info) => {
  test.setTimeout(180_000);
  const shots = process.env.SHOT_DIR;
  const dialog = await openShare(page);
  await dialog.getByLabel("Your name (optional)").fill("Maximiliana Featherstonehaugh-Ravensworth");
  for (const width of [1280, 1000, 768, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const seen: { format: string; col: number; preview: number; icons: boolean }[] = [];
    for (const format of ["Story", "Post", "Square"]) {
      await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
      const m = await dialog.evaluate((d) => {
        const seg = d.querySelector(".eb-seg")!.getBoundingClientRect();
        const col = d.querySelector(".eb-share-controls")!.getBoundingClientRect();
        const icon = d.querySelector(".eb-seg-btn svg")!;
        return {
          sw: d.scrollWidth, cw: d.clientWidth, over: seg.right - col.right, col: col.width,
          preview: d.querySelector('[data-testid="share-preview"]')!.getBoundingClientRect().width,
          icons: getComputedStyle(icon).display !== "none",
        };
      });
      expect(m.sw, `${format} at ${width}px: the dialog scrolls sideways`).toBeLessThanOrEqual(m.cw);
      expect(m.over, `${format} at ${width}px: the format control sticks out of its column`).toBeLessThanOrEqual(0.5);
      seen.push({ format, col: m.col, preview: m.preview, icons: m.icons });
      if (shots) {
        await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        for (const theme of ["light", "dark"]) {
          await page.evaluate((t) => document.documentElement.setAttribute("data-theme", t), theme);
          await page.waitForTimeout(300); // the image re-renders in the theme
          await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
          await dialog.screenshot({ path: `${shots}/after-share-${width}-${format.toLowerCase()}-${theme}-${info.project.name}.png` });
        }
        await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
      }
    }
    for (const s of seen.slice(1)) {
      expect(s.col, `${s.format} at ${width}px: the controls' column changed with the format`).toBeCloseTo(seen[0].col, 0);
      expect(s.preview, `${s.format} at ${width}px: the preview changed width with the format`).toBeCloseTo(seen[0].preview, 0);
      expect(s.icons, `${s.format} at ${width}px: the format icons came or went with the format`).toBe(seen[0].icons);
    }
    // Wide windows have room for the icons beside the preview.
    if (width >= 1000) expect(seen[0].icons, `at ${width}px the format control has its icons`).toBe(true);
  }
});
