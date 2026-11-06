import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { encodeShare } from "../src/lib/share/link";

// While stickers download, a slot draws nothing: no empty frame (WebKit draws one for an image with no source or one
// still loading), no broken-image icon; the bird's outline only on a real error; nothing moves when they arrive.
// Every sticker request is held back (the slow network, in both engines: WebKit has no network throttling), then let go.

const species = (JSON.parse(readFileSync("public/data/species.v1.json", "utf8")) as { species: { code: string; st: boolean }[] }).species;
const linkCodes = new Set(JSON.parse(readFileSync("data/link-index.json", "utf8")) as string[]);
const pool = species.filter((s) => s.st && linkCodes.has(s.code));
const birds = Array.from({ length: 80 }, (_, i) => ({ code: pool[Math.floor((i * pool.length) / 80)].code }));
const BROKEN = birds[3].code; // its file 404s: the one outline
const { token } = encodeShare({ v: 1, name: "Slow Net", birds });

/** Holds every sticker request until release() (BROKEN answers 404 on release). */
async function holdStickers(page: Page) {
  const held: (() => Promise<void>)[] = [];
  await page.route(/\/v1\/(128|384)\/[^/]+\.webp/, (route) => {
    held.push(async () => {
      if (route.request().url().includes(`/${BROKEN}.webp`)) await route.fulfill({ status: 404, body: "" });
      else await route.continue();
    });
  });
  return {
    count: () => held.length,
    release: async () => { const all = held.splice(0); await Promise.all(all.map((f) => f().catch(() => {}))); },
  };
}

/** Sticker images in `scope`: how many, how many draw anything (opacity > 0, or a border/outline), and loaded ones. */
async function stickerState(page: Page, scope: string, img = "img.eb-st") {
  return page.locator(scope).evaluate((root, sel) => {
    const imgs = [...root.querySelectorAll<HTMLImageElement>(sel)];
    const visible = imgs.filter((i) => {
      if (!("ld" in i.dataset)) {
        const cs = getComputedStyle(i);
        const border = cs.borderTopStyle !== "none" && parseFloat(cs.borderTopWidth) > 0;
        const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
        return parseFloat(cs.opacity) > 0 || border || outline;
      }
      return false;
    }).length;
    return { total: imgs.length, pendingVisible: visible, loaded: imgs.filter((i) => "ld" in i.dataset).length };
  }, img);
}

// Each bird's box in the stage's own coordinates (text above the stage may settle a pixel; the birds must not).
const boxes = (page: Page) =>
  page.getByTestId("collage-stage").evaluate((stage) => {
    const o = stage.getBoundingClientRect();
    return [...stage.querySelectorAll("[data-code]")].map((e) => {
      const r = e.getBoundingClientRect();
      return `${e.getAttribute("data-code")}:${Math.round(r.x - o.x)},${Math.round(r.y - o.y)},${Math.round(r.width)}x${Math.round(r.height)}`;
    });
  });

for (const [name, path] of [["the landing's sample collage", "/"], ["a shared view", `/s/${token}`]] as const) {
  test(`${name}: pending stickers draw nothing, arrive without a shift, and only a failed one shows the outline`, async ({ page }) => {
    const net = await holdStickers(page);
    await page.goto(path, { waitUntil: "domcontentloaded" }); // held images would hold the load event
    const stage = page.getByTestId("collage-stage");
    await expect(stage).toBeVisible();
    await expect.poll(() => net.count(), { timeout: 20_000 }).toBeGreaterThan(5);
    await page.waitForTimeout(2500); // the arrival animation is over: what remains is what a slow network shows
    const pending = await stickerState(page, "[data-testid=collage-stage]");
    expect(pending.total).toBeGreaterThan(5);
    expect(pending.loaded).toBe(0);
    expect(pending.pendingVisible, "a pending sticker drew a box or frame").toBe(0);
    await expect(stage.locator("[data-silhouette]")).toHaveCount(0); // no outline while pending
    const before = await boxes(page);

    await net.release();
    await expect.poll(async () => (await stickerState(page, "[data-testid=collage-stage]")).loaded, { timeout: 20_000 }).toBeGreaterThan(5);
    await page.waitForTimeout(400);
    const after = await stickerState(page, "[data-testid=collage-stage]");
    expect(after.pendingVisible).toBe(0);
    expect(await boxes(page), "the birds moved when their stickers arrived").toEqual(before);
    if (path !== "/") await expect(stage.locator(`[data-code="${BROKEN}"] [data-silhouette]`)).toHaveCount(1);
  });
}

test("the About demo: its stickers draw nothing until they load", async ({ page }) => {
  const net = await holdStickers(page);
  await page.goto("/about", { waitUntil: "domcontentloaded" });
  const demo = page.getByTestId("howto-demo");
  await demo.scrollIntoViewIfNeeded();
  await expect.poll(() => net.count(), { timeout: 20_000 }).toBeGreaterThan(0);
  await page.waitForTimeout(400);
  const pending = await stickerState(page, "[data-testid=howto-demo]", "img.ebd-st");
  expect(pending.total).toBeGreaterThan(0);
  expect(pending.pendingVisible).toBe(0);
  await net.release();
  await expect.poll(async () => (await stickerState(page, "[data-testid=howto-demo]", "img.ebd-st")).loaded, { timeout: 20_000 }).toBeGreaterThan(0);
});
