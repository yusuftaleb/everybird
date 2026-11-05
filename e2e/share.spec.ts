import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";

// The landing demo's public sample list (197 birds) restored as the birder's own list, so the collage page and its
// Share button appear. SHARE_PNG_DIR (optional) saves the downloaded images there for a look.
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
  await page.goto("/");
  await expect(page.getByTestId("collage-stage")).toBeVisible();
  await page.locator('input[type="file"][accept*="json"]').first().setInputFiles({ name: "backup.json", mimeType: "application/json", buffer: Buffer.from(backup) });
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
    return { w: bmp.width, h: bmp.height, type: blob.type, colours: colours.size };
  });
}

test("story image is 1080×1920 PNG and post is 1080×1350", async ({ page }) => {
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

test("copy link puts a /s/1… URL under 2000 chars on the clipboard", async ({ page, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: baseURL });
  const dialog = await openShare(page);
  await dialog.getByRole("button", { name: "Copy link" }).click();
  await expect(dialog.getByTestId("share-note")).toHaveText(/^Link copied/);
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url.startsWith(`${new URL(baseURL!).origin}/s/1`)).toBe(true);
  expect(url.length).toBeLessThan(2000);
  // And it opens the shared collage.
  await page.goto(url);
  await expect(page.getByText("197 species").first()).toBeVisible();
});
