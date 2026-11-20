import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { SAMPLE_COUNT } from "./sample";
import { en, type Ui } from "../src/i18n/messages/en";
import { es } from "../src/i18n/messages/es";

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

/** Opens the share dialog on the restored sample; `t` is the UI language the page is in (English by default). */
async function openShare(page: Page, t: Ui = en.ui) {
  await page.goto("/settings");
  await expect(page.getByRole("button", { name: t.collage.addBirds, exact: true })).toBeVisible(); // the bird data is in
  // Restore from backup on Settings opens the collage (/).
  await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("region", { name: t.collage.regionYours })).toBeVisible();
  await page.getByRole("button", { name: t.collage.share, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: t.share.title });
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
  // The story safe zones stay empty: nothing in the top 160px or the bottom 156px (measured on a real story).
  expect(story.clearTop).toBeGreaterThanOrEqual(160);
  expect(story.clearBottom).toBeGreaterThanOrEqual(156);

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

  // The title re-renders the image.
  await dialog.getByLabel("Collage title").fill("Ada's big year");
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

// The footer line ends with the day the image was made, on the device's clock and in its time zone: at 12:30 UTC on
// 14 Nov it is already 01:30 on 15 Nov in Auckland, so the stamp says 15 Nov and never the UTC day. A wrapper around
// fillText records every text the main-thread canvas draws (the share image is drawn there), cleared between formats
// so each format proves its own line.
test.describe("date stamp", () => {
  test.use({ timezoneId: "Pacific/Auckland" });

  /** 12:30 UTC on 14 Nov 2026 (15 Nov in Auckland), and every canvas fillText recorded in window.__fillTexts. */
  async function stampClock(page: Page) {
    await page.clock.setFixedTime(new Date("2026-11-14T12:30:00Z"));
    await page.addInitScript(() => {
      const w = window as unknown as { __fillTexts: string[] };
      w.__fillTexts = [];
      const real = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
        w.__fillTexts.push(String(text));
        return real.call(this, text, ...rest);
      };
    });
  }

  test("every format's footer line ends with the device's local date: 15 Nov 2026", async ({ page }) => {
    test.setTimeout(90_000);
    await stampClock(page);
    const dialog = await openShare(page);
    const preview = dialog.getByTestId("share-preview");
    const texts = () => page.evaluate(() => (window as unknown as { __fillTexts: string[] }).__fillTexts);
    const line = "everybird.yusuftaleb.com · stickers by huashu · 15 Nov 2026";
    for (const format of ["Story", "Post", "Square"]) {
      // The story is drawn as the dialog opens; the others on their click, after the previous format's texts are gone.
      if (format !== "Story") {
        await page.evaluate(() => { (window as unknown as { __fillTexts: string[] }).__fillTexts = []; });
        await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
      }
      await expect(preview.getByRole("img", { name: `Preview of the ${format.toLowerCase()} image` })).toBeVisible({ timeout: 30_000 });
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      const drawn = await texts();
      expect(drawn, `${format}: the footer line`).toContain(line);
      expect(drawn.join("\n"), `${format}: never the UTC day`).not.toContain("14 Nov 2026");
    }
  });

  // The same dialog in Spanish (the browser's language picks /es/): its words, the image's, an English download name,
  // and the credit line unchanged with the Spanish date after it, no lead ("Al").
  test.describe("in Spanish", () => {
    test.use({ locale: "es-ES" });
    test("the labels, the drawn words and the stamp; the file is still everybird-story.png", async ({ page }) => {
      test.setTimeout(90_000);
      await stampClock(page);
      const dialog = await openShare(page, es.ui);
      const preview = dialog.getByTestId("share-preview");
      for (const label of ["Historia", "Post", "Cuadrado"]) await expect(dialog.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
      await expect(dialog.getByRole("switch", { name: "Última especie nueva" })).toHaveAttribute("aria-checked", "true");
      await expect(dialog.getByRole("button", { name: "Copiar enlace" })).toBeVisible();
      await expect(preview.getByRole("img", { name: es.ui.share.preview.story })).toBeVisible({ timeout: 30_000 });
      await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      const drawn = await page.evaluate(() => (window as unknown as { __fillTexts: string[] }).__fillTexts);
      expect(drawn).toContain("everybird.yusuftaleb.com · stickers by huashu · 15 nov 2026");
      expect(drawn.some((t) => t.startsWith("ÚLTIMA ESPECIE NUEVA"))).toBe(true);
      expect(drawn).toContain("ESPECIES");
      const [download] = await Promise.all([page.waitForEvent("download"), dialog.getByRole("button", { name: "Descargar imagen" }).click()]);
      expect(download.suggestedFilename()).toBe("everybird-story.png");
      await expect(dialog.getByTestId("share-note")).toHaveText("Se guardó everybird-story.png.");
    });
  });
});

// "Show latest lifer" (on at every open): off, the image draws no latest lifer row (its room goes to the collage), and
// the footer with the sticker credit stays; on again, the row is back. The same fillText recorder as the date stamp's.
test("Show latest lifer: on by default; off draws no latest lifer row, on draws it again", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const w = window as unknown as { __fillTexts: string[] };
    w.__fillTexts = [];
    const real = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text: string, ...rest: [number, number, number?]) {
      w.__fillTexts.push(String(text));
      return real.call(this, text, ...rest);
    };
  });
  const dialog = await openShare(page);
  const preview = dialog.getByTestId("share-preview");
  const texts = () => page.evaluate(() => (window as unknown as { __fillTexts: string[] }).__fillTexts);
  const clear = () => page.evaluate(() => { (window as unknown as { __fillTexts: string[] }).__fillTexts = []; });
  const sw = dialog.getByRole("switch", { name: "Show latest lifer" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  // Bottom right of the controls: Buy Me a Coffee's static button image, its alt the link's name (never on the image).
  await expect(dialog.getByRole("link", { name: "Buy me a coffee" })).toHaveAttribute("href", "https://buymeacoffee.com/yusuftaleb");
  await expect(preview.getByRole("img", { name: "Preview of the story image" })).toBeVisible({ timeout: 30_000 });
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  expect((await texts()).some((t) => t.startsWith("LATEST LIFER"))).toBe(true);
  await clear();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const off = await texts();
  expect(off.length).toBeGreaterThan(0); // a new image was drawn
  expect(off.some((t) => t.startsWith("LATEST LIFER"))).toBe(false);
  expect(off.some((t) => t.startsWith("everybird.yusuftaleb.com · stickers by huashu"))).toBe(true); // the footer and credit stay
  expect(off.filter((t) => /coffee/i.test(t)), "Buy me a coffee is never drawn on the image").toEqual([]);
  await clear();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(preview).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
  const on = await texts();
  expect(on.some((t) => t.startsWith("LATEST LIFER"))).toBe(true);
  expect(on.filter((t) => /coffee/i.test(t)), "Buy me a coffee is never drawn on the image").toEqual([]);
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
    // A visit also carries the browser language's primary subtag (l: "en" under Playwright's en-US).
    { n: "visit", p: "settings", l: expect.stringMatching(/^[a-z]{2,3}$/) },
    { n: "visit", p: "collage", l: expect.stringMatching(/^[a-z]{2,3}$/) },
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
// fits its column (Square was added later and pushed it out once). The preview takes the shown image's own shape, so
// nothing is letterboxed (Yusuf, 2026-11-15: no story between grey bands), centred in an area the story's size (the
// story fills it; a post or square sits in its middle); the controls' column keeps its width, and the format control
// and Share image their places, whatever the format.
// SHOT_DIR (optional) saves each width and format, light and dark, there.
test("the dialog never scrolls sideways at 320 to 1440px, with a long name, in every format, nor at 320px with large text; the preview hugs the image", async ({ page }, info) => {
  test.setTimeout(240_000);
  const shots = process.env.SHOT_DIR;
  const dialog = await openShare(page);
  await dialog.getByLabel("Collage title").fill("Maximiliana Featherstonehaugh-Ravensworth");
  const aspect: Record<string, number> = { Story: 9 / 16, Post: 4 / 5, Square: 1 };
  for (const width of [1440, 1280, 1000, 768, 440, 390, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const seen: { format: string; col: number; icons: boolean; segX: number; segY: number; midY: number; midX: number; boxR: number; share: string }[] = [];
    for (const format of ["Story", "Post", "Square"]) {
      await dialog.getByRole("button", { name: new RegExp(`^${format}`) }).click();
      await expect(dialog.getByTestId("share-preview")).toHaveAttribute("data-format", format.toLowerCase(), { timeout: 30_000 });
      await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
      await page.waitForTimeout(350); // the box's width transition
      const m = await dialog.evaluate((d) => {
        d.scrollTop = 0;
        const seg = d.querySelector(".eb-seg")!.getBoundingClientRect();
        const formats = d.querySelector(".eb-share-formats")!.getBoundingClientRect();
        const col = d.querySelector(".eb-share-controls")!.getBoundingClientRect();
        const icon = d.querySelector(".eb-seg-btn svg")!;
        const box = d.querySelector('[data-testid="share-preview"]')!;
        const img = box.querySelector("img")!;
        const b = box.getBoundingClientRect();
        const share = [...d.querySelectorAll("button")].find((x) => x.textContent!.includes("Share image"))!.getBoundingClientRect();
        return {
          midY: b.y + b.height / 2, midX: b.x + b.width / 2, boxR: b.right,
          share: [share.x, share.y, share.width, share.height].map(Math.round).join(","),
          sw: d.scrollWidth, cw: d.clientWidth, over: seg.right - formats.right, col: col.width, segX: seg.x, segY: seg.y,
          swOver: Math.max(...[...d.querySelectorAll('[role="switch"]')].map((x) => x.getBoundingClientRect().right - col.right)),
          bw: box.clientWidth, bh: box.clientHeight, iw: img.getBoundingClientRect().width, ih: img.getBoundingClientRect().height,
          icons: getComputedStyle(icon).display !== "none",
        };
      });
      expect(m.sw, `${format} at ${width}px: the dialog scrolls sideways`).toBeLessThanOrEqual(m.cw);
      expect(m.over, `${format} at ${width}px: the format control sticks out of its column`).toBeLessThanOrEqual(0.5);
      expect(m.swOver, `${format} at ${width}px: "Show latest lifer" sticks out of its column`).toBeLessThanOrEqual(0.5);
      // The box has the image's shape (no bands), and the image fills it.
      expect(m.bw / m.bh, `${format} at ${width}px: the preview box isn't the image's shape`).toBeCloseTo(aspect[format], 1);
      expect(m.iw, `${format} at ${width}px: the image doesn't fill its box`).toBeGreaterThanOrEqual(m.bw - 1);
      expect(m.ih, `${format} at ${width}px: the image doesn't fill its box`).toBeGreaterThanOrEqual(m.bh - 1);
      // Beside the controls in an 800px-tall window, the story is the dialog's height: well over twice the old 400px box's area.
      if (width >= 1000 && format === "Story") expect(m.bh, `the story at ${width}px is short`).toBeGreaterThanOrEqual(600);
      // No preview is wider than 560px, so the widest dialog stays close to a story's.
      expect(m.bw, `${format} at ${width}px: the preview is wider than 560px`).toBeLessThanOrEqual(560.5);
      // Stacked on a phone, the tallest preview still leaves Share image on the dialog's first screen, with air under it.
      if (width < 720 && format === "Story") {
        const g = await dialog.evaluate((d) => {
          d.scrollTop = 0;
          const bottom = d.getBoundingClientRect().bottom;
          const btn = (t: string) => [...d.querySelectorAll("button")].find((b) => b.textContent!.includes(t))!.getBoundingClientRect();
          return { air: bottom - btn("Share image").bottom, peek: bottom - btn("Download image").top };
        });
        expect(g.air, `at ${width}px Share image is not on the first screen with air under it`).toBeGreaterThanOrEqual(12);
        expect(g.peek, `at ${width}px the Download row doesn't show its top as a scroll cue`).toBeGreaterThanOrEqual(width >= 390 ? 12 : 4);
      }
      seen.push({ format, col: m.col, icons: m.icons, segX: m.segX, segY: m.segY, midY: m.midY, midX: m.midX, boxR: m.boxR, share: m.share });
      if (shots) {
        // Dark image is in Style (outside the dialog): the shots are in the image's current look.
        await expect(dialog.getByTestId("share-preview")).toHaveAttribute("aria-busy", "false", { timeout: 30_000 });
        await dialog.screenshot({ path: `${shots}/after-share-${width}-${format.toLowerCase()}-${info.project.name}.png` });
      }
    }
    for (const s of seen.slice(1)) {
      expect(s.col, `${s.format} at ${width}px: the controls' column changed with the format`).toBeCloseTo(seen[0].col, 0);
      expect(s.icons, `${s.format} at ${width}px: the format icons came or went with the format`).toBe(seen[0].icons);
      // The format control and Share image stay put at every width: beside the preview the dialog keeps its height and
      // grows leftward from fixed right and top edges; stacked, the control sits above the preview's area, Share image
      // under it, and the dialog keeps its top.
      expect(s.segX, `${s.format} at ${width}px: the format control moved sideways`).toBeCloseTo(seen[0].segX, 0);
      expect(s.segY, `${s.format} at ${width}px: the format control moved up or down`).toBeCloseTo(seen[0].segY, 0);
      expect(s.share, `${s.format} at ${width}px: Share image moved`).toBe(seen[0].share);
      // Centred in the story's area: the same middle as the story's (beside the controls the area's right edge is the
      // box's own, and its left edge follows the format; stacked, the box is centred across the dialog too).
      expect(s.midY, `${s.format} at ${width}px: the preview isn't centred in its area`).toBeCloseTo(seen[0].midY, 0);
      if (width >= 720) expect(s.boxR, `${s.format} at ${width}px: the preview's right edge moved`).toBeCloseTo(seen[0].boxR, 0);
      else expect(s.midX, `${s.format} at ${width}px: the preview isn't centred across`).toBeCloseTo(seen[0].midX, 0);
    }
    // Wide windows have room for the icons beside the preview.
    if (width >= 1000) expect(seen[0].icons, `at ${width}px the format control has its icons`).toBe(true);
  }
  // A larger text size on a small phone (root font 150% and 200% at 320px, as a reader's setting makes it): the
  // switch's label keeps its 16px and wraps rather than pushing the dialog wider.
  await page.setViewportSize({ width: 320, height: 800 });
  for (const size of ["150%", "200%"]) {
    await page.evaluate((s) => { document.documentElement.style.fontSize = s; }, size);
    const m = await dialog.evaluate((d) => {
      const col = d.querySelector(".eb-share-controls")!.getBoundingClientRect();
      const words = [...d.querySelectorAll(".eb-seg-label")].map((l) => l.getBoundingClientRect());
      const btns = [...d.querySelectorAll(".eb-seg-btn")].map((l) => l.getBoundingClientRect());
      return {
        sw: d.scrollWidth, cw: d.clientWidth, swOver: Math.max(...[...d.querySelectorAll('[role="switch"]')].map((x) => x.getBoundingClientRect().right - col.right)),
        wordOver: Math.max(...words.map((w, i) => Math.max(btns[i].left - w.left, w.right - btns[i].right))),
      };
    });
    expect(m.sw, `at 320px and ${size} text: the dialog scrolls sideways`).toBeLessThanOrEqual(m.cw);
    expect(m.swOver, `at 320px and ${size} text: "Show latest lifer" sticks out of its column`).toBeLessThanOrEqual(0.5);
    expect(m.wordOver, `at 320px and ${size} text: a format's word sticks out of its button`).toBeLessThanOrEqual(0.5);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
});
